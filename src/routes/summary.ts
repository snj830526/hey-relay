import { Router } from 'express';

import type { SummaryEventHub } from '../services/summaryEventHub.js';
import type { RelayStore } from '../store/relayStore.js';

export function createSummaryRouter(relayStore: RelayStore, summaryEventHub: SummaryEventHub) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { content, title } = req.body;

    if (typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'content 필드가 필요합니다.' });
      return;
    }

    const normalizedTitle = typeof title === 'string' ? title : undefined;
    const { id } = await relayStore.saveSummary(content, normalizedTitle);
    await summaryEventHub.notifyAll();

    res.json({ ok: true, id });
  });

  router.get('/', async (_req, res) => {
    const summaries = await relayStore.listSummaries();
    res.json({ summaries });
  });

  router.delete('/:id', async (req, res) => {
    const summary = await relayStore.deleteSummary(req.params.id);

    if (!summary) {
      res.status(404).json({ error: '해당 요약을 찾을 수 없습니다.' });
      return;
    }

    await summaryEventHub.notifyAll();
    res.json({ ok: true, ...summary });
  });

  router.get('/events', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    summaryEventHub.addClient(res);
    await summaryEventHub.sendCurrentCount(res);

    const keepalive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        summaryEventHub.removeClient(res);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(keepalive);
      summaryEventHub.removeClient(res);
    });
  });

  return router;
}
