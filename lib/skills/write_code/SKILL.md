---
name: write_code
description: Writes content to a file, creating directories if needed.
---

# Write Code

Writes string content to a specified file path.

## Inputs
-   `filePath`: Target file path (relative).
-   `content`: The code/text to write.

## Outputs
-   Success message or error message.

## Instructions
1.  Ensure the directory structure exists. If not, create it.
2.  Write the `content` to `filePath`.
3.  Overwrite if file exists.
4.  **IMPORTANT**: Always use the correct file extension based on the explicit `Tech Stack` provided in the context (e.g., use `.tsx` for React/Next.js components, `.ts` for logic, `.css`/`.scss` for styles).
5.  Do NOT create `.txt` or `.md` files unless explicitly asked for documentation.
6.  For UI components in Next.js/React, ensure you import React and necessary libraries.
