---
name: typecheck
description: Runs TypeScript compiler to check for type errors without emitting files.
---

# TypeCheck

Executes the TypeScript compiler in check mode to validate type safety.

## Inputs
-   `projectPath`: Root path of the project.
-   `configPath`: Path to tsconfig.json (default: 'tsconfig.json').

## Outputs
-   A JSON object containing:
    -   `success`: Whether type checking passed
    -   `errorCount`: Number of type errors found
    -   `errors`: Array of type errors with file, line, message

## Instructions
1.  Check if TypeScript is available in the project.
2.  Run tsc --noEmit to check types without generating output.
3.  Parse the compiler output and return structured data.
4.  Include file paths and line numbers for each error.

## Use Cases
-   Validate generated TypeScript code is type-safe.
-   Detect type mismatches before runtime.
-   Ensure interfaces and types are properly used.
