---
name: scan_project
description: Scans a project directory to analyze its structure, tech stack, and key files.
---

# Scan Project

Performs a comprehensive analysis of a project directory to understand its structure, technology stack, and important files.

## Inputs
-   `projectPath`: The root path of the project to scan.
-   `depth`: Maximum directory depth to scan (default: 3).

## Outputs
-   A JSON object containing:
    -   `techStack`: Detected technology stack (nextjs, react, node, etc.)
    -   `structure`: Key directories and their purposes
    -   `entryPoints`: Main entry files (index, app, main, etc.)
    -   `configFiles`: Configuration files found (tsconfig, eslint, etc.)
    -   `dependencies`: Key dependencies from package.json
    -   `componentPaths`: Paths where UI components are located
    -   `stylePaths`: Paths for style files (css, scss, tailwind)

## Instructions
1.  Read the directory structure recursively up to the specified depth.
2.  Identify `package.json` and extract dependencies to determine tech stack.
3.  Locate configuration files (tsconfig.json, next.config.*, tailwind.config.*, etc.).
4.  Find component directories (components/, src/components/, app/, pages/).
5.  Identify style configuration (globals.css, tailwind.config.js).
6.  Return a structured analysis that helps other agents understand the project.

## Use Cases
-   Before writing new code, scan the project to understand existing patterns.
-   Determine which UI library (shadcn, MUI, etc.) is being used.
-   Find where to place new components based on existing structure.
