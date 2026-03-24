/**
 * Pick the LLM-extracted file block that corresponds to the server's target path.
 * Prevents writing `files[0]` when the model emitted a different path (e.g. layout vs page).
 */

export function normalizeModifyElementPath(raw: string): string {
    let p = raw.trim().replace(/\\/g, '/');
    p = p.replace(/^\/+/, '');
    p = p.replace(/\/+/g, '/');
    return p;
}

function stripSrcPrefix(p: string): string {
    const n = normalizeModifyElementPath(p);
    return n.startsWith('src/') ? n.slice(4) : n;
}

export function pathMatchesModifyTarget(candidatePath: string, targetPath: string): boolean {
    const a = normalizeModifyElementPath(candidatePath);
    const b = normalizeModifyElementPath(targetPath);
    if (a === b) return true;
    return stripSrcPrefix(a) === stripSrcPrefix(b);
}

export function normalizeFileContentForCompare(s: string): string {
    let t = s.replace(/^\uFEFF/, '');
    return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export type PickExtractedResult =
    | { ok: true; content: string }
    | { ok: false; reason: 'no_files' | 'no_match' | 'ambiguous'; pathsReturned: string[] };

export function pickExtractedFileContent(
    files: Array<{ path: string; content: string }>,
    targetPath: string
): PickExtractedResult {
    if (!files.length) {
        return { ok: false, reason: 'no_files', pathsReturned: [] };
    }

    const matches = files.filter((f) => pathMatchesModifyTarget(f.path, targetPath));
    if (matches.length === 0) {
        return {
            ok: false,
            reason: 'no_match',
            pathsReturned: files.map((f) => normalizeModifyElementPath(f.path)),
        };
    }

    const logicalKeys = new Set(
        matches.map((f) => stripSrcPrefix(normalizeModifyElementPath(f.path)))
    );
    if (logicalKeys.size > 1) {
        return {
            ok: false,
            reason: 'ambiguous',
            pathsReturned: matches.map((f) => normalizeModifyElementPath(f.path)),
        };
    }

    return { ok: true, content: matches[0].content };
}
