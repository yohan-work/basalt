---
name: check_responsive
description: Checks if a page or component is responsive across devices.
---

# Check Responsive

Verifies layout integrity on mobile, tablet, and desktop.

## Inputs
-   `url`: Local URL or path to check.

## Outputs
-   A result object confirming status for each breakpoint.

## Instructions
1.  Simulate different viewport sizes.
2.  Check for overflow or broken layout.
3.  Return `{ mobile: boolean, desktop: boolean }`.
