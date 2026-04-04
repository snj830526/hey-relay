import express from 'express';
import { Redis } from 'ioredis';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
const port = process.env.PORT || 3000;
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// ✅ 전역 미들웨어는 CORS만 남김! (스트림 파싱 방지)
app.use(cors());

const mcpServer = new Server(
  { name: "hey-relay-server", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// --- 도구 정의 ---
const TOOLS = [
  {
    name: "pull_memo",
    description: "아이패드에서 보낸 메모를 꺼냅니다. 읽은 항목은 제거됩니다.",
    inputSchema: { type: "object", properties: { peek: { type: "boolean" } } },
  },
  {
    name: "push_memo",
    description: "Claude가 정리한 내용을 저장합니다.",
    inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
  },
  {
    name: "list_memos",
    description: "현재 쌓인 메모 목록 조회",
    inputSchema: { type: "object", properties: {} },
  }
];

// --- 도구 실행 로직 ---
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

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  return await executeTool(request.params.name, request.params.arguments);
});

// --- 핵심: 라우터 설정 ---
let transport: SSEServerTransport | null = null;

// 🚨 형이 빼먹었던 부분 부활! (클로드가 처음에 연결을 맺는 길)
app.get('/mcp', async (req, res) => {
  console.log("--- New SSE Connection (GET /mcp) ---");
  
  // 기존 연결 청소
  if (transport) {
    try { await mcpServer.close(); } catch (e) {}
  }

  transport = new SSEServerTransport("/mcp", res);
  await mcpServer.connect(transport);
});

// 클로드가 명령을 보내는 길
app.post('/mcp', async (req, res) => {
  console.log("--- New Message (POST /mcp) ---"); 
  
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active session");
  }
});

// ✅ 아이패드 푸시 전용 (여기만 express.json() 달아줌!)
app.post('/push', express.json(), async (req, res) => {
  const { command } = req.body;
  const id = Date.now().toString();
  await redis.set(`memo:${id}`, command);
  res.send(`Command ${id} saved!`);
});

app.listen(port, () => {
  console.log(`🚀 Hey-Relay Server running at http://localhost:${port}`);
});