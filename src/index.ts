import express, { type Request, type Response } from 'express';
import { Redis } from 'ioredis';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

app.use(express.json());
app.use(cors());

// MCP 도구 정의 (기존 코드 유지)
const TOOLS = [
  {
    name: "pull_memo",
    description: "아이패드에서 보낸 메모를 꺼냅니다. 읽은 항목은 제거됩니다.",
    inputSchema: {
      type: "object",
      properties: {
        peek: { type: "boolean", description: "true이면 삭제하지 않음" },
      },
    },
  },
  {
    name: "push_memo",
    description: "Claude가 정리한 내용을 저장합니다.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "저장할 텍스트" },
      },
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
  // Redis 키 접두사 (다른 데이터와 섞이지 않게)
  const PREFIX = "memo:";

  if (name === "pull_memo") {
    const keys = await redis.keys(`${PREFIX}*`);
    if (keys.length === 0) return { content: [{ type: "text", text: "(아직 쌓인 메모가 없습니다)" }] };

    const shouldDelete = args.peek !== true;
    const sortedKeys = keys.sort(); // 시간순 정렬 (Date.now() 기반 키니까)

    const parts = await Promise.all(
      sortedKeys.map(async (key) => {
        const val = await redis.get(key);
        if (shouldDelete) await redis.del(key);
        return `[${key.replace(PREFIX, "")}]\n${val ?? ""}`;
      })
    );
    return { content: [{ type: "text", text: parts.join("\n\n---\n\n") }] };
  }

  if (name === "push_memo") {
    const { command } = args;
    if (!command) throw new Error("command 필요");
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

// --- 라우터 설정 ---

// MCP 엔드포인트
app.post('/mcp', async (req, res) => {
  const { method, params, id } = req.body;
  
  try {
    if (method === "initialize") {
      return res.json({ jsonrpc: "2.0", id, result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "hey-relay-server", version: "2.0.0" },
        capabilities: { tools: {} }
      }});
    }
    if (method === "tools/list") return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const result = await executeTool(params.name, params.arguments);
      return res.json({ jsonrpc: "2.0", id, result });
    }
    if (method === "ping") return res.json({ jsonrpc: "2.0", id, result: {} });
    
    res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  } catch (err: any) {
    res.status(500).json({ jsonrpc: "2.0", id, error: { code: -32000, message: err.message } });
  }
});

// 아이패드 푸시 엔드포인트
app.post('/push', async (req, res) => {
  const { command } = req.body;
  const id = Date.now().toString();
  await redis.set(`memo:${id}`, command);
  res.send(`Command ${id} saved!`);
});

app.listen(port, () => {
  console.log(`🚀 Hey-Relay Server running at http://localhost:${port}`);
});
