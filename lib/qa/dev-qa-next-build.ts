import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MAX_OUTPUT_CHARS = 120_000;
const BUILD_TIMEOUT_MS = 420_000;

export function isDevQaNextBuildEnabled(): boolean {
    const v = String(process.env.DEV_QA_RUN_NEXT_BUILD || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

export function isDevQaFailOnNextBuildEnabled(): boolean {
    const v = String(process.env.DEV_QA_FAIL_ON_NEXT_BUILD || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Runs `next build` in the target workspace (optional Dev QA gate). Heavy — use sparingly.
 */
export async function runDevQaNextBuildCapture(projectRoot: string): Promise<{
    ok: boolean;
    excerpt: string;
    exitCode: number | null;
}> {
    try {
        const { stdout, stderr } = await execAsync('npx next build', {
            cwd: projectRoot,
            timeout: BUILD_TIMEOUT_MS,
            maxBuffer: 20 * 1024 * 1024,
            env: {
                ...process.env,
                FORCE_COLOR: '0',
                CI: '1',
            },
        });
        const combined = `${stdout || ''}\n${stderr || ''}`.slice(0, MAX_OUTPUT_CHARS);
        return { ok: true, excerpt: combined || '(empty)', exitCode: 0 };
    } catch (e: any) {
        const stdout = e.stdout?.toString?.() || '';
        const stderr = e.stderr?.toString?.() || '';
        const code = typeof e.code === 'number' ? e.code : null;
        const combined = `${stdout}\n${stderr}`.slice(0, MAX_OUTPUT_CHARS);
        return {
            ok: false,
            excerpt: combined || e.message || String(e),
            exitCode: code,
        };
    }
}
