---
name: lint_code
description: Runs ESLint on specified files or directories to detect code quality issues.
---

# Lint Code

Executes ESLint to check for code quality issues, style violations, and potential bugs.

## Inputs
-   `target`: File path or directory to lint (default: '.').
-   `projectPath`: Root path of the project.
-   `fix`: Whether to automatically fix fixable issues (default: false).

## Outputs
-   A JSON object containing:
    -   `success`: Whether linting passed without errors
    -   `errorCount`: Number of errors found
    -   `warningCount`: Number of warnings found
    -   `fixedCount`: Number of issues automatically fixed (if fix=true)
    -   `issues`: Array of lint issues with file, line, message

## Instructions
1.  Check if ESLint is available in the project (node_modules/.bin/eslint).
2.  Run eslint with JSON output format.
3.  Parse the results and return structured data.
4.  If fix=true, run with --fix flag.

## Use Cases
-   Validate generated code before committing.
-   Detect potential issues in newly written files.
-   Auto-fix common style issues.
