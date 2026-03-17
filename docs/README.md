이 문서는 `README.md`의 상세 내용을 기능별로 분리해 관리하기 위한 인덱스입니다.

# Basalt Docs

## 빠른 진입

- `README.md`는 프로젝트 개요, 설치/실행, 주요 링크만 유지합니다.
- 아래 문서에서 세부 내용을 확인하세요.

## 문서 인덱스

### 아키텍처

- `architecture/orchestrator.md`  
  - Orchestrator/상태 흐름/재시도/잠금/메타데이터 저장 규칙
- `architecture/team-orchestrator.md`  
  - 팀 오케스트레이션 라운드, 메시지, handoff, 협업 지표
- `llm.md`  
  - 모델 구성, backoff, timeout, 스트리밍, 파서 안정화

### 실행 기능

- `features.md`  
  - 완료 수정, 요소 수정, 리뷰 제안, approve, discuss, enhance-prompt, react-grab 연동, TTS, 실행 시각화
- `api.md`  
  - `/app/api/**/route.ts` 기준 전체 엔드포인트 목록 및 사용 사례
- `agents-skills.md`  
  - 에이전트 정의, SKILL/AGENT 동작, 동적 로더 연동

### 프롬프트 엔지니어링

- `prompting/contract-template.md`  
  - 계약 표준 템플릿(목표/입력/제약/출력/성공기준)
- `prompting/api-contracts.md`  
  - API 단위 실행 계약(필수/선택 필드, 성공 조건)
- `prompting/agent-skill-contracts.md`  
  - 에이전트/스킬별 계약(목표, 제약, 출력)
- `prompting/prompt-families.md`  
  - Planning/Execution/Review/Editing/Approval 패밀리
- `prompting/eval-metric.md`  
  - 프롬프트 성능 측정 지표
- `prompting/failure-log-template.md`  
  - 실패 패턴 기록 및 재학습 템플릿

### UI/구성

- `ui-components.md`  
  - 핵심 컴포넌트와 분석/대시보드 컴포넌트 카탈로그
- `setup.md`  
  - 환경 변수, 실행 방법, 스크립트, 운영 가이드
- `stack.md`  
  - 기술 스택, 도입 배경, 외부 의존성 요약

## 유지 규칙

- 기능별 내용은 해당 문서에서만 편집하고, `README.md`에는 변경이 잦지 않은 핵심 요약만 유지합니다.
- 새로운 기능이 추가되면 아래 우선순위로 반영합니다.
  1. `features.md` 또는 `api.md`
  2. 동작 주체 문서(`architecture/*`, `agents-skills.md`)
  3. UI 변경 문서(`ui-components.md`)
  4. `README.md`의 링크/요약 갱신
