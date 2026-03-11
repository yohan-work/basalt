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
Your goal is to verify if the user's task was successfully completed based on the current file structure and project context.

1. Check if the expected files appear to be present.
2. If the task involved creating a specific component or page, confirm it exists in the correct directory (app/ for App Router, pages/ for Page Router).
3. Provide a clear reasoning for your verification status.

## Schema
```json
{
    "verified": boolean,
    "notes": "string",
    "suggestedFix": "string (optional, if verification fails)"
}
```
