# Agents와 Skills

태그: `#agent` `#skill` `#workflow` `#loader`

이 문서는 Basalt의 실행 주체와 실행 단위를 한 번에 정리합니다.

## 공통 계약

### 목표
- 태스크 특성에 맞는 에이전트-스킬 조합으로 예측 가능한 실행 경로를 보장

### 입력
- 태스크 상태, workflow step, 프로젝트 컨텍스트

### 제약
- 에이전트 역할 경계 침범 금지
- 위험 동작은 HITL 또는 승인 단계로 분기

### 출력
- step 실행 결과(성공/실패), 필요시 경고 및 후속 제안

### 성공기준
- 요청된 단계가 계약된 스킬로 수행되고 결과 메타가 적재됨

## 에이전트

- `lib/agents/<role>/AGENT.md` 기반으로 역할별 에이전트가 정의됩니다.
- 주요 역할: `main-agent`, `software-engineer`, `product-manager`, `qa`, `devops-engineer`, `style-architect`, `technical-writer`, `database-administrator`, `git-manager`
- 각 역할은 태스크 특성에 맞는 스킬 체인을 선택합니다.

### analyze_task → create_workflow → consult_agents 흐름

- `analyze_task`는 디스크의 전체 에이전트 목록을 보고 `required_agents`를 고릅니다. 동일 요청 텍스트에 대해 `lib/agent-roster-heuristics.ts`가 키워드로 `required_agents`를 보강할 수 있습니다.
- `create_workflow`는 분석에 나온 역할 위주로 `Available Agents` 블록을 구성합니다.
- `consult_agents`는 `required_agents`·요약/목표 텍스트 키워드·(복잡도 high 시) QA·코어 4역할을 우선순위로 합친 뒤, `CONSULT_MAX_PARTICIPANTS`(기본 8, 최대 16)로 잘라 참가자 목록을 만듭니다. 구현: `lib/agent-roster-heuristics.ts`, 호출부 `lib/skills/consult_agents/execute.ts`.

### 신규 에이전트 추가 체크리스트

1. `lib/agents/<role-slug>/AGENT.md` 추가(frontmatter + `## Available Skills`).
2. 스킬 이름이 실제 `lib/skills/<name>/`와 일치하는지 확인.
3. 토론/분석에 키워드로 끌어올지 결정 → 필요 시 `lib/agent-roster-heuristics.ts`의 `ROLE_KEYWORD_HINTS` 또는 `resolveTargetedConsultRole` 갱신.
4. `lib/skills/analyze_task/SKILL.md` 치트시트에 역할 한 줄 설명 추가 검토.
5. 이 문서의 역할 목록(위 bullet) 업데이트.
6. 템플릿은 `docs/templates/new-agent-AGENT.md` 참고.

## 스킬 시스템

- 스킬은 `lib/skills/SKILL.md` + 각 스킬 폴더의 `SKILL.md`로 정의됩니다.
- 런타임은 `Universal Skill Executor` 형태로, 하드코딩된 TS 호출 대신 프롬프트 기반 동적 실행을 기본으로 합니다.
- 코드 작성 시 `ProjectProfiler`를 통해 라우터/스타일/컴포넌트 컨텍스트를 반영하고, 신규 페이지 생성은 기본적으로 루트 페이지가 아닌 비루트 라우트 경로를 선택합니다.
- `write_code`는 사전 검증으로 존재하지 않는 import 경로(`@/components/ui/*`, 배럴 `@/components/ui`는 `index.(ts|tsx|…)` 필수, 상대/별칭 경로) 및 **미설치 npm 패키지**를 감지해 실패를 발생시켜 재시도/보정 루프를 유도합니다. `tsconfig.json`·`jsconfig.json`·`tsconfig.app.json` 등의 `paths`를 병합해 별칭을 해석하고, `components/ui` vs `src/components/ui` 폴백을 시도합니다. UI 전용 실패는 `importValidation.codes`(`UI_IMPORT_NOT_ON_DISK`, `UI_BARREL_INVALID`)로 분류되며, 오케스트레이터는 한 번에 생성된 파일 목록을 **`components/ui/` 우선**으로 정렬한 뒤, 필요 시 화이트리스트 기반 **UI import repair** LLM 호출 후 같은 파일에 대해 `write_code`를 재시도합니다(미설치 npm 오류와는 별도 처리).
- 안정화 정책은 아래 5개 축으로 운영됩니다.
  1. `라우팅 정책`: 요청이 신규 기능 페이지일 때 `app/page.tsx`, `pages/index.tsx` 같은 루트 덮어쓰기를 기본 금지하고, 적합한 비루트 경로로 재매핑.
  2. `RSC 경계 준수`: React Hook(`useState`, `useEffect`) 사용 시 클라이언트 컴포넌트 경계(`"use client"`)를 강제하고, 경로 기반 라우터 규칙과 연계해 서버 컴포넌트 오염을 방지.
  3. `임포트 존재성`: `@/`, 상대/별칭 경로 및 `@/components/ui`(배럴은 `index` 필요)·`@/components/ui/*` 임포트가 실제 파일 존재성 검사에 통과하지 않으면 쓰기를 실패 처리.
  4. `외부 패키지 검증`: npm 패키지 import가 `package.json`의 `dependencies`/`devDependencies`에 실제 존재하는지 검증. 미설치 패키지(`axios`, `lodash` 등) import 시 파일 쓰기를 거부하여 `Module not found` 빌드 에러를 사전 차단. Node.js 빌트인 모듈은 허용 리스트로 제외.
  5. `실패 기록/복구`: 실행 중 `write_code` 실패는 즉시 메타데이터 `executionRepairs`에 기록하고, 경로 정규화/검증 실패를 다음 스텝에서 보정 대상화.

### 적용 파일(반영 위치)
- `lib/profiler.ts`: 라우터/스타일/컴포넌트 컨텍스트 강화
- `lib/llm.ts`: 경로 규칙·UI 컴포넌트 규칙·프롬프트 하드닝
- `lib/agents/Orchestrator.ts`: write_code 사전 경로 정규화 및 실패 전파
- `lib/skills/index.ts`: import 존재성 AST 검증

### 핵심 스킬

- 분석/기획: `analyze_task`, `create_workflow`
- 코드: `read_codebase`, `write_code`, `refactor_code`
- 품질/검증: `lint_code`, `typecheck`, `verify_final_output`
- 협업/의사결정: `consult_agents`, `analyze_error_logs`
- 운영/도구: `run_shell_command`, `manage_git`, `scan_project`, `find_similar_components`, `check_responsive`

## 점진적 로딩

- 부팅 시 `agent-loader`가 메타데이터(YAML)만 선행 로드
- 대량의 SKILL 등록 시에도 토큰 과소비를 낮추기 위한 분기 전략 적용

## 실제 연동 포인트

- 에이전트 오케스트레이션: `app/api/agent/plan`, `app/api/agent/execute`
- 스킬 실행: `app/api/agent/skills`
- 동적 API/행동 추가 시: `lib/agent-loader.ts`, `app/api/agent/execute/route.ts`

## 계약 문서

- 에이전트/스킬 계약 상세: `docs/prompting/agent-skill-contracts.md`
