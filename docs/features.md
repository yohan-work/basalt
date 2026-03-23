# 주요 기능 목록

태그: `#feature` `#workflow` `#safety` `#ui`

README의 장문 기능 설명을 기능별로 분리한 문서입니다.

## 공통 계약

### 목표
- 사용자 요청을 상태 안전성에 맞춰 반영 가능한 기능 단위로 분해

### 입력
- 태스크 상태, 대상 파일/요소, 사용자 지시사항

### 제약
- 작성/수정은 허용 상태에서만 수행
- 승인 불필요 동작만 자동 진행

### 출력
- 변경 로그/제안/시각화 데이터

### 성공기준
- 변경 요청이 적절한 API 계약에 매핑되어 결과가 재현됨

## 0) 실행 전 명확화 질문 · 영향 범위 미리보기

- **명확화(선택)**: `pending` 태스크에서 AI가 한국어 질문을 생성하고, 사용자 답변을 `metadata.clarifyingGate`에 저장합니다. `plan()` 시 답변이 플랜 프롬프트에 합쳐집니다. API: `POST /api/agent/clarify/generate`, `POST /api/agent/clarify/submit`.
- **영향 미리보기**: 플랜 완료 후 워크플로·분석·코드베이스 맥락으로 예상 수정 경로·위험도·가정을 생성해 `metadata.impactPreview`에 저장합니다. 사용자가 `POST /api/agent/execution/acknowledge-impact`로 확인하기 전에는 `execute`가 거절됩니다(`executionPreflight`).
- UI: `TaskDetailsModal`에서 명확화 패널·미리보기 패널, 칸반 `Start Dev`는 확인 전 비활성/안내.

## 1) 완료 산출물 수정

- 테스트/리뷰/완료 상태에서 사용자 요청 기반으로 변경을 반영합니다.
- 대상 엔드포인트: `POST /api/agent/edit-completed`
- 동시 수정은 `metadata.editInProgress` 락으로 중복 실행 방지

## 2) 특정 요소 수정

- `filePath`, `elementDescriptor`, `request` 기반으로 세부 변경 요청
- 대상 엔드포인트: `POST /api/agent/modify-element`
- 적용 이력은 `metadata.fileChanges`에 기록

## 3) 리뷰 제안 생성/적용

- `POST /api/agent/review/suggestions`로 제안 생성
- `POST /api/agent/review/apply`로 제안 반영
- 추가로 `POST /api/agent/patch-file`로 직접 파일 patch 가능

## 4) 컴포넌트 기반 태스크 생성

- 생성 시 기존 컴포넌트 경로를 컨텍스트로 주입하여 import 유도
- `CreateTaskModal`에서 `attachedComponentPaths` 전달

## 5) 코드 리뷰와 검증

- `POST /api/agent/review` 실행 시 `deep_code_review` 기반 분석
- 결과는 `metadata.reviewResult`, `metadata.reviewAt`에 저장되어 세부 탭에 표시

## 5b) testing 단계: 대상 앱 페이지 QA 스모크

- `verify()`(testing)에서 대상 프로젝트의 dev URL에 대해 `runQaPageSmokeCheck`를 실행합니다: HTTP 연결·상태 코드 확인, **응답 HTML 앞부분(최대 약 12만 자)** 을 항상 스캔해 `PAGE_ERROR_SIGNALS`와 매칭하므로 `agent-browser`가 없어도 **문자열이 HTML에 포함된 오류**(예: 일부 빌드/오버레이 문구)는 탐지할 수 있습니다. `agent-browser`가 있으면 추가로 스냅샷·본문·Next 개발 오버레이/포털 DOM에서 텍스트를 모읍니다. 매칭된 신호 주변 텍스트는 `errorExcerpt`로 잘라 `metadata.qaPageCheck`에 넣고, Dev QA 자동 수정 프롬프트에도 실립니다. 공식 문서 링크 힌트는 `lib/qa/qa-repair-hints.ts`가 신호별로 붙입니다.
- **한계**: 브라우저 콘솔만에 있는 오류·스크립트가 잡지 못한 DOM·프로덕션 최소화 메시지는 놓칠 수 있습니다. `next build`와 불일치(개발 서버만 통과)하는 문제는 선택 환경 변수 `DEV_QA_RUN_NEXT_BUILD=1`로 빌드 로그를 메타·수정 프롬프트에 넣어 보완합니다(느림). `DEV_QA_FAIL_ON_NEXT_BUILD=1`이면 빌드 실패 시 Dev QA를 즉시 실패 처리합니다.
- 스모크는 본문·스냅샷·HTML 스니펫 텍스트를 소문자로 두고 `PAGE_ERROR_SIGNALS`(`lib/qa/page-smoke-check.ts`)와 매칭하며, **빌드/Next 관련**으로는 예를 들어 module not found, metadata·`use client` 충돌, Link 중첩, hydration, `next/image` 호스트, prerender, RSC payload, `metadataBase`/viewport 관련 문구 등이 포함된다(전체 목록은 소스 기준).
- **페이지 URL**은 `resolveQaPageUrl`(내부적으로 `resolveQaPageUrlWithDiagnostics`)로 결정합니다. (1) `metadata.qaDevServerUrl`에 경로가 포함된 전체 URL이면 그대로 사용합니다. (2) 아니면 위와 동일한 우선순위로 **origin**(호스트·포트)을 정한 뒤, `metadata.qaDevServerPath`(예: `/test`)를 붙이거나, `metadata.fileChanges`에서 Next `app/.../page.tsx`·`pages/...` 경로를 휴리스틱으로 추론합니다(최근 변경 파일부터). App Router는 **`page.tsx`** 만 URL로 매핑되므로 변경 목록에 **`.../index.tsx`만** 있고 `page.tsx`가 없으면 추론이 실패해 **루트 `/`만** 열릴 수 있습니다. 이 경우 `metadata.qaRouteInferenceWarning`에 안내가 남고 Dev 종료 QA·`verify()` 로그에 WARNING이 찍힙니다(`lib/qa/infer-route-from-files.ts`, `lib/project-dev-server.ts`).
- 결과는 `metadata.qaPageCheck`에 저장됩니다. `QA_FAIL_ON_PAGE_ERRORS=true`이면 스모크 실패 시 `verify_final_output` 결과와 무관하게 검증 단계를 실패 처리합니다.
- 이후 스크린샷·반응형 점검도 동일 URL을 사용합니다.

### Dev 종료 시 자동 QA (Test 칸반 진입 전)

- `execute()`가 워크플로 스텝을 모두 마치면 **상태를 `testing`으로 바꾸기 전에** `runDevExitQaPipeline`이 실행됩니다: 선택적으로 `DEV_QA_RUN_NEXT_BUILD`가 켜져 있으면 먼저 대상 저장소에서 `next build`를 돌려 로그 일부를 `metadata.devQaNextBuild`에 남기고, 자동 수정 프롬프트에 포함합니다. 이후 대상 dev URL에 대해 `runQaPageSmokeCheck`를 반복합니다. 스모크 실패 시 **`maybeScaffoldMinimalUiKit`**으로 `components/ui` 갭 필(비 LLM)을 **먼저** 시도하고, 새 파일이 생기면 그 라운드에서는 LLM 자동 수정을 건너뛴 뒤 재스모크합니다. 그다음 필요 시 코딩 모델로 `write_code` 자동 수정을 시도합니다(기본 최대 5회, 환경 변수 `DEV_QA_MAX_REPAIR_ROUNDS`로 1–12 조정). 수정 요청에는 스모크 `errorExcerpt`·오버레이 발췌·(있으면) 빌드 로그 발췌·신호별 문서 힌트가 붙습니다. 스모크가 통과할 때까지(또는 상한 초과 시 실행 실패)입니다.
- 이어서 `verify_final_output`, `screenshot_page`·`check_responsive`, `metadata.qaSignoff`까지 같은 흐름에서 기록합니다. 따라서 Test 칸반에 도착했을 때 검수 완료 탭에 데이터가 채워져 있는 것이 정상입니다.
- 수동 **「Verify & Request PR」**(`verify()`)은 PR/Git 자동화용으로 그대로 두며, Dev 종료 파이프라인과 겹치면 메타·캡처를 다시 갱신할 수 있습니다.

## 5c) 검수 완료 탭 · QA 아티팩트

- Dev 종료 파이프라인 또는 `verify()`에서 `screenshot_page`·`check_responsive` 캡처 PNG를 대상 프로젝트 경로 아래 `.basalt/basalt-qa/<taskId>/{main,mobile,tablet,desktop}.png`로 복사합니다.
- `metadata.qaSignoff`에 스모크 결과·검증 요약·`executionRepairs` 기반 이슈 목록·한국어 서술(`narrativeKo`, `finalVerdictKo`)을 저장합니다.
- UI: 태스크 상세 모달 **「검수 완료」** 탭에서 위 문구와 스크린샷을 확인합니다. 이미지는 `GET /api/project/qa-artifact?taskId=&slot=main|mobile|tablet|desktop`으로 제공됩니다.

## 6) 승인 워크플로우(HITL)

- `approve` API로 `review` 상태 태스크를 완료 상태로 반영
- 위험 액션은 자동 중단 후 사용자 승인 대기 가능

## 7) 토론/협업 보강

- `discuss` 엔드포인트로 실행 전후 브레인스토밍 대화 생성
- `enhance-prompt`로 사용자 초안 품질 향상

## 11) 동적 기술 스택 분석 기반 프롬프트 보강

- 대상 저장소별로 더 넓게 파악할 항목(버전·CSR/SSR·라우팅 등)은 `docs/target-workspace-environment.md` 체크리스트를 참고(문서화 + 자동 프로파일 보완).
- `ProjectProfiler.getContextString()`에 `[STACK_RULES]` 블록을 포함: 먼저 `lib/stack-rules/universal.md`(공통), 이어 스택별 `.md`를 주입한다. 각 팩은 스킬 문서와 같이 YAML 메타 + **Inputs / Outputs / Instructions / MUST NOT / Use Cases**로 정리된다. `getStackSummary()`에 적용 파일명 요약이 포함되며, 명확화용 스니펫 상한은 `lib/pre-execution/task-context.ts`의 `MAX_SNIPPET`으로 조정한다.
- 동일 블록에 **`## UI_COMPONENT_POLICY`** 를 주입한다. `components/ui`(또는 `src/components/ui`)에 실제 `.ts/.tsx`가 스캔되면 **USE_EXISTING**, 없으면 **ABSENT**로 시작해 `@/components/ui/*` import를 금지·허용을 명시한다. Next/React 대상 저장소는 `execute()` 직후(피처 브랜치 체크아웃 뒤) `lib/project-ui-kit.ts`가 최소 `button`/`input`/`label`과 배럴용 `index.ts` 재export를 자동 생성할 수 있으며(환경변수 `BASALT_AUTO_SCAFFOLD_UI=0`으로 끔), 생성 내역은 `metadata.uiKitScaffold`에 남긴다. 스캐폴드 **물리 경로**는 `lib/tsconfig-paths.ts`가 `tsconfig.json`·`jsconfig.json` 등에서 병합한 **`paths["@/*"]`** 로 `@/components/ui`가 실제로 가리키는 위치(예: 루트 `components/ui` vs `src/components/ui`)와 맞춘다. **`src/app`만 있고 루트에 `app/`이 없는데 `@/*`가 `./*`만 가리키는** 잘못된 템플릿은 선택적으로 `BASALT_ALIGN_NEXT_PATH_ALIAS=1`일 때 `tsconfig.json`의 `@/*`를 `./src/*`로 보정할 수 있다. **USE_EXISTING**일 때는 Known basenames 밖의 `@/components/ui/<name>` import를 금지한다는 **FORBIDDEN** 문구와, 최소 스캐폴드(버튼·입력·라벨만)일 때 **minimal kit** 경고를 추가한다.
- `write_code` 한 스텝에서 여러 파일이 나올 때 `Orchestrator`가 **`components/ui/*` 경로를 먼저** 디스크에 쓴 뒤 페이지 등을 쓰도록 정렬해, 같은 배치 안에서 새 UI 파일을 import해도 검증이 통과되게 한다. `@/components/ui/*` 화이트리스트 위반(`UI_IMPORT_NOT_ON_DISK`, `UI_BARREL_INVALID`)이면 미설치 npm 오류가 아닌 한 **짧은 LLM repair**(`write_code_ui_import_repair`)로 해당 파일만 시맨틱 HTML 위주로 고친 뒤 `write_code`를 최대 2회 재시도한다(구현: `lib/agents/Orchestrator.ts`, 검증 메타: `lib/skills/index.ts`의 `validateImportsExistence`).
- `enhance-prompt` API가 대상 프로젝트의 `package.json`을 실제로 분석하여 제약 조건을 동적으로 생성
- `CreateTaskModal`에서 `selectedProjectId`를 `enhance-prompt`에 전달
- 서버 측에서 `ProjectProfiler.getStackSummary()`를 호출하여 프레임워크, 언어, 스타일링, UI 라이브러리, 라우터 구조, 전체 설치 패키지 목록을 한국어로 요약
- `projectId`가 없는 경우 기존 범용 프롬프트로 폴백하여 하위 호환성 유지
- 적용 파일: `components/CreateTaskModal.tsx`, `app/api/agent/enhance-prompt/route.ts`, `lib/profiler.ts`

### 11b) 대상 앱이 Next.js App Router일 때 (코드 생성 가이드 요약)

- **시스템 프롬프트**: [`lib/llm.ts`](../lib/llm.ts)의 `CODE_GENERATION_SYSTEM_RULES` — `metadata`/`generateMetadata`/`viewport` 서버 전용, `"use client"` 분리, `metadataBase`, Next 15+ `params`/`searchParams` 등. 요약 문서는 [`llm.md`](./llm.md).
- **프로젝트 컨텍스트**: [`lib/profiler.ts`](../lib/profiler.ts) `getContextString()` — Next app-router 시 metadata·Link·(15+) params 힌트.
- **스택 규칙 팩**: [`lib/stack-rules/next-app-router.md`](../lib/stack-rules/next-app-router.md) — layout/template/loading/error, MUST NOT 등.
- **Cursor 저장소 스킬**(에이전트 참고용): [`.cursor/skills/nextjs-app-router-imports/SKILL.md`](../.cursor/skills/nextjs-app-router-imports/SKILL.md) — import 경로, Link, Metadata/RSC, Proxy(구 middleware), 캐시·env 링크 등. 상세는 해당 파일·본 문서 §5b·[`llm.md`](./llm.md)와 교차 참조.

### 11c) Next.js 라우트 루트·경로 일관성 (`lib/stack-profile.ts`, `Orchestrator`, `lib/skills/index.ts`)

- **`app/`와 `src/app/` 동시 존재**: `detectNextStyleRouterStructureWithMeta`가 각 트리의 `page`/`layout` 파일 개수로 Router Base를 정하고, 동점이면 `src/app`을 우선합니다. `[PROJECT CONTEXT]`에 **`[WARNING] Router root`** 와 한국어 설명이 붙을 수 있습니다(`StackProfile.routerDualRoot`, `routerResolutionNote`).
- **`write_code` 경로 정규화**(`Orchestrator.normalizeWriteTargetPath`): 감지된 Router Base와 다른 트리(예: LLM이 `app/...`만 쓰고 실제는 `src/app`)로 온 경로를 **같은 Base로 리라이트**하고, App Router에서 **`.../index.tsx`만** 있고 같은 폴더에 `page.tsx`가 없을 때 **`page.tsx`로 유도**하는 보수적 리맵을 시도합니다(구현: `lib/agents/Orchestrator.ts`).

### 11d) `write_code` — App Router `metadata`·`viewport`와 `"use client"` 충돌 차단

- `app/.../page.tsx`·`app/.../layout.tsx`(및 `src/app/...` 동일)에 대해, **`export const metadata` / `generateMetadata` / `viewport` / `generateViewport`** 와 **`"use client"`** 또는 **훅만 있고 클라이언트 분리 없음**인 조합은 **디스크에 쓰기 전에 거부**합니다. 메시지에 [generate-metadata — server component only](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only) 링크를 포함하고, 반환 객체에 `rscBoundaryViolation: true`를 붙일 수 있습니다.
- 훅이 있는데 서버 전용 export도 있으면, 예전처럼 **`ensureClientDirectiveForReactHooks`가 맨 위에 `use client`를 자동 삽입하지 않도록** 가드되어 동일 충돌을 만들지 않습니다(`lib/skills/index.ts`).

### 11e) 플랜 단계 스킬·`scan_project`

- **`analyze_task`**, **`create_workflow`**, **`consult_agents`**의 `SKILL.md`에 **저장소 전제 체크리스트**가 있습니다: `[PROJECT CONTEXT]`의 Tech Stack, Router Type/Base, INSTALLED PACKAGES, 이중 루트 경고, `[STACK_RULES]` 등을 UI 정책과 동일한 우선순위로 읽도록 요구합니다.
- **`scan_project`**(`lib/skills/index.ts`)는 스텁이 아니라 **`ProjectProfiler.getProfileData()`** 등과 동일 신호로 구조·의존성·`routerBase`·설정 파일·디렉터리 샘플 등을 JSON에 담아 반환합니다. 상세는 `lib/skills/scan_project/SKILL.md`.
- 플랜 단계의 스택 출처 요약은 [`agents-skills.md`](./agents-skills.md)를 참고합니다.

## 12) 미설치 패키지 import 방어 (4중 방어 체계)

LLM이 프로젝트에 설치되지 않은 npm 패키지(예: `axios`, `lodash`)를 import하는 코드를 생성하여 `Module not found` 빌드 에러가 발생하는 문제를 근본적으로 차단합니다.

### 방어 계층 1: 하드 밸리데이션 (`lib/skills/index.ts`)
- App Router `page`/`layout`에 대한 **`metadata`·`viewport` vs `"use client"`·훅** RSC 경계 검증(§11d)
- `validateImportsExistence()`가 외부 npm 패키지 import도 `package.json` 기반으로 검증
- 미설치 패키지를 import하면 파일 쓰기 자체가 거부되어 재시도/보정 루프 유도
- Node.js 빌트인 모듈(`fs`, `path`, `crypto` 등)은 허용 리스트로 제외
- `installedPackagesCache`로 반복 조회 비용 최소화, `reset_runtime_caches()`에서 함께 초기화

### 방어 계층 2: LLM 컨텍스트 (`lib/profiler.ts` — `getContextString()`)
- `[PROJECT CONTEXT]`에 **INSTALLED PACKAGES (package.json)** 전체 목록 명시
- "여기 없는 패키지는 절대 import하지 마라"는 CRITICAL 지시문 포함

### 방어 계층 3: 코드 생성 시스템 프롬프트 (`lib/llm.ts`)
- `CODE_GENERATION_SYSTEM_RULES`에 **PACKAGE IMPORT RULE (ZERO TOLERANCE)** 섹션 추가
- `axios → fetch()`, `lodash → native JS`, `moment → Date` 등 구체적 대체 방법 명시

### 방어 계층 4: enhance-prompt 스택 요약 (`lib/profiler.ts` — `getStackSummary()`)
- 전체 설치 패키지 목록 + 미설치 패키지 사용 금지 경고 포함
- `enhance-prompt` 시스템 프롬프트에도 "설치되지 않은 패키지를 제약 조건에 넣지 마라" 명시

## 8) react-grab 연동

- 클립보드 기반 요소 컨텍스트 붙여넣기 지원
- 실시간 요소 전송 플로우(별도 플러그인 연동 필요)는 문서 가이드를 외부 환경에서 준비

## 9) TTS

- 서버 기반 `edge-tts-universal` 및 Web Speech API 폴백
- 메시지별 재생 토글, 자동 재생 큐, 오디오/에이전트 식별 표시

## 10) 실행/협업 시각화

- Execution Discussion, Agent Collaboration Matrix, 팀 Board/라운드 메트릭 등은 실시간/폴링 기반으로 노출
- `metadata.executionDiscussions`, `metadata.agentCollaboration` 등을 통해 뷰 데이터 구성
