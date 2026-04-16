# 주요 API 계약서

`docs/api.md`의 전체 라우트 중 데모와 핵심 실행 흐름에 직접 쓰이는 API를 계약 단위로 정리합니다. 모든 엔드포인트 목록은 [`../api.md`](../api.md)를 기준으로 합니다.

## 공통 계약

- 계약 참조: 모든 API는 `method + path + body/query + 인증/의존성`으로 식별한다.
- 실패 시 기본 처리: 상태 불일치, 유효성 에러, 락 충돌은 에러 메시지와 함께 작업 중단 여부를 명시한다.

## Contract: POST /api/agent/execute

### 목표
태스크 실행 파이프라인(실행/재시도 기반 워크플로우)을 시작한다.

### 입력
- `taskId` (필수)
- `options`:
  - `discussionMode`: `off` | `step_handoff` | `roundtable`
  - `strategyPreset`: `quality_first` | `balanced` | `speed_first` | `cost_saver`
  - `maxDiscussionThoughts`: number
  - `carryDiscussionToPrompt`: boolean

### 제약
- 태스크가 실행 가능한 상태여야 함
- 동시 실행 잠금 충돌이 없어야 함

### 출력
- `task` 상태 전환 이벤트
- 진행 로그와 SSE 스트리밍 토큰(연동 시)

### 성공기준
- 실행이 시작되면 `working` 계열 상태가 기록됨
- 진행 메타데이터(`metadata.executionOptions` 등)가 업데이트됨

## Contract: POST /api/agent/plan

### 목표
태스크 설명과 대상 프로젝트 컨텍스트를 바탕으로 실행 가능한 workflow를 만든다.

### 입력
- `taskId` (필수)
- 실행 옵션: `planningDepth`, `coordinationMode`, `proactiveMode` 등

### 제약
- 태스크가 존재해야 함
- 대상 프로젝트가 연결되어 있으면 path 접근이 가능해야 함

### 출력
- `Tasks.workflow`
- plan 관련 실행 로그
- 선택적으로 `metadata.planArtifacts.deepPlan`

### 성공기준
- 이후 `execute`가 사용할 수 있는 step 목록이 저장됨
- 필요한 agent/skill과 주요 위험이 설명됨

## Contract: GET /api/agent/stream

### 목표
Plan, Execute, Verify, Ralph 실행 진행 상황을 SSE로 스트리밍한다.

### 입력
- `taskId` (필수, query)
- `action`: `plan` | `execute` | `verify` | `ralph`
- 실행 옵션 query: `discussionMode`, `strategyPreset`, `multiPhaseCodegen`, `planningDepth`, `coordinationMode`, `proactiveMode`

### 제약
- 지원하는 action이어야 함
- 장시간 실행 중 연결 종료 가능성을 고려해야 함

### 출력
- 진행 이벤트, 로그 이벤트, 완료/오류 이벤트
- 실행 옵션은 `Tasks.metadata.executionOptions`에 반영될 수 있음

### 성공기준
- UI가 진행 상태를 실시간으로 표시하고 종료 후 태스크 상태를 재조회할 수 있음

## Contract: POST /api/agent/verify

### 목표
실행 결과를 검증하고 QA/PR 준비에 필요한 메타데이터를 저장한다.

### 입력
- `taskId` (필수)

### 제약
- 태스크가 검증 가능한 상태여야 함
- 대상 프로젝트 dev 서버가 있으면 QA URL 추론 가능성이 높아짐

### 출력
- 검증 결과
- `metadata.qaPageCheck`, `metadata.qaSignoff` 등 QA 관련 메타데이터

### 성공기준
- 검증 결과가 pass/fail과 근거를 포함해 저장됨

## Contract: POST /api/agent/retry

### 목표
실패한 태스크를 이전 metadata와 오류 정보를 바탕으로 재개한다.

### 입력
- `taskId` (필수)

### 제약
- 실패 상태 또는 재시도 가능한 상태여야 함
- 무한 재시도를 피하기 위해 retry count와 실패 원인을 보존해야 함

### 출력
- 재시도 실행 로그
- 갱신된 태스크 상태와 metadata

### 성공기준
- 실패 원인이 다음 실행 컨텍스트에 반영됨

## Contract: POST /api/agent/review/suggestions

### 목표
코드 리뷰 결과 기반 개선 제안을 구조화해 제시한다.

### 입력
- `taskId` (필수)
- `taskMetadata` 또는 `fileChanges`(선택 보강)

### 제약
- 대상 태스크가 검토 가능한 상태인지 확인

### 출력
- 제안 목록(`reviewSuggestions`) 및 적용 가이드

### 성공기준
- 제안의 변경 범위가 파일 단위로 구분되어 있어야 함
- 비정합 제안은 `reason`과 함께 제외

## Contract: POST /api/agent/approve

### 목표
review 상태 태스크를 사용자 승인 흐름으로 완료 상태로 전환한다.

### 입력
- `taskId` (필수)
- `approvalNote` (선택)

### 제약
- 현재 상태가 승인 가능한 단계를 충족해야 함

### 출력
- 작업 상태 전환 결과
- 승인 타임스탬프/메타 반영

### 성공기준
- 상태가 `done`으로 바뀌고 승인 이력이 기록됨

## Contract: GET /api/project/components

### 목표
특정 프로젝트의 현재 컴포넌트 카탈로그를 반환한다.

### 입력
- `projectId` (필수)
- `taskId` (선택)

### 제약
- 프로젝트 접근권한 확인

### 출력
- 컴포넌트 경로 목록

### 성공기준
- JSON 형태로 재사용 가능한 경로가 중복 없이 반환됨

## Contract: GET /api/project/task-preview-url

### 목표
태스크에 연결된 대상 워크스페이스 dev 앱의 **미리보기 URL**을 서버에서 계산한다.

### 입력
- `taskId` (필수, query)

### 제약
- 태스크에 `project_id`가 있어야 함
- 프로젝트 `path`가 유효해야 함

### 출력
- `url`, `inferenceWarning`(선택), `projectId`

### 성공기준
- QA 파이프라인과 동일한 `resolveQaPageUrlWithDiagnostics` 규칙으로 일관된 URL이 반환됨

## Contract: POST /api/agent/recovery-suggestions

### 목표
실패·QA 메타를 바탕으로 **다음 시도용 한국어 가이드**(Markdown)를 생성한다.

### 입력
- `taskId` (필수)
- `note` (선택)

### 제약
- Ollama 등 LLM 가용
- 태스크 존재

### 출력
- `{ markdown: string }`

## Contract: POST /api/agent/handoff-summary

### 목표
실행 기록을 **인수인계용 요약 Markdown**으로 생성한다.

### 입력
- `taskId` (필수)

### 출력
- `{ markdown: string }`

## Contract: POST /api/agent/spec-expand

### 목표
태스크 설명을 AC·스모크 등이 포함된 스펙으로 확장하고 **`metadata.specExpansion`**에 저장한다.

### 입력
- `taskId` (필수)

### 제약
- 태스크 상태가 `pending` 또는 `planning` (그 외 409)

### 출력
- `{ markdown, generatedAt }`

### 성공기준
- 이후 `Orchestrator.plan`이 `specExpansion`을 플랜 입력에 합침

## Contract: GET /api/tasks/similar

### 목표
같은 프로젝트의 **완료(`done`)** 태스크 중 제목·설명 토큰 유사 상위 목록을 반환한다.

### 입력
- `projectId` (필수)
- `title`, `description` (선택, query)
- `excludeId` (선택)

### 출력
- `{ similar: Array<{ id, title, description, score }> }`
