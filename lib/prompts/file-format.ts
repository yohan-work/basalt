/**
 * Shared output format for multi-file codegen and surgical single-file edits.
 */
export const FILE_FORMAT_INSTRUCTIONS = `
### FORMAT RULE (CRITICAL):
For EACH file you create or modify, you MUST use the following PRECISE format:
1. The path MUST be on a line starting with "File: " and MUST be **OUTSIDE** the fenced code block. (e.g., File: app/page.tsx)
2. The code block MUST follow immediately after the file path line.
3. **RELATIVE IMPORTS ONLY**: When importing local files from the same project, **ALWAYS** use relative paths (e.g., \`import { data } from "./lib/mock-data"\` or \`../../lib/utils\`). 
4. **NO ALIAS IMPORTS**: **DO NOT** use \`@/\` aliases (e.g., \`@/lib/mock-data\`) unless the task explicitly confirms it is configured. Relative paths are 100% safer.
5. PREPEND the Router Base Path (e.g., "app/", "src/app/") explicitly.

    Example:
    File: path/to/file.ext
    \`\`\`language
    // file content
    \`\`\`
`.trim();
