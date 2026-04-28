import { Router } from 'express';

import type { SummaryEventHub } from '../services/summaryEventHub.js';
import type { RelayStore } from '../store/relayStore.js';

export function createSummaryRouter(relayStore: RelayStore, summaryEventHub: SummaryEventHub) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { content, raw, summary, title, tags, source } = req.body;
    const blockRaw = typeof raw === 'string' ? raw : content;

    if (typeof blockRaw !== 'string' || blockRaw.trim().length === 0) {
      res.status(400).json({ error: 'content 또는 raw 필드가 필요합니다.' });
      return;
    }

    const normalizedTitle = typeof title === 'string' ? title : undefined;
    const normalizedSummary = typeof summary === 'string' ? summary : undefined;
    const normalizedTags = Array.isArray(tags)
      ? tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    const normalizedSource = typeof source === 'string' ? source : 'http_summary';
    const { id, created } = await relayStore.saveSummary(
      blockRaw,
      normalizedTitle,
      normalizedSource,
      normalizedSummary,
      normalizedTags
    );

    if (created) {
      await summaryEventHub.notifyAll();
    }

    res.json({ ok: true, id, created });
  });

  router.get('/', async (_req, res) => {
    const summaries = await relayStore.listSummaries();
    res.json({ summaries });
  });

  router.delete('/:id', async (req, res) => {
    const summary = await relayStore.deleteSummary(req.params.id);

    if (!summary) {
      res.status(404).json({ error: '해당 Context Block을 찾을 수 없습니다.' });
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
