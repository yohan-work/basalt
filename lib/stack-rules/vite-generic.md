---
name: stack_rules_vite_generic
description: Vite 단독(프레임워크 미특정) — 엔트리, alias, env
---

# Vite (Framework-agnostic)

`vite`만 분명하고 React/Vue 등 상위 프레임워크가 CONTEXT에 없을 때.

## Inputs

- **vite.config**의 `root`, `resolve.alias`, `base`
- **index.html** 진입 스크립트 경로
- **INSTALLED PACKAGES** — 실제로 무엇이 있는지 다시 확인(프레임워크 추정 금지)

## Outputs

- 빌드 산출물 경로·public 디렉터리는 설정 파일에 따름.

## Instructions

1. **프레임워크 전용 문법**(`use client`, Vue SFC, `.svelte`)을 package.json 근거 없이 쓰지 않는다.
2. **`import.meta.env.VITE_*`** 환경 변수 규칙을 따른다.
3. TypeScript면 `tsconfig` paths와 Vite alias를 일치시킨다.

## MUST NOT

- 임의로 React/Vue/Next/SvelteKit을 가정한다.

## Use Cases

- 순수 TS 라이브러리 번들, 소규모 바닐라 TS UI 등.

## Reference

- Vite — Config, Env Variables.
