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

// 클로드가 처음 연결(GET)할 때 타는 곳
app.get('/mcp', async (req, res) => {
  // 메시지는 /message 경로로 받겠다고 설정 (클라이언트에게 알려줌)
  transport = new SSEServerTransport("/message", res);
  await mcpServer.connect(transport);
});

// 실제로 명령(POST)이 들어오는 곳
app.post('/message', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active session");
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