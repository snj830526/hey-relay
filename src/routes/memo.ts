import { Router } from 'express';

import type { RelayStore } from '../store/relayStore.js';

export function createMemoRouter(relayStore: RelayStore) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { command } = req.body;

    if (typeof command !== 'string' || command.trim().length === 0) {
      res.status(400).json({ error: 'command 필드가 필요합니다.' });
      return;
    }

    const id = await relayStore.saveMemo(command);
    res.send(`Command ${id} saved!`);
  });

  return router;
}
