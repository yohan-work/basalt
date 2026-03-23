---
name: deep_code_review
description: Performs a deep, multi-dimensional code review focusing on security, performance, and best practices.
---

# Deep Code Review

This skill performs a rigorous review of the provided code snippet or file content. It acts as an expert senior engineer looking for subtle bugs and architectural flaws.

## Inputs
-   `codeToReview`: The specific code snippet or file content to review.
-   `context`: (Optional) Broader context of where this code belongs in the application.

## Instructions

1. Analyze the `codeToReview` line by line.
2. **Security**: XSS (unsafe `dangerouslySetInnerHTML`, unsanitized user HTML), injection (SQL/string concat), auth gaps (missing session checks, client-only auth), secrets in code, unsafe `run_shell_command` patterns. For **Next.js App Router**: data leaks across Server/Client boundaries, improper exposure of env without `NEXT_PUBLIC_` rules.
3. **Performance**: N+1 queries, missing indexes (if SQL), unnecessary client components, large sync work in render.
4. **Maintainability**: coupling, naming, error handling, testability.
5. **Architecture (lightweight)**: Does this code belong in this layer (page vs server action vs route handler)? Flag boundary violations.
6. Provide **actionable** feedback with concrete fix suggestions.

Output a structured markdown report with the following sections:

- **Summary**: Brief overview of the code quality.
- **Security Check**: Any security issues found.
- **Performance Analysis**: Any performance bottlenecks.
- **Maintainability Suggestions**: Suggestions for cleaner code.
- **Architecture / boundaries**: Layering and contract notes (if applicable).
- **Refactored Example**: (Optional) A snippet showing how to fix the major issues.

IMPORTANT: Write the entire review in KOREAN.
