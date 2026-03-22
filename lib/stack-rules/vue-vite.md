---
name: stack_rules_vue_vite
description: Vue 3 + Vite — SFC, script setup, vue-router, import.meta.env
---

# Vue 3 + Vite

`vue` + `vite`, `nuxt` 없음.

## Inputs

- 기존 `.vue` 파일이 **`<script setup>`** 인지 **Options API** 인지(샘플 1~2개로 통일)
- **vue-router** 설치 여부·`router` 설정 파일 위치
- **Pinia** 등 상태 라이브러리 설치 여부

## Outputs

- SFC: `*.vue` (`template` / `script` / `style` 구조를 기존과 동일)
- 라우트: `router`에 등록된 경로·lazy import 패턴 유지

## Instructions

1. 환경 변수는 **`import.meta.env.VITE_*`** 규칙을 따른다.
2. **Composition API** vs **Options API** — 프로젝트 다수결에 맞춘다.
3. 전역 컴포넌트 등록이 있으면 로컬 import보다 그 규칙을 우선한다(기존 코드 확인).
4. **scoped CSS** / **CSS modules** / **Tailwind `@apply`** 등 스타일 방식을 인접 `.vue`에 맞춘다.

## MUST NOT

- Nuxt 전용 디렉터리·auto-import(`useAsyncData` 등)를 nuxt 미설치 상태에서 가정.
- React/Next 문법 혼입.

## Use Cases

- 새 페이지: `views/` 또는 `pages/`(vue-router용) 관례에 맞게 `.vue` 추가 후 라우트 등록.
- 공통 로직: `composables/` 패턴이 있으면 그곳에 분리.

## Reference

- Vue 3 SFC; Vue Router; Vite.
