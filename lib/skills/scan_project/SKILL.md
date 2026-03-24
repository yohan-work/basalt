---
name: scan_project
description: Scans a project directory to analyze its structure, tech stack, and key files.
---

# Scan Project

Performs a comprehensive analysis of a project directory to understand its structure, technology stack, and important files.

**Implementation (Basalt):** `lib/skills/index.ts`의 `scan_project`는 내부적으로 `ProjectProfiler` / `inferStackProfile`과 동일한 신호를 사용한다(플랜 단계 `codebaseContext`와 정합). 반환 객체에 `routerBase`, `depsWithVersions`, `directoryTreeSample` 등이 포함될 수 있다.

## Inputs
-   `projectPath`: The root path of the project to scan.
-   `depth`: Maximum directory depth to scan (default: 3).

## Outputs
-   A JSON object containing (실행 구현 기준):
    -   `techStack`, `structure`, `routerBase`, `pageCandidates`, `routerDualRoot`, `routerResolutionNote`
    -   플랜에 주입되는 `[PROJECT CONTEXT]`와 정합: **`VERSION_CONSTRAINTS`**, **`KEY_DEPENDENCY_VERSIONS`**, **`MAJOR_SYNTAX_HINTS`** 는 `ProjectProfiler.getContextString()`에서 동일 `depsWithVersions`·`majors`로 생성됨(`scan_project` JSON의 `dependencies` / `depsWithVersions`와 대응). **`## EXPORT_STYLE_POLICY`** 는 `lib/component-export-style.ts`의 `resolveRouteExportStyle`와 동일 소스.
    -   `entryPoints`: 루트 라우트 후보(`package.json` 포함)
    -   `configFiles`: 루트에 존재하는 설정 파일명
    -   `dependencies`, `depsWithVersions`
    -   `componentPaths`: UI 스캔 디렉터리 등
    -   `stylePaths`: globals.css·tailwind 설정 등 추정 경로
    -   `directoryTreeSample`: 깊이 제한된 디렉터리 트리 샘플
    -   `stackSummaryKr`, `scannedAt`

## Instructions
1.  Read the directory structure recursively up to the specified depth.
2.  Identify `package.json` and extract dependencies to determine tech stack.
3.  Locate configuration files (tsconfig.json, next.config.*, tailwind.config.*, etc.).
4.  Find component directories (components/, src/components/, app/, pages/).
5.  Identify style configuration (globals.css, tailwind.config.js).
6.  Return a structured analysis that helps other agents understand the project.

## Use Cases

- Before writing new code, scan the project to understand existing patterns.
- Determine which UI library (shadcn, MUI, etc.) is being used.
- Find where to place new components based on existing structure.

## Code map handoff

After `scan_project`, for **call-chain / ownership** questions combine with `read_codebase` and `extract_patterns` (heuristic: `use client` sample counts, path aliases, default vs named exports on page samples). The **`code-mapper`** agent uses this object as input to produce a human-readable **primary path** and **unknowns** list — `scan_project` alone is not a substitute for file-level tracing.
