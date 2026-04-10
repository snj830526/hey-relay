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
세션 기억이나 개별 AI의 습관에 의존하지 않고, memo / summary / protocol 의 역할을 고정한다.

────────────────────
기본 역할

- memo    : app  → assistant  임시 입력 inbox   (소비됨: pull하면 제거)
- summary : assistant → app   정리된 출력 outbox (소비됨: pull하면 제거)
- protocol: 영구 참조 문서    운영 규약 / 가이드 (읽어도 삭제 안 됨)

────────────────────
읽기/쓰기 규칙

| 주체       | memo       | summary    | protocol       |
|------------|------------|------------|----------------|
| assistant  | pull (읽기)| push (쓰기)| get (읽기 전용)|
| app        | push (쓰기)| pull (읽기)| -              |

- assistant는 summary를 읽지 않는다
- app은 memo를 읽지 않는다
- protocol은 assistant가 get으로만 참조한다 (set/delete는 명시적 요청 시에만)

────────────────────
peek vs pull

- peek=true  : 미리보기 전용, 항목이 제거되지 않음
- peek=false : 실제 소비, 읽은 뒤 항목 제거 (기본값)
- peek로 본 항목이 서버에 남아 있는 것은 정상 동작이다

────────────────────
운영 원칙

1. memo는 임시 입력 전용 — 운영 규약이나 장기 문서를 넣지 않는다
2. summary는 앱이 수신할 정리 결과를 넣는 용도다
3. 고정 규약은 protocol에 저장한다 — summary를 protocol 대용으로 쓰지 않는다
4. producer/consumer 경계를 지킨다 — 같은 채널을 assistant와 app이 혼용하지 않는다

────────────────────
주의 사항

- 채널 분리가 깨지면 중복 전송, 상태 혼선, 읽음 여부 혼란이 반복된다
- 새 스레드나 다른 AI를 시작할 때 이 가이드를 먼저 확인한다
  → get_protocol("mcp-usage-guide")

────────────────────
한 줄 요약

파일을 관리하는 것이 아니라 맥락의 흐름을 운영한다.
memo / summary / protocol 의 역할을 분리하고, 읽기/쓰기 규칙을 명시적으로 유지한다.
`.trim(),
};
