이 문서는 `README.md`의 상세 내용을 기능별로 분리해 관리하기 위한 인덱스입니다.

# Basalt Docs

## 빠른 진입

- `README.md`는 문제 정의·AI 역할 요약·퀵스타트·문서 인덱스를 담고, 세부는 아래 문서로 분리합니다.
- 아래 문서에서 세부 내용을 확인하세요.

## 문서 인덱스

### 아키텍처

- `architecture/overview.md`  
  - 시스템 구성도·디렉터리 맵(루브릭 P6용 1페이지 요약)
- `architecture/orchestrator.md`  
  - Orchestrator/상태 흐름/동적 토큰 예산/Dev 종료 QA/재시도/잠금/메타데이터 저장 규칙
- `architecture/team-orchestrator.md`  
  - 팀 오케스트레이션 라운드, 메시지, handoff, 협업 지표, 토큰 예산
- `llm.md`  
  - 모델 구성, Ollama `/api/generate` 로컬 규약, App Router 가드, backoff, timeout, 스트리밍, 파서 안정화

### 실행 기능

- `implementation-history.md`  
  - 누적 구현·개선 작업 요약(게이트, QA, 스택 규칙, UI 정책·import 복구 등) 및 상세 문서 링크
- `features.md`  
  - 완료 수정, QA·Dev 종료 파이프라인·QA URL 추론 경고, UI 스캐폴드·확장 UI 누락 스캐폴드(§11)·별칭, Next 코드 생성 가이드(§11b), 라우트 루트 일관성(§11c), `write_code` RSC/metadata 방어(§11d), 플랜 스킬·`scan_project`(§11e), 리뷰, discuss, enhance-prompt, TTS, 동적 스택 분석, 미설치 패키지 방어(§12), **태스크 미리보기·복구·인수인계·스펙 확장·유사 태스크·칸반 검색(§13)** 등
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
- `local-dev-troubleshooting.md`  
  - Turbopack dev 캐시, Ollama(Qwen thinking·빈 응답), Realtime 부분 페이로드, enhance vs `tasks/similar`, Ollama 성능·`tsc` 점검
- `stack.md`  
  - 기술 스택, 도입 배경, 외부 의존성 요약
- `target-workspace-environment.md`  
  - **대상 앱** 워크스페이스 스택·버전·구조 파악 체크리스트, 자동 프로파일링과 문서화의 역할 분담

### Cursor 프로젝트 스킬 (저장소 루트)

- `.cursor/skills/<이름>/SKILL.md` — Cursor 에이전트용 저장소별 가이드(예: Next App Router import·metadata·Proxy). 상세는 각 파일·[`features.md`](./features.md) §11b와 교차 참조.

## 유지 규칙

- 기능별 내용은 해당 문서에서만 편집하고, `README.md`에는 변경이 잦지 않은 핵심 요약만 유지합니다.
- 새로운 기능이 추가되면 아래 우선순위로 반영합니다.
  1. `features.md` 또는 `api.md`
  2. 동작 주체 문서(`architecture/*`, `agents-skills.md`)
  3. UI 변경 문서(`ui-components.md`)
  4. 루트 `README.md`의 문서 표 링크/요약 갱신
  5. (선택) 교차 참조용 한 페이지 요약은 `implementation-history.md`에 bullet + 링크만 추가
  6. Cursor 전용 안내가 있으면 `.cursor/skills/` 해당 `SKILL.md`와 `features.md`에 한 줄씩 연결
