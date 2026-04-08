import { Router } from 'express';

import type { RelayStore } from '../store/relayStore.js';

export function createOpenAiRouter(relayStore: RelayStore) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      ok: true,
      endpoint: '/openai',
      message: 'OpenAI/Codex 관련 진단용 엔드포인트입니다. 실제 MCP 연결은 /mcp/openai 를 사용합니다.',
    });
  });

  router.get('/health', async (_req, res) => {
    const memoCount = (await relayStore.listMemoIds()).length;
    const summaryCount = (await relayStore.listSummaryIds()).length;

    res.json({
      ok: true,
      endpoint: '/openai',
      memoCount,
      summaryCount,
    });
  });

  return router;
}
