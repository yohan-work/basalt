import fs from 'fs';
import path from 'path';

/**
 * Next.js generates `.next/types/validator.ts` that imports `app/.../page.js`.
 * Right after adding `page.tsx`, `tsc` can fail with TS2307 until `next dev`/`next build`
 * refreshes `.next/types`. If the corresponding `.tsx`/`.ts`/`.jsx` exists on disk, treat as stale codegen noise.
 *
 * Disable filtering: BASALT_STRICT_NEXT_VALIDATOR=1
 */
export function isStrictNextValidatorMode(): boolean {
    const v = String(process.env.BASALT_STRICT_NEXT_VALIDATOR || '').toLowerCase();
    return ['1', 'true', 'yes'].includes(v);
}

function lineIsNextValidatorTs2307(line: string): boolean {
    const n = line.replace(/\\/g, '/');
    return n.includes('.next/types/validator.ts') && /\berror TS2307\b/i.test(line);
}

function resolvedImportStaysInProject(projectRoot: string, typesDir: string, relImport: string): boolean {
    const resolved = path.normalize(path.resolve(typesDir, relImport));
    const rootRes = path.resolve(projectRoot);
    const rel = path.relative(rootRes, resolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True if missing `.js` is explained by an existing App Router source file next to it. */
function benignMissingJsModule(projectRoot: string, relImport: string): boolean {
    if (!relImport.endsWith('.js')) return false;
    const typesDir = path.join(projectRoot, '.next/types');
    if (!resolvedImportStaysInProject(projectRoot, typesDir, relImport)) return false;

    const resolvedJs = path.normalize(path.resolve(typesDir, relImport));
    const dir = path.dirname(resolvedJs);
    const base = path.basename(resolvedJs, '.js');
    const candidates = ['.tsx', '.ts', '.jsx', '.js'].map((ext) => path.join(dir, base + ext));
    return candidates.some((p) => fs.existsSync(p));
}

function lineIsBenignNextValidatorError(line: string, projectRoot: string): boolean {
    if (!lineIsNextValidatorTs2307(line)) return false;
    const m = line.match(/Cannot find module ['"]([^'"]+)['"]/);
    if (!m) return false;
    return benignMissingJsModule(projectRoot, m[1]);
}

/**
 * Removes validator.ts TS2307 lines that match `benignMissingJsModule`. Other lines unchanged.
 */
export function stripBenignNextValidatorTs2307(output: string, projectRoot: string): string {
    if (isStrictNextValidatorMode()) return output;
    const root = path.resolve(projectRoot);
    const lines = output.split(/\r?\n/);
    const out: string[] = [];
    for (const line of lines) {
        if (lineIsBenignNextValidatorError(line, root)) continue;
        out.push(line);
    }
    return out.join('\n');
}

/** Non-empty tsc-style error lines (after strip). */
export function projectTypecheckOutputHasErrors(output: string): boolean {
    return /\berror TS\d+:/i.test(output);
}
