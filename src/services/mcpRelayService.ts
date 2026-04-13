import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import type express from 'express';

import { mcpTools, executeMcpTool } from '../mcp/tools.js';
import type { SummaryEventHub } from './summaryEventHub.js';
import type { RelayStore } from '../store/relayStore.js';

type ServerTransport = Parameters<Server['connect']>[0];

type LegacySession = {
  server: Server;
  transport: SSEServerTransport;
};

type StreamableSession = {
  server: Server;
  transport: StreamableHTTPServerTransport;
};

export class McpRelayService {
  private readonly legacySessions = new Map<string, LegacySession>();
  private readonly streamableSessions = new Map<string, StreamableSession>();

  constructor(
    private readonly sessionPath: string,
    private readonly serverName: string,
    private readonly relayStore: RelayStore,
    private readonly summaryEventHub: SummaryEventHub
  ) {}

  private createServer() {
    const server = new Server(
      { name: this.serverName, version: '2.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));
    server.setRequestHandler(CallToolRequestSchema, async (request) =>
      executeMcpTool(request.params.name, request.params.arguments, this.relayStore, this.summaryEventHub)
    );

    return server;
  }

  private sendJsonRpcError(
    res: express.Response,
    status: number,
    code: number,
    message: string
  ) {
    res.status(status).json({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    });
  }

  private async createStreamableSession() {
    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.streamableSessions.set(sessionId, { server, transport });
      },
      onsessionclosed: (sessionId) => {
        this.streamableSessions.delete(sessionId);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        this.streamableSessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport as ServerTransport);

    return { server, transport };
  }

  private async openLegacySseConnection(req: express.Request, res: express.Response) {
    console.log(`--- New SSE Connection (GET ${this.sessionPath}) ---`);

    // Long-lived SSE 연결이 Express/Node 타임아웃에 끊기지 않도록 설정
    res.setTimeout(0);
    req.setTimeout(0);

    const server = this.createServer();
    const transport = new SSEServerTransport(this.sessionPath, res);

    this.legacySessions.set(transport.sessionId, { server, transport });

    // Proxy/방화벽이 idle 연결을 끊지 않도록 25초마다 SSE keepalive 전송
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 25_000);

    // transport.onclose / req close 중 먼저 발생한 쪽만 cleanup 처리
    let closed = false;
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.legacySessions.delete(transport.sessionId);
      try {
        await server.close();
      } catch {
        // 이미 닫힌 경우 무시
      }
    };

    transport.onclose = () => {
      console.log(`[MCP:${this.serverName}] SSE transport closed`);
      void cleanup();
    };

    req.on('close', () => {
      console.log(`[MCP:${this.serverName}] SSE request closed by client`);
      void cleanup();
    });

    await server.connect(transport);
  }

  private async handleLegacyPostMessage(req: express.Request, res: express.Response) {
    console.log(`--- New Message (POST ${this.sessionPath}) ---`);

    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;

    if (!sessionId) {
      res.status(400).send('Missing sessionId');
      return;
    }

    const session = this.legacySessions.get(sessionId);

    if (!session) {
      res.status(400).send('No active session');
      return;
    }

    await session.transport.handlePostMessage(req, res, req.body);
  }

  private isLegacySseRequest(req: express.Request) {
    if (typeof req.query.sessionId === 'string') {
      return true;
    }

    return req.method === 'GET' && !req.header('mcp-session-id');
  }

  async handleRequest(req: express.Request, res: express.Response) {
    if (this.isLegacySseRequest(req)) {
      if (req.method === 'GET') {
        await this.openLegacySseConnection(req, res);
        return;
      }

      if (req.method === 'POST') {
        await this.handleLegacyPostMessage(req, res);
        return;
      }
    }

    const sessionId = req.header('mcp-session-id');
    const session = sessionId ? this.streamableSessions.get(sessionId) : undefined;

    if (session) {
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const newSession = await this.createStreamableSession();
      await newSession.transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId) {
      this.sendJsonRpcError(res, 404, -32001, 'Session not found');
      return;
    }

    this.sendJsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
  }
}
