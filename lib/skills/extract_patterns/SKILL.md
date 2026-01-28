---
name: extract_patterns
description: Analyzes existing code files to extract coding patterns, conventions, and styles used in the project.
---

# Extract Patterns

Analyzes existing source files to understand the coding conventions and patterns used in the project.

## Inputs
-   `projectPath`: The root path of the project.
-   `fileTypes`: Array of file extensions to analyze (default: ['.tsx', '.ts', '.jsx', '.js']).

## Outputs
-   A JSON object containing:
    -   `importStyle`: How imports are organized (grouped, alphabetical, etc.)
    -   `exportStyle`: Default exports vs named exports preference
    -   `namingConventions`: Component naming (PascalCase, camelCase, etc.)
    -   `componentStructure`: Functional vs class components, hooks usage
    -   `stateManagement`: useState, useReducer, zustand, redux, etc.
    -   `stylingApproach`: Tailwind classes, CSS modules, styled-components
    -   `commonPatterns`: Frequently used patterns (error boundaries, loading states)
    -   `fileStructure`: How files are typically organized

## Instructions
1.  Scan the project for relevant source files.
2.  Read a sample of files (up to 10) from component directories.
3.  Analyze the code structure and extract patterns.
4.  Use LLM to summarize the conventions found.
5.  Return structured data that can guide code generation.

## Use Cases
-   Ensure generated code matches existing project style.
-   Automatically adopt the project's import organization.
-   Follow the same component structure patterns.
