---
name: stack_rules_fallback_unknown
description: 스택 미분류 — 추정 금지, 읽고 맞추기
---

# Unknown / Mixed Stack

프레임워크가 자동 분류되지 않았거나 모노레포·커스텀 템플릿인 경우.

## Inputs

- **전체 [PROJECT CONTEXT]** + **디렉터리 트리**(`read_codebase`, 목록 스킬)
- 가장 가까운 **설정 파일**: `package.json`, `vite.config.*`, `nuxt.config.*`, `angular.json`, `svelte.config.*`

## Outputs

- 기존 저장소와 **동일한 확장자·폴더 깊이·네이밍**을 우선한다.

## Instructions

1. **특정 프레임워크 문법을 추정하지 말고**, 같은 디렉터리의 기존 파일 2개 이상을 읽고 패턴을 복사한다.
2. `package.json`의 **dependencies**로 실제 스택을 다시 확인한다.
3. 여전히 애매하면 **범용 TS/JS** + 최소 의존성으로 작성하고, 사용자에게 확인이 필요한 가정을 로그에 남긴다.

## MUST NOT

- Next 전용 규칙을 Vue/Nuxt/Angular에 적용.
- 설치되지 않은 도구체인 가정.

## Use Cases

- 레거시 커스텀 번들, 희귀 템플릿, 잘못된 프로젝트 루트 등록.
- 복구: Basalt **프로젝트 경로**가 실제 앱 루트가 아닐 수 있음 — 모노레포면 패키지 디렉터리를 등록하도록 안내.
