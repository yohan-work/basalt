---
name: stack_rules_sveltekit
description: SvelteKit — +page, +layout, load, form actions
---

# SvelteKit

`@sveltejs/kit` 기반 프로젝트.

## Inputs

- **`src/routes`** 트리 구조, 기존 `+page.svelte` / `+page.ts` / `+page.server.ts` 혼합 패턴
- **adapter** 배포 환경(정적 vs Node) — `prerender` 설정에 영향

## Outputs

- 라우트: `+page.svelte`, `+layout.svelte`
- 데이터: `+page.ts`(universal) vs `+page.server.ts`(server-only) — 프로젝트 관례 준수
- 액션: `+page.server.ts`의 `export const actions`

## Instructions

1. **`load` 함수**는 서버/공용 구분을 기존 형제 라우트와 동일하게(`+page.server.ts` vs `+page.ts`).
2. 폼은 **`use:enhance`** 또는 `actions` 패턴을 이미 쓰는 쪽으로 통일한다.
3. **`$app/stores`**, **`$lib`** alias는 `svelte.config`·`tsconfig`와 일치해야 한다.
4. 브라우저 API는 **`onMount`** 또는 `import { browser } from '$app/environment'` 가드.

## MUST NOT

- React/Vue 컴포넌트 문법 사용.
- `load` 안에서 임의의 긴 블로킹 동작(기존 패턴 없으면 문서화된 패턴 사용).

## Use Cases

- 새 URL: `src/routes/feature/+page.svelte` + 필요 시 `+page.server.ts`에 `load`.
- CRUD: 기존 라우트의 `actions` + `fail`/`redirect` 패턴 복제.

## Reference

- SvelteKit — Routing, Loading data, Form actions.
