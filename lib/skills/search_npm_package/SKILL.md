---
name: search_npm_package
description: Resolves an npm package name against the public registry via npm view (version, description, peers) and notes if it is already in package.json.
---

# Search NPM Package

**Runtime (Basalt):** `lib/skills/index.ts`의 `search_npm_package`는 `npm view <name> --json`으로 레지스트리 메타데이터를 조회한다. 네트워크 또는 npm 캐시가 필요하다.

## Inputs

- `query`: npm 패키지 이름 (예: `react`, `lodash`, `@types/node`, `@radix-ui/react-dialog`).

## Outputs

- 성공 시: `version`, `description`, `homepage`, `repository`, `peerDependencies`, `listedInProjectPackageJson` 등 구조화 객체.
- 실패 시: `success: false`, `error` 메시지.

## Instructions

1. Use an **exact package name** the user intends to depend on — not vague keywords (for keywords, suggest the engineer pick a candidate name first).
2. If `listedInProjectPackageJson` is false, **do not** import that package in generated code until the dependency is added by the project owner.
3. Report **peerDependencies** when present — they may require extra installs.

## Schema

```json
{
  "summary": "string",
  "safeToImport": "boolean",
  "notes": "string"
}
```

When using `execute_skill` without the TS implementation, mirror the above behavior conceptually.
