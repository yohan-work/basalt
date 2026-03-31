import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MAX_LOG_CHARS = 8000;
const DEFAULT_TIMEOUT_MS = 420_000;

function isRalphFeedbackGateEnabled(): boolean {
    return ['true', '1', 'yes'].includes(String(process.env.BASALT_RALPH_FEEDBACK_GATE || '').toLowerCase());
}

function parsePackageScripts(projectPath: string): Record<string, string> | null {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    try {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
        return pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : null;
    } catch {
        return null;
    }
}

export type RalphFeedbackGateResult = {
    ok: boolean;
    ran: string[];
    failure?: string;
};

/**
 * 옵트인: 대상 프로젝트에서 `npm run typecheck` → `test` → `lint` 순으로 존재하는 스크립트만 실행.
 * BASALT_RALPH_FEEDBACK_GATE=true(또는 1/yes)일 때만 동작.
 */
export async function runRalphFeedbackGate(projectPath: string): Promise<RalphFeedbackGateResult> {
    if (!isRalphFeedbackGateEnabled()) {
        return { ok: true, ran: [] };
    }
    const root = path.resolve(projectPath);
    const scripts = parsePackageScripts(root);
    if (!scripts) {
        return { ok: true, ran: [], failure: undefined };
    }

    const order = ['typecheck', 'test', 'lint'] as const;
    const ran: string[] = [];
    for (const name of order) {
        if (!scripts[name]) continue;
        ran.push(name);
        try {
            const { stdout, stderr } = await execFileAsync('npm', ['run', name], {
                cwd: root,
                timeout: Number(process.env.BASALT_RALPH_FEEDBACK_GATE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
                maxBuffer: 4 * 1024 * 1024,
                env: { ...process.env },
            });
            const combined = `${stdout || ''}${stderr ? `\n${stderr}` : ''}`.trim();
            if (combined.length > MAX_LOG_CHARS) {
                /* success with verbose log — ignore */
            }
        } catch (e: unknown) {
            const err = e as { stdout?: string; stderr?: string; message?: string };
            const out = `${err.stdout || ''}\n${err.stderr || ''}`.trim() || err.message || String(e);
            const clipped = out.length > MAX_LOG_CHARS ? `${out.slice(0, MAX_LOG_CHARS)}\n… [truncated]` : out;
            return {
                ok: false,
                ran,
                failure: `npm run ${name} 실패:\n${clipped}`,
            };
        }
    }
    return { ok: true, ran };
}
