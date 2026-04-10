import { Router } from 'express';

import type { RelayStore } from '../store/relayStore.js';

export function createProtocolRouter(relayStore: RelayStore) {
  const router = Router();

  // 전체 목록
  router.get('/', async (_req, res) => {
    const keys = await relayStore.listProtocols();
    res.json({ protocols: keys });
  });

  // 단건 조회 (읽어도 삭제되지 않음)
  router.get('/:key', async (req, res) => {
    const content = await relayStore.getProtocol(req.params.key);
    if (!content) {
      res.status(404).json({ error: '해당 프로토콜을 찾을 수 없습니다.' });
      return;
    }
    res.json({ key: req.params.key, content });
  });

  // 저장 / 업데이트
  router.put('/:key', async (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'content 필드가 필요합니다.' });
      return;
    }
    await relayStore.setProtocol(req.params.key, content);
    res.json({ ok: true, key: req.params.key });
  });

  // 삭제
  router.delete('/:key', async (req, res) => {
    const deleted = await relayStore.deleteProtocol(req.params.key);
    if (!deleted) {
      res.status(404).json({ error: '해당 프로토콜을 찾을 수 없습니다.' });
      return;
    }
    res.json({ ok: true, key: req.params.key });
  });

  return router;
}
