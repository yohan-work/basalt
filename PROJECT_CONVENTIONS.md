# Basalt Project Conventions for AI Agents

This document outlines project-specific conventions and guidelines that AI agents must adhere to when operating within this Basalt project. These rules supplement general LLM best practices and are derived from project analysis, Claude Code's architectural patterns, and identified edge cases.

## 1. Agent Behavior Guidelines (Inspired by Claude Code)

These guidelines ensure agents operate efficiently, safely, and in line with project needs.

### 1.1. Just-in-Time (JIT) Information Retrieval
- **Prioritize Search:** Always use `grep_search`, `list_directory`, and `glob` to find information before performing broad file reads.
- **Minimal Read:** For large files (>100 lines), use `read_file` with specific line ranges discovered via `grep_search`. Avoid reading entire files unless absolutely necessary.
- **Goal:** Minimize token usage and accelerate context retrieval.

### 1.2. Surgical Editing
- **Prefer `replace`:** For modifying existing files, always use the `replace` tool with precise context. This ensures minimal changes and reduces the risk of unintended side effects.
- **Use `write_code` Sparingly:** Reserve `write_code` for creating new files or complete rewrites.
- **Context Precision:** When providing `old_string` for `replace`, ensure it includes sufficient surrounding code (at least 3 lines before and after) to guarantee uniqueness and safety.

### 1.3. In-File Data Mocking
- **Prototype First:** For initial features, UI components, or pages, **define dummy data as `const` within the same file**.
- **Avoid External Mock Files:** Do NOT assume the existence of or create files like `@/lib/mock-data`, `data/products.ts`, etc., unless explicitly instructed by the task and confirmed to exist on disk.
- **Self-Containment:** Keep components self-contained. If data is needed for rendering, include it locally.

## 2. Defenses Against Edge Cases in Code Generation

These rules proactively address common issues encountered during AI-driven code generation.

### 2.1. Module Import Validation
- **Verify Existence:** Before importing any module (especially custom ones like `@/lib/mock-data` or `@/components/ui/*`), agents must verify its existence using `list_directory` or `grep_search`.
- **Strict Import Paths:** Only import modules that are confirmed to exist in the project. Do NOT assume paths like `@/lib/mock-data`.
- **UI Component Imports:** When importing from `@/components/ui/`, ensure the imported basename (e.g., `button` from `Button`) is valid and exists on disk. If invalid, remove the import and use semantic HTML or existing CSS patterns.

### 2.2. Next.js App Router Conventions
- **Server/Client Component Separation:** Strictly adhere to Next.js App Router rules. Use `"use client"` directive ONLY when necessary. Server Components (`metadata`, `viewport` exports) must NOT be in client files. If a violation is detected, split into a Server Component (`page.tsx`) and a Client Component (`*Client.tsx`).
- **Routing:** Use `page.tsx` for route segments. Do not use `index.tsx` in `app/` directories. Map root requests to appropriate feature routes if not explicitly targeting the homepage.

### 2.3. Dependency Management
- **No New Dependencies:** Do NOT add new npm packages or `@types/*` packages unless they are already present in `package.json`.
- **Prefer Existing:** Use packages already installed in the project. Use `search_npm_package` to confirm before adding any new ones.

### 2.4. Stability Over Advanced Libraries
- **Fallback to Standard HTML:** If type errors persist with complex libraries (e.g., `@tanstack/react-table`, `@prisma/client`), **abandon the library**. Rewrite the component using standard HTML (`<table>`, `<thead>`, etc.) and local mock data. A working component with standard HTML is preferred over a broken one using advanced libraries.
- **Prisma Client:** If `@prisma/client` is imported but not generated, remove Prisma usage for UI-only tasks and use mock data. For DB-required tasks, use the project's Prisma singleton (`import { prisma } from '@/lib/prisma'`) if available.

## 3. Supplementary Documentation

Refer to the following documents for deeper insights:
- `docs/nextjs-best-practices.md`: Detailed Next.js App Router guidelines.
- `docs/typescript-best-practices.md`: TypeScript usage standards.
- `docs/agents-skills.md`: Overview of available agents and skills.
- `lib/agents/software-engineer/AGENT.md`: Specific behavioral rules for the Software Engineer agent.
