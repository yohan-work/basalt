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
  - `metadata.budgetPolicy` — 태스크당 누적 LLM 토큰 상한은 `lib/orchestration/policy.ts`의 **`resolveExecutionTokenCap`**으로 정해진다. **프리셋 기본값 + 워크플로 스텝 수·버퍼**로 동적 확장되며, `metadata.budgetPolicy.maxTokensPerTask`가 있으면 그 값과 동적 하한 중 **큰 값**이 채택된다. **절대 상한**은 환경 변수 `BASALT_MAX_TOKENS_PER_TASK_CEILING`(기본 약 400만, `0`/`unlimited`는 사실상 무제한)으로 제한된다. 플랜·토론·이전 스텝·`write_code` 직전까지 누적이 상한을 넘으면 `write_code` 호출 전에 차단되며, 오류 메시지에 동적 상한·환경 변수·`discussionMode` 조정 안내가 포함된다.
- 파일 변경 추적
  - `write_code` 실행 시 before/after diff 캡처 후 `metadata.fileChanges` 반영
- `write_code` 배치 처리
  - 한 스텝에서 여러 파일이 나오면 **`components/ui/*`를 먼저** 저장한 뒤 나머지 경로를 저장해 import 존재성 검증과 맞춘다.
- 경로 정규화(`normalizeWriteTargetPath`)
  - 프로파일의 **Router Base**(`app` vs `src/app` 등)와 LLM이 낸 경로 접두가 다르면 **같은 Base로 리라이트**합니다. App Router 세그먼트에서 **`index.tsx`만** 유효한 라우트로 보이면 **`page.tsx`로** 보수적 리맵을 시도합니다.
  - `@/components/ui` 화이트리스트 위반 시(코드 `UI_IMPORT_NOT_ON_DISK` / `UI_BARREL_INVALID`) 미설치 npm 오류가 아니면 단일 파일 **UI import repair** LLM 호출 후 동일 경로에 재시도(상한).
- Dev 종료 ~ Test 진입
  - 워크플로 완료 후 `testing` 전 **`runDevExitQaPipeline`**: (선택) `DEV_QA_RUN_NEXT_BUILD=1`이면 대상 프로젝트에서 **`next build`** 를 실행해 로그 앞부분을 `metadata.devQaNextBuild`에 저장하고, `DEV_QA_FAIL_ON_NEXT_BUILD=1`이면 빌드 실패 시 파이프라인을 즉시 중단한다. QA 대상 URL은 `resolveQaPageUrlWithDiagnostics`로 정하며, App Router에서 **`page.tsx` 추론 실패**(예: 변경만 `index.tsx`) 시 **`metadata.qaRouteInferenceWarning`**을 남길 수 있다. 이후 대상 dev URL에 **`runQaPageSmokeCheck`** — HTTP 응답 HTML 스니펫 + (가능 시) 브라우저 스냅샷·본문·Next 오버레이 DOM에서 `PAGE_ERROR_SIGNALS` 탐지, 실패 시 진단 `errorExcerpt` 생성. 스모크 실패 시 **`maybeScaffoldMinimalUiKit`**(`lib/project-ui-kit.ts`)로 `components/ui` 경로를 **`lib/tsconfig-paths.ts`**의 병합 `paths`(`@/*`)와 맞춰 **비-LLM 갭 필**(button/input/label·배럴 등)을 먼저 시도하고, 새 파일이 생기면 해당 라운드에서는 LLM 자동 수정을 건너뛴 뒤 재스모크한다. 여전히 실패하면 `write_code` 자동 수정에 **발췌·`lib/qa/qa-repair-hints.ts` 문서 힌트**를 붙인 뒤 재시도·캡처·`metadata.qaSignoff` 흐름은 기존과 동일. 스모크는 콘솔 전용 오류나 빌드/런타임 불일치를 완전히 보장하지 않으며, 브라우저 미기동 시에도 HTML에 문자열이 남는 경우에 한해 탐지가 강해진다. 구현: `lib/qa/page-smoke-check.ts`, `lib/qa/qa-repair-hints.ts`, `lib/qa/dev-qa-next-build.ts`, `lib/project-ui-kit.ts`, `lib/tsconfig-paths.ts`.
- 잠금
  - 동시 실행 억제를 위한 DB 레벨 잠금 계층 적용

## 사용자 개입 포인트

- `metadata.editInProgress`, `metadata.modifyElementInProgress`로 태스크 수정 경로 락 제어
- `approve` API 기반 완료 승인 흐름
- 리뷰 제안 생성/적용 흐름을 통한 인간 검토 강화

## 참고 파일

- `lib/agents/Orchestrator.ts`
- `lib/orchestration/policy.ts` — `resolveExecutionTokenCap`, 프리셋별 스케일링, `BASALT_MAX_TOKENS_PER_TASK_CEILING`
- `lib/agents/TeamOrchestrator.ts`는 별도 문서(`docs/architecture/team-orchestrator.md`)에서 관리
- `lib/context-manager.ts`
- `lib/stream-emitter.ts`
- `app/api/agent/execute/route.ts`
