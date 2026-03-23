---
name: generate_scss
description: Generates SCSS for a block/module that matches the **target project's** variables and conventions (Request Work).
---

# Generate SCSS

Returns SCSS text for a named block (e.g. BEM root) that fits the **task workspace**, not a template theme.

## Inputs

-   `moduleName`: Root class / block name (e.g. `Header`, `chat-panel`).
-   `projectPath` (optional): Target repo root; orchestrator may append automatically.

## Outputs

-   Raw SCSS string (no markdown fences in the final artifact).

## Instructions

1.  Use `var(--…)` and mixins only when they appear in **DESIGN HINTS** or are standard for that repo; do not assume Basalt's `:root` values.
2.  Nest selectors clearly; keep specificity reasonable.
3.  If the project has no shared SCSS variables, use plain CSS-compatible SCSS with neutral, accessible values consistent with existing pages.
4.  Do not `@import` npm packages that are not in **INSTALLED PACKAGES**.
