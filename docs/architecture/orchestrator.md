# Orchestrator 아키텍처

태그: `#architecture` `#orchestrator` `#workflow` `#metadata`

Basalt의 단일 태스크 실행 핵심은 `lib/agents/Orchestrator.ts`입니다.

## 계약

### 목표
- 태스크 실행을 단계적으로 진행하고 상태/메타데이터를 안정적으로 보존

### 입력
- 작업 상태, workflow 정의, 실행 옵션

### 제약
- 실패 시 재시도 정책 준수
- 승인 필요 상태는 HITL로 분기

### 출력
- 상태 전이 로그, 실행 토론/메타 데이터

### 성공기준
- step 단위 실행이 계획대로 완료되거나 실패 지점을 명확히 저장

## 처리 흐름

1. `Pending` 태스크를 `plan` 단계로 올리고, `analyze_task`/`create_workflow` 기반으로 실행 계획(`Tasks.workflow`)을 구성합니다.
2. 실행 단계에서 `workflow`의 step들을 순서대로 수행합니다.
3. 각 step에서 담당 에이전트와 스킬을 로드하고, 인자를 보강한 뒤 실행합니다.
4. 실패/재시도 정책에 따라 `retry`가 동작하고, 성공 시 다음 step로 진행합니다.

## 핵심 책임

- 상태 전이
  - `pending -> planning -> working -> testing -> review -> done` 중심의 생애주기 관리
- 컨텍스트
  - step별로 읽은 파일, 분석 결과, 이전 실행 정보(요약/오류)를 다음 step로 전달
- 영속성
  - 주요 상태·메타데이터를 Supabase에 저장해 중단 복구와 재시도 안정성 확보
- 리스크 제어
  - 위험 step 탐지 시 `self-correction`(`analyze_error_logs`) 또는 사람 승인 흐름(HITL) 연동

## 오토메이션/안전성

- SSE 기반 실시간 진행 감시(`stream-emitter` 연동)
- 디버그/학습용 메타데이터 저장
  - `metadata.executionOptions`
  - `metadata.executionDiscussions`
  - `metadata.agentCollaboration`
  - `metadata.executionMetrics`
  - `metadata.budgetPolicy` — `maxTokensPerTask`로 태스크당 누적 LLM 토큰 상한(기본·balanced 약 32k, quality_first 약 42k). 플랜·토론·`write_code` 재시도로 빠르게 소진되면 `write_code` 직전에 차단될 수 있음.
- 파일 변경 추적
  - `write_code` 실행 시 before/after diff 캡처 후 `metadata.fileChanges` 반영
- `write_code` 배치 처리
  - 한 스텝에서 여러 파일이 나오면 **`components/ui/*`를 먼저** 저장한 뒤 나머지 경로를 저장해 import 존재성 검증과 맞춘다.
  - `@/components/ui` 화이트리스트 위반 시(코드 `UI_IMPORT_NOT_ON_DISK` / `UI_BARREL_INVALID`) 미설치 npm 오류가 아니면 단일 파일 **UI import repair** LLM 호출 후 동일 경로에 재시도(상한).
- Dev 종료 ~ Test 진입
  - 워크플로 완료 후 `testing` 전 **`runDevExitQaPipeline`**: 대상 dev URL 스모크, 필요 시 `write_code` 자동 수정, 캡처·`metadata.qaSignoff` 기록.
- 잠금
  - 동시 실행 억제를 위한 DB 레벨 잠금 계층 적용

## 사용자 개입 포인트

- `metadata.editInProgress`, `metadata.modifyElementInProgress`로 태스크 수정 경로 락 제어
- `approve` API 기반 완료 승인 흐름
- 리뷰 제안 생성/적용 흐름을 통한 인간 검토 강화

## 참고 파일

- `lib/agents/Orchestrator.ts`
- `lib/agents/TeamOrchestrator.ts`는 별도 문서(`docs/architecture/team-orchestrator.md`)에서 관리
- `lib/context-manager.ts`
- `lib/stream-emitter.ts`
- `app/api/agent/execute/route.ts`
