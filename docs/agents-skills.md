# Agents와 Skills

이 문서는 Basalt의 실행 주체와 실행 단위를 한 번에 정리합니다.

## 에이전트

- `lib/agents/AGENT.md` 기반으로 역할별 에이전트가 정의됩니다.
- 주요 역할: `main-agent`, `software-engineer`, `product-manager`, `qa`, `devops-engineer`, `style-architect`, `technical-writer`, `database-administrator`, `git-manager`
- 각 역할은 태스크 특성에 맞는 스킬 체인을 선택합니다.

## 스킬 시스템

- 스킬은 `lib/skills/SKILL.md` + 각 스킬 폴더의 `SKILL.md`로 정의됩니다.
- 런타임은 `Universal Skill Executor` 형태로, 하드코딩된 TS 호출 대신 프롬프트 기반 동적 실행을 기본으로 합니다.

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
