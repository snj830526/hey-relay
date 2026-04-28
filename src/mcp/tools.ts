import type { RelayStore } from '../store/relayStore.js';
import type { SummaryEventHub } from '../services/summaryEventHub.js';

export const mcpTools = [
  {
    name: 'pull_memo',
    description: '아이패드에서 보낸 메모를 꺼냅니다. 읽은 항목은 제거됩니다.',
    inputSchema: { type: 'object', properties: { peek: { type: 'boolean' } } },
  },
  {
    name: 'push_memo',
    description:
      'AI가 Buffer로 보낼 내용을 Context Block으로 저장합니다. push_summary와 동일한 수신함에 들어갑니다.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
  },
  {
    name: 'list_memos',
    description: '현재 쌓인 메모 목록 조회',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'push_summary',
    description:
      'AI가 Buffer로 보낼 요약/응답을 Context Block으로 저장합니다. push_memo와 동일한 수신함에 들어갑니다.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'pull_summary',
    description: '앱에서 pull할 Context Block을 꺼냅니다. 읽은 항목은 제거됩니다.',
    inputSchema: { type: 'object', properties: { peek: { type: 'boolean' } } },
  },
  {
    name: 'list_summaries',
    description: '현재 쌓인 Context Block 목록 조회',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_protocol',
    description:
      '운영 규약이나 고정 가이드를 key-value로 서버에 영구 저장합니다. consume 대상이 아닌 고정 문서(시스템 규약, 사용 가이드 등)용입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['key', 'content'],
    },
  },
  {
    name: 'get_protocol',
    description: '저장된 운영 규약을 key로 조회합니다. 읽어도 삭제되지 않습니다.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'list_protocols',
    description: '저장된 프로토콜 key 목록을 조회합니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_protocol',
    description: '저장된 프로토콜 항목을 삭제합니다.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
] as const;

function asTextResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown> = {},
  relayStore: RelayStore,
  summaryEventHub: SummaryEventHub
) {
  if (name === 'pull_memo') {
    return asTextResult(await relayStore.pullMemos(args.peek === true));
  }

  if (name === 'push_memo') {
    const command = typeof args.command === 'string' ? args.command : '';
    const { id, created } = await relayStore.saveSummary(command, undefined, 'push_memo');

    if (created) {
      await summaryEventHub.notifyAll();
      return asTextResult(`✓ Context Block 저장 완료 (key: ${id})`);
    }

    return asTextResult(`ℹ 이미 같은 Context Block이 있습니다. 기존 key: ${id}`);
  }

  if (name === 'list_memos') {
    const ids = await relayStore.listMemoIds();
    const text = ids.length === 0 ? '(비어 있음)' : `총 ${ids.length}개\n${ids.join('\n')}`;
    return asTextResult(text);
  }

  if (name === 'push_summary') {
    const content = typeof args.content === 'string' ? args.content : '';
    const title = typeof args.title === 'string' ? args.title : undefined;
    const { id, created } = await relayStore.saveSummary(content, title, 'push_summary');

    if (created) {
      await summaryEventHub.notifyAll();
      return asTextResult(`✓ Context Block 저장 완료 (key: ${id})`);
    }

    return asTextResult(`ℹ 이미 같은 Context Block이 있습니다. 기존 key: ${id}`);
  }

  if (name === 'pull_summary') {
    return asTextResult(await relayStore.pullSummaries(args.peek === true));
  }

  if (name === 'list_summaries') {
    const ids = await relayStore.listSummaryIds();
    const text = ids.length === 0 ? '(비어 있음)' : `총 ${ids.length}개\n${ids.join('\n')}`;
    return asTextResult(text);
  }

  if (name === 'set_protocol') {
    const key = typeof args.key === 'string' ? args.key : '';
    const content = typeof args.content === 'string' ? args.content : '';
    if (!key) return asTextResult('오류: key가 필요합니다.');
    await relayStore.setProtocol(key, content);
    return asTextResult(`✓ 프로토콜 저장 완료 (key: ${key})`);
  }

  if (name === 'get_protocol') {
    const key = typeof args.key === 'string' ? args.key : '';
    if (!key) return asTextResult('오류: key가 필요합니다.');
    const content = await relayStore.getProtocol(key);
    if (!content) return asTextResult(`(프로토콜 없음: ${key})`);
    return asTextResult(`[${key}]\n${content}`);
  }

  if (name === 'list_protocols') {
    const keys = await relayStore.listProtocols();
    const text = keys.length === 0 ? '(저장된 프로토콜 없음)' : `총 ${keys.length}개\n${keys.join('\n')}`;
    return asTextResult(text);
  }

  if (name === 'delete_protocol') {
    const key = typeof args.key === 'string' ? args.key : '';
    if (!key) return asTextResult('오류: key가 필요합니다.');
    const deleted = await relayStore.deleteProtocol(key);
    if (!deleted) return asTextResult(`(프로토콜 없음: ${key})`);
    return asTextResult(`✓ 프로토콜 삭제 완료 (key: ${key})`);
  }

  throw new Error(`Unknown tool: ${name}`);
}
