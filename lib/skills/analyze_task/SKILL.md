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
1.  Read the `taskDescription` carefully.
2.  Assess how many different domains (frontend, backend, database, testing) are involved.
3.  Return the structured analysis.
