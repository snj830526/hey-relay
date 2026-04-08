import type express from 'express';

import type { RelayStore } from '../store/relayStore.js';

export class SummaryEventHub {
  private readonly clients = new Set<express.Response>();

  constructor(private readonly relayStore: RelayStore) {}

  addClient(client: express.Response) {
    this.clients.add(client);
  }

  removeClient(client: express.Response) {
    this.clients.delete(client);
  }

  async sendCurrentCount(client: express.Response) {
    const count = await this.relayStore.getSummaryCount();
    client.write(`data: ${JSON.stringify({ count })}\n\n`);
  }

  async notifyAll() {
    const count = await this.relayStore.getSummaryCount();
    const data = `data: ${JSON.stringify({ count })}\n\n`;

    this.clients.forEach((client) => {
      try {
        client.write(data);
      } catch {
        this.clients.delete(client);
      }
    });
  }
}
