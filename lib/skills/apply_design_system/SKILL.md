---
name: apply_design_system
description: Aligns one file in the **target project** with that repo's design tokens and styling patterns (Request Work execution).
---

# Apply Design System

Updates classes, layout utilities, or minimal markup so the file **matches the repository** the task runs against. Does **not** apply Basalt or any fixed external theme.

## Inputs

-   `componentPath`: Path to the file relative to the project root (e.g. `app/features/chat/ChatPanel.tsx`). No leading `/`.
-   `projectPath` (optional): Absolute path to the target repo; the orchestrator appends this like other filesystem skills.

## Outputs

-   Success message, or an error string if the file is missing, generation failed, or `write_code` validation failed.

## Execution rules

1.  Read `[PROJECT CONTEXT]` and **DESIGN HINTS** — they describe Tailwind, shadcn availability, and real CSS/theme excerpts.
2.  If Tailwind is installed, prefer semantic utilities already used in the project (`bg-background`, `text-muted-foreground`, etc.) when such tokens exist in DESIGN HINTS or sibling files.
3.  If Tailwind is **not** installed, do **not** add utility classes; use the project's CSS approach.
4.  **USE_EXISTING** UI policy: only use `@/components/ui/*` components that are listed as available. Otherwise semantic HTML.
5.  Preserve behavior: do not remove hooks, data flow, or exports unless a styling fix requires a trivial wrapper.
6.  Do not introduce new npm packages or fonts unless they are already in **INSTALLED PACKAGES**.

## Optional: distinctive UI (rare)

Only when the **task objective** explicitly requests a bold / marketing / portfolio look, you may additionally borrow ideas from `reference/02.design-system--type2.md` (typography contrast, motion, layered backgrounds) while still respecting the target stack (e.g. no Tailwind if not installed). Default is **neutral conformity**, not spectacle.

## Instructions

1.  Load the current file from `componentPath` under the task's project root.
2.  Produce **one** full file in the standard `File: path` + fenced code format expected by codegen.
3.  After generation, the runtime writes via `write_code` (import/RSC rules apply).
