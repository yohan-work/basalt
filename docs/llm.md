# LLM 운영 가이드

태그: `#llm` `#model` `#stability` `#timeout`

Basalt의 LLM 호출은 `lib/llm.ts`에서 공통 처리됩니다.

## 프롬프트 모듈 (`lib/prompts/`)

- 코드 생성·파일 포맷·수술 편집 등 **긴 시스템 규칙 문자열**은 `lib/prompts/`에 모듈로 두고 `lib/prompts/index.ts`에서 re-export 합니다(예: `code-generation-rules`, `file-format`, `surgical-edit-rules`, 다단계용 `codegen-plan`).
- `lib/llm.ts`는 위 모듈을 import해 `generateCode` / `generateCodeStream` / `generateSurgicalFileEdit` 등에서 **조립·호출**만 담당합니다. 규칙 문구를 고칠 때는 `lib/llm.ts`가 아니라 해당 `lib/prompts/*.ts`를 편집하는 것이 맞습니다.
- **다단계 코드 생성(옵션)**: `write_code` 경로에서 켜면 `generateJSON` + `CODEGEN_PLAN_SYSTEM_PROMPT` / `CODEGEN_PLAN_SCHEMA_DESCRIPTION`로 짧은 구현 계획(JSON)을 만든 뒤, 스트리밍 코드 생성 프롬프트에 붙입니다. UI·환경 변수·SSE는 [`features.md`](./features.md) §5e 참고.

## 모델 구성

`lib/model-config.ts` 기준 기본값은 다음과 같습니다.

- 빠른 응답(FAST): `llama3.2:latest` (`FAST_MODEL`)
- 분석/추론(SMART): `gemma4:e2b` (`SMART_MODEL`)
- 코드 생성(CODING): `qwen2.5-coder:7b` (`CODING_MODEL`)

## 안정성 정책

- Exponential backoff 재시도: 최대 3회 (`0.5초 -> 1초 -> 2초`)
- 타임아웃
  - 코드 생성: 180초
  - JSON 생성: 90초
- JSON 파싱 방어
  - 모델 출력이 단편적으로 떨어져도 크래시가 나지 않도록 안전 파싱
- `CODE_GENERATION_SYSTEM_RULES`(소스: `lib/prompts/code-generation-rules.ts`) 하드닝 체크
  - 비루트 라우트 선호, 루트 오버라이트 금지, 경로 미지정/슬래시 접두어 보정 등 규칙을 강제.
  - `Available UI Components` 기준으로 컴포넌트 임포트 허용 범위를 제한하고, 미존재 시 대체 구현으로 전환.
  - App/Pages 라우터 타입에 맞는 경로 컨텍스트를 포함해 LLM의 컨벤션 오해를 줄임.
- 템플릿 문자열 안정성
  - `lib/llm.ts`의 백틱 템플릿 내 사용자 정의 문자열에서 백틱 중첩이 생기지 않도록 escape 규칙을 적용.
  - 프롬프트 수정 시 `CODE_GENERATION_SYSTEM_RULES` 빌드 실패(파싱 오류) 예방을 코드 리뷰 체크포인트로 추가.

## 코드 생성 시각 기본값

`CODE_GENERATION_SYSTEM_RULES`에 **DEFAULT VISUAL TONE (clean dark-first baseline)** 이 있다. 대상 저장소에 확립된 테마·DESIGN HINTS·기존 페이지 스타일이 없고 태스크가 반대로 요구하지 않을 때, 페이지 **구조는** 레이아웃 카탈로그·태스크에 따르되 **분위기**는 다크 셸·밝은 전경·인디고 primary·블루 링크·얇은 보더·여백 위주로 통일한다. Tailwind 미설치 시 동일 느낌을 인라인/CSS 모듈로 구현하도록 명시되어 있다. 저장소에 이미 토큰/스타일이 있으면 **EXECUTION UI** 우선순위로 그것을 따른다.

## 호출 모드

- 스트리밍 모드(`generateCodeStream`, `generateJSONStream`) 지원
- 환경 변수로 `OLLAMA_BASE_URL` 재정의 가능

## Ollama `/api/generate` 호출 규약 (로컬)

`lib/llm.ts` 및 `app/api/agent/enhance-prompt/route.ts` 등은 Ollama에 `POST /api/generate`로 JSON 본문을 보낸다. 운영 시 다음을 염두에 둔다.

- **thinking 계열 모델**(예: Qwen3.x): 내부 추론에 토큰이 쓰이면 `response`가 비어 보일 수 있어, Ollama 측에서는 본문 **최상위**에 `think: false`를 두는 방식이 권고되는 경우가 있다.
- **HTTP 200**: 본문에 `error`가 있거나 `response`가 비어 있으면 실패로 처리하는 것이 안전하다.
- **라우트별 구현**: `enhance-prompt`는 `fetch`로 직접 호출하고, 나머지 다수는 `lib/llm.ts`의 `ollamaRequest` 경로를 쓴다. 동작 차이가 있으면 각 파일을 확인한다.

상세 증상·Turbopack·Realtime·디스크는 [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md)를 본다.

## App Router 가드

- Next.js 훅/컴포넌트 규칙을 위반하지 않도록 `use client` 프롬프트 규칙이 강화되어 있습니다.
- SEO: `export const metadata` / `generateMetadata`는 **서버 전용**; `"use client"` 파일과 동일 파일에 두지 않는다. 동일 세그먼트에서 static `metadata`와 `generateMetadata` 동시 export 금지. 상대 OG·canonical 등에는 루트 `metadataBase` 또는 절대 URL.
- **저장 단계 강제**: `lib/skills/index.ts`의 `write_code`가 `app/.../page.tsx`·`layout.tsx`에서 위 서버 전용 export와 `"use client"`(또는 서버 export + 훅만) 조합을 **파일 쓰기 전에 거부**합니다. 프롬프트만으로는 모델이 어길 수 있으므로 빌드 전에 차단하는 용도입니다.
- `viewport` / `themeColor` / `colorScheme`는 `metadata`에 넣지 않고 `export const viewport` / `generateViewport` 사용.
- Next.js 15+ 에서는 `params`·`searchParams`가 **Promise**인 경우가 많음 — `await` 후 사용(프로젝트의 `next` 메이저는 `[PROJECT CONTEXT]`에서 확인).
- 내부 링크는 `next/link`·Link 안에 `<a>` 중첩 금지 등 — 전체 목록은 [`features.md`](./features.md) §11b·[`.cursor/skills/nextjs-app-router-imports/SKILL.md`](../.cursor/skills/nextjs-app-router-imports/SKILL.md) 참고.
- Hydration·`next/image` 호스트·Server Actions·Route Handlers·환경 변수 노출에 대한 추가 규칙은 동일 파일의 **PRE-EMPTIVE** 블록과 `lib/profiler.ts`의 `[PROJECT CONTEXT]` 보강을 따른다.
- Dev QA 자동 수정(`Orchestrator.runDevQaRepairWriteCode`)은 스모크 실패 시 `lib/qa/qa-repair-hints.ts`의 신호→문서 링크와 `qaPageCheck.errorExcerpt` 등을 사용자 프롬프트에 합성한다 — 코드 생성 규칙과 맞물리도록 유지한다.

## 동적 라우팅

- 스킬 난이도에 따라 FAST/SMART 모델을 자동 분기
- 프로젝트 프로파일(`lib/profiler.ts`) 기반 경로/임포트 안정성 강화
