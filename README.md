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
- 실패 시 에러 정보 저장 및 재시도 지원

### LLM

로컬 Ollama 서버(`127.0.0.1:11434`)와 통신합니다. 두 가지 용도로 씁니다:

1. **인자 생성** — 스킬을 호출할 때 필요한 실제 값들 (파일 경로, 코드 내용 등)을 LLM이 만들어줍니다
2. **코드 생성** — `write_code` 같은 스킬에서 직접 코드를 생성할 때

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

스킬 정의는 `lib/skills/` 폴더 아래 `SKILL.md` 파일로 관리됩니다.

---

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: React 19, Radix UI, dnd-kit (드래그앤드롭)
- **Styling**: Tailwind CSS 4, SASS
- **Database**: Supabase
- **LLM**: Ollama (로컬)

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
NEXT_PUBLIC_SUPABASE_URL=<Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
```

---

## 프로젝트 구조

```
basalt/
├── app/                    # Next.js App Router
│   ├── api/agent/         # 에이전트 API
│   └── page.tsx           # 메인 (칸반 보드)
├── components/
│   ├── KanbanBoard.tsx    # 칸반 보드
│   ├── TaskDetailsModal.tsx
│   └── LogViewer.tsx
├── lib/
│   ├── agents/            # 에이전트 정의 (AGENT.md)
│   │   └── Orchestrator.ts
│   ├── skills/            # 스킬 모듈 (SKILL.md)
│   ├── llm.ts             # Ollama 통신
│   ├── agent-loader.ts    # 에이전트 로더
│   └── context-manager.ts # 실행 컨텍스트 관리
└── scripts/
```

---

## 라이선스

Yohan Choi
