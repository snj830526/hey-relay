import type { RelayStore } from '../store/relayStore.js';

/**
 * 서버 시작 시 protocol 저장소에 기본 운영 규약을 심는다.
 * 이미 존재하는 key는 덮어쓰지 않는다.
 */
export async function seedProtocols(store: RelayStore) {
  const existing = await store.listProtocols();

  for (const [key, content] of Object.entries(DEFAULT_PROTOCOLS)) {
    if (!existing.includes(key)) {
      await store.setProtocol(key, content);
      console.log(`[protocol] seeded: ${key}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 기본 프로토콜 정의
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PROTOCOLS: Record<string, string> = {
  'mcp-usage-guide': `
[SYSTEM PROTOCOL - MCP USAGE GUIDE]

목적:
hey-relay를 새 스레드나 다른 AI에서도 일관되게 쓰기 위한 최소 사용 가이드.
세션 기억이나 개별 AI의 습관에 의존하지 않고, app inbox / context block outbox / protocol 의 역할을 고정한다.

────────────────────
기본 역할

- memo    : app  → assistant  임시 입력 inbox   (pull_memo로 소비)
- context : assistant → app   Context Block outbox (push_memo/push_summary 모두 저장, app pull로 소비)
- protocol: 영구 참조 문서    운영 규약 / 가이드 (읽어도 삭제 안 됨)

────────────────────
읽기/쓰기 규칙

| 주체       | memo inbox | context block outbox | protocol       |
|------------|------------|-----------------------|----------------|
| assistant  | pull (읽기)| push (쓰기)           | get (읽기 전용)|
| app        | push (쓰기)| pull (읽기)           | -              |

- assistant가 Buffer로 보낼 내용은 push_memo 또는 push_summary 어느 쪽을 써도 Context Block으로 저장된다
- app은 memo를 읽지 않는다
- protocol은 assistant가 get으로만 참조한다 (set/delete는 명시적 요청 시에만)

────────────────────
peek vs pull

- peek=true  : 미리보기 전용, 항목이 제거되지 않음
- peek=false : 실제 소비, 읽은 뒤 항목 제거 (기본값)
- peek로 본 항목이 서버에 남아 있는 것은 정상 동작이다

────────────────────
운영 원칙

1. app이 보내는 memo는 임시 입력 전용 — 운영 규약이나 장기 문서를 넣지 않는다
2. AI가 앱으로 보내는 내용은 모두 Context Block outbox에 저장한다
3. 고정 규약은 protocol에 저장한다 — Context Block을 protocol 대용으로 쓰지 않는다
4. 받을 때는 memo/summary 이름을 고민하지 않고, 쓸 때 short/full을 선택한다

────────────────────
주의 사항

- app inbox와 Context Block outbox의 생산자/소비자 경계가 깨지면 중복 전송, 상태 혼선, 읽음 여부 혼란이 반복된다
- 새 스레드나 다른 AI를 시작할 때 이 가이드를 먼저 확인한다
  → get_protocol("mcp-usage-guide")

────────────────────
한 줄 요약

파일을 관리하는 것이 아니라 맥락의 흐름을 운영한다.
앱 입력은 memo inbox, AI 출력은 Context Block outbox, 고정 문서는 protocol로 유지한다.
`.trim(),
};
