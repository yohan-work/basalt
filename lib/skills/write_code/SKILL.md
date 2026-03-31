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
4.  **STACK_RULES + EXPORT_STYLE_POLICY + UI_COMPONENT_POLICY (CRITICAL)**: `[PROJECT CONTEXT]`에 `[STACK_RULES]`(스택 전용), **`## EXPORT_STYLE_POLICY`**(라우트 모듈의 `export default function …` vs `const …` + `export default`), **`## UI_COMPONENT_POLICY`** 가 함께 있을 수 있다.
5.  **IMPORTANT**: Always use the correct file extension based on the explicit `Tech Stack` provided in the context.
6.  Do NOT create `.txt` or `.md` files unless explicitly asked for documentation.
7.  For UI components in Next.js/React, **ALWAYS** \`import React from "react";\` (and other hooks like \`useState\`) at the top.
8.  **CRITICAL (Next.js App Router & Zero-Error Pattern)**:
    - **Page Pattern (Next.js 15/16)**: **ALWAYS** await params.
      \`\`\`tsx
      import React from "react";
      export default async function Page(props: any) {
        const params = await props.params;
        const searchParams = await props.searchParams;
        return <div>...</div>;
      }
      \`\`\`
    - **Defensive Props**: **ALWAYS** use \`(props: any)\` for components to avoid TS2322/TS2339.
    - **Safe Data**: Use \`(data ?? []).map((item: any) => ...)\` to prevent runtime crashes.
9.  **NO BROWSER APIS IN SSR**: Never access \`window\`, \`document\`, or \`localStorage\` directly in a component body. Use \`useEffect\`.
10. **NO COMPLEX LIBRARIES (CRITICAL)**: To ensure "perfectly rendered pages" without build errors, **DO NOT** use complex libraries like **TanStack Table** or **Prisma**. Even if they are listed as installed, ignore them for UI tasks. Use standard semantic HTML tags (e.g., `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`) for all data displays.
11. **NO <a> TAGS (Next.js internal nav)**: Use `import Link from 'next/link'` for internal navigation.
12. **IMPORT EXISTENCE VALIDATION**: `@/components/ui/*` and other local imports must exist on disk.
13. **NPM DEPENDENCIES (CRITICAL)**: External packages MUST already appear in the project's `package.json`. **TanStack Table and Prisma are FORBIDDEN** for UI tasks.
14. **MOCK DATA MANDATE**: Always use local typed mock arrays defined directly inside the component or a local `lib/mock-data.ts`.
15. **PLACEHOLDER / DEMO IMAGE URLS (CRITICAL)**: Use `https://dummyimage.com/<W>x<H>/000/fff` only.
16. **MOCK API / fetch**: Do not use `fetch('/api/...')` unless the route handler is also written. Default to local mock arrays.

## UI Component Guidelines (MANDATORY)

When creating UI components (pages, forms, modals, cards, etc.), you MUST follow these guidelines:

- **Gate**: Read **`## UI_COMPONENT_POLICY`**.
- **Default visual tone**: Near-black shell, light high-contrast text, indigo primary CTA, blue text links, subtle borders.
- **Table / Data Lists**: **NEVER** use `@tanstack/react-table`. **ALWAYS** use standard HTML `<table>` with Tailwind CSS classes for styling.

### 1. Component Usage Reference (shadcn/ui)
Use `@/components/ui/` only if listed in `[PROJECT CONTEXT]`.

| Element | shadcn/ui Component | Fallback (Mandatory) |
|---------|---------------------|----------------------|
| Button | `Button` | `<button className="...">` |
| Table | `Table`, ... | `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` |

**CRITICAL**: You are an expert engineer. **ABANDON ALL COMPLEX LIBRARIES** in favor of standard HTML and local Mock Data to ensure zero-error delivery.
