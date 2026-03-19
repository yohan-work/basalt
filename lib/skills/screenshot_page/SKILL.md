---
name: screenshot_page
description: Captures a full-page screenshot and optionally annotated screenshot of a web page using agent-browser.
---

# Screenshot Page

Opens a URL and captures screenshots for verification, documentation, or diff purposes.

## Inputs
-   `url`: The URL to capture.
-   `annotate`: (optional, default false) Include numbered element labels in the screenshot.
-   `fullPage`: (optional, default true) Capture the full scrollable page.
-   `viewport`: (optional) Custom viewport as `{ width, height }`.

## Outputs
-   Screenshot capture result:

## Schema
```json
{
    "success": true,
    "screenshotPath": "string",
    "annotations": ["string"],
    "pageTitle": "string",
    "pageUrl": "string"
}
```

## Instructions
1. Open the URL with agent-browser.
2. Wait for network idle.
3. Optionally set custom viewport.
4. Take a screenshot (full-page by default).
5. If annotate is true, include element labels.
6. Return the screenshot path and metadata.
