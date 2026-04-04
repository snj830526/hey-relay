import express from 'express';
import { Redis } from 'ioredis';
import cors from 'cors';
// MCP SDK 임포트
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
const port = process.env.PORT || 3000;
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

app.use(express.json());
app.use(cors());

// 1. MCP 서버 인스턴스 초기화
const mcpServer = new Server(
  { name: "hey-relay-server", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// --- 기존 도구 정의 및 실행 로직 (동일) ---
const TOOLS = [
  {
    name: "pull_memo",
    description: "아이패드에서 보낸 메모를 꺼냅니다. 읽은 항목은 제거됩니다.",
    inputSchema: {
      type: "object",
      properties: { peek: { type: "boolean" } },
    },
  },
  {
    name: "push_memo",
    description: "Claude가 정리한 내용을 저장합니다.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
  {
    name: "list_memos",
    description: "현재 쌓인 메모 목록 조회",
    inputSchema: { type: "object", properties: {} },
  }
];

async function executeTool(name: string, args: any = {}) {
  const PREFIX = "memo:";
  if (name === "pull_memo") {
    const keys = await redis.keys(`${PREFIX}*`);
    if (keys.length === 0) return { content: [{ type: "text", text: "(아직 쌓인 메모가 없습니다)" }] };
    const shouldDelete = args.peek !== true;
    const sortedKeys = keys.sort();
    const parts = await Promise.all(sortedKeys.map(async (key) => {
      const val = await redis.get(key);
      if (shouldDelete) await redis.del(key);
      return `[${key.replace(PREFIX, "")}]\n${val ?? ""}`;
    }));
    return { content: [{ type: "text", text: parts.join("\n\n---\n\n") }] };
  }
  if (name === "push_memo") {
    const { command } = args;
    const id = Date.now().toString();
    await redis.set(`${PREFIX}${id}`, command);
    return { content: [{ type: "text", text: `✓ 저장 완료 (key: ${id})` }] };
  }
  if (name === "list_memos") {
    const keys = await redis.keys(`${PREFIX}*`);
    const text = keys.length === 0 ? "(비어 있음)" : `총 ${keys.length}개\n${keys.map(k => k.replace(PREFIX, "")).join("\n")}`;
    return { content: [{ type: "text", text }] };
  }
  throw new Error(`Unknown tool: ${name}`);
}

// 2. SDK 핸들러 연결
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  return await executeTool(request.params.name, request.params.arguments);
});

// 3. SSE 트랜스포트 라우팅
let transport: SSEServerTransport | null = null;

app.get('/mcp', async (req, res) => {
  // 1. 기존에 연결된 게 있다면 깔끔하게 헤어지기(close) ㅋㅋㅋ
  if (transport) {
    try {
      await mcpServer.close();
    } catch (e) {
      // 이미 닫혔으면 무시!
    }
  }

  // 2. 새로운 통로 개설
  transport = new SSEServerTransport("/message", res);
  await mcpServer.connect(transport);

  // 3. [보너스] 클라이언트가 연결을 끊으면(브라우저 닫기 등) 리소스 정리해주는 센스!
  res.on('close', async () => {
    console.log("Client disconnected. Cleaning up...");
    await mcpServer.close();
    transport = null;
  });
});

app.post('/message', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    // 세션이 없으면 400 던지기
    res.status(400).send("No active MCP session. Please connect via GET /mcp first.");
  }
});

// --- 기존 아이패드 푸시 엔드포인트 ---
app.post('/push', async (req, res) => {
  const { command } = req.body;
  const id = Date.now().toString();
  await redis.set(`memo:${id}`, command);
  res.send(`Command ${id} saved!`);
});

app.listen(port, () => {
  console.log(`🚀 Hey-Relay Server running at http://localhost:${port}`);
});