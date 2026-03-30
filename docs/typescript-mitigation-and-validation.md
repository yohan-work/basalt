# TypeScript mitigation and validation

Tags: `#typescript` `#basalt` `#validation`

## Purpose

This document explains how Basalt **reduces** TypeScript errors during AI-driven code generation and how **failed writes** are handled so the workspace does not stay in a broken state. It does **not** promise zero TS errors—project-specific types, cross-file references, and model mistakes can still fail `tsc`.

## Goals and limits

| Goal | Notes |
|------|--------|
| Fewer TS errors | System prompts, profiler hints, and `docs/typescript-best-practices.md` steer the model toward patterns that typecheck. |
| Limited side effects on failure | A failed type check after a write triggers rollback when possible (see below). |
| **Not** guaranteed | Full-project `tsc` may still report issues that single-file validation misses. |

## What Basalt does today

### 1. Code generation (`lib/llm.ts`)

`CODE_GENERATION_SYSTEM_RULES` includes mandatory rules plus a **TypeScript / TSX checklist** (state generics, Next.js 15+ `params`/`searchParams`, TanStack Table `flexRender`, **named-only** `@/components/ui/table` imports (**TS2613**), **`Row`** vs **`Cell`** / **`getVisibleCells()`**, **`getCoreRowModel()`** invocation (**TS2322**), **React Rules of Hooks** — especially `useReactTable` / `useMemo(columns)` **before** loading early-returns, props typing, etc.). `generateCode` / `generateCodeStream` attach this to every codegen request.

Single-file surgical edits use `SURGICAL_FILE_EDIT_SYSTEM_RULES`, which includes a short TypeScript + **hooks order** note when touching table-related code, plus the same TanStack/UI table pitfalls when edits touch data tables.

### 2. Project context (`lib/profiler.ts`)

The `[PROJECT CONTEXT]` block includes Next.js metadata, **Link** guidance aligned with **minimal scaffold `Button`** (no `asChild` unless the project’s Button supports it), and—when App Router is detected—a **TypeScript quick wins** line pointing at this repo’s `docs/typescript-best-practices.md`. It can also note whether **`lib/utils` / `src/lib/utils`** exists (for safe `cn` imports) and a short **UI auto-scaffold contract**: some `components/ui/*` files may be **single-wrapper** auto-generations, so compound shadcn exports must not be assumed. If `table` exists in the UI kit, **TanStack Table** rules are appended. When `package.json` lists **`@tanstack/react-table`**, **TanStack v8** import rules are included even before `table` exists on disk. When `package.json` lists **`@prisma/client`**, a **Prisma** line is added: **by default, UI/list/board tasks do not need Prisma** — use mock data unless the user explicitly asked for DB access. When implementing real DB code, do not assume a global `prisma`; import the app singleton (profiler may list on-disk candidates such as `lib/prisma.ts`). If the default generated client folder **`node_modules/.prisma/client`** is missing at profile time, a **WARNING** is appended: for UI-only work skip `@prisma/client` imports; for real DB work run **`npx prisma generate`** before importing `PrismaClient`, or TypeScript often fails with **TS2305**. Custom `generator client { output = ... }` paths are noted as a caveat.

### 3. `write_code` validation (`lib/skills/index.ts`)

When the target project has **`@prisma/client`** installed and the incoming file body uses **`prisma.`** (member access), `write_code` runs a **lightweight check** before writing: the file must already contain an `import` that binds `prisma` or a top-level `const prisma =` / `let prisma =`. That catches **TS2304 Cannot find name 'prisma'** early with a direct message instead of only relying on post-write TypeScript diagnostics.

If the file **`import`s from `@prisma/client`** (any subpath) and the default **`node_modules/.prisma/client`** directory is missing, `write_code` **rejects the write** with a message to run **`npx prisma generate`** **or** remove Prisma and use **mock data** for UI-only tasks. That blocks the common **TS2305** failure mode before `tsc` runs.

**TanStack Table + `components/ui/table`**: When the model imports `@/components/ui/table` but the file was missing, Basalt’s **extended UI scaffold** (`lib/project-ui-kit.ts`) now generates a **shadcn-style `table.tsx`** exporting `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableFooter`, and `TableCaption` (not a single generic `Table` div). The same scaffold path can create **`tabs.tsx`** with `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent`. For **other** basenames, the generic path may still emit **only one** wrapper component — copying full shadcn multi-export patterns causes **TS2305** until a dedicated template exists or the file is hand-authored. Additionally, `write_code` **fails fast** if the source uses `flexRender`, `useReactTable`, or `getCoreRowModel` but contains **no** `@tanstack/react-table` import (prevents **TS2552**); if TanStack APIs are present and the file uses a **default import** from `@/components/ui/table` (or a path ending in `components/ui/table`), the write is rejected early (**TS2613** — Basalt’s extended `table.tsx` is **named exports only**). Codegen rules and the Orchestrator TS repair prompt also cover **TS2339** on `ColumnMeta` / `meta.width` vs built-in **`size`** / **`getSize()`**, **TS2551** (`header.columnDef` vs **`header.column.columnDef`** on v8 `Header`), **`row.column`** vs **`cell.column`** after **`getVisibleCells()`**, **`getCoreRowModel()`** invocation (**TS2322**), and **TS7006** (annotate **`Cell`/`Header`** or type **`useReactTable<Row>`**) ([TanStack introduction](https://tanstack.com/table/latest/docs/introduction), [column sizing](https://tanstack.com/table/latest/docs/guide/column-sizing)).

Codegen rules (`lib/llm.ts`, `[PROJECT CONTEXT]` from `lib/profiler.ts`) also require **v8** APIs (`useReactTable`, not `useTable`), **`flexRender` only from `@tanstack/react-table`**, **`next/navigation`** (not `next/router`) for App Router client hooks, cautious **`cn` / `@/lib/utils`** usage, typed `.map` callbacks, **no `asChild` on minimal `Button`**, and **hooks before early `return`** for table/list clients — reducing TS2305/TS2322/TS7006 and **hook order** runtime errors on board/list pages.

The Orchestrator **TypeScript diagnostic repair** prompt (`repairWriteCodeTypeScriptDiagnostics`) includes matching fixes for **wrong router import**, **lucide-react** names, missing **`cn`**, **nonexistent compound UI** exports, and **Rules of Hooks** / `useReactTable` placement when diagnostics or patterns imply hook-order issues.

After writing a file, `validateGeneratedTypeSafety` runs (via `scripts/validate-client-boundary.mjs --types-only` when present, or in-process TypeScript diagnostics). If validation **fails**, the implementation attempts to **restore the previous file contents** or **remove** a newly created file so bad output does not persist.

### 4. Orchestrator repair loop (`lib/agents/Orchestrator.ts`)

If `write_code` still fails (imports, UI allowlist, TS diagnostics, etc.), the orchestrator can trigger targeted repairs, including **TypeScript diagnostic repair** with a bounded number of rounds (`MAX_TYPESCRIPT_DIAGNOSTIC_REPAIRS`, currently **5**). That repair prompt includes explicit guidance for missing **`prisma`** bindings (import singleton or instantiate `PrismaClient`), for **TS2305** on **`PrismaClient`** / `@prisma/client` (run **`prisma generate`**; prefer singleton; remove Prisma from Client Components), for **React Rules of Hooks** / **`useReactTable`** when hook-order or board/table patterns appear in the diagnostics text, and for TanStack/UI table issues (**TS2613** default import, **`row.column`** vs **`cell.column`**, **`getCoreRowModel()`**). Pre-validation failures that mention **`TanStack Table:`** and **`no default export`** also route into the same TS repair path.

**Prisma pre-check (missing `node_modules/.prisma/client`)**: Before the first codegen attempt for a `write_code` step, if the target lists **`@prisma/client`** in `package.json` but the default generated client folder is absent, the orchestrator appends a **[BASALT HARD CONSTRAINT]** line to the coding prompt: **do not** import `@prisma/client` / `PrismaClient`; use typed mock/sample data instead. If the model still emits an `@prisma/client` import and `write_code` rejects with the Prisma message, a dedicated **Prisma import repair** runs (up to **`MAX_PRISMA_IMPORT_REPAIR_ATTEMPTS`**, currently **3**): the coding model rewrites the file to drop Prisma imports and drive the UI with in-file mock data so the write can succeed without **`prisma generate`**. For real persistence, run **`npx prisma generate`** (or your custom generator output) in the target project and then implement DB access intentionally.

**RSC / metadata vs `"use client"` (`rscBoundaryViolation`)**: When `write_code` rejects an App Router `page.tsx` / `layout.tsx` because **`metadata` / `generateMetadata` / `viewport` / `generateViewport`** conflict with **`"use client"`** (or hooks without a client split), the orchestrator runs an **RSC boundary repair** (up to **`MAX_RSC_BOUNDARY_REPAIR_ATTEMPTS`**, currently **3**): the coding model emits a **server** route file (no `"use client"`, keeps SEO exports) plus one or more **`*Client.tsx`** files under `components/` / `src/components/`, writes the client file(s) first, then retries the page/layout. Reference: [generateMetadata — server component only](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only).

## Operational recommendations (target projects)

1. Run the project’s type check regularly (e.g. `npm run lint:types` or `tsc --noEmit`).
2. Keep team rules in `.cursor/rules` or project skills aligned with `docs/typescript-best-practices.md`.
3. Treat codegen as **first pass**; human review and CI remain the safety net for cross-file and architectural issues.

## Related docs

- [TypeScript best practices](./typescript-best-practices.md) — concrete patterns (state, tables, Next.js APIs, etc.).
