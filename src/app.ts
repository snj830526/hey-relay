import express from 'express';
import cors from 'cors';

import type { Redis } from 'ioredis';
import { createMcpInfoRouter, createMcpRouter } from './routes/mcp.js';
import { createMemoRouter } from './routes/memo.js';
import { createSummaryRouter } from './routes/summary.js';
import { createOpenAiRouter } from './routes/openai.js';
import { RelayStore } from './store/relayStore.js';
import { SummaryEventHub } from './services/summaryEventHub.js';
import { McpRelayService } from './services/mcpRelayService.js';

export function createApp(redis: Redis) {
  const app = express();
  const relayStore = new RelayStore(redis);
  const summaryEventHub = new SummaryEventHub(relayStore);
  const claudeMcpRelayService = new McpRelayService(
    '/mcp/claude',
    'hey-relay-claude',
    relayStore,
    summaryEventHub
  );
  const openAiMcpRelayService = new McpRelayService(
    '/mcp/openai',
    'hey-relay-openai',
    relayStore,
    summaryEventHub
  );
  const legacyMcpRelayService = new McpRelayService(
    '/mcp',
    'hey-relay-legacy',
    relayStore,
    summaryEventHub
  );

  app.use(cors());

  app.use('/mcp/claude', express.json(), createMcpRouter(claudeMcpRelayService));
  app.use('/mcp/openai', express.json(), createMcpRouter(openAiMcpRelayService));
  app.use('/mcp/info', createMcpInfoRouter());
  app.use('/mcp', express.json(), createMcpRouter(legacyMcpRelayService));
  app.use('/push', express.json(), createMemoRouter(relayStore));
  app.use('/summary', express.json(), createSummaryRouter(relayStore, summaryEventHub));
  app.use('/openai', createOpenAiRouter(relayStore));

  app.get('/health', async (_req, res) => {
    res.json({
      ok: true,
      service: 'hey-relay',
      endpoints: ['/mcp', '/mcp/claude', '/mcp/openai', '/mcp/info', '/push', '/summary', '/openai'],
    });
  });

  return app;
}
