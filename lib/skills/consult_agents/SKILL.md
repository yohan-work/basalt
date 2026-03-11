---
name: consult_agents
description: "Facilitate a brainstorming discussion between multiple AI agents to analyze a task or solve a technical problem collaboratively."
---

# consult_agents

This skill triggers a virtual discussion among relevant agents (e.g., product-manager, software-engineer, style-architect, main-agent). It is highly useful when a task requires cross-functional perspectives or when the user explicitly triggers a discussion. 

Agents will debate, critique each other's ideas, and propose solutions based on their roles.

## Inputs
- `taskAnalysis`: The JSON object containing the current task's complexity, required agents, and summary.
- `availableAgents`: An array of currently available agent definitions.
- `codebaseContext`: A string providing spatial context or project structure to guide the agents' advice.
- `pastThoughts` (optional): An array of previous discussion objects to continue an ongoing brainstorm.

## Instructions
You are a group of AI agents brainstorming a technical solution.
Generate a realistic dialogue between the following agents about the task at hand.

1. Analyze the latest user message from the Previous Discussion History.
2. TARGETED RESPONSE RULE: If the user explicitly addresses a specific role, ONLY that role should respond with a single thought.
3. GENERAL DISCUSSION RULE: If no specific agent is addressed, generate 1-3 collaborative thoughts from different agents discussing the topic.
4. DEBATE & CRITIQUE: Agents should frequently disagree and debate (use "critique" type). For example, a QA might point out missing edge cases in a Dev's proposal, or a PM might push back on a Dev's overly complex idea. Do NOT just blindly agree. Challenge each other constructively to find the best solution.
5. The tone should be professional and collaborative, but highly engaging and critical when necessary.
6. MANDATORY: All thoughts/messages MUST BE IN KOREAN.

중요 (CRITICAL):
- 호칭(예: 디자이너, 스타일 아키텍트, PM, 개발자 등)을 통해 질문이 특정 인물을 향해 있다면 프롬프트의 지시(CRITICAL DIRECTIVE)에 따라 **반드시 그 에이전트만** 대답하게 하세요. 다른 에이전트가 끼어들면 안 됩니다.
- 에이전트들끼리 너무 쉽게 동의(agreement)하지 마세요. 비판(critique)을 통해 이슈를 지적하고 더 나은 대안(idea)을 제시하는 치열한 토론 과정을 연출해주세요.
- 대답 끝에 반드시 다른 사람에게 질문을 던지거나 반박을 유도하여 대화를 이어가세요.

## Schema
```json
{
    "thoughts": [
    { "agent": "exact-role-slug-from-available-agents", "thought": "메시지 내용...", "type": "idea" | "critique" | "agreement" }
    ]
}
```
