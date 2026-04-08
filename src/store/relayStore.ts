import type { Redis } from 'ioredis';

import { formatSummaryContent, getSummaryTitle } from '../lib/summaryFormatter.js';

export type SummaryPayload = {
  title: string | null;
  content: string;
  savedAt: string;
};

const MEMO_PREFIX = 'memo:';
const SUMMARY_PREFIX = 'summary:';

export class RelayStore {
  constructor(private readonly redis: Redis) {}

  async saveMemo(command: string) {
    const id = Date.now().toString();
    await this.redis.set(`${MEMO_PREFIX}${id}`, command);
    return id;
  }

  async listMemoIds() {
    const keys = await this.redis.keys(`${MEMO_PREFIX}*`);
    return keys.sort().map((key) => key.replace(MEMO_PREFIX, ''));
  }

  async pullMemos(peek = false) {
    return this.pullByPrefix(MEMO_PREFIX, peek);
  }

  async saveSummary(content: string, title?: string) {
    const id = Date.now().toString();
    const formattedContent = formatSummaryContent(content, title);
    const normalizedTitle = getSummaryTitle(formattedContent, title);
    const payload: SummaryPayload = {
      title: normalizedTitle,
      content: formattedContent,
      savedAt: new Date().toISOString(),
    };

    await this.redis.set(`${SUMMARY_PREFIX}${id}`, JSON.stringify(payload));
    return { id, payload };
  }

  async listSummaryIds() {
    const keys = await this.redis.keys(`${SUMMARY_PREFIX}*`);
    return keys.sort().map((key) => key.replace(SUMMARY_PREFIX, ''));
  }

  async listSummaries() {
    const keys = (await this.redis.keys(`${SUMMARY_PREFIX}*`)).sort();

    return Promise.all(
      keys.map(async (key) => {
        const raw = await this.redis.get(key);
        return {
          id: key.replace(SUMMARY_PREFIX, ''),
          ...(raw ? (JSON.parse(raw) as SummaryPayload) : {}),
        };
      })
    );
  }

  async pullSummaries(peek = false) {
    return this.pullByPrefix(SUMMARY_PREFIX, peek);
  }

  async getSummaryCount() {
    const keys = await this.redis.keys(`${SUMMARY_PREFIX}*`);
    return keys.length;
  }

  async deleteSummary(id: string) {
    const key = `${SUMMARY_PREFIX}${id}`;
    const raw = await this.redis.get(key);

    if (!raw) {
      return null;
    }

    await this.redis.del(key);

    return {
      id,
      ...(JSON.parse(raw) as SummaryPayload),
    };
  }

  private async pullByPrefix(prefix: string, peek: boolean) {
    const keys = (await this.redis.keys(`${prefix}*`)).sort();

    if (keys.length === 0) {
      return '(아직 쌓인 항목이 없습니다)';
    }

    const shouldDelete = peek !== true;

    const parts = await Promise.all(
      keys.map(async (key) => {
        const value = await this.redis.get(key);

        if (shouldDelete) {
          await this.redis.del(key);
        }

        return `[${key.replace(prefix, '')}]\n${value ?? ''}`;
      })
    );

    return parts.join('\n\n---\n\n');
  }
}
