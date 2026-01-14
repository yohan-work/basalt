---
name: read_codebase
description: Reads the content of a file from the local filesystem.
---

# Read Codebase

Reads the text content of a specified file.

## Inputs
-   `filePath`: Relative path to the file to read (e.g., 'app/page.tsx').

## Outputs
-   The content of the file as a string.

## Instructions
1.  Verify the file exists at the given path.
2.  Read the content using UTF-8 encoding.
3.  Return the content. If error, return error message.
