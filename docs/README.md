# Basalt Docs

이 문서는 Basalt의 기능, 실행 방법, 내부 구조를 살펴보기 위한 문서 인덱스입니다.

## 처음 볼 문서

1. [`../README.md`](../README.md)  
   서비스가 해결하는 문제, AI 처리 방식, 사용 흐름, 실행 방법.
2. [`features.md`](./features.md)  
   주요 기능, 상태 흐름, 화면에서 확인되는 결과.
3. [`llm.md`](./llm.md)  
   사용 모델, 모델별 역할, 프롬프트/처리 방식.
4. [`architecture/overview.md`](./architecture/overview.md)  
   UI, API, Orchestrator, Supabase, LLM의 실행 구조.
5. [`setup.md`](./setup.md)  
   로컬 실행, Supabase 스키마, Ollama, QA 옵션.

## 문서 인덱스

### 기능과 사용

- [`features.md`](./features.md): 핵심 기능, 사용 흐름, 확장 기능
- [`ui-components.md`](./ui-components.md): 화면과 주요 컴포넌트
- [`api.md`](./api.md): API 엔드포인트 목록과 주요 실행 옵션

### 모델과 실행 구조

- [`llm.md`](./llm.md): 모델 구성, 프롬프트, LLM 안정성 정책
- [`agents-skills.md`](./agents-skills.md): Agent/Skill 구조, 역할별 실행 단위, 스킬 레지스트리
- [`architecture/overview.md`](./architecture/overview.md): 시스템 구성도와 사용자 액션 기준 데이터 흐름
- [`architecture/orchestrator.md`](./architecture/orchestrator.md): 단일 태스크 실행, 상태 전이, 검증/수리 루프
- [`architecture/team-orchestrator.md`](./architecture/team-orchestrator.md): 팀 오케스트레이션 라운드, 메시지, handoff

### 프롬프트 엔지니어링

- [`prompting/contract-template.md`](./prompting/contract-template.md): 계약 문서 표준 템플릿
- [`prompting/api-contracts.md`](./prompting/api-contracts.md): 주요 API 계약
- [`prompting/agent-skill-contracts.md`](./prompting/agent-skill-contracts.md): 에이전트/스킬별 계약
- [`prompting/prompt-families.md`](./prompting/prompt-families.md): Planning, Execution, Review, Editing, Approval 패밀리
- [`prompting/eval-metric.md`](./prompting/eval-metric.md): 프롬프트 성능 측정 지표
- [`prompting/failure-log-template.md`](./prompting/failure-log-template.md): 실패 패턴 기록 템플릿

### 운영과 부록

- [`setup.md`](./setup.md): 설치, 환경 변수, Supabase, Ollama, QA 실행 준비
- [`implementation-history.md`](./implementation-history.md): 누적 구현·개선 이력
- [`local-dev-troubleshooting.md`](./local-dev-troubleshooting.md): Turbopack, Ollama, Realtime, spec-expand 문제 해결
- [`stack.md`](./stack.md): 기술 스택과 주요 의존성
- [`target-workspace-environment.md`](./target-workspace-environment.md): Basalt가 수정할 대상 앱의 환경 파악 체크리스트
- [`typescript-best-practices.md`](./typescript-best-practices.md), [`nextjs-best-practices.md`](./nextjs-best-practices.md): 코드 생성 품질 보조 가이드

## 유지 규칙

- 루트 `README.md`는 서비스 소개와 실행 방법 중심으로 유지합니다.
- 세부 기능은 `features.md`, API 변경은 `api.md`, AI/모델 변경은 `llm.md`, 구조 변경은 `architecture/*`에 먼저 반영합니다.
- 변경 이력은 `implementation-history.md`에 간단한 설명과 링크만 추가합니다.
