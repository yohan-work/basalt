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

## Outputs
- An array of `thought` objects, where each object contains:
  - `agent`: The role slug (e.g., 'software-engineer').
  - `thought`: The string content of their message, always in Korean.
  - `type`: 'idea', 'critique', or 'agreement'.
