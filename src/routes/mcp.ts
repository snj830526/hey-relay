import { Router } from 'express';

import type { McpRelayService } from '../services/mcpRelayService.js';

export function createMcpRouter(mcpRelayService: McpRelayService) {
  const router = Router();

  router.get('/', async (req, res) => {
    await mcpRelayService.openSseConnection(req, res);
  });

  router.post('/', async (req, res) => {
    await mcpRelayService.handlePostMessage(req, res);
  });

  return router;
}

export function createMcpInfoRouter() {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      ok: true,
      message: 'Provider별 MCP 엔드포인트를 사용하세요.',
      endpoints: {
        claude: '/mcp/claude',
        openai: '/mcp/openai',
        legacy: '/mcp',
        info: '/mcp/info',
      },
    });
  });

  return router;
}
