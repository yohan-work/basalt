---
name: create_workflow
description: Generates a step-by-step workflow based on task analysis.
---

# Create Workflow

This skill generates a concrete execution plan (workflow) based on a task analysis.

## Inputs
-   `taskAnalysis`: The JSON object returned by `analyze_task`.

### 미니멀리즘 워크플로 전략 (Minimalist Workflow Strategy — 필수)
안정적이고 빠른 구현을 위해 다음 전략을 워크플로 설계에 반영한다.

- **라이브러리 설정 단계 지양**: `TanStack Table 설정`이나 `Prisma 스키마 정의`와 같은 단계를 워크플로에 포함하지 않는다.
- **표준 구현 중심**: 대신 `표준 HTML 테이블 구조 설계` 및 `Mock 데이터 정의` 단계를 포함한다.
- **에러 발생 최소화**: 복잡한 의존성 연동보다는 단일 파일 내에서 완결되는 자율적인 컴포넌트 구현 위주로 스텝을 구성한다.

## Instructions
You are a Project Manager.
Create a step-by-step workflow to complete the task.
Use ONLY the available agents and their specific skills.

IMPORTANT:
- Use the exact agent role slugs (e.g. "software-engineer", "product-manager", "qa").
- Every `agent` field MUST be one of the roles listed under **Available Agents and their skills** above. Do not invent new role names.
- MANDATORY: Use the 'codebaseContext' provided above to determine actual file paths and folder structures.
- MANDATORY: In `codebaseContext`, read **`## UI_COMPONENT_POLICY`** first. If it is **ABSENT**, do NOT plan steps that assume `@/components/ui/*` already exists unless an earlier step explicitly creates those files (or note that execute-time auto-scaffold may add minimal button/input/label for React/Next). If **USE_EXISTING**, you may plan imports only for listed components.
- MANDATORY (저장소 전제): `[PROJECT CONTEXT]`의 **VERSION_CONSTRAINTS**, **KEY_DEPENDENCY_VERSIONS**, **MAJOR_SYNTAX_HINTS**(있을 때), **`## EXPORT_STYLE_POLICY`**, **Router Type**, **Router Base**, **INSTALLED PACKAGES**, **`[WARNING] Router root`**, **Route Policy Hint**, **`[STACK_RULES]`** 를 읽는다. UI 정책과 **동일한 우선순위**로 워크플로에 반영한다. 워크플로 단계는 **파싱된 메이저·semver에 맞는 API**만 가정할 것(버전 착오 시 빌드 실패). 신규 라우트 파일 단계는 **`EXPORT_STYLE_POLICY`와 모순되지 않게** 기술할 것.
- UI 페이지·화면이 포함되면 `taskAnalysis.summary`에 적힌 **레이아웃 패턴 ID**(예: `ContainedStack`, `DashboardGrid`, `SidebarContent` 등)를 워크플로 초반 한 단계 설명에 **한국어로 재명시**하고, 이후 `write_code` 단계가 그 구조를 따르도록 구체화한다. `summary`에 패턴이 없으면 플랜 단계에서 먼저 고정할 것을 한 줄로 요구한다.
- 신규 페이지·라우트: **`Router Base` 값 그대로** 하위 경로를 쓴다(예: Router Base가 `src/app`이면 `src/app/<segment>/page.tsx`). App Router는 세그먼트당 **`page.tsx`**(또는 `page.js`); Pages Router는 해당 프로젝트 관례를 따른다. 루트 `app/`만 전제로 단계를 쓰지 말 것.
- Each 'description' MUST be UNIQUE, SPECIFIC and ACTIONABLE for the designated agent.
- EVERY 'description' MUST BE WRITTEN IN KOREAN.
- 모든 단계의 설명(description)은 반드시 한국어로 작성하십시오.

## Schema
```json
{
    "steps": [
        { "agent": "software-engineer", "action": "read_codebase", "description": "Analyzing existing project structure" },
        { "agent": "software-engineer", "action": "write_code", "description": "Implementing the requested feature/page at the appropriate path" },
        { "agent": "main-agent", "action": "verify_final_output", "description": "Verifying implementation against requirements" }
    ]
}
OR
{
    "steps": [
        { "agent": "product-manager", "action": "search_npm_package", "description": "Searching for libraries related to the task" },
        { "agent": "software-engineer", "action": "write_code", "description": "Integrating the new library into the project" }
    ]
}
```
