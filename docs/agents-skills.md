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

- `lib/agents/AGENT.md` 기반으로 역할별 에이전트가 정의됩니다.
- 주요 역할: `main-agent`, `software-engineer`, `product-manager`, `qa`, `devops-engineer`, `style-architect`, `technical-writer`, `database-administrator`, `git-manager`
- 각 역할은 태스크 특성에 맞는 스킬 체인을 선택합니다.

## 스킬 시스템

- 스킬은 `lib/skills/SKILL.md` + 각 스킬 폴더의 `SKILL.md`로 정의됩니다.
- 런타임은 `Universal Skill Executor` 형태로, 하드코딩된 TS 호출 대신 프롬프트 기반 동적 실행을 기본으로 합니다.
- 코드 작성 시 `ProjectProfiler`를 통해 라우터/스타일/컴포넌트 컨텍스트를 반영하고, 신규 페이지 생성은 기본적으로 루트 페이지가 아닌 비루트 라우트 경로를 선택합니다.
- `write_code`는 사전 검증으로 존재하지 않는 import 경로(`@/components/ui/*`, 상대/별칭 경로)를 감지해 실패를 발생시켜 재시도/보정 루프를 유도합니다.

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
