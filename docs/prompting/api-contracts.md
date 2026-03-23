# API 계약서 모음

`docs/api.md`의 라우트를 AI가 바로 실행/해석할 수 있도록 계약 단위로 정리합니다.

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
