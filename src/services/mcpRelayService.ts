import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type express from 'express';

import { mcpTools, executeMcpTool } from '../mcp/tools.js';
import type { SummaryEventHub } from './summaryEventHub.js';
import type { RelayStore } from '../store/relayStore.js';

export class McpRelayService {
  private readonly server: Server;
  private transport: SSEServerTransport | null = null;

  constructor(
    private readonly sessionPath: string,
    private readonly serverName: string,
    private readonly relayStore: RelayStore,
    private readonly summaryEventHub: SummaryEventHub
  ) {
    this.server = new Server(
      { name: this.serverName, version: '2.0.0' },
      { capabilities: { tools: {} } }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));
    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      executeMcpTool(request.params.name, request.params.arguments, this.relayStore, this.summaryEventHub)
    );
  }

  async openSseConnection(req: express.Request, res: express.Response) {
    console.log(`--- New SSE Connection (GET ${this.sessionPath}) ---`);

    if (this.transport) {
      try {
        await Promise.race([
          this.server.close(),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('close timeout')), 3000);
          }),
        ]);
      } catch (error) {
        console.warn('[MCP] previous transport cleanup:', (error as Error).message);
      }

      this.transport = null;
    }

    this.transport = new SSEServerTransport(this.sessionPath, res);
    await this.server.connect(this.transport);

    req.on('close', () => {
      console.log(`[MCP:${this.serverName}] SSE connection closed, clearing transport`);
      this.transport = null;
    });
  }

  async handlePostMessage(req: express.Request, res: express.Response) {
    console.log(`--- New Message (POST ${this.sessionPath}) ---`);

    if (!this.transport) {
      res.status(400).send('No active session');
      return;
    }

    await this.transport.handlePostMessage(req, res);
  }
}
