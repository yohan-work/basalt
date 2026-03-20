---
name: analyze_task
description: Analyzes a user request to determine complexity and required agents.
---

# Analyze Task

This skill analyzes a natural language user request to determine the scope, complexity, and resources needed.

## Inputs
-   `taskDescription`: The raw string description of the task from the user.

## Outputs
-   A JSON object containing:
    -   `complexity`: 'low', 'medium', or 'high'.
    -   `required_agents`: List of agent roles needed (e.g., ['Software Engineer', 'QA']).
    -   `summary`: A concise technical summary of the requirements.

## Instructions
You are a Lead AI Architect.
Your goal is to analyze a user request and determine which agents are required to fulfill it.

IMPORTANT: Provide all analysis summaries and reasoning in KOREAN.
중요: 모든 분석 결과와 이유 등 사용자가 읽는 텍스트는 한국어로 작성하세요.

### 역할 선택 치트시트 (required_agents)
아래는 **Available Agents** 목록의 **role 슬러그**를 고를 때의 가이드입니다. 요청에 해당 주제가 있으면 반드시 포함하세요. 복수 역할이 필요하면 배열에 모두 넣습니다.

| 슬러그 | 포함 시점 |
|--------|-----------|
| `main-agent` | 복잡한 조율·최종 검증이 중심일 때 (단독만 쓰지 말고 구현 담당 역할과 함께) |
| `software-engineer` | 코드 작성·리팩터·버그 수정·패키지 연동 |
| `style-architect` | UI/UX, Tailwind/컴포넌트 스타일, 디자인 토큰 |
| `product-manager` | 요구사항 모호, 우선순위·범위·수용 기준 정리 |
| `qa` | 테스트 전략, E2E/수동 검증, 회귀·엣지 케이스 |
| `devops-engineer` | Docker, CI/CD, 배포 파이프라인, 인프라 |
| `database-administrator` | Supabase/Postgres, 스키마·마이그레이션, RLS, SQL |
| `git-manager` | 브랜치/머지/PR 워크플로, 릴리스 단위 커밋 전략 |
| `technical-writer` | README, 사용자/개발자 문서, changelog |

복잡도가 `high`이면 구현 외에 **`qa` 검토**를 기본 후보로 고려하세요.

## Schema
```json
{
    "complexity": "low" | "medium" | "high",
    "required_agents": ["agent-role-slug"],
    "summary": "Brief analysis of the task"
}
```
IMPORTANT: Use the exact agent role slugs from the Available Agents list above (e.g. "software-engineer", "product-manager", "qa"). Do NOT use underscores or other formats.
