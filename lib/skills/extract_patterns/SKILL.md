---
name: extract_patterns
description: Heuristic project conventions — stack, router, UI kit, sampled use client usage, path aliases, default vs named exports on page samples.
---

# Extract Patterns

**Runtime (Basalt):** `lib/skills/index.ts`의 `extract_patterns`는 `ProjectProfiler`와 제한된 파일 샘플(라우터·컴포넌트 트리)을 사용한다. LLM 추측이 아니라 **파일 기반 휴리스틱**이다.

## Inputs

- `projectPath`: 프로젝트 루트.
- `fileTypes`: 분석할 확장자 배열 (기본 `['.tsx', '.ts', '.jsx', '.js']`).

## Outputs (실제 구현)

- `techStack`, `structure`, `routerBase`, `routerResolutionNote`
- `hasTailwind`, `uiKitPresent`, `uiKitRelativePath`
- `pageCandidatesSample`
- `conventions`:
  - `useClientOccurrencesInSampledFiles`, `filesSampledForUseClient`
  - `defaultVsNamedExportInPageSample` — 페이지 후보 경로 기반 레거시 카운트(확장자 있는 경로만 유효)
  - `routeExportStyle` — `resolveRouteExportStyle` 결과: `style`, `source`, `defaultFunctionCount`, `constArrowCount`, `skippedCount`, `sampledRelPaths` (`[PROJECT CONTEXT]`의 `## EXPORT_STYLE_POLICY`와 동일 소스)
  - `tsconfigPathPatterns` — 컴파일러 paths 키 샘플
- `notes` — 해석 시 주의사항

## Instructions

1. Callers should treat output as **hints**; confirm with `read_codebase` for critical paths.
2. Pair with `scan_project` for directory context and with **`code-mapper`** for execution flow.

## Use Cases

- Planners seeding `[PROJECT CONTEXT]` with convention hints.
- Before bulk codegen, check alias and client-boundary prevalence.
