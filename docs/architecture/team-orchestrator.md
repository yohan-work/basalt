# TeamOrchestrator 아키텍처

태그: `#architecture` `#team` `#orchestration` `#chat`

멀티 에이전트 협업은 `lib/agents/TeamOrchestrator.ts`에서 처리합니다.

## 계약

### 목표
- 다중 에이전트 협업에서 라운드/메시지 기반 작업 분배와 전달 흔적을 관리

### 입력
- 팀 실행 요청, 팀 보드 상태, 협업 설정

### 제약
- 라운드/turn 제한 준수
- 과도한 동시 처리로 인한 race condition 억제

### 출력
- 라운드 요약, 협업 메트릭, 에이전트 상태

### 성공기준
- 회차 종료 시 `roundSummaries` 및 `teamExecutionMetrics`가 갱신됨

## 핵심 개념

- **라운드-로빈 실행**: 팀 내 에이전트가 순차적으로 turn을 받아 작업
- **공유 보드**: 칸반 기반 태스크 분배/상태 추적
- **팀 채팅**: `chat`, `discussion`, `system` 메시지 타입으로 협업 맥락 분리
- **핸드오프**: `handoff_task` 동작으로 in-progress 태스크 인수인계

## 실행 메커니즘

1. 팀 실행 요청이 들어오면 실행 플래그와 협업 메트릭 수집을 시작합니다.
2. 라운드별로 에이전트별 수행 항목을 분배하고, 메시지 기반으로 협업 인사이트를 누적합니다.
3. 에이전트 상태와 에러/성공을 실시간으로 board에 반영합니다.
4. 회차 종료 시 `metadata.roundSummaries` 및 `metadata.teamExecutionMetrics`를 갱신합니다.

## 토큰 예산

- 단일 태스크 `Orchestrator`와 동일하게 `lib/orchestration/policy.ts`의 **`resolveExecutionTokenCap`**을 사용한다. 팀 보드의 태스크 수 등으로부터 **`syntheticStepCount`**를 두어 워크플로 스텝 수와 유사하게 동적 상한을 계산하고, `metadata.budgetPolicy`·`BASALT_MAX_TOKENS_PER_TASK_CEILING` 규칙은 동일하다.
- 구현: `lib/agents/TeamOrchestrator.ts`, `lib/orchestration/policy.ts`.

## 협업 지표

- `metadata.collaboration`: 에이전트 간 기여/전달 그래프
- `metadata.teamExecutionMetrics`: 라운드 수, 톤/속도, 성공률, LLM 사용량 기반 요약
- 대시보드 연결
  - 팀 라운드 시각화
  - 협업 매트릭스
  - 채널별 로그

## 동작 상호작용

`TeamOrchestrator`는 팀 기능 전용 API와 연계되어 있습니다.

- `POST /api/team/execute`
- `GET /api/team/execute`

상세 항목은 `docs/api.md`를 참고하세요.
