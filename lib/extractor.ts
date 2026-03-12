
/**
 * Specialized utility to extract files from LLM raw text responses.
 * Handles markdown formatting debris and path normalization.
 */
export class FileExtractor {
    /**
     * Extracts files from raw text which follows the "File: path\n```...content```" pattern.
     * Handles many LLM output variations:
     *  - Standard:      File: app/page.tsx\n```tsx\n...\n```
     *  - Bold:          **File:** app/page.tsx\n```tsx\n...\n```
     *  - Header:        ### File: app/page.tsx\n```tsx\n...\n```
     *  - No blank line: File: app/page.tsx\n```tsx (path and block on consecutive lines)
     */
    static extractFromMarkdown(text: string): Array<{ path: string; content: string }> {
        const files: Array<{ path: string; content: string }> = [];

        // Primary pattern: explicit "File:" or "Path:" prefix (with optional markdown decorators)
        // Handles: File:, **File:**, ### File:, `File:`, Path:, etc.
        // Allows 0 or 1 blank lines between the path line and the code block.
        const fileRegex = /(?:^|\n)[ \t]*(?:[#*`_~\s]*(?:File|Path)\s*:\s*[*_`]?\s*)([^\n\r`]+?)[ \t]*(?:\n[ \t]*){1,2}```[a-z0-9]*[ \t]*\n([\s\S]*?)\n[ \t]*```/gi;

        let match;
        while ((match = fileRegex.exec(text)) !== null) {
            const rawPath = match[1].trim();
            const cleanPath = this.normalizePath(rawPath);

            if (cleanPath) {
                files.push({
                    path: cleanPath,
                    content: match[2].trim()
                });
            }
        }

        // Fallback: some LLMs omit "File:" and just write the path then a code block.
        // Pattern: a standalone path-like line followed immediately by ```
        if (files.length === 0) {
            const barePathRegex = /(?:^|\n)((?:[\w.-]+\/)+[\w.-]+\.[\w]{1,6})[ \t]*\n[ \t]*```[a-z0-9]*[ \t]*\n([\s\S]*?)\n[ \t]*```/gi;
            while ((match = barePathRegex.exec(text)) !== null) {
                const rawPath = match[1].trim();
                const cleanPath = this.normalizePath(rawPath);
                if (cleanPath) {
                    files.push({ path: cleanPath, content: match[2].trim() });
                }
            }
        }

        return files;
    }

    /**
     * Normalizes and cleans up path strings captured from LLM outputs.
     */
    static normalizePath(rawPath: string): string {
        let path = rawPath
            .replace(/^[#*`\s]+/, '')     // Remove leading markdown symbols
            .replace(/[#*`\s]+$/, '')     // Remove trailing markdown symbols
            .replace(/^File[:\s]*/i, '')  // Remove "File:"
            .replace(/^Path[:\s]*/i, '')  // Remove "Path:"
            .trim();

        // 1. Remove explanatory text in parentheses at the end (e.g., "(if not already present)")
        path = path.replace(/\s*\(.*?\)\s*$/, '').trim();

        // 2. Remove trailing punctuation often added by LLMs (e.g., "page.tsx:")
        path = path.replace(/[:.]$/, '').trim();

        // 3. Handle cases where the LLM wrote a sentence like "Next, modify the [id].tsx file"
        if (path.includes(' ')) {
            // Check if one of the words looks like a real path (contains a dot and doesn't look like a common word)
            const words = path.split(/\s+/);
            const likelyPath = words.find(w =>
                /\.[a-z0-9]{2,4}$/i.test(w) && // has extension
                !/^(the|a|an|file|path|to|is|in|on|at|by|with|for)$/i.test(w) // not a common filler word
            );

            if (likelyPath) {
                path = likelyPath.replace(/^[`'"]|[`'"]$/g, ''); // Strip quotes
            } else if (path.length > 50 || words.length > 5) {
                // If it's long and no word looks like a path, it's likely a sentence
                return '';
            }
        }

        // 4. Final cleanup of quotes and backticks
        path = path.replace(/^[`'"]|[`'"]$/g, '');

        // 5. Fix unbalanced brackets at the END specifically (e.g., "list].tsx")
        // This often happens if the LLM wrote "[list].tsx" but the "[" was interpreted as part of a label
        if (path.endsWith('].tsx') && !path.startsWith('[')) {
            // If there's an unmatched ] at the end of the filename part
            const fileName = path.split('/').pop() || '';
            const openCount = (fileName.match(/\[/g) || []).length;
            const closeCount = (fileName.match(/\]/g) || []).length;
            if (closeCount > openCount) {
                path = path.replace(/\](\.[a-z0-9]+)$/i, '$1');
            }
        }

        // Ensure no leading slash
        path = path.replace(/^\//, '');

        return path;
    }

    /**
     * Fallback to extract files from a JSON structure if markdown extraction fails.
     */
    static extractFromJSON(text: string): Array<{ path: string; content: string }> | null {
        try {
            // Assume cleanJSON is available or handled outside
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) {
                const jsonStr = text.substring(start, end + 1);
                const parsed = JSON.parse(jsonStr);
                if (parsed.files && Array.isArray(parsed.files)) {
                    return parsed.files.map((f: { path?: string; filePath?: string; content?: string; code?: string }) => ({
                        path: this.normalizePath(f.path || f.filePath || ''),
                        content: f.content || f.code || ''
                    })).filter((f: { path: string }) => f.path);
                }
            }
        } catch (e) {
            // Silent fail for fallback
        }
        return null;
    }

    /**
     * Orchestrates the extraction process.
     * Logs a warning with raw output preview when extraction fails to aid debugging.
     */
    static extractAll(text: string): Array<{ path: string; content: string }> {
        const markdownFiles = this.extractFromMarkdown(text);
        if (markdownFiles.length > 0) return markdownFiles;

        const jsonFiles = this.extractFromJSON(text);
        if (jsonFiles) return jsonFiles;

        // Log the raw LLM output so developers can diagnose format mismatches
        if (text && text.trim().length > 0) {
            console.warn(
                '[FileExtractor] Could not extract any files. Raw LLM output preview:\n' +
                text.slice(0, 500)
            );
        }

        return [];
    }
}
