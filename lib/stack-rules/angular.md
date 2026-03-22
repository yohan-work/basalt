---
name: stack_rules_angular
description: Angular — standalone vs NgModule, DI, 라우팅, 템플릿
---

# Angular

`@angular/core` 기반 앱.

## Inputs

- **standalone: true** 컴포넌트가 대부분인지, **NgModule** 기반인지(최근 생성 컴포넌트 2~3개로 판단)
- **`angular.json`** 소스 루트(`src/app` 등)
- **라우팅**: `provideRouter` / `RouterModule.forRoot` 중 프로젝트 방식

## Outputs

- 컴포넌트: `.ts` + `templateUrl` / `styleUrls` 또는 인라인 — 기존과 동일
- 서비스: `@Injectable` + `providedIn` 또는 모듈 providers

## Instructions

1. 새 컴포넌트는 프로젝트가 **standalone**이면 `imports` 배열에 필요한 `CommonModule`·UI 모듈을 명시한다.
2. **의존성 주입**은 생성자 또는 `inject()` — 프로젝트 스타일에 맞춘다.
3. **비동기 파이프** `async` vs **subscribe** — 기존 템플릿 패턴을 따른다.
4. 라우트 추가 시 **lazy `loadComponent` / `loadChildren`** 패턴을 기존 라우트 정의에 맞춘다.

## MUST NOT

- React/Vue 템플릿 문법 혼입.
- standalone 프로젝트에만 쓰는 API를 NgModule-only 코드베이스에 임의 도입(또는 그 반대) without reading files.

## Use Cases

- 새 화면: `routes`에 path 추가 + 컴포넌트 생성.
- 공유 상태: 기존에 NgRx/Signals/서비스 중 무엇을 쓰는지 확인 후 동일 계층에 추가.

## Reference

- Angular — Components, Dependency injection, Routing (설치된 메이저 버전 문서).
