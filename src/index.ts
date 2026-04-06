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
  },
  {
    name: "push_summary",
    description: "Claude가 대화 내용을 요약해서 Redis에 저장합니다. 아이패드 앱에서 pull할 용도입니다.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        title: { type: "string" }
      },
      required: ["content"]
    },
  },
  {
    name: "pull_summary",
    description: "앱에서 pull할 대화 요약을 꺼냅니다. 읽은 항목은 제거됩니다.",
    inputSchema: { type: "object", properties: { peek: { type: "boolean" } } },
  },
  {
    name: "list_summaries",
    description: "현재 쌓인 대화 요약 목록 조회",
    inputSchema: { type: "object", properties: {} },
  }
];

// --- 도구 실행 로직 ---
async function pullFromRedis(prefix: string, peek: boolean) {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length === 0) return { content: [{ type: "text", text: "(아직 쌓인 항목이 없습니다)" }] };
  const shouldDelete = peek !== true;
  const sortedKeys = keys.sort();
  const parts = await Promise.all(sortedKeys.map(async (key) => {
    const val = await redis.get(key);
    if (shouldDelete) await redis.del(key);
    return `[${key.replace(prefix, "")}]\n${val ?? ""}`;
  }));
  return { content: [{ type: "text", text: parts.join("\n\n---\n\n") }] };
}

async function executeTool(name: string, args: any = {}) {
  const MEMO_PREFIX = "memo:";
  const SUMMARY_PREFIX = "summary:";

  if (name === "pull_memo") {
    return pullFromRedis(MEMO_PREFIX, args.peek === true);
  }
  if (name === "push_memo") {
    const { command } = args;
    const id = Date.now().toString();
    await redis.set(`${MEMO_PREFIX}${id}`, command);
    return { content: [{ type: "text", text: `✓ 저장 완료 (key: ${id})` }] };
  }
  if (name === "list_memos") {
    const keys = await redis.keys(`${MEMO_PREFIX}*`);
    const text = keys.length === 0 ? "(비어 있음)" : `총 ${keys.length}개\n${keys.map(k => k.replace(MEMO_PREFIX, "")).join("\n")}`;
    return { content: [{ type: "text", text }] };
  }
  if (name === "push_summary") {
    const { content, title } = args;
    const id = Date.now().toString();
    const payload = JSON.stringify({ title: title ?? null, content, savedAt: new Date().toISOString() });
    await redis.set(`${SUMMARY_PREFIX}${id}`, payload);
    notifyAllSummaryClients();
    return { content: [{ type: "text", text: `✓ 요약 저장 완료 (key: ${id})` }] };
  }
  if (name === "pull_summary") {
    return pullFromRedis(SUMMARY_PREFIX, args.peek === true);
  }
  if (name === "list_summaries") {
    const keys = await redis.keys(`${SUMMARY_PREFIX}*`);
    const text = keys.length === 0 ? "(비어 있음)" : `총 ${keys.length}개\n${keys.map(k => k.replace(SUMMARY_PREFIX, "")).join("\n")}`;
    return { content: [{ type: "text", text }] };
  }
  throw new Error(`Unknown tool: ${name}`);
}

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  return await executeTool(request.params.name, request.params.arguments);
});

// --- Summary SSE 클라이언트 관리 ---
const summarySSEClients = new Set<express.Response>();

async function notifyAllSummaryClients() {
  const keys = await redis.keys('summary:*');
  const count = keys.length;
  const data = `data: ${JSON.stringify({ count })}\n\n`;
  summarySSEClients.forEach(client => {
    try { client.write(data); } catch (e) {}
  });
}

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

// ✅ 대화 요약 저장 엔드포인트 (앱에서 pull할 용도)
app.post('/summary', express.json(), async (req, res) => {
  const { content, title } = req.body;
  if (!content) {
    res.status(400).json({ error: "content 필드가 필요합니다." });
    return;
  }
  const id = Date.now().toString();
  const payload = JSON.stringify({ title: title ?? null, content, savedAt: new Date().toISOString() });
  await redis.set(`summary:${id}`, payload);
  notifyAllSummaryClients();
  res.json({ ok: true, id });
});

// ✅ 앱용: 쌓인 요약 목록 조회
app.get('/summary', async (req, res) => {
  const keys = (await redis.keys('summary:*')).sort();
  if (keys.length === 0) {
    res.json({ summaries: [] });
    return;
  }
  const summaries = await Promise.all(keys.map(async (key) => {
    const raw = await redis.get(key);
    return { id: key.replace('summary:', ''), ...(raw ? JSON.parse(raw) : {}) };
  }));
  res.json({ summaries });
});

// ✅ 앱용: 요약 하나씩 꺼내기 (읽으면 삭제)
app.delete('/summary/:id', async (req, res) => {
  const key = `summary:${req.params.id}`;
  const raw = await redis.get(key);
  if (!raw) {
    res.status(404).json({ error: "해당 요약을 찾을 수 없습니다." });
    return;
  }
  await redis.del(key);
  notifyAllSummaryClients();
  res.json({ ok: true, id: req.params.id, ...(JSON.parse(raw)) });
});

// ✅ 앱용: Summary SSE 스트림 (실시간 count 알림)
app.get('/summary/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  summarySSEClients.add(res);

  // 연결 즉시 현재 count 전송
  const keys = await redis.keys('summary:*');
  res.write(`data: ${JSON.stringify({ count: keys.length })}\n\n`);

  // 30초마다 keepalive ping (연결 유지)
  const keepalive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) {}
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    summarySSEClients.delete(res);
  });
});

app.listen(port, () => {
  console.log(`🚀 Hey-Relay Server running at http://localhost:${port}`);
});