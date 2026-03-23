---
name: stack_rules_next_app_router
description: Next.js App Router — RSC 기본, use client, metadata, 라우팅 파일 규약
---

# Next.js App Router

`app/` 또는 `src/app/` 기준 App Router 프로젝트에서 페이지·레이아웃·API를 추가·수정할 때 따른다.

## Inputs

- **Router Base** (예: `app`, `src/app`)
- **Tech Stack**의 `next` 버전 — 메이저별 캐시·`fetch` 기본 동작이 다를 수 있음
- **INSTALLED PACKAGES**: `next/link`, `next/image` 등은 `next`에 포함; 별도 UI 라이브러리는 설치된 것만

## Outputs

- 라우트: `{RouterBase}/<segment>/page.tsx` (또는 `.jsx`)
- 공유 UI: 프로젝트에 맞는 `components/` 또는 `src/components/`
- Route Handler: `{RouterBase}/api/.../route.ts` (`GET`/`POST` export)

## Instructions

1. **기본은 Server Component**다. `useState`·`useEffect`·`onClick`·브라우저 전용 API가 필요하면 파일 **최상단**에 `"use client"`를 둔다.
2. **`metadata` / `generateMetadata`**는 Server Component 파일에서만 export한다. Client Component와 동일 파일에 넣지 않는다.
3. 내부 이동은 **`next/link`**의 `Link`를 쓴다. 외부만 `<a>`.
4. 서버에서 데이터를 가져올 수 있으면 Server Component + `fetch`(프로젝트 관례의 cache 옵션)를 우선한다.
5. 동적 세그먼트는 `[id]` 폴더, 라우트 그룹은 `(name)` — 기존 프로젝트의 네이밍을 따른다.
6. **레이아웃**: 루트 `layout.tsx`는 보통 `<html>` / `<body>`를 포함한다(`lang` 등). 중첩 `layout`은 자식 세그먼트를 감싼다.
7. **`template.tsx` vs `layout.tsx`**: `template`은 네비게이션 시 자식을 **재마운트**한다(전환 애니메이션에 적합). `layout`은 상태를 **유지**한다 — 목적에 맞게 선택한다.
8. **특수 파일**: 같은 세그먼트에 `loading.tsx`(Suspense 경계), `error.tsx`(클라이언트 error boundary + `reset`), `not-found.tsx`를 둘 수 있다. API/의미는 공식 file conventions를 따른다.

## MUST NOT

- 동일 라우트 세그먼트에서 `export const metadata`와 `generateMetadata`를 **동시에** export하지 않는다.
- Client Component 파일에서 `metadata` / `generateMetadata` / `viewport` export.
- Server Component 본문에서 `window` / `document` / `localStorage` 직접 접근.
- App Router인데 Pages 전용만의 패턴으로만 구현(`getServerSideProps` 등은 Pages 라우터용).

## Use Cases

- 새 마케팅/기능 페이지: `/{RouterBase}/<feature>/page.tsx` + 필요 시 `layout.tsx`.
- 클라이언트 전용 위젯: 작은 컴포넌트만 `"use client"`로 분리해 트리 상단을 서버로 유지.
- API: `route.ts`에서 `NextRequest`/`NextResponse` 패턴을 프로젝트 기존 API와 맞춘다.

## Reference

- [Layout](https://nextjs.org/docs/app/api-reference/file-conventions/layout), [Template](https://nextjs.org/docs/app/api-reference/file-conventions/template), [loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error), [not-found](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
- Next.js — App Router, Server Components, Route Handlers (공식 문서, 설치된 `next` 메이저에 맞는 버전).
