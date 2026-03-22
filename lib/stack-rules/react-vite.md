---
name: stack_rules_react_vite
description: React + Vite SPA — 엔트리, import.meta.env, 선택적 react-router
---

# React + Vite (SPA)

`vite` + `react`가 있고 `next`가 없는 일반 SPA 번들 구성.

## Inputs

- **vite.config**에 정의된 **alias**·`base` (직접 읽거나 기존 import 경로로 추론)
- **react-router-dom** 등 라우팅 라이브러리 **설치 여부** — 없으면 단일 페이지·앵커로 처리
- **TypeScript** 여부 → `.tsx` vs `.jsx`

## Outputs

- 엔트리는 보통 `src/main.tsx` + `index.html`의 script 연결을 유지한다.
- 컴포넌트는 `src/components/` 등 기존 트리를 따른다.

## Instructions

1. 환경 변수는 **`import.meta.env.VITE_*`** 만 클라이언트에 노출된다는 전제를 둔다(프로젝트 설정 확인).
2. **`react-router-dom`**이 있으면 `BrowserRouter` / `Routes` 패턴을 기존 `App`과 동일하게.
3. HMR/클라이언트 전용이 기본이므로 `window` 사용은 가능하나, **테스트·SSR 도입**을 고려해 훅/분리 가능하면 분리한다.
4. **Fast Refresh**를 깨지 않도록 컴포넌트 export 규칙(기본 export vs named)을 기존 파일에 맞춘다.

## MUST NOT

- Next 전용 API(`next/image`, `next/link`, `getServerSideProps`) 사용.
- `process.env`를 브라우저 번들에서 Vite 규칙 없이 가정(프로젝트에 `define`이 없으면 금지).

## Use Cases

- 새 화면: 라우터가 있으면 `Route` + 페이지 컴포넌트 추가, 없으면 기존 라우팅 방식 확인 후 추가.
- API 호출: `fetch` + 상대 또는 `VITE_*`로 베이스 URL 구성.

## Reference

- Vite — Env Variables and Modes; React 문서.
