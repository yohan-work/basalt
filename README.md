# Basalt

Basalt는 짧은 프론트엔드 수정 요청을 AI가 계획하고, 실행을 보조하고, 검증 결과와 후속 정리까지 남기는 작업 관리 프로토타입입니다.

프론트엔드 개발자는 작은 UI 수정 요청 하나를 처리할 때도 요청 해석, 작업 순서 정리, 수정 범위 확인, 결과 검토, 인수인계 정리를 반복합니다. Basalt는 이 반복 비용을 줄이기 위해 `요청 등록 -> 계획 -> 실행 -> 검증 -> 정리` 흐름을 하나의 도구 안에 묶었습니다.

Basalt는 작은 UI 수정 요청이 자주 들어오는 프론트엔드 개발자와 팀을 주요 사용자로 둡니다. 사용자는 프로젝트를 연결하고 태스크를 만든 뒤, AI가 만든 계획과 실행 로그, 검증 결과, 후속 정리 내용을 한 화면 흐름에서 확인할 수 있습니다.

## 해결하려는 문제

짧은 UI 수정 요청도 실제 작업에서는 다음 단계를 동반합니다.

- 모호한 요청을 실제 작업 단위로 해석
- 어떤 순서로 수정할지 계획
- 수정 후 영향 범위와 이상 여부 확인
- 작업 내용을 로그, 리뷰, 인수인계 형태로 정리

각 단계는 작아 보이지만 반복되면 누적 비용이 큽니다. Basalt가 해결하려는 문제는 **프론트엔드 개발자의 반복적인 요청 해석, 실행 조율, 검토 정리 업무를 줄이는 것**입니다.

## 서비스 소개

Basalt의 기본 사용 흐름은 다음과 같습니다.

1. 로컬 프로젝트를 연결합니다.
2. 처리할 태스크를 생성합니다.
3. AI가 태스크를 바탕으로 작업 계획을 만듭니다.
4. 실행 단계에서 코드 수정과 step별 로그 기록이 이어집니다.
5. 검증 결과, 작업 이력, 복구 가이드, 인수인계 요약을 확인합니다.

핵심은 코드 결과만 보여주는 것이 아니라, 요청이 처리되는 과정을 태스크 상태, 실행 로그, 검증 결과, 후속 정리 정보로 남기는 것입니다.

## AI 활용 방식

Basalt에서 AI는 부가 기능이 아니라 핵심 실행 주체입니다. AI가 없다면 Basalt는 단순 칸반 보드에 가깝습니다.

| 단계 | AI 역할 | 결과 |
| --- | --- | --- |
| 계획 | 요청을 분석하고 workflow를 생성 | 실행 가능한 step 목록 |
| 실행 | 프로젝트 문맥을 읽고 코드 수정 보조 | 변경 파일과 실행 로그 |
| 검토 | 결과와 로그를 바탕으로 위험과 개선점 확인 | 리뷰/검증 메타데이터 |
| 정리 | 실패 원인, 복구 방향, 인수인계 문서 생성 | 한국어 Markdown 요약 |

역할별 모델 구성은 아래와 같습니다. 실제 기본값과 운영 규칙은 [docs/llm.md](docs/llm.md)에 정리되어 있습니다.

- `FAST_MODEL`: 빠른 판단, 경량 의사결정, 일부 스킬 인자 생성
- `SMART_MODEL`: 분석, workflow 설계, 검토, 검증, 구조화 응답 생성
- `CODING_MODEL`: 코드 생성, 수정, repair 작업

Basalt는 `analyze_task -> create_workflow -> consult_agents` 흐름으로 필요한 agent와 skill을 고르고, `ProjectProfiler`가 프로젝트 구조, 설치 패키지, 라우터 정보, stack rules를 프롬프트에 주입합니다. 실행 결과는 Supabase의 태스크 메타데이터와 실행 로그에 저장됩니다.

## 차별점

기존 AI 코딩 도구가 “코드를 생성한다”에 초점을 둔다면, Basalt는 “짧은 수정 요청을 끝까지 처리하는 과정”을 제품 단위로 봅니다.

- 태스크 상태를 따라 계획, 실행, 검증, 정리까지 연결합니다.
- 역할별 agent와 skill 조합으로 실행 단계를 나눕니다.
- 결과 코드뿐 아니라 실행 로그, 검증 결과, 작업 이력을 함께 남깁니다.
- 실패와 검증 결과를 다음 수정, 복구 가이드, 인수인계 요약에 연결합니다.

## 현재 구현된 핵심 기능

- 로컬 프로젝트 연결
- 태스크 생성 및 칸반 상태 관리
- AI 기반 계획 생성
- 실행 단계에서 코드 변경과 step별 실행 로그 기록
- `Test` 단계에서 검증 결과, 작업 이력, verification 상태 저장
- `agent-browser` 기반 QA 캡처와 `검수 완료` 탭의 결과 확인
- 복구 가이드, 인수인계 요약 같은 후속 정리 정보 생성

## 사용 흐름

Basalt는 아래 순서로 사용할 수 있습니다.

1. 칸반 보드의 `Request` 컬럼에서 프로젝트를 선택하고 짧은 태스크를 생성합니다.
2. `Plan` 단계로 이동해 작업 계획을 만듭니다.
3. `Dev (Working)` 단계에서 `Execute`를 실행합니다.
4. `Test` 단계와 태스크 상세 화면에서 실행 로그와 검증 결과를 확인합니다.
5. `Task Details`에서 복구 가이드, 인수인계 요약, `검수 완료` 탭의 QA 결과를 확인합니다.

화면에서는 다음 결과를 확인할 수 있습니다.

- 태스크가 `Request -> Plan -> Dev (Working) -> Test`로 이동하는 흐름
- `Task Details`와 `LogViewer`에 남는 실행 로그
- `Test` 단계와 `검수 완료` 탭의 검증 결과, 작업 이력, QA 캡처
- 복구 가이드와 인수인계 요약 생성 결과

## 기술 구조

Basalt는 다음 구조로 동작합니다.

- Next.js App Router: 칸반 UI와 API 라우트를 한 프로젝트 안에서 구성
- Supabase: 프로젝트, 태스크, 실행 로그, 메타데이터 저장
- Ollama 호환 LLM 호출: 계획, 분석, 코드 생성, 검토를 역할별 모델로 분리
- Orchestrator + Agent + Skill 레이어: 태스크를 step 단위로 실행하고 검증/수리 루프 제어

사용자 액션 기준 흐름은 `UI -> API Route -> Orchestrator -> Agent/Skill -> LLM 또는 파일 작업 -> Supabase 로그/메타데이터 -> UI 갱신`입니다. 자세한 구조는 [docs/architecture/overview.md](docs/architecture/overview.md)를 참고하세요.

## 실행 방법

```bash
node -v # 권장: >= 20.9.0
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

실행 전 준비가 필요합니다.

- Supabase 프로젝트 생성 후 `.env.local`에 URL과 anon key 설정
- [supabase/schema.sql](supabase/schema.sql)을 Supabase SQL Editor에서 실행
- Ollama 또는 호환 가능한 모델 엔드포인트 준비
- 연결해서 테스트할 로컬 프론트엔드 프로젝트 준비

자세한 설치와 운영 옵션은 [docs/setup.md](docs/setup.md)를 참고하세요.

## 문서

| 문서 | 내용 |
| --- | --- |
| [docs/README.md](docs/README.md) | 전체 문서 인덱스 |
| [docs/features.md](docs/features.md) | 핵심 기능, 화면 흐름, 확장 기능 |
| [docs/api.md](docs/api.md) | API 엔드포인트와 용도 |
| [docs/llm.md](docs/llm.md) | 사용 모델, 프롬프트, LLM 처리 구조 |
| [docs/setup.md](docs/setup.md) | 설치, 실행, 환경 변수, 운영 가이드 |
| [docs/architecture/overview.md](docs/architecture/overview.md) | 시스템 전체 구조 |
| [supabase/schema.sql](supabase/schema.sql) | 최소 실행에 필요한 Supabase 테이블 스키마 |
