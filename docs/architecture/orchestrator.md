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
2. `metadata.executionOptions`에 `planningDepth=deep`가 켜져 있으면, plan review 이후 추가 consultation으로 **deep plan artifact**를 생성해 `metadata.planArtifacts.deepPlan`에 저장합니다.
3. 실행 단계에서 `workflow`의 step들을 순서대로 수행합니다.
4. 각 step에서 담당 에이전트와 스킬을 로드하고, 인자를 보강한 뒤 실행합니다.
5. `coordinationMode=parallel`일 때는 플랜 단계 및 step handoff 시점의 구조화 메모를 `metadata.agentInbox[]`에 저장합니다.
6. 실패/재시도 정책에 따라 `retry`가 동작하고, 성공 시 다음 step로 진행합니다.

## 핵심 책임

- 상태 전이
  - `pending -> planning -> working -> testing -> review -> done` 중심의 생애주기 관리
- 컨텍스트
  - step별로 읽은 파일, 분석 결과, 이전 실행 정보(요약/오류)를 다음 step로 전달
  - 프로젝트 세션 메모리는 `MEMORY_INDEX`와 최근 관련 memory를 함께 읽어 플랜/실행 컨텍스트에 보강
- 영속성
  - 주요 상태·메타데이터를 Supabase에 저장해 중단 복구와 재시도 안정성 확보
- 리스크 제어
  - 위험 step 탐지 시 `self-correction`(`analyze_error_logs`) 또는 사람 승인 흐름(HITL) 연동
- Buddy context
  - buddy는 watcher/commentator 역할로만 프롬프트에 주입되며, 기술 의사결정을 override하지 않음
- Proactive evaluation
  - `proactiveMode`가 켜져 있으면 plan 완료, QA 실패, execution 실패 시점에 짧은 `PROACTIVE_NOTE`를 남기고 `metadata.proactiveAssistant`를 갱신

## 스킬 실행 경로·레지스트리

- **`write_code`**: 코딩 모델 스트리밍·파일 정규화·수리 루프·(옵션) 다단계 Plan→Implement→프로젝트 타입체크 재시도 등 **전용 분기**로 유지됩니다. 다단계 옵션·SSE·환경 변수는 [`../features.md`](../features.md) §5e·[`../setup.md`](../setup.md) 참고.
- **그 외 워크플로 스킬**: `generateSkillArguments` 이후 **`invokeSkillExecution`** private에서 일괄 처리합니다 — 레지스트리 기준 `projectPath` 마지막 인자 보정, `analyze_task`/`create_workflow`용 `StreamEmitter` 주입, (옵션) **스킬 risk 게이트**, `skillFunc` 호출, `read_codebase` 결과를 `ContextManager`에 반영, 실행 로그 및 `skill_execute`/`skill_result` SSE.
- **스킬 레지스트리** (`lib/skills/registry.ts`): 스킬별 **위험 표면**(fs 읽기/쓰기, network, shell, git), **`FAST_ARG_SKILL_NAMES`**(인자 생성 시 기본 FAST 모델), **`appendProjectPathLast`**, **`injectEmitterForExecution`**의 단일 소스입니다. 과거 `Orchestrator` 내부 하드코딩 배열을 대체합니다. 설계 요약: [`../../.cursor/plans/tool-registry-design.md`](../../.cursor/plans/tool-registry-design.md).
- **Risk 게이트**: `BASALT_SKILL_RISK_MODE` — 미설정과 그 외 값은 추가 동작 없음(`off`); `warn`은 shell/git/network 위험 스킬 실행 전 System 경고; `deny`는 해당 스킬 실행을 throw로 차단. 상세는 [`../setup.md`](../setup.md).

## 오토메이션/안전성

- SSE 기반 실시간 진행 감시(`stream-emitter` 연동)
- 디버그/학습용 메타데이터 저장
  - `metadata.buddy`
  - `metadata.executionOptions`
  - `metadata.executionDiscussions`
  - `metadata.agentInbox`
  - `metadata.agentCollaboration`
  - `metadata.planArtifacts`
  - `metadata.proactiveAssistant`
  - `metadata.executionMetrics`
  - `metadata.budgetPolicy` — 태스크당 누적 LLM 토큰 상한은 `lib/orchestration/policy.ts`의 **`resolveExecutionTokenCap`**으로 정해진다. **프리셋 기본값 + 워크플로 스텝 수·버퍼**로 동적 확장되며, `metadata.budgetPolicy.maxTokensPerTask`가 있으면 그 값과 동적 하한 중 **큰 값**이 채택된다. **절대 상한**은 환경 변수 `BASALT_MAX_TOKENS_PER_TASK_CEILING`(기본 약 400만, `0`/`unlimited`는 사실상 무제한)으로 제한된다. 플랜·토론·이전 스텝·`write_code` 직전까지 누적이 상한을 넘으면 `write_code` 호출 전에 차단되며, 오류 메시지에 동적 상한·환경 변수·`discussionMode` 조정 안내가 포함된다.
- Agent Inbox
  - `executionDiscussions`가 자유형 thought 로그라면, `agentInbox`는 `from/to/summary/actionRequired` 중심의 구조화 handoff 저장소입니다. `parallel` coordination에서만 적극적으로 사용합니다.
- Buddy metadata
  - `metadata.buddy`는 `TaskBuddyInstance`를 저장하며, `Execution_Logs.metadata`에는 전체 정의 대신 `buddyId`, `buddyInstanceId` 같은 최소 필드만 넣습니다.
- 파일 변경 추적
  - `write_code` 실행 시 before/after diff 캡처 후 `metadata.fileChanges` 반영
- `write_code` 배치 처리
  - 한 스텝에서 여러 파일이 나오면 **`components/ui/*`를 먼저** 저장한 뒤 나머지 경로를 저장해 import 존재성 검증과 맞춘다.
- 경로 정규화(`normalizeWriteTargetPath`)
  - 프로파일의 **Router Base**(`app` vs `src/app` 등)와 LLM이 낸 경로 접두가 다르면 **같은 Base로 리라이트**합니다. App Router 세그먼트에서 **`index.tsx`만** 유효한 라우트로 보이면 **`page.tsx`로** 보수적 리맵을 시도합니다.
  - `@/components/ui` 검증 실패 시: **`UI_IMPORT_NOT_ON_DISK`** 이고 미설치 npm 오류가 아니면 **`scaffoldMissingUiFromImportSpecifiers`**로 누락 `components/ui/<name>.tsx`(및 필요 시 배럴 export)를 먼저 생성한 뒤 `reset_runtime_caches()` 하고 동일 내용으로 `write_code`를 재시도한다(`BASALT_AUTO_SCAFFOLD_UI_EXTENDED=0`으로 끔). 그래도 실패하면 **`UI_IMPORT_NOT_ON_DISK` / `UI_BARREL_INVALID`**에 대해 **UI import repair** LLM 호출 후 동일 경로에 재시도(상한). 상세는 [`../features.md`](../features.md) §11·§13 및 `lib/project-ui-kit.ts`.
- Dev 종료 ~ Test 진입
  - 워크플로 완료 후 `testing` 전 **`runDevExitQaPipeline`**: (선택) `DEV_QA_RUN_NEXT_BUILD=1`이면 대상 프로젝트에서 **`next build`** 를 실행해 로그 앞부분을 `metadata.devQaNextBuild`에 저장하고, `DEV_QA_FAIL_ON_NEXT_BUILD=1`이면 빌드 실패 시 파이프라인을 즉시 중단한다. QA 대상 URL은 `resolveQaPageUrlWithDiagnostics`로 정하며, App Router에서 **`page.tsx` 추론 실패**(예: 변경만 `index.tsx`) 시 **`metadata.qaRouteInferenceWarning`**을 남길 수 있다. 이후 대상 dev URL에 **`runQaPageSmokeCheck`** — HTTP 응답 HTML 스니펫 + (가능 시) 브라우저 스냅샷·본문·Next 오버레이 DOM에서 `PAGE_ERROR_SIGNALS` 탐지, 실패 시 진단 `errorExcerpt` 생성. **HTTP 본문은 `<script>` / `<style>` / `<noscript>`를 제거한 뒤** 신호를 매칭해 Next dev 번들에 포함된 오류 UI 리터럴로 인한 **오탐을 줄인다**; 신호 목록·힌트 맵 조정 요약은 [`../implementation-history.md`](../implementation-history.md). 스모크 실패 시 **`maybeScaffoldMinimalUiKit`**(`lib/project-ui-kit.ts`)로 `components/ui` 경로를 **`lib/tsconfig-paths.ts`**의 병합 `paths`(`@/*`)와 맞춰 **비-LLM 갭 필**(button/input/label·배럴 등)을 먼저 시도하고, 새 파일이 생기면 해당 라운드에서는 LLM 자동 수정을 건너뛴 뒤 재스모크한다. 여전히 실패하면 `write_code` 자동 수정에 **발췌·`lib/qa/qa-repair-hints.ts` 문서 힌트**를 붙인 뒤 재시도·캡처·`metadata.qaSignoff` 흐름은 기존과 동일. `proactiveMode`가 켜져 있으면 반복 QA 실패와 execution 실패는 `PROACTIVE_NOTE` 로그를 남길 수 있다. 스모크는 콘솔 전용 오류나 빌드/런타임 불일치를 완전히 보장하지 않으며, 브라우저 미기동 시에도 HTML에 문자열이 남는 경우에 한해 탐지가 강해진다. 구현: `lib/qa/page-smoke-check.ts`, `lib/qa/qa-repair-hints.ts`, `lib/qa/dev-qa-next-build.ts`, `lib/project-ui-kit.ts`, `lib/tsconfig-paths.ts`.
- 잠금
  - 동시 실행 억제를 위한 DB 레벨 잠금 계층 적용

## 사용자 개입 포인트

- `metadata.editInProgress`, `metadata.modifyElementInProgress`로 태스크 수정 경로 락 제어
- `approve` API 기반 완료 승인 흐름
- 리뷰 제안 생성/적용 흐름을 통한 인간 검토 강화

## 참고 파일

- `lib/agents/Orchestrator.ts` — `invokeSkillExecution`, `getSkillFunction`, `write_code` 분기
- `lib/skills/registry.ts` — 스킬 메타·risk·FAST 인자 목록
- `lib/codegen/multi-phase-write-code.ts` — 다단계 `write_code` 플래그·프롬프트 조립
- `lib/orchestration/policy.ts` — `resolveExecutionTokenCap`, 프리셋별 스케일링, `BASALT_MAX_TOKENS_PER_TASK_CEILING`
- `lib/agents/TeamOrchestrator.ts`는 별도 문서(`docs/architecture/team-orchestrator.md`)에서 관리
- `lib/context-manager.ts`
- `lib/stream-emitter.ts`
- `app/api/agent/execute/route.ts`
