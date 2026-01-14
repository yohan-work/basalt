---
name: verify_final_output
description: checks if the final result matches the initial requirements.
---

# Verify Final Output

This skill performs a final check to ensure the work done matches the user's request.

## Inputs
-   `outputRef`: Reference to the final artifact or state (e.g., file path or URL).
-   `originalRequirements`: The initial user request.

## Outputs
-   A JSON object containing:
    -   `verified`: Boolean (true/false).
    -   `notes`: Explanation of the verification result.

## Instructions
1.  Compare the actual output against the requirements.
2.  If mostly correct but with minor issues, mark as verified=false and provide notes.
3.  If critical requirements are missing, clearly state what is missing.
