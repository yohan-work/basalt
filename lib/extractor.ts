
/**
 * Specialized utility to extract files from LLM raw text responses.
 * Handles markdown formatting debris and path normalization.
 */
export class FileExtractor {
    /**
     * Extracts files from raw text which follows the "File: path\n```...\ncontent\n```" pattern.
     */
    static extractFromMarkdown(text: string): Array<{ path: string; content: string }> {
        const files: Array<{ path: string; content: string }> = [];

        // Robust regex to handle:
        // 1. Varied prefixes (File:, Path:, or none)
        // 2. Optional markdown formatting around the path
        // 3. Optional whitespace before/after triple backticks
        // 4. Different languages in the code block
        const fileRegex = /(?:^|\n)(?:[#*`\s]*File[:\s]*|[#*`\s]*Path[:\s]*)*\s*([^\n\r]+)[\r\n]+\s*```[a-z0-9]*[\r\n]+([\s\S]*?)[\r\n]+\s*```/gi;

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
                // If it's like [id].tsx, path is okay. If it's list].tsx, we should fix it to [list].tsx?
                // Actually, let's just strip the stray ] if it's at the end.
                // Or even better: prepend [ if it's very likely a mistake.
                // But safest is to just strip debris or keep as is if it's valid.
                // The user said "list].tsx 이런식으로 ] 가 붙는다" -> they want the ] GONE.
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
     */
    static extractAll(text: string): Array<{ path: string; content: string }> {
        const markdownFiles = this.extractFromMarkdown(text);
        if (markdownFiles.length > 0) return markdownFiles;

        const jsonFiles = this.extractFromJSON(text);
        if (jsonFiles) return jsonFiles;

        return [];
    }
}
