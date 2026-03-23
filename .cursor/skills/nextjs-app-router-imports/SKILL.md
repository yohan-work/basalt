---
name: nextjs-app-router-imports
description: >-
  Next.js App Router에서 @/ 별칭·components/ui·next/link·metadata/RSC 경계 관련 빌드 오류를
  예방·해결할 때 사용한다. module-not-found, invalid-new-link, metadata vs use client, tsconfig paths.
---

# Next.js App Router — import 경로와 Link

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

## 체크리스트 (에이전트)

- [ ] `tsconfig.json` / `jsconfig.json`의 `paths` + `baseUrl`이 실제 폴더 구조와 맞는가?
- [ ] `@/components/ui`가 가리키는 디렉터리에 해당 컴포넌트 파일(또는 배럴 `index`)이 있는가?
- [ ] App Router에서 클라이언트 훅을 쓰는 파일에 `"use client"`가 파일 최상단에 있는가?
- [ ] 내부 이동에 `<a href>` 대신 `next/link`의 `<Link>`를 쓰고, `<a>` 중첩이 없는가?
- [ ] 같은 `page.tsx`에 `"use client"`와 `export const metadata` / `generateMetadata`가 동시에 없는가? (있으면 서버 `page` + 클라이언트 `*Client.tsx`로 분리)
- [ ] SEO가 필요한 라우트는 서버 `page`/`layout`에 두고, 인터랙션만 클라이언트 파일로 옮겼는가?
