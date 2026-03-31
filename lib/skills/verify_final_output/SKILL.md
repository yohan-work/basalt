---
name: verify_final_output
description: checks if the final result matches the initial requirements.
---

# Verify Final Output

This skill performs a final check to ensure the work done matches the user's request.

## Inputs
-   `taskDescription`: The original task description to verify against.
-   `projectPath`: (optional) The project root path. Defaults to `process.cwd()`.

## Outputs
-   A JSON object containing:
    -   `verified`: Boolean (true/false).
    -   `notes`: Explanation of the verification result.

## Instructions
You are a Senior QA Engineer.
Your goal is to verify if the user's task was successfully completed based on the current file structure, **sampled directory tree**, **snippets of files listed in task `fileChanges`**, optional live page snapshot, and project context.

1. Check if the expected files appear to be present (including nested routes under `app/` or `src/app/`).
2. If the task involved creating a specific component or page, confirm it exists in the correct directory (App Router: `app/.../page.tsx` etc., Pages Router: `pages/...`).
3. **App Router route files (`page.tsx` / `page.ts` / `page.jsx` / `page.js`) must default-export a React UI component** (e.g. `export default function Page()`), not raw mock data, JSON-like arrays/objects, or content copied from a `mock-data` module. If snippets show only data literals or a non-component default export, set `verified` to **false** and put concrete repair steps in `suggestedFix` (e.g. move mocks to `lib/...`, import into a real page component).
4. Provide a clear reasoning for your verification status. When failing, prefer actionable `suggestedFix` text the implementer can follow in one pass.

## Schema
```json
{
    "verified": boolean,
    "notes": "string",
    "suggestedFix": "string (optional, if verification fails)"
}
```
