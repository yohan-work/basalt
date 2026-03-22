---
name: stack_rules_universal
description: 모든 스택 공통 — 패키지, 경로, 기존 코드 정합성
---

# Universal Stack Rules (모든 프로젝트)

`[PROJECT CONTEXT]`와 아래 스택 전용 팩을 함께 적용한다. 충돌 시 **스택 전용 팩**이 우선한다(단, npm 설치 여부는 항상 CONTEXT가 우선).

## Inputs (항상 확인)

- **Tech Stack**, **Router Base**, **Router Type**, **INSTALLED PACKAGES** 목록
- **Styling**: Tailwind 설치 여부 — 미설치면 유틸 클래스·shadcn 가정 금지
- **`UI_COMPONENT_POLICY`**: `[PROJECT CONTEXT]`의 `USE_EXISTING` vs `ABSENT` — **먼저** 판별. `ABSENT`면 `@/components/ui/*` import 금지(파일이 생긴 뒤에만). `USE_EXISTING`이면 나열된 파일만 import.
- **UI Component Import Style**: named vs default, barrel 여부 (`USE_EXISTING`일 때만 의미 있음)

## Outputs

- 프로젝트에 이미 있는 **파일명·폴더 깊이·alias**와 동일한 패턴의 경로만 제안한다.
- 새 라우트/페이지는 가능하면 **루트 페이지 덮어쓰기**를 피한다(CONTEXT의 Root Page Rewrite 정책 준수).

## Instructions

1. 코드를 쓰기 전에 `read_codebase`로 **인접 파일·유사 페이지**를 읽고, 네이밍·import 스타일을 복제한다.
2. **npm 패키지**는 `INSTALLED PACKAGES`에 있는 것만 import한다. 없으면 `fetch`, `Intl`, 네이티브 API로 대체한다.
3. **경로**는 프로젝트 루트 기준 상대 경로이며 선행 `/`를 붙이지 않는다(Orchestrator 규칙과 동일).
4. 타입스크립트 프로젝트면 확장자·`strict` 관례에 맞춘다(CONTEXT·기존 파일 기준).

## MUST NOT

- 설치되지 않은 패키지 가정(`axios`, `lodash`, `date-fns` 등).
- CONTEXT와 반대되는 스타일 강제(예: Tailwind 없는데 `className` 유틸 남발).
- 존재하지 않는 `@/`·별칭 경로로 import.

## Use Cases

- 어떤 프레임워크든 **첫 파일 작성 전** 기존 `page`·`layout`·`component` 1개 이상 참조.
- 의존성이 애매하면 **package.json을 읽고** 확정한다.
