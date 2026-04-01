# 구현·개선 이력 (누적 요약)

Basalt 저장소에 반영된 **Request Work 실행 품질**, **Dev QA**, **코드 생성 규약** 관련 변경을 한곳에서 추적합니다. 세부 동작은 아래 **참조 파일**을 보면 됩니다.

---

## 2026-04 — 프롬프트 모듈·다단계 코드 생성·스킬 레지스트리

**요약**

- **프롬프트 모듈화**: 코드 생성·파일 포맷·수술 편집·다단계 Plan용 시스템 문구를 `lib/prompts/`로 분리하고 `lib/llm.ts`가 import해 조립한다. 가이드는 [`llm.md`](./llm.md) §프롬프트 모듈.
- **다단계 `write_code`(옵션)**: Plan(JSON, `generateJSON` + `lib/prompts/codegen-plan.ts`) → `generateCodeStream` → 배치 저장 후 프로젝트 타입체크가 남으면 진단을 프롬프트에 넣고 재생성(패스 상한). 플래그·UI·SSE·env는 [`features.md`](./features.md) §5e, [`setup.md`](./setup.md). 설계 초안: [`.cursor/plans/multi-phase-codegen-design.md`](../.cursor/plans/multi-phase-codegen-design.md).
- **스킬 레지스트리 Phase A·B**: `lib/skills/registry.ts`에 스킬별 risk·FAST 인자 티어·`projectPath` 마지막 인자·emitter 주입 메타를 집중. `Orchestrator`는 일반 스킬을 `invokeSkillExecution`에서 실행하고, `BASALT_SKILL_RISK_MODE`(warn/deny, 기본 무해)로 elevated-risk 스킬을 선택적으로 경고/차단. [`agents-skills.md`](./agents-skills.md) §스킬 레지스트리, [`architecture/orchestrator.md`](./architecture/orchestrator.md) §스킬 실행 경로·레지스트리, [`.cursor/plans/tool-registry-design.md`](../.cursor/plans/tool-registry-design.md).

**참조 파일**

- `lib/prompts/`, `lib/llm.ts`, `lib/codegen/multi-phase-write-code.ts`, `lib/agents/Orchestrator.ts`, `lib/skills/registry.ts`, `lib/stream-emitter.ts`

---

## 2026-03 — 로컬 dev·Ollama·Realtime·Turbopack 이슈 정리 및 문서화

**요약**

- Turbopack dev 파일시스템 캐시 비활성화(`next.config.ts`), `GET /api/tasks/similar`와 `POST /api/agent/enhance-prompt` 구분, Ollama Qwen thinking·빈 `response` 가능성, Supabase Realtime `payload.new` 부분 페이로드 주의, spec-expand·메타 반영, Hugging Face 등으로 모델을 여럿 둔 뒤의 Ollama 성능, `tsc --noEmit` 기존 오류 가능성을 [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md)에 모았다.
- [`llm.md`](./llm.md)에 Ollama `/api/generate` 호출 규약 소절을 추가했고, [`setup.md`](./setup.md)에 Turbopack 단락, [`features.md`](./features.md) §13에 AI Enhance vs 유사 태스크 단락을 넣었다.

**참조 문서**

- [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md)

---

## 2026-03 — Request Work 실행용 디자인 시스템

**목표**: Basalt 앱 자체가 아니라, 태스크에 연결된 **대상 저장소**에 에이전트가 UI를 쓸 때 그 프로젝트와 이질감 없이 맞추기.

**요약**

- `style-architect`는 Basalt 브랜드 색·고정 테마를 전제하지 않는다. `[PROJECT CONTEXT]`의 Tailwind 유무, `UI_COMPONENT_POLICY`, UI 키트 목록을 따른다.
- `ProjectProfiler.getContextString()`에 **DESIGN HINTS** 블록이 포함된다. 공통 경로의 `globals.css` 일부와 `tailwind.config.*` 일부를 잘라 넣어, 모델이 추측이 아니라 파일 근거로 토큰을 맞추게 한다.
- `apply_design_system(componentPath, projectPath)`는 스텁이 아니라, 프로파일 컨텍스트 + `llm.generateCode`로 파일을 고친 뒤 `write_code`로 저장한다(임포트·RSC 검증 동일).
- `generate_scss(moduleName, projectPath)`는 대상 프로젝트 컨텍스트를 넣어 SCSS 문자열을 생성한다.
- 오케스트레이터는 레지스트리(`appendProjectPathLast`) 기준으로 `apply_design_system`, `generate_scss` 등에 **`projectPath`가 마지막 인자로 붙는다** (`read_codebase`와 동일 패턴; 이후 `lib/skills/registry.ts`로 일원화).
- `lib/llm.ts`의 코드 생성 규약에 **EXECUTION UI** 한 줄을 넣어, 임의 저장소에 Basalt 팔레트를 이식하지 않도록 했다.
- `reference/02.design-system--type2.md`는 스킬/에이전트 문서에서 **명시적으로 distinctive UI를 요구할 때만** 보조 참고로 명시한다.

**참조 파일**

- `lib/agents/style-architect/AGENT.md`
- `lib/skills/apply_design_system/SKILL.md`
- `lib/skills/generate_scss/SKILL.md`
- `lib/skills/check_responsive/SKILL.md` (선택: reduced-motion 메모)
- `lib/profiler.ts` (`getDesignHintsBlock`, `getContextString`)
- `lib/skills/index.ts` (`apply_design_system`, `generate_scss`)
- `lib/agents/Orchestrator.ts` (경로 append는 레지스트리 `shouldAppendProjectPathLast`로 이관됨)

---

## 2026-03 — Dev 종료 QA 페이지 스모크 오탐 완화

**문제**: 정상 렌더 페이지인데 HTML/스냅샷 문자열에 Next.js dev **번들**에 들 있는 문자열(`__next_error__`, `digest:` 등)이나 DOM 속성(`suppresshydrationwarning`)이 잡혀 **페이지 오류 감지 → 자동 코드 수정** 루프가 도는 경우가 있었다.

**요약**

- HTTP 본문을 신호 검사에 넣기 전에 `<script>` / `<noscript>` / `<style>` 내용을 제거한다(`stripHtmlScriptsStylesAndNoscript`).
- 오탐이 잦던 신호 일부 제거·완화: `digest:`, `__next_error__`, `nextjs-original-stack-frame`, `edge runtime`; `suppresshydrationwarning` → **`try adding suppresshydrationwarning`** 로만 매칭.
- `lib/qa/qa-repair-hints.ts`의 힌트 맵을 위 신호 목록과 맞췄다.

**참조 파일**

- `lib/qa/page-smoke-check.ts` (`PAGE_ERROR_SIGNALS`, `stripHtmlScriptsStylesAndNoscript`)
- `lib/qa/qa-repair-hints.ts` (`SIGNAL_DOC_HINTS`)
- `lib/agents/Orchestrator.ts` (`runDevExitQaPipeline`)

---

## 2026-03 — 더미·데모 이미지 URL (dummyimage.com)

**목표**: 랜딩·`/features` 등에서 모델이 Unsplash/Picsum 등으로 가지 않고, **고정 호스트 + 치수만 변경** 패턴을 쓰게 한다.

**규칙 (요약)**

- 태스크에 **사용자가 준 정확한 이미지 URL**이 없으면, 코드에 넣는 **http(s) 래스터 이미지**는 `https://dummyimage.com/<W>x<H>/000/fff` 만 사용하고 **W·H 숫자만** 바꾼다. `/000/fff`는 사용자가 색을 지정할 때만 변경.
- Unsplash, Picsum, via.placeholder.com, placehold.co, loremflickr, Pexels, Pixabay 등은 사용하지 않는다.
- `next/image`의 `remotePatterns` 부담을 줄이려 `<img src="https://dummyimage.com/...">`를 우선한다.

**참조 파일**

- `lib/llm.ts` (`CODE_GENERATION_SYSTEM_RULES` — PLACEHOLDER / DEMO IMAGE URLS)
- `lib/stack-rules/next-app-router.md` (항목 12·13)
- `lib/skills/write_code/SKILL.md` (항목 13)

---

## 2026-03 — 태스크 운영 UX·UI 누락 스캐폴드

**목표**: Dev/Test 중 **대상 앱 미리보기**, 실패 후 **복구 문구**, **인수인계 요약**, 플랜 전 **스펙 확장**, 태스크 생성 시 **유사 완료 태스크**, 칸반 **검색**을 Basalt UI에서 바로 쓰고, `write_code`가 `@/components/ui/*` 누락으로 막힐 때 **비-LLM으로 파일을 먼저 채운다**.

**요약**

- API: `GET /api/project/task-preview-url`, `POST /api/agent/recovery-suggestions`, `handoff-summary`, `spec-expand`, `GET /api/tasks/similar` — 상세는 [`api.md`](./api.md), 기능 서술은 [`features.md`](./features.md) §13.
- UI: `TaskLivePreview`, `TaskDetailsModal` 탭·패널, `CreateTaskModal` 유사 태스크, `KanbanBoard` 검색 — [`ui-components.md`](./ui-components.md).
- 플랜: `metadata.specExpansion` + `formatSpecExpansionForPlan` → `Orchestrator.plan`의 `effectiveDescription`.
- UI 키트: `scaffoldMissingUiFromImportSpecifiers` + `BASALT_AUTO_SCAFFOLD_UI_EXTENDED` — [`project-ui-kit.ts`](../lib/project-ui-kit.ts), 오케스트레이터 `write_code` 루프는 LLM repair 전에 1회 스캐폴드 재시도.

**참조 파일**

- `app/api/project/task-preview-url/route.ts`
- `app/api/agent/recovery-suggestions/route.ts`, `handoff-summary/route.ts`, `spec-expand/route.ts`
- `app/api/tasks/similar/route.ts`
- `components/TaskLivePreview.tsx`, `TaskDetailsModal.tsx`, `CreateTaskModal.tsx`, `KanbanBoard.tsx`
- `lib/pre-execution/gates.ts` (`formatSpecExpansionForPlan`)
- `lib/project-ui-kit.ts`, `lib/agents/Orchestrator.ts`

---

## 교차 참고

- 실행 파이프라인·Dev QA 단계: [`architecture/orchestrator.md`](./architecture/orchestrator.md)
- 에이전트·스킬 개요: [`agents-skills.md`](./agents-skills.md)
- 기능 목록·§ 참조: [`features.md`](./features.md)
