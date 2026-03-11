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
- MANDATORY: Use the 'codebaseContext' provided above to determine actual file paths and folder structures.
- For new pages, check if the project uses 'app/' (App Router) or 'pages/' (Page Router) and follow that pattern.
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
