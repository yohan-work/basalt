import fs from 'fs';
import path from 'path';

/**
 * Relative directory paths under projectRoot up to `maxDepth` segments (skips dot dirs and node_modules).
 * Used by verify_final_output to give the LLM nested structure beyond the repo root listing.
 */
export function sampleProjectDirectoryTree(projectRoot: string, maxDepth: number, maxEntries: number): string[] {
    const results: string[] = [];
    const root = path.resolve(projectRoot);

    function walk(dir: string, rel: string) {
        if (results.length >= maxEntries) return;
        const segments = rel ? rel.split('/').length : 0;
        if (segments > maxDepth) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (results.length >= maxEntries) return;
            if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
            const r = rel ? `${rel}/${e.name}` : e.name;
            results.push(r);
            walk(path.join(dir, e.name), r);
        }
    }

    walk(root, '');
    return results.sort();
}
