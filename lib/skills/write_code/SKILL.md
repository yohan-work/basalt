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
4.  **IMPORTANT**: Always use the correct file extension based on the explicit `Tech Stack` provided in the context (e.g., use `.tsx` for React/Next.js components, `.ts` for logic, `.css`/`.scss` for styles).
5.  Do NOT create `.txt` or `.md` files unless explicitly asked for documentation.
6.  For UI components in Next.js/React, ensure you import React and necessary libraries.
7.  **CRITICAL (Next.js App Router)**: If the project uses App Router (files in `app/`) and you use React Hooks (e.g., `useState`, `useEffect`, `useContext`) or event handlers (e.g., `onClick`), you **MUST** include `"use client";` at the very first line of the file (Line 1). DO NOT FORGET IT, OR IT WILL CAUSE A FATAL BUILD ERROR.
8.  **NO BROWSER APIS IN SSR**: Never access `window`, `document`, or `localStorage` directly in a component body. Always wrap them in `useEffect`.
9.  **NO `<a>` TAGS**: Use `import Link from 'next/link'` for all internal navigation to prevent SPA reloads.
10. **IMPORT EXISTENCE VALIDATION**: `@/components/ui/*`, 별칭 경로, 상대 경로 import는 실제 존재하는 파일만 사용한다. 존재하지 않는 import는 코드 저장 시 실패 처리하고, 회복 가능한 경우 HTML/CSS 대체안을 제안한다.
11. **NPM DEPENDENCIES (CRITICAL)**: External packages (`date-fns`, `lodash`, `axios`, etc.) MUST already appear in the target project's `package.json` `dependencies` or `devDependencies`. If a package is not installed, `write_code` will reject the file. Before importing, infer from `[PROJECT CONTEXT]` / `package.json` which libraries exist. Prefer **no new dependencies**: e.g. format dates with `Intl.DateTimeFormat` or native `Date` instead of `date-fns` unless the project already uses it.

## UI Component Guidelines (MANDATORY)

When creating UI components (pages, forms, modals, cards, etc.), you MUST follow these guidelines while remaining flexible to the specific requirements:

### 1. Component Usage Reference (shadcn/ui)
Use these components from `@/components/ui/` as building blocks. **Do NOT just copy-paste the structure; adapt it to the task's specific layout requirements.**

| Element | shadcn/ui Component | Import Path |
|---------|---------------------|-------------|
| Button | `Button` | `@/components/ui/button` |
| Input | `Input` | `@/components/ui/input` |
| Label | `Label` | `@/components/ui/label` |
| Card | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` | `@/components/ui/card` |
| Dialog | `Dialog`, `DialogTrigger`, `DialogContent` | `@/components/ui/dialog` |
| Select | `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | `@/components/ui/select` |

### 2. Layout & Styling Rules
- **Follow the exact layout requested.** If the user asks for a grid, vertical stack, or specific section ordering, implement exactly that.
- **Styling**: Check the `[PROJECT CONTEXT]` for `Tailwind CSS`. Use Tailwind `grid`, `flex`, `gap-X` only if it is installed.
- **Import Style**: Check `[PROJECT CONTEXT]` for `UI Component Import Style`.
    - **MANDATORY**: If named imports are required, use `import { Component } from "@/components/ui/component"`.
    - **MANDATORY**: If a barrel file (`components/ui/index.ts`) exists, use MUST use it: `import { Button, Card } from "@/components/ui"`.
- **CRITICAL**: If Tailwind is NOT installed, **NEVER** use its classes. If `shadcn/ui` components are present but Tailwind is missing, they are likely broken; use standard HTML tags with premium inline styles instead.
- **NEVER** stick to a fixed template if the task description implies a different structure.

### 3. Component Reference Example
*This is a reference for how to use shadcn/ui components, NOT a template to be used every time.*

```tsx
// 1. Preferred if barrel import is available (check [PROJECT CONTEXT])
import { Button, Card, CardHeader, CardTitle, CardContent } from "@/components/ui";

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
1. **NO HALLUCINATIONS**: ONLY use components that are explicitly listed in the reference table above or that you know exist in the actual codebase (e.g. check `components/ui` directory if unsure). NEVER invent components like `Heading`, `Text`, or `Typography` if they are not provided.
2. **Standard HTML + Tailwind**: If a specialized component (like a Typography or List component) is missing, use standard semantic HTML tags (`h1`, `h2`, `p`, `ul`, `li`, etc.) combined with Tailwind CSS classes for styling.
3. NEVER use plain HTML elements (`<input>`, `<button>`, `<div>` without styling) for UI components.
