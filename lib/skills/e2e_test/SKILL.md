---
name: e2e_test
description: Generates and executes end-to-end browser test scenarios using agent-browser based on the task description.
---

# E2E Test

Uses LLM to generate test scenarios from the task description, then executes them step-by-step using agent-browser (snapshot → interact → verify).

## Inputs
-   `url`: The URL to test (e.g. `http://localhost:3000`).
-   `taskDescription`: What the feature should do (used to generate test scenarios).
-   `scenarios`: (optional) Pre-defined test scenarios to run instead of LLM-generated ones.

## Outputs
-   A JSON object with test results:

## Schema
```json
{
    "passed": true,
    "totalScenarios": 2,
    "passedScenarios": 2,
    "failedScenarios": 0,
    "results": [
        {
            "name": "string",
            "passed": true,
            "steps": [
                { "action": "string", "success": true, "detail": "string" }
            ],
            "error": "string (optional)"
        }
    ],
    "browserUsed": true
}
```

## Instructions
1. If no pre-defined scenarios, use LLM to generate 1-3 test scenarios based on the task description.
2. For each scenario, open the URL with agent-browser.
3. Take a snapshot to discover interactive elements.
4. Execute each test step (click, fill, navigate, verify text).
5. After each action, re-snapshot to verify the expected outcome.
6. Report pass/fail for each scenario with details.
