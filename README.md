# Basalt

개발 태스크를 AI 에이전트들이 알아서 처리해주는 자동화 시스템.
칸반 보드에 태스크를 올려두면, 계획 수립부터 코드 작성, 검증, PR 생성까지 한 번에.

---

## 어떻게 돌아가나요?

### 전체 흐름

태스크 하나가 완료되기까지 세 단계를 거칩니다.

**1. Planning** — 뭘 해야 하는지 파악

태스크가 들어오면 Orchestrator가 `analyze_task` 스킬을 호출해서 요구사항을 분석합니다. 어떤 에이전트가 필요한지, 어떤 순서로 작업해야 하는지 workflow를 만들어서 DB에 저장해둡니다.

**2. Execution** — 실제 작업 수행

workflow에 정의된 step들을 순서대로 실행합니다. 각 step마다:
- 담당 에이전트를 로드하고
- LLM에게 "이 스킬에 어떤 인자를 넣어야 해?"라고 물어본 뒤
- 스킬 함수를 실행합니다

예를 들어 "버튼 컴포넌트 만들어줘"라는 태스크면, `write_code` 스킬이 호출되면서 LLM이 파일 경로와 코드 내용을 생성해줍니다.

**3. Verification** — 결과 검증 및 PR 생성

`verify_final_output` 스킬로 결과물을 검증하고, 통과하면 자동으로 Git에 커밋 → 푸시 → PR 생성까지 해줍니다.

---

### Orchestrator

모든 흐름의 중심. `Orchestrator.ts`가 담당합니다.

- 태스크 상태 관리 (pending → planning → working → testing → review → done)
- 워크플로우 실행 (step별로 에이전트와 스킬 매칭)
- 컨텍스트 관리 (이전 step에서 읽은 파일 내용 등을 다음 step에 전달)
- 실패 시 에러 정보 저장 및 실패한 step부터 재시도 지원
- 매 step 완료 시 컨텍스트를 Supabase에 영속화하여 재시도 시 복원

### TeamOrchestrator

멀티 에이전트 팀 협업 모드. `TeamOrchestrator.ts`가 담당합니다.

- 라운드-로빈 방식으로 여러 에이전트가 번갈아가며 작업
- 공유 태스크 보드(칸반)로 작업 분배 및 추적
- 팀 채팅 채널을 통한 에이전트 간 커뮤니케이션
- 에이전트별 독립 컨텍스트 매니저 운영
- 상태를 Supabase에 영속화하여 중단 후 재개 가능
- 액션 기반 통신 (메시지 전송, 태스크 생성/인수/리뷰/제출, 스킬 호출)

### LLM

Ollama 서버와 통신합니다. 두 가지 용도로 씁니다:

1. **인자 생성** — 스킬을 호출할 때 필요한 실제 값들 (파일 경로, 코드 내용 등)을 LLM이 만들어줍니다
2. **코드 생성** — `write_code` 같은 스킬에서 직접 코드를 생성할 때

안정성을 위해 다음 기능이 내장되어 있습니다:
- **Exponential backoff 재시도** (최대 3회, 1s → 2s → 4s)
- **AbortController 기반 타임아웃** (코드 생성 120초, JSON 생성 60초)
- **환경변수 기반 설정** (`OLLAMA_BASE_URL`, 모델 오버라이드)

용도별로 다른 모델을 사용합니다 (`model-config.ts`):

| 용도 | 기본 모델 | 환경변수 오버라이드 |
|------|----------|-------------------|
| 빠른 응답 (FAST) | `llama3.2:latest` | `FAST_MODEL` |
| 분석/추론 (SMART) | `gemma3:latest` | `SMART_MODEL` |
| 코드 생성 (CODING) | `gpt-oss:20b` | `CODING_MODEL` |

### Agents

역할별로 분리된 에이전트들. 각자 전문 분야가 있습니다:

| 에이전트 | 역할 |
|---------|------|
| main-agent | 태스크 분석, 워크플로우 생성 |
| software-engineer | 코드 구현 |
| product-manager | 요구사항 정리 |
| qa | 테스트, 검증 |
| devops-engineer | 환경 설정, 배포 |
| style-architect | 스타일 시스템 |
| technical-writer | 문서화 |
| database-administrator | DB 스키마 설계, SQL 최적화, 마이그레이션 |
| git-manager | 버전 관리, Git 안전성 검사 |

에이전트 정의는 `lib/agents/` 폴더 아래 `AGENT.md` 파일로 관리됩니다.

### Skills

에이전트가 실제로 "할 수 있는 것들"입니다. 재사용 가능한 함수 모듈.

| 스킬 | 하는 일 |
|------|--------|
| `analyze_task` | 태스크 분석, 필요한 에이전트 판단 |
| `create_workflow` | 실행 계획(workflow) 생성 |
| `read_codebase` | 파일 읽기 |
| `write_code` | 파일 생성/수정 |
| `refactor_code` | 코드 리팩토링 |
| `lint_code`, `typecheck` | 코드 품질 검사 |
| `manage_git` | checkout, commit, push, PR 생성 |
| `run_shell_command` | 터미널 명령 실행 |
| `check_environment` | Node 버전 등 환경 체크 |
| `generate_scss` | SCSS 파일 생성 |
| `apply_design_system` | 디자인 토큰 적용 |
| `verify_final_output` | 최종 결과물 검증 |
| `scan_project` | 프로젝트 구조 및 기술 스택 스캔 |
| `extract_patterns` | 기존 코드에서 코딩 패턴 추출 |
| `find_similar_components` | 유사 컴포넌트 검색 |
| `search_npm_package` | NPM 패키지 검색 |
| `analyze_error_logs` | 에러 로그 원인 분석 |
| `check_responsive` | 반응형 레이아웃 검사 |
| `list_directory` | 디렉토리 목록 조회 |

스킬 정의는 `lib/skills/` 폴더 아래 `SKILL.md` 파일로 관리됩니다.

### API 엔드포인트

프론트엔드와 에이전트 시스템을 연결하는 API 라우트들입니다.

| 메서드 | 경로 | 하는 일 |
|--------|------|--------|
| POST | `/api/agent/plan` | 태스크 분석 및 워크플로우 생성 |
| POST | `/api/agent/execute` | 워크플로우 순차 실행 |
| POST | `/api/agent/verify` | 결과 검증 및 Git PR 생성 |
| POST | `/api/agent/retry` | 실패한 태스크 재시도 (실패 step부터 재개) |
| POST | `/api/agent/skills` | 스킬 동적 실행 (`skillName`, `args`) |
| POST | `/api/system/dialog` | macOS 폴더 선택 다이얼로그 |
| POST | `/api/team/execute` | 팀 협업 오케스트레이션 (최대 5분) |

### Components

주요 UI 컴포넌트들입니다.

**메인 컴포넌트:**

| 컴포넌트 | 하는 일 |
|----------|--------|
| `KanbanBoard` | 6개 컬럼(Request, Plan, Dev, Test, Review, Failed) 칸반 보드. Supabase 실시간 구독. 스켈레톤 로딩, 에러 토스트, 빈 상태 표시 |
| `LogViewer` | 실행 로그 실시간 뷰어. 타입별 컬러 구분 (THOUGHT, ACTION, RESULT, ERROR). `taskId` 기반 필터링 지원 |
| `TaskDetailsModal` | 태스크 상세 모달 (Radix Dialog 기반). 워크플로우, 에이전트 상태, 파일 활동, 로그를 한눈에 |
| `CreateTaskModal` | 태스크 생성 폼 (Radix Dialog 기반). 제목, 설명, 우선순위. Cmd+Enter 단축키, 폼 자동 초기화 |
| `ProjectSelector` | 프로젝트 선택/생성. 폴더 브라우저 연동 |
| `WorkflowFlowchart` | React Flow 기반 워크플로우 시각화. 에이전트별 색상, 상태 표시 |
| `AgentStatusDashboard` | 에이전트 실시간 상태 대시보드 (idle/active/completed) |
| `FileActivityTree` | 파일 읽기/쓰기 활동을 트리 구조로 표시. 실시간 업데이트 |
| `StepProgress` | 워크플로우 진행률 표시 (compact/detailed 모드). `ProgressInfo` 타입 공유 |
| `ThemeToggle` | 다크/라이트 모드 전환 토글 버튼 |

**Analytics 컴포넌트:**

| 컴포넌트 | 하는 일 |
|----------|--------|
| `AnalyticsDashboard` | 분석 대시보드. 성공률, 에이전트 통계, 에러 분석 |
| `AgentActivityChart` | Recharts 기반 에이전트 활동 바 차트 |
| `ErrorRankingTable` | 빈도순 에러 랭킹 테이블 |
| `StatCard` | 통계 카드 (아이콘, 값, 트렌드) |
| `TeamActivityView` | 팀 활동 라이브 뷰 (3초 폴링) |
| `ChatChannel` | 팀 에이전트 간 채팅 인터페이스 |

**UI 컴포넌트 (shadcn/ui):**

`components/ui/` 아래 Radix UI 기반 재사용 컴포넌트들: Avatar, Badge, Button, Card, Dialog, Input, Label, ScrollArea, Select, Separator, Skeleton, Table, Tabs

---

## 기술 스택

- **Framework**: Next.js 16 (App Router, React Compiler 활성화)
- **Language**: TypeScript
- **UI**: React 19, Radix UI, dnd-kit (드래그앤드롭)
- **Styling**: Tailwind CSS 4, SASS
- **Charts**: Recharts
- **Flowchart**: @xyflow/react (React Flow)
- **Database**: Supabase
- **LLM**: Ollama (로컬, 환경변수로 설정 가능)
- **Utilities**: gray-matter (마크다운 파싱)
- **Theming**: 다크/라이트 모드 (시스템 감지 + 수동 토글, FOUC 방지)

---

## 설치 및 실행

```bash
# 클론
git clone <repository-url>
cd basalt

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env.local
# .env.local 편집해서 Supabase 정보 입력

# 개발 서버
npm run dev
```

http://localhost:3000 접속

---

## 환경 변수

`.env.local`:

```env
# --- 필수 ---
NEXT_PUBLIC_SUPABASE_URL=<Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>

# --- 선택 (Ollama) ---
OLLAMA_BASE_URL=http://127.0.0.1:11434    # Ollama 서버 주소 (기본값)

# --- 선택 (모델 오버라이드) ---
FAST_MODEL=llama3.2:latest                 # 빠른 응답용
SMART_MODEL=gemma3:latest                  # 분석/추론용
CODING_MODEL=gpt-oss:20b                   # 코드 생성용

# --- 선택 (개발) ---
MOCK_LLM=false                             # true로 설정 시 LLM 모킹
```

---

## 프로젝트 구조

```
basalt/
├── app/                          # Next.js App Router
│   ├── analytics/
│   │   └── page.tsx              # 분석 대시보드 페이지
│   ├── api/
│   │   ├── agent/
│   │   │   ├── execute/route.ts  # 워크플로우 실행
│   │   │   ├── plan/route.ts     # 태스크 분석 및 계획
│   │   │   ├── retry/route.ts    # 실패 재시도
│   │   │   ├── skills/route.ts   # 스킬 동적 실행
│   │   │   └── verify/route.ts   # 결과 검증
│   │   ├── system/
│   │   │   └── dialog/route.ts   # macOS 폴더 선택
│   │   └── team/
│   │       └── execute/route.ts  # 팀 협업 실행
│   ├── error.tsx                 # 페이지 에러 바운더리
│   ├── global-error.tsx          # 앱 전체 에러 바운더리
│   ├── globals.css               # Tailwind CSS 4 테마 (라이트/다크)
│   ├── layout.tsx                # 루트 레이아웃 (메타데이터, 테마 스크립트)
│   ├── loading.tsx               # 메인 페이지 로딩 스켈레톤
│   ├── not-found.tsx             # 404 페이지
│   ├── page.tsx                  # 메인 (칸반 보드 + 로그 뷰어)
│   └── theme-script.tsx          # 다크모드 FOUC 방지 인라인 스크립트
├── components/
│   ├── analytics/
│   │   ├── team/
│   │   │   ├── ChatChannel.tsx       # 팀 채팅
│   │   │   ├── KanbanBoard.tsx       # 팀 태스크 보드
│   │   │   └── TeamActivityView.tsx  # 팀 활동 라이브 뷰
│   │   ├── AgentActivityChart.tsx    # 에이전트 활동 차트
│   │   ├── AnalyticsDashboard.tsx    # 분석 대시보드
│   │   ├── ErrorRankingTable.tsx     # 에러 랭킹
│   │   └── StatCard.tsx              # 통계 카드
│   ├── ui/                    # shadcn/ui 컴포넌트 (13개)
│   ├── AgentStatusDashboard.tsx  # 에이전트 상태 대시보드
│   ├── CreateTaskModal.tsx       # 태스크 생성 모달 (Radix Dialog)
│   ├── FileActivityTree.tsx      # 파일 활동 트리
│   ├── KanbanBoard.tsx           # 메인 칸반 보드
│   ├── LogViewer.tsx             # 실행 로그 뷰어 (task_id 필터링)
│   ├── ProjectSelector.tsx       # 프로젝트 선택/생성
│   ├── StepProgress.tsx          # 워크플로우 진행률
│   ├── TaskDetailsModal.tsx      # 태스크 상세 모달 (Radix Dialog)
│   ├── ThemeToggle.tsx           # 다크/라이트 모드 토글
│   └── WorkflowFlowchart.tsx     # 워크플로우 시각화
├── lib/
│   ├── agents/                # 에이전트 정의 (AGENT.md × 9)
│   │   ├── Orchestrator.ts    # 순차 실행 오케스트레이터
│   │   └── TeamOrchestrator.ts # 팀 협업 오케스트레이터
│   ├── skills/                # 스킬 정의 (SKILL.md × 20)
│   │   └── index.ts           # 스킬 런타임 구현
│   ├── agent-loader.ts        # 에이전트/스킬 로더
│   ├── analytics.ts           # 분석 데이터 조회
│   ├── context-manager.ts     # 실행 컨텍스트 관리 (저장/복원)
│   ├── llm.ts                 # LLM 통신 (재시도, 타임아웃)
│   ├── model-config.ts        # LLM 모델 설정 (환경변수 오버라이드)
│   ├── supabase.ts            # Supabase 클라이언트
│   ├── team-types.ts          # 팀 협업 타입 정의
│   └── utils.ts               # 유틸리티 (cn)
└── scripts/                   # 테스트/유틸리티 스크립트
```

---

## 스크립트

`scripts/` 디렉토리에 테스트 및 유틸리티 스크립트가 있습니다.

| 스크립트 | 하는 일 |
|----------|--------|
| `simulate_team_collab.ts` | 팀 협업 시뮬레이션 (TeamOrchestrator 테스트) |
| `test-intelligence.ts` | 로그인 페이지 생성 테스트 |
| `test-intelligence-signup.ts` | 회원가입 페이지 생성 테스트 |
| `test-loader.ts` | AgentLoader 기능 테스트 |
| `test-orchestrator.ts` | Orchestrator 통합 테스트 (plan → execute → verify) |
| `test-plan-generation.ts` | 워크플로우 생성 테스트 |

---

## 라이선스

Yohan Choi
