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
- SSE(Server-Sent Events) 기반 실시간 진행 스트리밍 (optional `StreamEmitter` 주입)
- 파일 변경 diff 추적 (`write_code` 실행 시 before/after 캡처 → `metadata.fileChanges`)
- **자기 수정 루프(Self-Correction Loop)**: 작업 중 에러 발생 시 `analyze_error_logs`를 호출하여 원인을 파악하고 스스로 수정을 시도
- **상세 PR 설명 자동화**: 변경된 파일의 diff를 분석하여 전문적이고 상세한 PR 본문을 자동 생성
- **지속적 잠금 메커니즘(Persistent Locking)**: DB 레벨의 잠금 장치를 통해 작업의 중복 실행을 방지하고 작업 안정성 확보
- **Human-in-the-Loop (HITL)**: 파일 삭제, 주요 설정 변경 등 파괴적인 액션이 감지될 경우, 작업을 일시 정지하고 사용자의 승인(Approve) 또는 반려(Reject)를 대기하여 안전을 보장

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
- **SSE 스트리밍 모드** — `stream: true`로 Ollama API 호출 시 토큰 단위 실시간 전송 지원 (`generateCodeStream`, `generateJSONStream`)
- **지능형 워크플로우 최적화**: 특정 예시(로그인 페이지 등)에 고착되지 않도록 가이드라인을 추상화하여 사용자 의도 정확도 향상
- **App Router & SEO 준수**: Client Component 충돌 방지 및 `<title>`, `<meta>` 등 SEO 필수 요소 자동 포함. 특히 `useState`, `useEffect` 등의 훅 사용 시 `"use client"` 지시어를 100% 강제 삽입하도록 프롬프트가 대폭 강화되었습니다.
- **안정적 JSON 파싱 메커니즘**: 모델의 스트리밍이 불완전하게 끊기거나(빈 `}` 부족 등) 잘못된 포맷이 들어와도 서버 크래시(`SyntaxError`)를 내지 않도록 안전한 파싱 보호막(`try-catch`)이 적용되어 있습니다.
- **프로파일러 연동**: 프로젝트 구조 및 Barrel import 지원 여부를 감지하여 존재하지 않는 경로 임포트(할루시네이션) 방지
- **지능적 컨텍스트 라우팅**: 스킬의 난이도에 따라 FAST(단순 경로/인자) 또는 SMART(추론/분석) 모델을 동적으로 선택하여 속도와 정확도 최적화

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

에이전트가 실제로 "할 수 있는 것들"입니다. 재사용 가능한 기능 모듈.
**마크다운(SKILL.md) 기반의 동적 스킬 시스템**으로 아키텍처.
- **점진적 로딩 (Progressive Disclosure)**: 시스템 부팅 시 스킬 문서의 YAML 메타데이터만 가볍게 파싱하여(Level 1), 수백 개의 커뮤니티 스킬이 등록되어도 컨텍스트 윈도우 폭발이나 토큰 누수가 발생하지 않습니다.
- **범용 스킬 실행기 (Universal Skill Executor)**: 하드코딩된 TypeScript 함수 없이도, 에이전트가 스킬을 호출하면 런타임에 프롬프트를 동적으로 조립하여 실행합니다. 이를 통해 외부 생태계의 스킬을 드롭인(Drop-in) 방식으로 즉시 연동할 수 있습니다.

| 스킬 | 하는 일 |
|------|--------|
| `analyze_task` | 태스크 분석, 필요한 에이전트 판단 |
| `create_workflow` | 실행 계획(workflow) 생성 |
| `read_codebase` | 파일 읽기 |
| `write_code` | 파일 생성/수정 |
| `refactor_code` | 코드 리팩토링 |
| `lint_code`, `typecheck` | 코드 품질 검사 |
| `deep_code_review` | 코드 성능, 보안, 유지보수성 측면의 심층 분석 (커뮤니티 스킬 연동 예시) |
| `manage_git` | checkout, commit, push, PR 자동 생성 (변경점 없을 시 빈 커밋 허용, Bash 이스케이프 및 `gh` CLI 미설치 대응 안전성 보완) |
| `run_shell_command` | 터미널 명령 실행 (`emitter` safe 호출 지원) |
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
| `consult_agents` | 에이전트 간 브레인스토밍 논의 생성 (Boardroom AI 연동) |

스킬 정의는 `lib/skills/` 폴더 아래 `SKILL.md` 파일로 관리됩니다.

### API 엔드포인트

프론트엔드와 에이전트 시스템을 연결하는 API 라우트들입니다.

| 메서드 | 경로 | 하는 일 |
|--------|------|--------|
| POST | `/api/agent/plan` | 태스크 분석 및 워크플로우 생성 |
| POST | `/api/agent/execute` | 워크플로우 순차 실행 |
| POST | `/api/agent/verify` | 결과 검증 및 Git PR 생성 |
| POST | `/api/agent/retry` | 실패한 태스크 재시도 (실패 step부터 재개) |
| POST | `/api/agent/skills` | 스킬 동적 실행 (`skillName`, `args`, 선택 `projectPath`) |
| GET | `/api/agent/stream` | SSE 실시간 진행 스트리밍 (`taskId`, `action` 쿼리 파라미터) |
| POST | `/api/agent/edit-completed` | 완료/검토/테스트 단계 태스크의 코드에 사용자 지시사항 적용 (`taskId`, `instructions`) |
| POST | `/api/agent/modify-element` | 완료 결과물의 특정 요소만 수정 (`taskId`, `filePath`, `elementDescriptor`, `request`) |
| POST | `/api/agent/review` | 태스크 결과물 코드 검토 실행, 결과를 `metadata.reviewResult`에 저장 |
| GET | `/api/project/components` | 프로젝트(및 선택 시 특정 태스크)의 컴포넌트 목록 (`projectId`, 선택 `taskId`) |
| POST | `/api/system/dialog` | macOS 폴더 선택 다이얼로그 |
| POST | `/api/tts` | 텍스트를 음성으로 변환 (edge-tts-universal). `{ text, voice, rate?, pitch? }` → `audio/mpeg` 스트림 반환 |
| POST | `/api/team/execute` | 팀 협업 오케스트레이션 (최대 5분) |

### 추가 기능 구현 내역

**1. 완료된 코드 수정**  
status가 `testing`, `review`, `done`인 태스크의 결과물(`metadata.fileChanges`)에 사용자 지시사항을 반영합니다. TaskDetailsModal에서 "코드 수정 요청" → 지시사항 입력 → `POST /api/agent/edit-completed`. 변경분은 `metadata.fileChanges`에 `agent: 'user-edit'`로 append됩니다. 동시 수정 방지를 위해 `metadata.editInProgress` 락을 사용합니다.

**2. 특정 요소 수정 요청**  
완료 결과물에서 "타이틀", "HeroSection" 등 특정 요소만 지정해 수정합니다. TaskDetailsModal → Changes 탭에서 파일 선택, 요소 설명, 수정 요청 입력 후 "이 요소 수정 요청" → `POST /api/agent/modify-element`. 변경분은 `metadata.fileChanges`에 `agent: 'user-edit-element'`로 append됩니다. 락: `metadata.modifyElementInProgress`.

**3. 태스크 생성 시 컴포넌트 import**  
새 태스크(특히 페이지 생성)에서 기존 컴포넌트를 지정해 에이전트가 해당 파일을 import해 사용하도록 유도합니다. CreateTaskModal에서 프로젝트 선택 시 "사용할 컴포넌트" 체크 → 생성 시 `metadata.attachedComponentPaths`와 설명 문구가 전달됩니다. Orchestrator 실행 초반에 해당 경로들을 `read_codebase`로 읽어 context에 주입합니다. 컴포넌트 목록은 `GET /api/project/components?projectId=...`로 조회합니다.

**4. 코드 검토**  
TaskDetailsModal "코드 검토 실행" → `POST /api/agent/review` → `deep_code_review` 스킬로 태스크의 fileChanges(또는 프로젝트 코드)를 검토 → 결과를 `metadata.reviewResult`, `metadata.reviewAt`에 저장하고 Details 탭 "코드 검토 결과"에 표시합니다.

**5. react-grab 연동 (요소 선택 → AI 수정)**  
- **클립보드 붙여넣기**: 미리보기(에이전트가 만든 앱)에서 [react-grab](https://github.com/aidenybai/react-grab)으로 요소 선택 후 Cmd+C(또는 Ctrl+C)로 복사 → Basalt TaskDetailsModal Changes 탭에서 "요소 컨텍스트 붙여넣기"로 파일/요소 설명을 채운 뒤 수정 요청 입력 후 "이 요소 수정 요청"으로 전송.
- **미리보기에서 바로 보내기**: Basalt에서 "미리보기에서 요소 선택"으로 프로젝트 미리보기를 새 창에 연 뒤, **해당 프로젝트**에 react-grab + Basalt용 플러그인을 넣으면, 요소 선택 후 컨텍스트 메뉴 "Basalt로 보내기"로 Basalt 쪽 수정 폼에 자동 반영됩니다. 플러그인 코드는 [docs/react-grab-basalt-plugin.md](docs/react-grab-basalt-plugin.md) 참고.

**6. 에이전트 음성 대화 (TTS)**  
에이전트들의 브레인스토밍 및 팀 채팅 대화를 텍스트뿐 아니라 음성(TTS)으로도 들을 수 있습니다. `edge-tts-universal`(Microsoft Neural TTS)을 주력으로, Web Speech API를 폴백으로 사용하는 이중 구조입니다.
- **에이전트별 고유 음성**: 각 에이전트 역할에 서로 다른 한국어 Neural 음성이 할당됩니다 (`lib/tts/voice-map.ts`). PM은 `ko-KR-SunHiNeural`(여성), Lead는 `ko-KR-HyunsuMultilingualNeural`(남성), Dev는 `ko-KR-InJoonNeural`(남성) 등.
- **자동 재생**: Virtual Office(AgentDiscussion)와 Team Chat(ChatChannel)에서 새 메시지가 도착하면 해당 에이전트의 음성으로 자동 재생됩니다.
- **FIFO 큐 기반 순차 재생**: 여러 메시지가 동시에 도착해도 순서대로 재생되어 겹치지 않습니다.
- **TTS 토글**: 헤더의 TTS 버튼으로 켜기/끄기. 상태는 `localStorage`에 저장되어 새로고침 후에도 유지됩니다.
- **개별 메시지 재생**: 각 메시지 버블에 호버 시 재생 버튼이 나타나 원하는 메시지를 재청취할 수 있습니다.
- **시각 피드백**: 현재 발화 중인 메시지에 사운드 웨이브 애니메이션이 표시됩니다.
- **자동 폴백**: edge-tts API 실패 시 브라우저 내장 Web Speech API로 자동 전환됩니다.
- **서버 사이드 TTS**: `POST /api/tts` 엔드포인트에서 `edge-tts-universal`로 오디오를 생성하여 MP3 스트림으로 반환합니다. API 키 불필요, 완전 무료.

**Tasks.metadata 추가 필드**: `attachedComponentPaths`(string[]), `editInProgress`/`modifyElementInProgress`(락 플래그), `reviewResult`/`reviewAt`(코드 검토 결과).

### Components

주요 UI 컴포넌트들입니다.

**메인 컴포넌트:**

| 컴포넌트 | 하는 일 |
|----------|--------|
| `KanbanBoard` | 6개 컬럼(Request, Plan, Dev, Test, Review, Failed) 칸반 보드. Supabase 실시간 구독. SSE 기반 액션 스트리밍. 스켈레톤 로딩, 에러 토스트, 빈 상태 표시 |
| `LogViewer` | 실행 로그 실시간 뷰어. 타입별 컬러 구분 (THOUGHT, ACTION, RESULT, ERROR). `taskId` 기반 필터링 및 ID 기반 중복 제거 지원 |
| `AgentDiscussion` | **Basalt Virtual Office**. 플로팅 카드 형태의 룸들과 점선 그리드 배경을 가진 2.5D 탑다운 가상 오피스. 에이전트들이 작업 상태에 따라 Boardroom, Patio, Engineering Hub 등으로 이동하며, 대기 중일 때는 자연스러운 배회(Wandering) 및 각자의 위치에서 배경 업무(Working Animation)를 수행합니다. 브레인스토밍 전 과정(시작/수립 결론 포함)을 누락 없이 실시간 스트리밍합니다. **TTS 토글**로 에이전트별 고유 음성 자동 재생, 메시지별 개별 재생 버튼, 발화 중 사운드 웨이브 시각 효과 지원 |
| `OfficeLayout` | 점선 그리드(Dotted Grid) 배경 위에 각 공간(Boardroom, Patio, Hub)을 분리된 플로팅 카드로 세련되게 구현한 확장 가능한 오피스 레이아웃 |
| `AgentAvatar` | 탑다운 시점에서 레고(Lego) 캐릭터 형태로 디자인된 전신 아바타. `framer-motion`을 통해 이동, 발화, 생각(Thought), 배경 업무(Working), 그리고 시선(Gaze) 애니메이션을 역동적으로 처리하는 심리스한 컴포넌트 |
| `TaskDetailsModal` | 태스크 상세 모달. Details, Changes, Brainstorm, Live Logs 4개 탭 통합. 85vh 고정 높이 레이아웃. testing/review/done 시 **코드 수정 요청**, **특정 요소 수정 요청**(Changes 탭), **코드 검토 실행** 및 검토 결과 표시 |
| `CreateTaskModal` | 태스크 생성 폼 (Radix Dialog 기반). 8종 템플릿 선택 지원. 제목, 설명, 우선순위. 프로젝트 선택 시 **사용할 컴포넌트 선택**(`components/` 목록, 생성 시 `metadata.attachedComponentPaths` 반영). Cmd+Enter 단축키, 폼 자동 초기화 |
| `CodeDiffViewer` | 파일 변경 diff 뷰어. 사이드바 파일 목록 + split/unified diff. 신규/수정 파일 구분. 다크모드 지원 |
| `LiveProgressPanel` | SSE 기반 실시간 진행 패널. 프로그레스 바, ETA 카운트다운, LLM 토큰 스트리밍, 완료 step 타이밍 |
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
| `AgentActionRadarChart` | 에이전트들의 액션 분포 및 전문성 영역(Topology)을 보여주는 방사형 차트 |
| `ErrorRankingTable` | 빈도순 에러 랭킹 테이블 |
| `StatCard` | 통계 카드 (아이콘, 값, 트렌드). API 토큰 사용량 기반 **Cost Saved (비용 절감액)** 추정 기능 지원 |
| `TeamActivityView` | 팀 활동 라이브 뷰 (3초 폴링) |
| `ChatChannel` | 팀 에이전트 간 채팅 인터페이스. TTS 토글, 메시지별 음성 재생 버튼, 새 메시지 자동 TTS 재생, 사운드 웨이브 표시 |

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
- **TTS**: edge-tts-universal (Microsoft Neural TTS, 한국어 지원, API 키 불필요) + Web Speech API (폴백)
- **Diff Viewer**: react-diff-viewer-continued
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

### 프로젝트 구조 및 주요 파일 분석

```
basalt/
├── app/                          # Next.js App Router 기반의 웹 프론트엔드 및 API
│   ├── analytics/                # 분석 대시보드 페이지 (에이전트 통계, 에러 랭킹 등)
│   ├── api/                      # 서버측 API 엔드포인트
│   │   ├── agent/                # 에이전트 제어 (plan, execute, verify, retry, skills, stream, edit-completed, modify-element, review)
│   │   ├── project/              # 프로젝트 연동 (components)
│   │   ├── system/               # 시스템 유틸리티 (macOS 다이얼로그 등)
│   │   ├── team/                 # 팀 협업 오케스트레이션 API
│   │   └── tts/                  # TTS 음성 생성 API (edge-tts-universal → MP3 스트림)
│   ├── globals.css               # Tailwind CSS 4 기반의 스타일 시스템 (다크모드 지원)
│   ├── layout.tsx                # 루트 레이아웃 및 테마 관리
│   └── page.tsx                  # 메인 대시보드 (칸반 보드 및 로그 뷰어 통합)
├── components/                   # React UI 컴포넌트
│   ├── analytics/                # 통계 및 분석용 시각화 컴포넌트
│   │   ├── team/                 # 팀 활동 라이브 뷰 및 채팅 인터페이스
│   │   └── AgentActivityChart.tsx # Recharts 기반 에이전트 활동 차트
│   ├── ui/                       # shadcn/ui 기반 원자적 컴포넌트 (버튼, 카드, 다이얼로그 등)
│   ├── AgentStatusDashboard.tsx  # 에이전트별 실시간 상태(IDLE, ACTIVE, DONE) 시각화
│   ├── CodeDiffViewer.tsx        # 파일 변경 사항을 보여주는 고해상도 Diff 뷰어
│   ├── CreateTaskModal.tsx       # 태스크 생성, 8종 템플릿, 컴포넌트 선택 지원 모달
│   ├── FileActivityTree.tsx      # 에이전트의 파일 접근/수정 내역을 트리 구조로 표현
│   ├── KanbanBoard.tsx           # 프로젝트의 핵심 인터페이스. Supabase 실시간 연동
│   ├── LiveProgressPanel.tsx     # SSE 기반 실시간 진행률 및 LLM 토큰 스트리밍 패널
│   ├── LogViewer.tsx             # 에이전트의 사고(Thought)와 실행(Action) 로그 뷰어
│   ├── StepProgress.tsx          # 워크플로우 단계별 상세 진행 상태 표시
│   ├── TaskDetailsModal.tsx      # 태스크의 모든 정보(분석, 계획, 로그, 변경사항) 통합 뷰어
│   └── WorkflowFlowchart.tsx     # React Flow를 이용한 워크플로우 시각화
├── lib/                          # 핵심 비즈니스 로직 및 에이전트 엔진
│   ├── agents/                   # 에이전트 정의 및 오케스트레이터
│   │   ├── Orchestrator.ts       # 단일 태스크의 생명주기 관리 (Plan -> Exec -> Verify)
│   │   └── TeamOrchestrator.ts   # 멀티 에이전트 협업 및 라운드-로빈 실행 엔진
│   ├── skills/                   # 에이전트가 실행하는 실무 기능 (Git, 코드 생성, 분석 등)
│   │   └── index.ts              # 20여 종의 핵심 스킬 런타임 구현부
│   ├── tts/                      # TTS 모듈
│   │   ├── voice-map.ts          # 에이전트 역할별 음성 매핑 (ko-KR Neural Voices)
│   │   └── useTTS.ts             # React Hook: 큐 기반 순차 재생, 폴백, 볼륨/속도 제어
│   ├── agent-loader.ts           # 마크다운 기반의 에이전트/스킬 설정 동적 로더
│   ├── analytics.ts              # Supabase 연동 분석 데이터 집계 로직
│   ├── context-manager.ts        # LLM을 위한 지능적 컨텍스트 최적화 및 저장/복원
│   ├── extractor.ts              # LLM 응답에서 코드와 메타데이터를 추출하는 정규식 엔진
│   ├── llm.ts                    # Ollama 연동 및 재시도, 스트리밍, 타임아웃 처리
│   ├── profiler.ts               # 프로젝트 구조 및 스택 자동 분석 (할루시네이션 방지)
│   ├── stream-emitter.ts         # SSE 이벤트 생성 및 ETA 예측 엔진
│   └── supabase.ts               # Supabase 클라이언트 설정 및 실시간 구독 관리
└── scripts/                      # 테스트 자동화 및 시뮬레이션 스크립트
```

### 상세 기능 분석

#### 1. 에이전트 오케스트레이션 (`lib/agents`)
- **자동화된 워크플로우**: `Orchestrator`가 `main-agent`를 통해 요구사항을 분석하고 최적의 실행 계획을 수립합니다.
- **상태 영속성**: 모든 작업 단계는 Supabase에 저장되어, 예기치 못한 중단 시에도 `context-manager`를 통해 마지막 작업 지점부터 재개(`retry`)할 수 있습니다.
- **멀티 에이전트 팀 협업**: `TeamOrchestrator`는 여러 전문 에이전트가 채팅과 공유 보드를 통해 협업하는 환경을 제공합니다.

#### 2. 지능적 컨텍스트 처리 (`lib/context-manager.ts`, `lib/profiler.ts`)
- **컨텍스트 최적화**: LLM의 토큰 제한 내에서 가장 관련성 높은 파일 내용과 실행 이력을 우선적으로 포함하도록 동적으로 구성합니다.
- **프로젝트 분석**: `Profiler`가 실제 프로젝트의 `package.json`, 컴포넌트 구조, 스타일 시스템을 스캔하여 LLM에게 사실 기반의 정보를 제공, 정확한 코드 생성을 유도합니다.

#### 3. 실시간 인터페이스 및 모니터링 (`components/`)
- **실시간 스트리밍**: SSE(Server-Sent Events)를 통해 에이전트의 사고 과정과 작업 진행률을 지연 없이 사용자에게 전달합니다.
- **Virtual Office (Brainstorming)**: 에이전트들이 작업 전 논의하는 과정을 2.5D 가상 오피스로 시각화합니다. 레고 형태의 전신 아바타들이 실제 좌표를 따라 걸어 다니며 상호작용합니다. 최근 업데이트를 통해 대기 중 **무작위 배회(Idle Wandering)**, 발화자 쪽으로의 **시선 향함(Dynamic Gaze)**, 유휴 시간 중의 **배경 업무 타이핑(Work Animation)**, 참가자 간의 연결을 나타내는 **데이터 플로우(Data Flow Lines)** 가 추가되어 한층 더 살아 숨 쉬는 협업 씬을 연출합니다. 우측 하단 포탈 기반의 Floating Live Discussion 챗 패널을 통해 쾌적한 논의 맥락(Drip Feed) 파악이 가능합니다.
- **코드 변경 추적**: `write_code` 스킬 실행 시 변경 전/후를 캡처하여 `CodeDiffViewer`를 통해 시각화된 diff를 제공합니다.
- **고해상도 레이아웃**: 모든 상세 뷰는 85vh 고정 높이와 최적화된 스크롤 시스템을 갖추어, 대량의 로그나 코드 변경 사항도 끊김 없이 확인할 수 있습니다.
- **시각적 워크플로우**: `WorkflowFlowchart`를 통해 에이전트 간의 작업 흐름을 한눈에 파악할 수 있습니다.

#### 4. 에이전트 음성 대화 TTS (`lib/tts/`, `app/api/tts/`)
- **이중 TTS 아키텍처**: 서버 사이드 `edge-tts-universal`(Microsoft Neural TTS)을 주력으로, 클라이언트 Web Speech API를 폴백으로 사용합니다. API 키 없이 완전 무료로 고품질 한국어 음성을 생성합니다.
- **에이전트별 고유 음성**: `voice-map.ts`에서 9개 에이전트 역할에 각각 다른 한국어 Neural 음성(SunHi, Hyunsu, InJoon)을 할당하고, rate/pitch 조정으로 개성을 부여합니다.
- **`useTTS` React Hook**: FIFO 큐 기반 순차 재생, `AbortController` 기반 중지, localStorage 상태 영속화, 볼륨/재생속도 제어, `isSpeaking`/`speakingAgent` 상태 노출 등 통합적인 TTS 제어를 제공합니다.
- **실시간 시각 피드백**: 현재 TTS로 발화 중인 메시지에 사운드 웨이브 애니메이션이 표시되어, 어떤 에이전트가 말하고 있는지 직관적으로 확인할 수 있습니다.

#### 5. 강력한 에이전트 스킬셋 (`lib/skills/`)
- **Git 자동화**: 커밋 메시지 생성부터 브랜치 생성, 푸시, PR 생성까지 Git 전체 과정을 자동 처리합니다.
- **코드 품질 관리**: `lint_code`, `typecheck` 스킬을 통해 생성된 코드의 기초적인 오류를 자동으로 검증합니다.
- **프로젝트 스캔**: 기존 코드 패턴을 추출(`extract_patterns`)하고 유사 컴포넌트를 검색(`find_similar_components`)하여 일관성 있는 코드를 작성합니다.


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
