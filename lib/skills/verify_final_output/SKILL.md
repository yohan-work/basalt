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
1.  List the project's top-level files to check if expected artifacts exist.
2.  Compare the current file structure against the task requirements.
3.  If mostly correct but with minor issues, mark as verified=true and add notes.
4.  If critical requirements are missing, mark as verified=false and clearly state what is missing.
