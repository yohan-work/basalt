---
name: check_responsive
description: Checks if a page or component is responsive across mobile, tablet, and desktop viewports using agent-browser.
---

# Check Responsive

Uses agent-browser to open the target URL at three viewport sizes (mobile 375x812, tablet 768x1024, desktop 1920x1080), takes screenshots, and detects horizontal overflow.

Falls back to a stub result when agent-browser is not installed.

## Inputs
-   `url`: Local dev server URL to check (e.g. `http://localhost:3000/page`).

## Outputs
-   A JSON object with viewport results:

## Schema
```json
{
    "mobile": { "ok": true, "width": 375, "height": 812, "overflow": false, "screenshotPath": "string (optional)" },
    "tablet": { "ok": true, "width": 768, "height": 1024, "overflow": false, "screenshotPath": "string (optional)" },
    "desktop": { "ok": true, "width": 1920, "height": 1080, "overflow": false, "screenshotPath": "string (optional)" },
    "browserUsed": true,
    "summary": "string"
}
```

## Instructions
1. Open the URL with agent-browser at each viewport breakpoint.
2. Wait for network idle.
3. Check `document.body.scrollWidth > window.innerWidth` for horizontal overflow.
4. Take a full-page screenshot for each breakpoint.
5. Return the combined results.
