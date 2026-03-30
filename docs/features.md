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

- `verify()`(testing)에서 대상 프로젝트의 dev URL에 대해 `runQaPageSmokeCheck`를 실행합니다: HTTP 연결·**문서** 상태 코드 확인, **응답 HTML 앞부분(최대 약 12만 자)** 스캔, `PAGE_ERROR_SIGNALS` 매칭. **문서는 200이어도** 같은 페이지에서 `fetch`/`XHR`로 호출한 **`/api/...`가 404**이면 예전에는 스모크가 통과할 수 있었습니다. 이제 `agent-browser`가 있으면 `networkidle` 직후 짧은 대기 뒤 **`console` / `errors` / `network requests --type xhr,fetch`** 결과를 합쳐 (1) **동일 오리진** fetch/XHR **4xx/5xx**, (2) 콘솔 **error**·리소스 실패 문구, (3) 페이지 **uncaught** 오류를 실패로 처리합니다. 구조화 요약은 `metadata.qaPageCheck.browserDiagnostics`에 남깁니다. **`agent-browser` 0.23 미만**에서는 네트워크 요청 배열이 비어 있을 수 있어, 동일 오리진 API 실패 탐지가 약해질 수 있습니다 — `npx agent-browser@latest --version`으로 업그레이드를 권장합니다([`setup.md`](./setup.md)의 `AGENT_BROWSER_BIN`).
- `agent-browser`가 **없거나** `AGENT_BROWSER_ENABLED=false`이면 HTML·HTTP 스모크와 `PAGE_ERROR_SIGNALS`만으로 동작합니다. 이때 **DOM/innerText에 “failed to fetch” 등이 노출될 때만** 보조 신호가 잡히고, **콘솔만의 404**는 여전히 놓칠 수 있습니다.
- 매칭된 신호 주변 텍스트는 `errorExcerpt`로 잘라 `metadata.qaPageCheck`에 넣고, Dev QA 자동 수정 프롬프트에도 실립니다. 공식 문서 링크 힌트는 `lib/qa/qa-repair-hints.ts`가 신호별로 붙입니다.
- **한계**: 서드파티 도메인 API 실패는 기본적으로 무시합니다(동일 오리진만 엄격). `next build`와 불일치(개발 서버만 통과)하는 문제는 선택 환경 변수 `DEV_QA_RUN_NEXT_BUILD=1`로 빌드 로그를 메타·수정 프롬프트에 넣어 보완합니다(느림). `DEV_QA_FAIL_ON_NEXT_BUILD=1`이면 빌드 실패 시 Dev QA를 즉시 실패 처리합니다.
- 스모크는 본문·스냅샷·HTML 스니펫 텍스트를 소문자로 두고 `PAGE_ERROR_SIGNALS`(`lib/qa/page-smoke-check.ts`)와 매칭하며, **빌드/Next 관련**으로는 예를 들어 module not found, metadata·`use client` 충돌, Link 중첩, hydration, `next/image` 호스트, prerender, RSC payload, `metadataBase`/viewport 관련 문구 등이 포함된다(전체 목록은 소스 기준).
- **페이지 URL**은 `resolveQaPageUrl`(내부적으로 `resolveQaPageUrlWithDiagnostics`)로 결정합니다. (1) `metadata.qaDevServerUrl`에 경로가 포함된 전체 URL이면 그대로 사용합니다. (2) 아니면 위와 동일한 우선순위로 **origin**(호스트·포트)을 정한 뒤, `metadata.qaDevServerPath`(예: `/test`)를 붙이거나, `metadata.fileChanges`에서 Next `app/.../page.tsx`·`pages/...` 경로를 휴리스틱으로 추론합니다(최근 변경 파일부터). App Router는 **`page.tsx`** 만 URL로 매핑되므로 변경 목록에 **`.../index.tsx`만** 있고 `page.tsx`가 없으면 추론이 실패해 **루트 `/`만** 열릴 수 있습니다. 이 경우 `metadata.qaRouteInferenceWarning`에 안내가 남고 Dev 종료 QA·`verify()` 로그에 WARNING이 찍힙니다(`lib/qa/infer-route-from-files.ts`, `lib/project-dev-server.ts`).
- 결과는 `metadata.qaPageCheck`에 저장됩니다. **`QA_FAIL_ON_PAGE_ERRORS=true`**(또는 `1`/`yes`)일 때만 스모크 실패가 `verify()`의 최종 검증(`verified: false`)과 연동됩니다. 설정하지 않으면 스모크는 로그·메타(`qaPageCheck`, `qaSignoff`)에만 남고 워크플로는 계속 진행될 수 있으므로, 엄격히 막으려면 해당 환경 변수를 켜세요.
- 이후 스크린샷·반응형 점검도 동일 URL을 사용합니다.

### Dev 종료 시 자동 QA (Test 칸반 진입 전)

- `execute()`가 워크플로 스텝을 모두 마치면 **상태를 `testing`으로 바꾸기 전에** `runDevExitQaPipeline`이 실행됩니다: 선택적으로 `DEV_QA_RUN_NEXT_BUILD`가 켜져 있으면 먼저 대상 저장소에서 `next build`를 돌려 로그 일부를 `metadata.devQaNextBuild`에 남기고, 자동 수정 프롬프트에 포함합니다. 이후 대상 dev URL에 대해 `runQaPageSmokeCheck`를 반복합니다. 스모크 실패 시 **`maybeScaffoldMinimalUiKit`**으로 `components/ui` 갭 필(비 LLM)을 **먼저** 시도하고, 새 파일이 생기면 그 라운드에서는 LLM 자동 수정을 건너뛴 뒤 재스모크합니다. 그다음 필요 시 코딩 모델로 `write_code` 자동 수정을 시도합니다(기본 최대 5회, 환경 변수 `DEV_QA_MAX_REPAIR_ROUNDS`로 1–12 조정). 수정 요청에는 스모크 `errorExcerpt`·오버레이 발췌·(있으면) 빌드 로그 발췌·신호별 문서 힌트가 붙습니다. 스모크가 통과할 때까지(또는 상한 초과 시 실행 실패)입니다.
- 이어서 `verify_final_output`, `screenshot_page`·`check_responsive`, `metadata.qaSignoff`까지 같은 흐름에서 기록합니다. 따라서 Test 칸반에 도착했을 때 검수 완료 탭에 데이터가 채워져 있는 것이 정상입니다.
- 수동 **「Verify & Request PR」**(`verify()`)은 PR/Git 자동화용으로 그대로 두며, Dev 종료 파이프라인과 겹치면 메타·캡처를 다시 갱신할 수 있습니다.

## 5c) 검수 완료 탭 · QA 아티팩트

- Dev 종료 파이프라인 또는 `verify()`에서 `screenshot_page`·`check_responsive` 캡처 PNG를 대상 프로젝트 경로 아래 `.basalt/basalt-qa/<taskId>/{main,mobile,tablet,desktop}.png`로 복사합니다.
- `metadata.qaSignoff`에 스모크 결과·검증 요약·`executionRepairs` 기반 이슈 목록·한국어 서술(`narrativeKo`, `finalVerdictKo`)을 저장합니다.
- UI: 태스크 상세 모달 **「검수 완료」** 탭에서 위 문구와 스크린샷을 확인합니다. 이미지는 `GET /api/project/qa-artifact?taskId=&slot=main|mobile|tablet|desktop`으로 제공됩니다.
- **스크린샷이 생략**되고 로그에 `agent-browser 미사용`이 보일 때 확인 순서: (1) `AGENT_BROWSER_ENABLED=false`가 설정돼 있지 않은지, (2) Basalt 서버 프로세스에서 `agent-browser --version`이 되는지(터미널과 PATH가 다를 수 있음), (3) 필요 시 `.env.local`에 `AGENT_BROWSER_BIN`에 `which agent-browser`로 얻은 **절대 경로** 지정, (4) Dev 종료 QA 직전에 가용성 캐시를 비우므로 설정 변경 후 **재시작** 또는 다음 태스크 실행에서 재탐지됨. 구현: `lib/browser/agent-browser.ts`, `Orchestrator.runDevExitQaPipeline`. 상세는 [`setup.md`](./setup.md).



## 5d) Ralph 이벤트 모드 (옵트인)

- **목적**: Huntley식 외부 루프로 `plan` → 영향 범위 자동 승인 → `execute` → `verify`를 최대 N회 반복하며, 대상 프로젝트 `.basalt/ralph/<taskId>/guardrails.md`에 실패 요약을 누적해 다음 라운드 플랜에 반영합니다.
- **UI**: Request 칸반 카드에서 **Ralph 이벤트**, 태스크 상세(`pending`)에서 **Ralph 이벤트 시작**. 배너 이미지는 `public/ralph-hero.svg`(교체 가능).
- **SSE**: `GET /api/agent/stream?taskId=&action=ralph` — 기존 `plan`/`execute`/`verify`와 동일 엔드포인트, `Orchestrator` 본문은 변경하지 않고 `lib/agents/ralph-runner.ts`만 루프를 돌립니다.
- **환경 변수**: `BASALT_RALPH_MAX_ROUNDS`(기본 3, 최대 12).
- **메타데이터**: `metadata.ralphSession`에 라운드·결과(`completed`/`max_rounds`/`error`)가 기록됩니다.

## 6) 승인 워크플로우(HITL)

- `approve` API로 `review` 상태 태스크를 완료 상태로 반영
- 위험 액션은 자동 중단 후 사용자 승인 대기 가능

## 7) 토론/협업 보강

- `discuss` 엔드포인트로 실행 전후 브레인스토밍 대화 생성
- `enhance-prompt`로 사용자 초안 품질 향상

## 8) react-grab 연동

- 클립보드 기반 요소 컨텍스트 붙여넣기 지원
- 실시간 요소 전송 플로우(별도 플러그인 연동 필요)는 문서 가이드를 외부 환경에서 준비

## 9) TTS

- 서버 기반 `edge-tts-universal` 및 Web Speech API 폴백
- 메시지별 재생 토글, 자동 재생 큐, 오디오/에이전트 식별 표시

## 10) 실행/협업 시각화

- Execution Discussion, Agent Collaboration Matrix, 팀 Board/라운드 메트릭 등은 실시간/폴링 기반으로 노출
- `metadata.executionDiscussions`, `metadata.agentCollaboration` 등을 통해 뷰 데이터 구성

## 11) 동적 기술 스택 분석 기반 프롬프트 보강

- 대상 저장소별로 더 넓게 파악할 항목(버전·CSR/SSR·라우팅 등)은 `docs/target-workspace-environment.md` 체크리스트를 참고(문서화 + 자동 프로파일 보완).
- `ProjectProfiler.getContextString()`에 `[STACK_RULES]` 블록을 포함: 먼저 `lib/stack-rules/universal.md`(공통), 이어 스택별 `.md`를 주입한다. 각 팩은 스킬 문서와 같이 YAML 메타 + **Inputs / Outputs / Instructions / MUST NOT / Use Cases**로 정리된다. `getStackSummary()`에 적용 파일명 요약이 포함되며, 명확화용 스니펫 상한은 `lib/pre-execution/task-context.ts`의 `MAX_SNIPPET`으로 조정한다.
- 동일 블록에 **`## UI_COMPONENT_POLICY`** 를 주입한다. `components/ui`(또는 `src/components/ui`)에 실제 `.ts/.tsx`가 스캔되면 **USE_EXISTING**, 없으면 **ABSENT**로 시작해 `@/components/ui/*` import를 금지·허용을 명시한다. Next/React 대상 저장소는 `execute()` 직후(피처 브랜치 체크아웃 뒤) `lib/project-ui-kit.ts`가 최소 `button`/`input`/`label`과 배럴용 `index.ts` 재export를 자동 생성할 수 있으며(환경변수 `BASALT_AUTO_SCAFFOLD_UI=0`으로 끔), 생성 내역은 `metadata.uiKitScaffold`에 남긴다. 스캐폴드 **물리 경로**는 `lib/tsconfig-paths.ts`가 `tsconfig.json`·`jsconfig.json` 등에서 병합한 **`paths["@/*"]`** 로 `@/components/ui`가 실제로 가리키는 위치(예: 루트 `components/ui` vs `src/components/ui`)와 맞춘다. **`src/app`만 있고 루트에 `app/`이 없는데 `@/*`가 `./*`만 가리키는** 잘못된 템플릿은 선택적으로 `BASALT_ALIGN_NEXT_PATH_ALIAS=1`일 때 `tsconfig.json`의 `@/*`를 `./src/*`로 보정할 수 있다. **USE_EXISTING**일 때는 Known basenames 밖의 `@/components/ui/<name>` import를 금지한다는 **FORBIDDEN** 문구와, 최소 스캐폴드(버튼·입력·라벨만)일 때 **minimal kit** 경고를 추가한다.
- `write_code` 한 스텝에서 여러 파일이 나올 때 `Orchestrator`가 **`components/ui/*` 경로를 먼저** 디스크에 쓴 뒤 페이지 등을 쓰도록 정렬해, 같은 배치 안에서 새 UI 파일을 import해도 검증이 통과되게 한다. `@/components/ui/*` 검증 실패 시: **`UI_IMPORT_NOT_ON_DISK`** 이고 미설치 npm 오류가 아니면 **먼저** `importValidation.offendingUiSpecifiers`에 따라 `lib/project-ui-kit.ts`의 **`scaffoldMissingUiFromImportSpecifiers`**가 없는 `components/ui/<basename>.tsx`를 생성하고(일부 이름은 전용 템플릿, 나머지는 `div` 래퍼), 배럴 `index.ts`/`index.tsx`가 있으면 `export { … } from "./<basename>"`를 추가할 수 있다. 이후 `reset_runtime_caches()` 하고 **동일 파일 내용**으로 `write_code`를 재시도한다. 확장 스캐폴드는 **`BASALT_AUTO_SCAFFOLD_UI_EXTENDED=0`**(또는 `false`)로 끈다. 그래도 실패하면 **`UI_IMPORT_NOT_ON_DISK` / `UI_BARREL_INVALID`**에 대해 **LLM repair**(`write_code_ui_import_repair`)로 해당 소스를 고친 뒤 `write_code`를 최대 2회 재시도한다(구현: `lib/agents/Orchestrator.ts`, `lib/project-ui-kit.ts`, 검증: `lib/skills/index.ts`의 `validateImportsExistence`).
- **미설치 npm import**: `validateImportsExistence`가 `missingNpmPackageRoots`를 넘기면, 기본적으로 `lib/package-manager-install.ts`가 lockfile 기준으로 `npm install` / `pnpm add` / `yarn add`를 **한 번** 시도하고 `reset_runtime_caches()` 후 동일 소스로 `write_code`를 재시도한다. 끄려면 **`BASALT_AUTO_INSTALL_NPM_DEPS=0`**(또는 `false`). 설치 실패·재검증 실패 시에는 **LLM 복구**(`write_code_uninstalled_npm_repair`, 최대 2회)로 해당 import를 제거·대체한다.
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
- **오케스트레이터 자동 수리**: 위 조합으로 `write_code`가 실패하면 `lib/agents/Orchestrator.ts`가 **RSC 분리 수리**(최대 3회)를 호출해 서버 `page`/`layout`과 `*Client.tsx`를 나누고, 클라이언트 파일을 먼저 기록한 뒤 라우트 파일을 다시 씁니다.

### 11e) 플랜 단계 스킬·`scan_project`

- **`analyze_task`**, **`create_workflow`**, **`consult_agents`**의 `SKILL.md`에 **저장소 전제 체크리스트**가 있습니다: `[PROJECT CONTEXT]`의 Tech Stack, Router Type/Base, INSTALLED PACKAGES, 이중 루트 경고, `[STACK_RULES]` 등을 UI 정책과 동일한 우선순위로 읽도록 요구합니다.
- **`scan_project`**(`lib/skills/index.ts`)는 스텁이 아니라 **`ProjectProfiler.getProfileData()`** 등과 동일 신호로 구조·의존성·`routerBase`·설정 파일·디렉터리 샘플 등을 JSON에 담아 반환합니다. 상세는 `lib/skills/scan_project/SKILL.md`.
- 플랜 단계의 스택 출처 요약은 [`agents-skills.md`](./agents-skills.md)를 참고합니다.

### 11f) Request Work 스타일·QA 스모크·더미 이미지 (요약)

- **실행용 디자인**: `style-architect`와 `apply_design_system` / `generate_scss`는 **태스크 워크스페이스** 기준으로 동작한다. `ProjectProfiler`가 **DESIGN HINTS**(globals·tailwind 발췌)를 컨텍스트에 넣고, `apply_design_system`은 LLM + `write_code`로 단일 파일을 정렬한다. 상세·파일 목록은 [`implementation-history.md`](./implementation-history.md).
- **Dev 종료 QA 스모크**: `lib/qa/page-smoke-check.ts`에서 HTML `<script>` 등을 제거한 뒤 오류 신호를 스캔하고, 번들 문자열 오탐을 줄이기 위해 신호 목록을 조정했다. Orchestrator `runDevExitQaPipeline`과 연동.
- **더미 이미지 URL**: 코드 생성·`write_code`·`next-app-router` 스택 규칙에 **dummyimage.com** 패턴(치수만 변경)을 ZERO TOLERANCE에 가깝게 명시. 랜딩·`/features` 등에서 스톡 CDN 대신 사용.

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

## 13) 태스크 상세·생성 보조 (미리보기·LLM 요약·검색)

태스크 실행 품질과 운영 편의를 위한 **Basalt 앱 UI + 전용 API** 묶음입니다. **`recovery-suggestions`**, **`handoff-summary`**, **`spec-expand`**는 Ollama(`OLLAMA_BASE_URL`)·`generateText`를 쓰며, 실패 시 해당 API만 오류로 돌아갑니다. **`task-preview-url`**, **`tasks/similar`**, 칸반 검색은 LLM 없음. 미리보기는 대상 프로젝트 **dev 서버**가 떠 있어야 합니다.

**AI Enhance vs 유사 태스크**: 태스크 생성 화면에서 **프롬프트를 LLM으로 고도화**하는 기능은 `POST /api/agent/enhance-prompt`이며 Ollama 스마트 모델을 쓴다. 반면 **같은 프로젝트의 완료 태스크 추천**은 `GET /api/tasks/similar`로, 토큰 유사도만 계산하고 LLM을 호출하지 않는다. 터미널에 `tasks/similar` 로그만 보인다고 해서 enhance가 성공한 것은 아니다. 로그·엔드포인트 혼동 시 [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md)를 참고한다.

### 13a) Dev / Test 라이브 미리보기

- **목적**: 태스크가 **`working`(Dev)** 또는 **`testing`(Test)** 이고 프로젝트가 연결되어 있을 때, **대상 워크스페이스**의 dev 앱을 Basalt 태스크 상세 안에서 iframe으로 본다.
- **API**: `GET /api/project/task-preview-url?taskId=` — Supabase에서 태스크 `metadata`·`project_id`를 읽고, 프로젝트 `path`에 대해 [`resolveQaPageUrlWithDiagnostics`](../lib/project-dev-server.ts)로 URL·`inferenceWarning`을 반환한다(QA 스모크·`verify`와 동일한 URL 우선순위: `qaDevServerUrl` → origin + `qaDevServerPath` → `fileChanges` 기반 라우트 추론 → `/`).
- **UI**: [`TaskDetailsModal`](../components/TaskDetailsModal.tsx) 상단 탭 **Preview** — [`TaskLivePreview`](../components/TaskLivePreview.tsx)가 위 API를 호출하고, 주소창·이동·iframe 새로고침·새 탭 열기·`X-Frame-Options` 안내를 제공한다. `metadata.fileChanges` 개수가 바뀌면 컴포넌트 `key`로 재마운트해 URL을 다시 조회한다.
- **전제**: 대상 프로젝트에서 `npm run dev` 등으로 dev 서버가 떠 있어야 한다. 헤더의 **Project Preview**([`ProjectPreviewPanel`](../components/ProjectPreviewPanel.tsx), `GET /api/project/dev-server-info`)는 **프로젝트 단위** 미리보기로 별도 유지된다.

### 13b) 복구 제안 (`recovery-suggestions`)

- **목적**: 실패·QA 이후 사용자가 태스크에 다시 넣을 **한국어 프롬프트 초안·가설·체크리스트**를 생성한다.
- **API**: `POST /api/agent/recovery-suggestions` — body `{ taskId, note? }`. 태스크 메타에서 `lastError`, `qaPageCheck`, `devQaNextBuild`, `executionRepairs`, `qaSignoff` 등을 발췌해 `generateText`(스마트 모델)로 Markdown 응답.
- **UI**: `TaskDetailsModal` **Details** 뷰의 「복구 · 다음 시도 가이드」— 조건: `failed` / `testing` / `review` 또는 `metadata.qaPageCheck` 존재. 선택 메모, 생성, 복사, Markdown 뷰어.

### 13c) 인수인계 요약 (`handoff-summary`)

- **목적**: 실행 토론·변경 파일·워크플로를 **이슈 트래커·팀 공유용 한 페이지 요약**(한국어 Markdown)으로 압축한다.
- **API**: `POST /api/agent/handoff-summary` — body `{ taskId }`. `executionDiscussions`, `workflow`, `fileChanges`, `agentCollaboration` 등 발췌 후 `generateText`.
- **UI**: `TaskDetailsModal` **Details** — 「인수인계 요약」. 조건: `executionDiscussions`가 비어 있지 않거나 `fileChanges`가 있으면 표시. 생성·복사·뷰어.

### 13d) 태스크 스펙 확장 (`spec-expand`)

- **목적**: 짧은 요청을 **수용 기준·엣지 케이스·수동 스모크·금지 사항** 등이 포함된 스펙(Markdown)으로 확장하고, **플랜 LLM 입력**에 자동 합류시킨다.
- **API**: `POST /api/agent/spec-expand` — body `{ taskId }`. 상태가 **`pending` 또는 `planning`** 만 허용(그 외 409). `ProjectProfiler.getStackSummary()`를 넣어 LLM 생성 후 `metadata.specExpansion`에 `{ markdown, generatedAt }` 저장.
- **플랜 주입**: [`formatSpecExpansionForPlan`](../lib/pre-execution/gates.ts)가 [`Orchestrator.plan`](../lib/agents/Orchestrator.ts)의 `effectiveDescription`에 블록을 붙인다(명확화 답변과 병행).
- **UI**: `TaskDetailsModal` **Details** — 「태스크 스펙 확장」패널(`pending`/`planning`), 생성 버튼·저장된 Markdown 뷰어.

### 13e) 유사 완료 태스크 (`tasks/similar`)

- **목적**: 새 태스크 작성 시 **같은 프로젝트·`done` 상태** 태스크 중 제목·설명 **토큰 유사도** 상위 후보를 제시한다(임베딩 없음).
- **API**: `GET /api/tasks/similar?projectId=&title=&description=&excludeId=` — `similar: [{ id, title, description, score }]`.
- **UI**: [`CreateTaskModal`](../components/CreateTaskModal.tsx) — 제목·설명 입력 후 디바운스 조회, 「설명에 참고 문구 추가」로 설명 필드에 참고 블록 append.

### 13f) 칸반 태스크 검색

- **목적**: 태스크가 많을 때 **제목·설명·`metadata` JSON 문자열**에 대한 부분 문자열 필터로 칸반 카드를 좁힌다(LLM 없음).
- **UI**: [`KanbanBoard`](../components/KanbanBoard.tsx) 헤더 `type="search"` 입력 — 컬럼별 필터에 `taskMatchesSearch` 적용.
