---
name: create_workflow
description: Generates a step-by-step workflow based on task analysis.
---

# Create Workflow

This skill generates a concrete execution plan (workflow) based on a task analysis.

## Inputs
-   `taskAnalysis`: The JSON object returned by `analyze_task`.

## Instructions
You are a Project Manager.
Create a step-by-step workflow to complete the task.
Use ONLY the available agents and their specific skills.

IMPORTANT:
- Use the exact agent role slugs (e.g. "software-engineer", "product-manager", "qa").
- Every `agent` field MUST be one of the roles listed under **Available Agents and their skills** above. Do not invent new role names.
- MANDATORY: Use the 'codebaseContext' provided above to determine actual file paths and folder structures.
- MANDATORY: In `codebaseContext`, read **`## UI_COMPONENT_POLICY`** first. If it is **ABSENT**, do NOT plan steps that assume `@/components/ui/*` already exists unless an earlier step explicitly creates those files (or note that execute-time auto-scaffold may add minimal button/input/label for React/Next). If **USE_EXISTING**, you may plan imports only for listed components.
- MANDATORY (저장소 전제): `[PROJECT CONTEXT]`의 **Router Type**, **Router Base**, **INSTALLED PACKAGES**, **`[WARNING] Router root`**, **Route Policy Hint**, **`[STACK_RULES]`** 를 읽는다. UI 정책과 **동일한 우선순위**로 워크플로에 반영한다.
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
