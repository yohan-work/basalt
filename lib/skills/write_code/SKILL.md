---
name: write_code
description: Writes content to a file, creating directories if needed.
---

# Write Code

Writes string content to a specified file path.

## Inputs
-   `filePath`: Target file path (relative).
-   `content`: The code/text to write.

## Outputs
-   Success message or error message.

## Instructions
1.  Ensure the directory structure exists. If not, create it.
2.  Write the `content` to `filePath`.
3.  Overwrite if file exists.
4.  **STACK_RULES + EXPORT_STYLE_POLICY + UI_COMPONENT_POLICY (CRITICAL)**: `[PROJECT CONTEXT]`에 `[STACK_RULES]`(스택 전용), **`## EXPORT_STYLE_POLICY`**(라우트 모듈의 `export default function …` vs `const …` + `export default`), **`## UI_COMPONENT_POLICY`** 가 함께 있을 수 있다. 우선순위: **`[STACK_RULES]`** → **`## EXPORT_STYLE_POLICY`**(새 `page`/`layout`(및 Pages Router 경로) 작성 시) → **`## UI_COMPONENT_POLICY`** / **UI Component Import Style**. `EXPORT_STYLE_POLICY`는 **UI 키트 import 규칙을 덮어쓰지 않는다**. **`ABSENT`** 이면 `@/components/ui/*` import 금지(파일 생성 전까지); 시맨틱 HTML 또는 선행 primitives 작성. **`USE_EXISTING`** 이면 나열·확인된 파일만 import. 실행 초기 자동 스캐폴드 후에는 다음 컨텍스트부터 `USE_EXISTING`에 준한다.
5.  **IMPORTANT**: Always use the correct file extension based on the explicit `Tech Stack` provided in the context (e.g., use `.tsx` for React/Next.js components, `.ts` for logic, `.css`/`.scss` for styles).
6.  Do NOT create `.txt` or `.md` files unless explicitly asked for documentation.
7.  For UI components in Next.js/React, ensure you import React and necessary libraries.
8.  **CRITICAL (Next.js App Router)**:
    - In `app/.../page.tsx` and `app/.../layout.tsx`, `export const metadata`, `generateMetadata`, `viewport`, and `generateViewport` are **server-only**. **Never** put `"use client"` in the same file as those exports — the build will fail ([generate-metadata — server component only](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only)).
    - If you need hooks (`useState`, `useEffect`, …) or client-only APIs **and** SEO metadata: keep `page.tsx` / `layout.tsx` as a **Server Component** (metadata export, default export composes children), and move interactive UI to a separate file (e.g. `components/MyFeatureClient.tsx`) with `"use client"` at the top of **that** file only.
    - For other files under `app/` (e.g. leaf components not exporting metadata), if you use React hooks or event handlers that require a Client Component, include `"use client"` as the first statement (after comments only). Basalt `write_code` rejects invalid metadata + `"use client"` combinations before writing; the Orchestrator may then run an automatic **server + `*Client.tsx` split** (writes the client file(s) first, then retries the page).
9.  **NO BROWSER APIS IN SSR**: Never access `window`, `document`, or `localStorage` directly in a component body. Always wrap them in `useEffect`. **State vs JSX**: Any name used in JSX (`showPassword`, `isOpen`, `query`, …) must exist in the **same** component (`useState` / `useReducer` / props / `const` before `return`, or import). Password show/hide: emit `useState` + setter + toggle together with `type={showPassword ? "text" : "password"}`. Controlled inputs: `value` + `onChange`, or `defaultValue` for uncontrolled only. When the target repo has no `scripts/validate-client-boundary.mjs`, `write_code` still runs in-process TypeScript on the written file — undefined identifiers fail the write.
10. **NO `<a>` TAGS (Next.js internal nav)**: When the stack is Next.js, use `import Link from 'next/link'` for internal navigation. For other frameworks, follow `[STACK_RULES]` and existing project patterns.
11. **IMPORT EXISTENCE VALIDATION**: `@/components/ui/*`, 별칭 경로, 상대 경로 import는 실제 존재하는 파일만 사용한다. 존재하지 않는 import는 코드 저장 시 실패 처리하고, 회복 가능한 경우 HTML/CSS 대체안을 제안한다.
12. **NPM DEPENDENCIES (CRITICAL)**: External packages (`date-fns`, `lodash`, `axios`, etc.) MUST already appear in the target project's `package.json` `dependencies` or `devDependencies`. If a package is not installed, `write_code` will reject the file. Before importing, infer from `[PROJECT CONTEXT]` / `package.json` which libraries exist. Prefer **no new dependencies**: e.g. format dates with `Intl.DateTimeFormat` or native `Date` instead of `date-fns` unless the project already uses it.
13. **PRISMA (optional — UI-first default)**: Boards, lists, dashboards, and most pages often need **only a polished UI**. Unless the task **explicitly** requires a real database, Prisma, or persisted CRUD, **do not** import `@prisma/client`, `PrismaClient`, or `prisma` — use **typed mock/sample arrays** so the screen works without `prisma generate`. **`@prisma/client` in `package.json` does not obligate you to use it.** When the task **does** require DB access: in Route Handlers (`app/.../route.ts`), Server Actions, and server modules, never use `prisma.someModel` without defining `prisma` — import the singleton (e.g. `import { prisma } from '@/lib/prisma'`) or `import { PrismaClient } from '@prisma/client'` plus `const prisma = new PrismaClient()`. Bare `prisma` causes **TS2304**. Importing from `@prisma/client` requires **`npx prisma generate`** when using the default client output (`node_modules/.prisma/client`); if that folder is missing, `write_code` fails early — **fix UI-only tasks by removing Prisma imports**, not only by running generate. Never use Prisma in **`"use client"`** files.
14. **PLACEHOLDER / DEMO IMAGE URLS (CRITICAL)**: If the task does **not** paste an exact image URL (or an exact existing static path / explicit instruction to add that asset), every UI raster reference for landing, `/features`, heroes, cards, galleries MUST use `https://dummyimage.com/<W>x<H>/000/fff` with **only** `<W>` and `<H>` changed. Do **not** invent `/images/...`, `/assets/...`, or `public/images/...` paths you are not actually creating — they 404. Do **not** use Unsplash, Picsum, via.placeholder.com, placehold.co, etc. Prefer `<img src="...">` for dummyimage to avoid `next/image` remote config.
15. **MOCK API / `fetch` (boards, lists, dashboards)**: Do **not** use `useEffect` + `fetch('/api/...')` for demo data unless you **also** write the corresponding **`app/api/.../route.ts`** (or `src/app/api/...`) in the same step/output. Otherwise the browser gets **404** and Basalt QA can fail (same-origin XHR/fetch errors). **Default for UI-only**: typed **in-file or `lib/mock-*` arrays** — same pattern as avoiding Prisma for mock UIs.

## UI Component Guidelines (MANDATORY)

When creating UI components (pages, forms, modals, cards, etc.), you MUST follow these guidelines while remaining flexible to the specific requirements:

- **Gate**: Read **`## UI_COMPONENT_POLICY`**. **`USE_EXISTING`** → use listed `components/ui` files only. **`ABSENT`** → no `@/components/ui/*` imports until files exist (semantic HTML + project CSS; or rely on execute-time auto-scaffold + refreshed context).
- **Default visual tone**: If the repo has no strong existing theme (**DESIGN HINTS** / globals / pages you read) and the task does not demand otherwise, follow **`DEFAULT VISUAL TONE`** in global codegen rules (`lib/llm.ts` / `CODE_GENERATION_SYSTEM_RULES`): near-black shell, light high-contrast text, indigo primary CTA, blue text links, subtle borders, generous vertical rhythm. **Layout** still follows the task and the layout pattern catalog — only the “feel” is shared across pages.

### 1. Component Usage Reference (shadcn/ui)
When the project **has** those files **and** the basename appears under **Known component basenames** in `[PROJECT CONTEXT]`, use `@/components/ui/` as building blocks. **Never** import a path whose file is not listed (e.g. `table`, `card`, `dialog` are invalid on a minimal `button`/`input`/`label` kit—use semantic HTML instead). **Do NOT** copy-paste shadcn patterns that assume a full kit.

| Element | shadcn/ui Component | Import Path |
|---------|---------------------|-------------|
| Button | `Button` | `@/components/ui/button` |
| Input | `Input` | `@/components/ui/input` |
| Label | `Label` | `@/components/ui/label` |
| Card | `Card`, … | `@/components/ui/card` — **only if `card` is in Known basenames** |
| Dialog | `Dialog`, … | `@/components/ui/dialog` — **only if listed** |
| Select | `Select`, … | `@/components/ui/select` — **only if listed** |
| Table | (various) | `@/components/ui/table` — **only if listed**; otherwise use `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>` |

**Boards / data tables (TanStack v8)**: Use **`useReactTable`** + **`getCoreRowModel`** from `@tanstack/react-table` — **not** `useTable`. Import **`flexRender`**, **`ColumnDef`**, row models **only** from `@tanstack/react-table` (**required in every file that uses `flexRender`** — prevents **TS2552**). Import **`Table`**, **`TableRow`**, **`TableCell`**, etc. **only** from `@/components/ui/table`. Render headers with **`flexRender(header.column.columnDef.header, header.getContext())`** — **`Header` has no `header.columnDef`**; use **`header.column.columnDef`** (**TS2551**). If **`cell` / `header`** in `.map` is implicit **`any`**, add **`import type { Cell, Header } from '@tanstack/react-table'`** and annotate **`(cell: Cell<YourRow, unknown>)`** or type **`useReactTable<YourRow>(…)`** (**TS7006**). Column widths: use **`size` / `header.getSize()`** per [TanStack column sizing](https://tanstack.com/table/latest/docs/guide/column-sizing); do **not** use **`meta.width`** unless you **`declare module '@tanstack/react-table'`** and extend **`ColumnMeta`** (**TS2339**). Type **`headerGroup` / `row` / `cell`** in `.map` callbacks (avoid implicit `any`). Basalt extended scaffold creates a full **`table.tsx`** when that import was missing. `write_code` **rejects** files that call `flexRender` / `useReactTable` / `getCoreRowModel` without any `@tanstack/react-table` import. **Rules of Hooks**: call **`useMemo` (columns)** and **`useReactTable`** *before* any **`if (loading) return …`** / **`if (!data) return …`**; use **`data: rows ?? []`** while loading, then early-return or ternary for UI — never add hooks only after a branch that sometimes returns early (avoids *Rendered more hooks than during the previous render*). **Minimal `Button`**: do **not** use **`asChild`** — use `<Link className="...">` or `<button>`.

### 2. Layout & Styling Rules
- **Follow the exact layout requested.** If the user asks for a grid, vertical stack, or specific section ordering, implement exactly that.
- **When layout is not specified**: follow the **layout pattern catalog** in the global code-generation rules (`ContainedStack`, `HeroBandPlusSections`, `SplitFeature`, `BentoGrid`, `SidebarContent`, `AppShell`, `DashboardGrid`, `SingleColumnArticle`, `PricingOrCompare`, `StepsTimeline`, `FAQStack`) and the **pattern picker** there. If the task analysis / plan / summary already names a pattern, use that name consistently.
- **Styling**: Check the `[PROJECT CONTEXT]` for `Tailwind CSS`. Use Tailwind `grid`, `flex`, `gap-X` only if it is installed.
- **Import Style**: Check `[PROJECT CONTEXT]` for `UI Component Import Style`.
    - **MANDATORY**: If named imports are required, use `import { Component } from "@/components/ui/component"`.
    - If a barrel file exists, you MAY use `import { … } from "@/components/ui"` **only** for symbols that are both in **Known component basenames** and re-exported from that index (never import `Card` from the barrel if `card` is not on disk).
- **CRITICAL**: If Tailwind is NOT installed, **NEVER** use its classes. If `shadcn/ui` components are present but Tailwind is missing, they are likely broken; use standard HTML tags with premium inline styles instead.
- **NEVER** stick to a fixed template when the task description implies a different structure; the catalog applies only when the task is silent on layout.

### 3. Component Reference Example
*This is a reference for how to use shadcn/ui components, NOT a template to be used every time.*

```tsx
// 1. Barrel import only if index exists AND every symbol is in Known component basenames
// import { Button, Card, ... } from "@/components/ui";

// 2. Fallback if no barrel file exists (check for NAMED vs DEFAULT style)
// Named export style: import { Button } from "@/components/ui/button";
// Default export style: import Button from "@/components/ui/button";

// Example: A generic container using background and flex/grid
export default function FlexibleComponent() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
       {/* Use Card or other components as needed by the requirement */}
       <Card className="max-w-2xl mx-auto">
         <CardHeader>
           <CardTitle>Dynamic Title</CardTitle>
         </CardHeader>
         <CardContent>
            {/* The internal structure should vary based on the prompt! */}
         </CardContent>
       </Card>
    </div>
  );
}
```

**CRITICAL**: You are an expert engineer. Judge the best structure for the specific request.
1. **NO HALLUCINATIONS**: ONLY use `@/components/ui/*` when the context lists them or `read_codebase` confirms the files exist. NEVER invent components like `Heading`, `Text`, or `Typography` if they are not provided.
2. **No UI kit**: If there is no `components/ui` in the project, use semantic HTML with styling consistent with the repo (Tailwind classes only if Tailwind is installed; otherwise CSS modules, inline styles, or existing patterns).
3. **Partial kit**: If a specialized component (Typography, List, etc.) is missing, use semantic HTML (`h1`, `p`, `ul`, …) plus the project’s styling approach—do not import paths that do not exist.
