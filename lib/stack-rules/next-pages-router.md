---
name: stack_rules_next_pages_router
description: Next.js Pages Router — pages/, getServerSideProps, API routes
---

# Next.js Pages Router

`pages/` 또는 `src/pages/` 기준 Pages Router 프로젝트용.

## Inputs

- **Router Base** (`pages` / `src/pages`)
- **INSTALLED PACKAGES** — `next/router`, `next/link` 등
- 기존 페이지가 **SSR/SSG/ISR** 중 어떤 API를 쓰는지(파일 샘플로 확인)

## Outputs

- URL 경로: `pages/about.tsx` → `/about`, `pages/blog/[slug].tsx` → 동적 라우트
- API: `pages/api/*.ts` (legacy) — 프로젝트가 이미 쓰는 방식 유지

## Instructions

1. 데이터 로딩은 **`getServerSideProps` / `getStaticProps` / `getStaticPaths`** 중 프로젝트에 이미 있는 패턴을 복제한다. 혼용 시 빌드 오류에 주의한다.
2. **`next/link`**로 클라이언트 네비게이션. `passHref`·legacy `a` child 패턴은 프로젝트의 Next 메이저에 맞게.
3. **`next/router`**의 `useRouter`는 **클라이언트** 컴포넌트에서만 사용한다.
4. 브라우저 API는 **`useEffect`** 안에서만 또는 `typeof window !== 'undefined'` 가드.
5. `_app.tsx` / `_document.tsx` 수정이 필요하면 기존 파일을 읽고 최소 변경만 한다.

## MUST NOT

- Pages 트리에서 App Router 전용 파일(`page.tsx` under `app/`) 규칙만으로 경로를 설명하는 것(혼용 프로젝트는 실제 폴더 확인).
- SSR 단계에서 `window` 접근.

## Use Cases

- 기존 목록 페이지와 동일하게 `getServerSideProps`로 목록 fetch.
- 정적 블로그: `getStaticProps` + `getStaticPaths` 패턴을 기존 포스트 페이지에 맞춤.

## Reference

- Next.js — Pages Router, Data Fetching (`getServerSideProps` 등).
