---
name: visual_test
description: Takes screenshots of a web page and evaluates visual quality, layout correctness, and accessibility using agent-browser and LLM analysis.
---

# Visual Test

Captures a screenshot and accessibility snapshot of the target page, then uses LLM to evaluate visual quality and correctness against the task requirements.

Optionally performs a visual diff against a baseline screenshot.

## Inputs
-   `url`: The URL to test (e.g. `http://localhost:3000/page`).
-   `taskDescription`: What the page should look like / contain.
-   `baselineScreenshot`: (optional) Path to a baseline screenshot for diff comparison.

## Outputs
-   A JSON result with quality assessment:

## Schema
```json
{
    "passed": true,
    "score": 85,
    "screenshotPath": "string",
    "issues": ["string"],
    "suggestions": ["string"],
    "diffMismatchPercent": null
}
```

## Instructions
1. Open the URL with agent-browser.
2. Wait for network idle.
3. Take an annotated screenshot.
4. Capture an accessibility snapshot.
5. If baseline is provided, run `diff screenshot` to get mismatch percentage.
6. Send the snapshot + task description to LLM for quality evaluation.
7. Return combined results.
