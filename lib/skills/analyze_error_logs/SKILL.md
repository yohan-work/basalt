---
name: analyze_error_logs
description: Analyzes error logs to find the root cause of a failure.
---

# Analyze Error Logs

Parses and interprets error logs to provide actionable fixes.

## Inputs
-   `logs`: The string content of the error log.

## Outputs
-   A JSON object with:
    -   `cause`: The suspected root cause.
    -   `solution`: Proposed fix or advice.

## Instructions
1.  Read the logs and look for keyword errors (e.g., 'SyntaxError', 'undefined').
2.  Correlate the error with the codebase if possible.
3.  Suggest a concrete solution.
