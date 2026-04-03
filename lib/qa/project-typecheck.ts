import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import {
    projectTypecheckOutputHasErrors,
    stripBenignNextValidatorTs2307,
} from './next-validator-filter';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 12_000;

/**
 * write_code 배치 직후 전체 프로젝트 typecheck 게이트.
 * 끄려면 BASALT_SKIP_PROJECT_TYPECHECK=1 (기본은 켜짐).
 */
export function isProjectTypecheckWriteGateEnabled(): boolean {
    const skip = String(process.env.BASALT_SKIP_PROJECT_TYPECHECK || '').toLowerCase();
    return !['1', 'true', 'yes'].includes(skip);
}

export function shouldRunProjectTypecheckForPath(relativePath: string): boolean {
    const ext = path.extname(relativePath).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
}

function findTsOrJsConfig(projectPath: string): string | null {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const p = path.join(projectPath, name);
        if (fs.existsSync(p)) return name;
    }
    return null;
}

function parsePackageScripts(projectPath: string): Record<string, string> | null {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
        return pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : null;
    } catch {
        return null;
    }
}

/**
 * npm 스크립트 우선, 없으면 npx tsc --noEmit -p <tsconfig|jsconfig>.
 */
export function resolveProjectTypecheckCommand(projectPath: string): { cmd: string; args: string[] } | null {
    const root = path.resolve(projectPath);
    const scripts = parsePackageScripts(root);
    if (scripts?.typecheck) {
        return { cmd: 'npm', args: ['run', 'typecheck'] };
    }
    if (scripts?.['lint:types']) {
        return { cmd: 'npm', args: ['run', 'lint:types'] };
    }
    const cfg = findTsOrJsConfig(root);
    if (cfg) {
        return { cmd: 'npx', args: ['tsc', '--noEmit', '-p', cfg] };
    }
    return null;
}

/**
 * tsc 출력에서 가장 먼저 언급된, 이번에 쓴 경로를 고른다. 없으면 배치의 마지막 경로(보통 페이지).
 */
export function pickWrittenPathMatchingDiagnostics(output: string, writtenPaths: string[]): string | null {
    if (writtenPaths.length === 0) return null;
    const out = output.replace(/\\/g, '/');
    for (const p of writtenPaths) {
        const n = p.replace(/\\/g, '/');
        if (n && out.includes(n)) return p;
    }
    return writtenPaths[writtenPaths.length - 1];
}

export type ProjectTypecheckResult = {
    ok: boolean;
    skipped: boolean;
    output: string;
    command?: string;
};

/**
 * 대상 워크스페이스 루트에서 전체 타입체크. 스크립트/tsconfig 없으면 skipped.
 */
export async function runProjectTypecheck(projectPath: string): Promise<ProjectTypecheckResult> {
    const root = path.resolve(projectPath);
    const resolved = resolveProjectTypecheckCommand(root);
    if (!resolved) {
        return { ok: true, skipped: true, output: '' };
    }
    const timeout = Number(process.env.BASALT_PROJECT_TYPECHECK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const cmdStr = `${resolved.cmd} ${resolved.args.join(' ')}`;
    try {
        const { stdout, stderr } = await execFileAsync(resolved.cmd, resolved.args, {
            cwd: root,
            timeout,
            maxBuffer: 4 * 1024 * 1024,
            encoding: 'utf8',
            env: { ...process.env },
        });
        const combined = `${stdout || ''}${stderr || ''}`.trim();
        return {
            ok: true,
            skipped: false,
            output: combined.slice(0, MAX_OUTPUT_CHARS),
            command: cmdStr,
        };
    } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const raw = `${e.stdout || ''}${e.stderr || ''}`.trim() || e.message || String(err);
        const stripped = stripBenignNextValidatorTs2307(raw, root);
        const hadTscErrors = projectTypecheckOutputHasErrors(raw);
        const ok = hadTscErrors && !projectTypecheckOutputHasErrors(stripped);
        const out = (hadTscErrors ? stripped : raw).slice(0, MAX_OUTPUT_CHARS);
        return {
            ok,
            skipped: false,
            output: out,
            command: cmdStr,
        };
    }
}
