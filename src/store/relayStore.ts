import type { Redis } from 'ioredis';

import { formatSummaryContent, getSummaryTitle } from '../lib/summaryFormatter.js';

export type SummaryPayload = {
  title: string | null;
  content: string;
  savedAt: string;
};

export type SavedSummary = {
  id: string;
  payload: SummaryPayload;
  created: boolean;
};

export type SummaryRecord = {
  id: string;
  title: string | null;
  content: string;
  savedAt: string;
};

const MEMO_PREFIX = 'memo:';
const SUMMARY_PREFIX = 'summary:';
const PROTOCOL_PREFIX = 'protocol:';

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
    const formattedContent = formatSummaryContent(content, title);
    const normalizedTitle = getSummaryTitle(formattedContent, title);
    const existingSummary = await this.findMatchingSummary(normalizedTitle, formattedContent);

    if (existingSummary) {
      return {
        id: existingSummary.id,
        payload: existingSummary.payload,
        created: false,
      } satisfies SavedSummary;
    }

    const id = Date.now().toString();
    const payload: SummaryPayload = {
      title: normalizedTitle,
      content: formattedContent,
      savedAt: new Date().toISOString(),
    };

    await this.redis.set(`${SUMMARY_PREFIX}${id}`, JSON.stringify(payload));
    return { id, payload, created: true } satisfies SavedSummary;
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
        const payload = this.parseSummaryPayload(raw);
        return {
          id: key.replace(SUMMARY_PREFIX, ''),
          ...payload,
        } satisfies SummaryRecord;
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

  // ── Protocol (고정 운영 규약 저장소) ───────────────────────────────────────
  // protocol은 consume 대상이 아닌 영구 참조 문서다.
  // 읽어도 삭제되지 않으며, 명시적 delete로만 제거된다.

  async setProtocol(key: string, content: string) {
    await this.redis.set(`${PROTOCOL_PREFIX}${key}`, content);
    return key;
  }

  async getProtocol(key: string) {
    return this.redis.get(`${PROTOCOL_PREFIX}${key}`);
  }

  async listProtocols() {
    const keys = await this.redis.keys(`${PROTOCOL_PREFIX}*`);
    return keys.sort().map((k) => k.replace(PROTOCOL_PREFIX, ''));
  }

  async deleteProtocol(key: string) {
    const fullKey = `${PROTOCOL_PREFIX}${key}`;
    const content = await this.redis.get(fullKey);
    if (!content) return null;
    await this.redis.del(fullKey);
    return content;
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
      ...this.parseSummaryPayload(raw),
    };
  }

  private async findMatchingSummary(title: string | null, content: string) {
    const summaries = await this.listSummaries();
    const matchingSummary = summaries.find(
      (summary) => summary.title === title && summary.content === content
    );

    if (!matchingSummary) {
      return null;
    }

    return {
      id: matchingSummary.id,
      payload: {
        title: matchingSummary.title,
        content: matchingSummary.content,
        savedAt: matchingSummary.savedAt,
      } satisfies SummaryPayload,
    };
  }

  private parseSummaryPayload(raw: string | null) {
    if (!raw) {
      return {
        title: null,
        content: '',
        savedAt: '',
      } satisfies SummaryPayload;
    }

    return JSON.parse(raw) as SummaryPayload;
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
