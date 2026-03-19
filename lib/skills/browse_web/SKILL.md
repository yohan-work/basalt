---
name: browse_web
description: Opens an external web page with agent-browser, extracts text content and accessibility snapshot for research purposes. Used by Product Manager and Technical Writer agents.
---

# Browse Web

Opens a URL with agent-browser and extracts page content (text, accessibility tree) for research and data gathering.

Security defaults: `--content-boundaries`, `--max-output 100000`. Configure `AGENT_BROWSER_ALLOWED_DOMAINS` to restrict navigation.

## Inputs
-   `url`: The URL to browse.
-   `extractMode`: One of `text`, `snapshot`, or `full` (default: `full`).
-   `selector`: (optional) CSS selector to scope extraction to a specific section.

## Outputs
-   Extracted page content:

## Schema
```json
{
    "success": true,
    "url": "string",
    "title": "string",
    "content": "string",
    "snapshot": "string (optional)",
    "screenshotPath": "string (optional)"
}
```

## Instructions
1. Open the URL with agent-browser.
2. Wait for network idle.
3. Extract page title.
4. Based on extractMode:
   - `text`: Get text content of body or scoped selector.
   - `snapshot`: Get accessibility tree.
   - `full`: Get both text and snapshot + a screenshot.
5. Return extracted data.
