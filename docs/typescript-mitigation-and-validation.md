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

`CODE_GENERATION_SYSTEM_RULES` includes mandatory rules plus a **TypeScript / TSX checklist** (state generics, Next.js 15+ `params`/`searchParams`, TanStack Table `flexRender`, props typing, etc.). `generateCode` / `generateCodeStream` attach this to every codegen request.

Single-file surgical edits use `SURGICAL_FILE_EDIT_SYSTEM_RULES`, which includes a short TypeScript note when touching table-related code.

### 2. Project context (`lib/profiler.ts`)

The `[PROJECT CONTEXT]` block includes Next.js metadata, Link, and—when App Router is detected—a **TypeScript quick wins** line pointing at this repo’s `docs/typescript-best-practices.md`. If `table` exists in the UI kit, **TanStack Table** rules are appended. When `package.json` lists **`@prisma/client`**, a **Prisma** line is added: do not assume a global `prisma`; import the app singleton (profiler may list on-disk candidates such as `lib/prisma.ts`).

### 3. `write_code` validation (`lib/skills/index.ts`)

When the target project has **`@prisma/client`** installed and the incoming file body uses **`prisma.`** (member access), `write_code` runs a **lightweight check** before writing: the file must already contain an `import` that binds `prisma` or a top-level `const prisma =` / `let prisma =`. That catches **TS2304 Cannot find name 'prisma'** early with a direct message instead of only relying on post-write TypeScript diagnostics.

After writing a file, `validateGeneratedTypeSafety` runs (via `scripts/validate-client-boundary.mjs --types-only` when present, or in-process TypeScript diagnostics). If validation **fails**, the implementation attempts to **restore the previous file contents** or **remove** a newly created file so bad output does not persist.

### 4. Orchestrator repair loop (`lib/agents/Orchestrator.ts`)

If `write_code` still fails (imports, UI allowlist, TS diagnostics, etc.), the orchestrator can trigger targeted repairs, including **TypeScript diagnostic repair** with a bounded number of rounds (`MAX_TYPESCRIPT_DIAGNOSTIC_REPAIRS`, currently **5**). That repair prompt includes explicit guidance for missing **`prisma`** bindings (import singleton or instantiate `PrismaClient`).

## Operational recommendations (target projects)

1. Run the project’s type check regularly (e.g. `npm run lint:types` or `tsc --noEmit`).
2. Keep team rules in `.cursor/rules` or project skills aligned with `docs/typescript-best-practices.md`.
3. Treat codegen as **first pass**; human review and CI remain the safety net for cross-file and architectural issues.

## Related docs

- [TypeScript best practices](./typescript-best-practices.md) — concrete patterns (state, tables, Next.js APIs, etc.).
