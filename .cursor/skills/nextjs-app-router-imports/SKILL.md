---
name: nextjs-app-router-imports
description: >-
  Next.js App Router에서 @/ 별칭·components/ui·next/link·metadata·viewport·Proxy(구 middleware)·
  레이아웃 규약 관련 빌드 오류를 예방·해결할 때 사용한다.
---

# Next.js App Router — import 경로와 Link

## App Router — `page.tsx` vs `index.tsx`

- App Router에서는 **`app/.../page.tsx`**(또는 `page.js`)가 세그먼트 라우트다. **`app/.../index.tsx`는 라우트 엔트리가 아니다** — Pages Router 습관과 혼동하면 **404**가 나고, Basalt QA는 `page.tsx` 경로만 URL로 추론한다.
- 새 페이지는 반드시 **`{Router Base}/<segment>/page.tsx`** 형태로 두고, **[PROJECT CONTEXT]의 Router Base**(`app` vs `src/app`)와 동일한 트리만 쓴다.

## 네이티브 DOM으로의 prop 전달 (unknown prop)

공식: [Unknown Prop on DOM Element](https://react.dev/warnings/unknown-prop) (React)

- `React.forwardRef` 등으로 `<button>`, `<input>`, `<div>` 같은 **네이티브 요소**를 감쌀 때, MUI/shadcn 스타일의 **커스텀 prop**(`fullWidth`, `variant`, `size`, `color` 등)을 `{...props}`로 그대로 넘기면 React가 경고한다(“does not recognize the `fullWidth` prop on a DOM element”).
- **해결**: 커스텀 prop은 구조 분해로 **꺼낸 뒤** DOM에는 `React.ButtonHTMLAttributes<HTMLButtonElement>` 등에 해당하는 속성만 전달한다. 너비·레이아웃은 `className`/`style`로만 반영한다.

## `@/components/ui` / module not found

공식: [Module not found](https://nextjs.org/docs/messages/module-not-found)

1. **npm 패키지**인지 **로컬 경로**인지 구분한다. npm이면 `package.json`에 있는지 확인한다.
2. **대소문자·실제 파일 경로**가 import와 일치하는지 확인한다 (특히 Linux/CI).
3. **`@/*` 별칭과 디스크 위치가 일치하는지** 확인한다.
   - `compilerOptions.paths["@/*"]`가 `["./*"]`이면 `@/components/ui`는 **프로젝트 루트의** `components/ui`를 가리킨다.
   - `["./src/*"]`이면 **`src/components/ui`**를 가리킨다.
   - `src/app`만 쓰는데 `@/*`가 `./*`로만 잡혀 있으면, UI 파일을 루트 `components/ui`에 두거나 `paths`를 `./src/*`로 맞춘다 ([src directory](https://nextjs.org/docs/app/building-your-application/configuring/src-directory)).
4. Basalt 실행 시 `BASALT_ALIGN_NEXT_PATH_ALIAS=1`이면 위와 같은 **src 전용 레이아웃**에서 `tsconfig.json`의 `@/*`를 `./src/*`로 보정할 수 있다(선택).

## `next/link` — extra anchor

공식: [Invalid new link with extra anchor](https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor)

- Next.js 13+ 에서는 `<Link>` **안에** `<a>`를 두지 않는다. 스타일·텍스트는 `<Link className="...">`에 직접 둔다.
- 레거시 마이그레이션: `npx @next/codemod new-link .`

## Metadata / Server vs Client (`"use client"` 충돌)

공식: [generateMetadata — server component only](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only)

- `export const metadata`와 `export async function generateMetadata`는 **서버에서만** 가능하다. `"use client"`가 있는 파일에서는 **둘 다 금지**다(훅이 없어도 동일).
- 권장: `app/.../page.tsx`는 기본적으로 **Server Component**로 두고 `metadata`만 export한다. `useState` 등이 필요하면 `components/...Client.tsx`에 `"use client"`만 두고, `page.tsx`에서 `<FooClient />`로 합성한다.
- 공통 SEO는 상위 [`layout.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/layout)에 `metadata`를 두는 것도 가능하다.

연관 참고(경계 이해):

- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)

### P0 — 자주 나는 빌드 실수 (메타데이터)

공식: [generate-metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)

- 같은 세그먼트에서 **`metadata` 객체와 `generateMetadata` 함수를 둘 다 export하지 않는다.**
- 상대 경로로 OG·canonical·twitter 이미지 등을 쓰려면 루트 `layout`에 **`metadataBase: new URL('https://…')`** 를 두거나, 필드마다 절대 URL을 쓴다. `metadataBase` 없이 상대 URL만 쓰면 **빌드 실패**할 수 있다.
- **`app/opengraph-image.*`**, **`icon`**, 파비콘 등 [파일 기반 메타데이터](https://nextjs.org/docs/app/api-reference/file-conventions/metadata)가 있으면 export 기반 설정보다 **우선**한다 — 충돌 시 파일이 이긴다.
- **`searchParams`** 는 **`page`** 에만 전달된다(`layout`의 `generateMetadata`에는 없음).
- **Next.js 15+**: `params` / `searchParams`가 **`Promise`** 인 경우가 많다 — `await` 후 사용한다.
- **viewport / themeColor / colorScheme** 은 `metadata` 안에 넣지 않는다(deprecated). [`generateViewport`](https://nextjs.org/docs/app/api-reference/functions/generate-viewport) / `export const viewport` 사용(역시 서버 전용).

## 레이아웃·`loading`·`error`·`not-found`

- [Layout](https://nextjs.org/docs/app/api-reference/file-conventions/layout) — 루트에 `<html>` / `<body>`.
- [Template](https://nextjs.org/docs/app/api-reference/file-conventions/template) vs layout: template은 자식 **재마운트**, layout은 **상태 유지**.
- [loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error), [not-found](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)

## Proxy (구 `middleware`) — Next 16+

공식: [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

- 문서 기준으로 **`middleware.ts` 파일 규칙이 `proxy.ts`로 바뀌는 방향**이 있다. 레거시 튜토리얼과 혼동하지 말 것.
- 마이그레이션: `npx @next/codemod@canary middleware-to-proxy .` (문서에 안내된 codemod; 프로젝트 `next` 버전에 맞게 확인).
- `export function proxy` / default export, **`config.matcher`는 빌드 타임 상수**여야 한다(변수로 동적 matcher 금지).
- RSC 요청 시 Proxy에서 일부 내부 헤더가 숨겨질 수 있고, **`NextResponse.rewrite`가 아닌 수동 `fetch` rewrite** 는 RSC 헤더 누락으로 깨질 수 있다 — 문서 “RSC requests and rewrites” 참고.
- 실행 순서·CORS·쿠키는 [Proxy 문서](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)의 execution order / examples 참고.

## 추가 참고 링크 (캐시·설정)

- [Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [Segment config](https://nextjs.org/docs/app/api-reference/file-reference/segment-config) (`dynamic`, `revalidate`, …)
- [Environment variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Draft mode](https://nextjs.org/docs/app/building-your-application/configuring/draft-mode)

## Hydration (react-hydration-error)

공식: [React hydration error](https://nextjs.org/docs/messages/react-hydration-error)

- 서버 HTML과 클라이언트 첫 렌더가 일치해야 한다. 렌더 중 `Date.now()`, `Math.random()`, `window`/`localStorage` 직접 접근으로 마크업이 달라지지 않게 한다.
- 시간·클라이언트 전용 값은 `useEffect` 이후나 클라이언트 전용 컴포넌트로 분리한다.

## next/image — 외부 호스트

공식: [next-image-unconfigured-host](https://nextjs.org/docs/messages/next-image-unconfigured-host)

- 외부 URL은 `next.config`의 `images.remotePatterns`(또는 설치된 Next 버전 문서의 권장 필드)에 등록하거나, 임시 placeholder는 `<img>`를 사용한다.

## Server Actions

공식: [Server Actions and mutations](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

- 액션은 async. `"use server"` 파일/모듈 규칙을 따른다. 직렬화 불가 인자를 넘기지 않는다.

## Route Handlers (`route.ts`)

공식: [Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route)

- 필요한 HTTP 메서드만 export. Edge 런타임이면 Node 전용 API를 import하지 않는다.

## 체크리스트 (에이전트)

- [ ] `components/ui`의 `Button`/`Input` 등이 네이티브 요소에 **`fullWidth` 등 비DOM prop을 스프레드하지 않았는가?** (구조 분해 후 `className` 등만 전달)
- [ ] 새 라우트가 **`page.tsx`**(App Router)로 추가되었는가? **`app/.../index.tsx`로 URL을 만들려 하지 않았는가?
- [ ] 파일 경로가 **[PROJECT CONTEXT] Router Base**(`app/` vs `src/app/`)와 동일한 트리인가?
- [ ] `tsconfig.json` / `jsconfig.json`의 `paths` + `baseUrl`이 실제 폴더 구조와 맞는가?
- [ ] `@/components/ui`가 가리키는 디렉터리에 해당 컴포넌트 파일(또는 배럴 `index`)이 있는가?
- [ ] App Router에서 클라이언트 훅을 쓰는 파일에 `"use client"`가 파일 최상단에 있는가?
- [ ] 내부 이동에 `<a href>` 대신 `next/link`의 `<Link>`를 쓰고, `<a>` 중첩이 없는가?
- [ ] 같은 `page.tsx`에 `"use client"`와 `export const metadata` / `generateMetadata`가 동시에 없는가? (있으면 서버 `page` + 클라이언트 `*Client.tsx`로 분리)
- [ ] SEO가 필요한 라우트는 서버 `page`/`layout`에 두고, 인터랙션만 클라이언트 파일로 옮겼는가?
- [ ] 같은 세그먼트에 `metadata`와 `generateMetadata`를 동시에 export하지 않았는가?
- [ ] 상대 OG/ canonical URL을 쓸 때 루트 `metadataBase` 또는 절대 URL을 두었는가?
- [ ] Next 15+에서 `params`/`searchParams`를 `await`했는가?
- [ ] viewport는 `metadata`가 아니라 `viewport` / `generateViewport`인가?
- [ ] Hydration: 서버·클라이언트 첫 렌더가 동일한가? (비결정적 값·브라우저 API를 렌더 경로에서 제거했는가?)
- [ ] `next/image` 외부 URL은 `remotePatterns` 등록 또는 `<img>` 대체인가?
- [ ] Server Action / Route Handler가 프로젝트·문서 규칙(async, export, 런타임)을 따르는가?
- [ ] 클라이언트에 `NEXT_PUBLIC_` 없는 비밀 env를 넘기지 않았는가?
