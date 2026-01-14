---
name: create_workflow
description: Generates a step-by-step workflow based on task analysis.
---

# Create Workflow

This skill generates a concrete execution plan (workflow) based on a task analysis.

## Inputs
-   `taskAnalysis`: The JSON object returned by `analyze_task`.

## Outputs
-   A JSON object containing:
    -   `steps`: An array of step objects, where each step has:
        -   `agent`: The role responsible (e.g., 'Software Engineer').
        -   `action`: The specific skill name to execute (e.g., 'write_code').
        -   `description`: A brief description of what to do in this step.

## Instructions
1.  Break down the goal into logical, sequential steps.
2.  Assign the most specific skill available to the most appropriate agent for each step.
3.  Ensure dependencies are respected (e.g., design before implementation).
