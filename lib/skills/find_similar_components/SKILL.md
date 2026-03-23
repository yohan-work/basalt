---
name: find_similar_components
description: Finds component-like files by basename/path/content match plus UI kit basenames from the profiler.
---

# Find Similar Components

**Runtime (Basalt):** `lib/skills/index.ts`의 `find_similar_components`는 `components/`, `src/components`, `app`, `src/app` 아래를 제한적으로 순회하고, UI 키트 목록·파일명·파일 내용(앞부분)으로 매칭한다. `app/**/api` 라우트 디렉터리는 건너뛴다.

## Inputs

- `projectPath`: 프로젝트 루트.
- `query`: 검색 문자열 (파일명·경로·내용, 대소문자 무시). 빈 값이면 `componentType`이 있어야 의미 있음.
- `componentType`: 경로/파일명에 포함 여부로 좁히는 선택 필터.

## Outputs (실제 구현)

- `matches`: 상대 경로 문자열 배열 (점수 상위, 최대 24).
- `details`: `{ path, score, reason }` 최대 12개.
- `query`, `componentType`

## Instructions

1. Prefer **short, distinctive** queries (e.g. `DataTable`, `sign-in`, `useCart`).
2. Follow up with `read_codebase` on the top matches — this skill does not return full file bodies.

## Use Cases

- 새 페이지/컴포넌트 작성 전 유사 파일 탐색.
- 리팩터 시 영향 받을 수 있는 컴포넌트 나열.
