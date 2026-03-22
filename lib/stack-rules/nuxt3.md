---
name: stack_rules_nuxt3
description: Nuxt 3 — 디렉터리 규약, SSR, useFetch, server routes
---

# Nuxt 3

`nuxt` 패키지 기반 Nuxt 3 앱.

## Inputs

- **nuxt.config**에 있는 `ssr`, `modules`, `runtimeConfig` (필요 시 read_codebase)
- **자동 import** — composables·components 디렉터리 규약
- **서버** 라우트: `server/api`, `server/middleware`

## Outputs

- 페이지: `pages/*.vue` → 파일 기반 라우팅
- 레이아웃: `layouts/`, 미들웨어: `middleware/`
- 서버 API: `server/api/**/*.ts`

## Instructions

1. 데이터는 **`useFetch` / `useAsyncData`** 등 Nuxt 데이터 레이어를 우선하고, 기존 페이지와 동일한 패턴을 쓴다.
2. **클라이언트 전용** 코드는 `<ClientOnly>` 또는 `onMounted`, 또는 `import.meta.client` 등 **프로젝트가 쓰는 방식**으로 감싼다.
3. **`runtimeConfig`**의 public/private 구분을 지킨다 — 비밀은 클라이언트 번들에 넣지 않는다.
4. **Nitro** 서버 라우트는 메서드 export·경로 규칙을 기존 `server/api` 파일에 맞춘다.

## MUST NOT

- Next의 `app/page.tsx` 규칙으로 Nuxt URL을 추론.
- SSR 중 `window` 무가드 접근.

## Use Cases

- 새 페이지: `pages/feature/index.vue` 또는 `pages/feature.vue` — 기존 sibling 구조 복제.
- BFF: `server/api/feature.get.ts` 등 기존 네이밍에 맞춤.

## Reference

- Nuxt 3 — Directory Structure, Data Fetching, Server Routes.
