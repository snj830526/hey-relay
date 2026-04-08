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
    description: 'Claude가 정리한 내용을 저장합니다.',
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
    description: 'Claude가 대화 내용을 요약해서 Redis에 저장합니다. 아이패드 앱에서 pull할 용도입니다.',
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
    description: '앱에서 pull할 대화 요약을 꺼냅니다. 읽은 항목은 제거됩니다.',
    inputSchema: { type: 'object', properties: { peek: { type: 'boolean' } } },
  },
  {
    name: 'list_summaries',
    description: '현재 쌓인 대화 요약 목록 조회',
    inputSchema: { type: 'object', properties: {} },
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
    const id = await relayStore.saveMemo(command);
    return asTextResult(`✓ 저장 완료 (key: ${id})`);
  }

  if (name === 'list_memos') {
    const ids = await relayStore.listMemoIds();
    const text = ids.length === 0 ? '(비어 있음)' : `총 ${ids.length}개\n${ids.join('\n')}`;
    return asTextResult(text);
  }

  if (name === 'push_summary') {
    const content = typeof args.content === 'string' ? args.content : '';
    const title = typeof args.title === 'string' ? args.title : undefined;
    const { id } = await relayStore.saveSummary(content, title);
    await summaryEventHub.notifyAll();
    return asTextResult(`✓ 요약 저장 완료 (key: ${id})`);
  }

  if (name === 'pull_summary') {
    return asTextResult(await relayStore.pullSummaries(args.peek === true));
  }

  if (name === 'list_summaries') {
    const ids = await relayStore.listSummaryIds();
    const text = ids.length === 0 ? '(비어 있음)' : `총 ${ids.length}개\n${ids.join('\n')}`;
    return asTextResult(text);
  }

  throw new Error(`Unknown tool: ${name}`);
}
