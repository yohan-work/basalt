import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const EXEC_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_CHARS = 100_000;

export interface SnapshotResult {
    success: boolean;
    snapshot?: string;
    refs?: Record<string, { role: string; name: string }>;
    error?: string;
}

export interface ScreenshotResult {
    success: boolean;
    path?: string;
    annotations?: string[];
    error?: string;
}

export interface EvalResult {
    success: boolean;
    value?: string;
    error?: string;
}

export interface BrowserCommandResult {
    success: boolean;
    data?: any;
    raw?: string;
    error?: string;
}

/** agent-browser `console --json` message entry */
export type AgentBrowserConsoleMessage = { type?: string; text?: string; [k: string]: unknown };

/** agent-browser `errors --json` entry */
export type AgentBrowserPageErrorEntry = {
    text?: string;
    line?: number;
    column?: number;
    url?: string | null;
    [k: string]: unknown;
};

/** agent-browser `network requests --json` entry (xhr/fetch; shape from agent-browser 0.23+) */
export type AgentBrowserNetworkRequestEntry = {
    url?: string;
    status?: number;
    method?: string;
    resourceType?: string;
    mimeType?: string;
    [k: string]: unknown;
};

export type AgentBrowserQaDiagnostics = {
    consoleMessages: AgentBrowserConsoleMessage[];
    pageErrors: AgentBrowserPageErrorEntry[];
    networkRequests: AgentBrowserNetworkRequestEntry[];
};

let _agentBrowserAvailable: boolean | null = null;

/**
 * CLI 바이너리. GUI로 연 Next/Cursor는 nvm·Homebrew 경로가 PATH에 없을 수 있어
 * 터미널에서 `which agent-browser`로 나온 절대 경로를 AGENT_BROWSER_BIN에 두면 된다.
 */
export function getAgentBrowserExecutable(): string {
    const fromEnv = process.env.AGENT_BROWSER_BIN?.trim();
    return fromEnv || 'agent-browser';
}

function shellQuoteArg(arg: string): string {
    if (!arg.includes(' ') && !arg.includes('"')) return arg;
    return `"${arg.replace(/"/g, '\\"')}"`;
}

export async function isAgentBrowserAvailable(): Promise<boolean> {
    if (_agentBrowserAvailable !== null) return _agentBrowserAvailable;

    if (process.env.AGENT_BROWSER_ENABLED === 'false') {
        _agentBrowserAvailable = false;
        return false;
    }

    const exe = getAgentBrowserExecutable();
    try {
        await execFileAsync(exe, ['--version'], {
            timeout: 5_000,
            env: process.env,
            windowsHide: true,
        });
        _agentBrowserAvailable = true;
    } catch {
        _agentBrowserAvailable = false;
    }
    return _agentBrowserAvailable;
}

export function resetAvailabilityCache(): void {
    _agentBrowserAvailable = null;
}

function screenshotDir(): string {
    const dir = path.join(os.tmpdir(), 'basalt-screenshots');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

export class AgentBrowser {
    private session: string;

    constructor(sessionId: string) {
        this.session = `basalt-${sessionId}`;
    }

    private async run(args: string[], json = false): Promise<BrowserCommandResult> {
        const available = await isAgentBrowserAvailable();
        if (!available) {
            return { success: false, error: 'agent-browser is not installed or disabled' };
        }

        const sessionArgs = ['--session', this.session];
        if (json) sessionArgs.push('--json');
        const exe = getAgentBrowserExecutable();
        const cmd = [shellQuoteArg(exe), ...sessionArgs, ...args]
            .map(a => (a.includes(' ') && !a.startsWith('"') ? `"${a}"` : a))
            .join(' ');

        try {
            const { stdout, stderr } = await execAsync(cmd, {
                timeout: EXEC_TIMEOUT_MS,
                maxBuffer: 5 * 1024 * 1024,
                env: {
                    ...process.env,
                    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
                    AGENT_BROWSER_MAX_OUTPUT: String(MAX_OUTPUT_CHARS),
                },
            });

            if (json && stdout.trim()) {
                try {
                    const parsed = JSON.parse(stdout.trim());
                    return { success: parsed.success !== false, data: parsed.data ?? parsed, raw: stdout };
                } catch {
                    return { success: true, raw: stdout };
                }
            }

            return { success: true, raw: stdout.trim() || stderr.trim() };
        } catch (err: any) {
            const msg = err.stderr?.trim() || err.message || String(err);
            return { success: false, error: msg };
        }
    }

    async open(url: string): Promise<BrowserCommandResult> {
        return this.run(['open', url]);
    }

    async close(): Promise<BrowserCommandResult> {
        return this.run(['close']);
    }

    async snapshot(options?: { interactive?: boolean; compact?: boolean; selector?: string }): Promise<SnapshotResult> {
        const args = ['snapshot'];
        if (options?.interactive) args.push('-i');
        if (options?.compact) args.push('-c');
        if (options?.selector) args.push('-s', options.selector);

        const result = await this.run(args, true);
        if (!result.success) return { success: false, error: result.error };

        return {
            success: true,
            snapshot: result.data?.snapshot ?? result.raw,
            refs: result.data?.refs,
        };
    }

    async screenshot(filename?: string, options?: { full?: boolean; annotate?: boolean }): Promise<ScreenshotResult> {
        const dir = screenshotDir();
        const outputPath = filename
            ? (path.isAbsolute(filename) ? filename : path.join(dir, filename))
            : path.join(dir, `screenshot-${Date.now()}.png`);

        const args = ['screenshot', outputPath, '--screenshot-dir', dir];
        if (options?.full) args.push('--full');
        if (options?.annotate) args.push('--annotate');

        const result = await this.run(args);
        if (!result.success) return { success: false, error: result.error };

        const annotations: string[] = [];
        if (options?.annotate && result.raw) {
            for (const line of result.raw.split('\n')) {
                const match = line.match(/^\s*\[\d+\]\s+@e\d+/);
                if (match) annotations.push(line.trim());
            }
        }

        return { success: true, path: outputPath, annotations };
    }

    async click(ref: string): Promise<BrowserCommandResult> {
        return this.run(['click', ref]);
    }

    async fill(ref: string, text: string): Promise<BrowserCommandResult> {
        return this.run(['fill', ref, text]);
    }

    async setViewport(width: number, height: number, scale?: number): Promise<BrowserCommandResult> {
        const args = ['set', 'viewport', String(width), String(height)];
        if (scale) args.push(String(scale));
        return this.run(args);
    }

    async setDevice(name: string): Promise<BrowserCommandResult> {
        return this.run(['set', 'device', name]);
    }

    async waitForLoad(state: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<BrowserCommandResult> {
        return this.run(['wait', '--load', state]);
    }

    async waitForSelector(selector: string): Promise<BrowserCommandResult> {
        return this.run(['wait', selector]);
    }

    async waitForText(text: string): Promise<BrowserCommandResult> {
        return this.run(['wait', '--text', text]);
    }

    async waitMs(ms: number): Promise<BrowserCommandResult> {
        return this.run(['wait', String(ms)]);
    }

    async getText(ref: string): Promise<BrowserCommandResult> {
        return this.run(['get', 'text', ref], true);
    }

    async getUrl(): Promise<BrowserCommandResult> {
        return this.run(['get', 'url'], true);
    }

    async getTitle(): Promise<BrowserCommandResult> {
        return this.run(['get', 'title'], true);
    }

    async evaluate(js: string): Promise<EvalResult> {
        const result = await this.run(['eval', '--stdin'], false);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, value: result.raw };
    }

    async evaluateExpression(expression: string): Promise<EvalResult> {
        const args = ['eval', expression];
        const result = await this.run(args);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, value: result.raw };
    }

    async diffSnapshot(baseline?: string): Promise<BrowserCommandResult> {
        const args = ['diff', 'snapshot'];
        if (baseline) args.push('--baseline', baseline);
        return this.run(args);
    }

    async diffScreenshot(baseline: string, output?: string): Promise<BrowserCommandResult> {
        const args = ['diff', 'screenshot', '--baseline', baseline];
        if (output) args.push('-o', output);
        return this.run(args);
    }

    async batch(commands: string[][]): Promise<BrowserCommandResult> {
        const json = JSON.stringify(commands);
        const exe = shellQuoteArg(getAgentBrowserExecutable());
        const cmd = `echo '${json.replace(/'/g, "'\\''")}' | ${exe} --session ${this.session} batch --json`;
        try {
            const { stdout } = await execAsync(cmd, {
                timeout: EXEC_TIMEOUT_MS * 2,
                maxBuffer: 5 * 1024 * 1024,
                env: process.env,
            });
            return { success: true, raw: stdout };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async scroll(direction: 'up' | 'down' | 'left' | 'right', px?: number, selector?: string): Promise<BrowserCommandResult> {
        const args = ['scroll', direction];
        if (px) args.push(String(px));
        if (selector) args.push('--selector', selector);
        return this.run(args);
    }

    async press(key: string): Promise<BrowserCommandResult> {
        return this.run(['press', key]);
    }

    async select(ref: string, value: string): Promise<BrowserCommandResult> {
        return this.run(['select', ref, value]);
    }

    async check(ref: string): Promise<BrowserCommandResult> {
        return this.run(['check', ref]);
    }

    async pdf(outputPath: string): Promise<BrowserCommandResult> {
        return this.run(['pdf', outputPath]);
    }

    /**
     * After `open` + `waitForLoad`, read console / page errors / xhr+fetch network log (JSON CLI).
     * Network capture is reliable on agent-browser **0.23+**; older CLIs may return an empty `requests` array.
     */
    async collectQaDiagnostics(): Promise<AgentBrowserQaDiagnostics> {
        const empty: AgentBrowserQaDiagnostics = {
            consoleMessages: [],
            pageErrors: [],
            networkRequests: [],
        };

        const pullArray = (result: BrowserCommandResult, key: 'messages' | 'errors' | 'requests'): unknown[] => {
            const d = result.data;
            if (d && typeof d === 'object' && key in d) {
                const arr = (d as Record<string, unknown>)[key];
                return Array.isArray(arr) ? arr : [];
            }
            if (result.raw) {
                try {
                    const p = JSON.parse(result.raw.trim()) as { data?: Record<string, unknown> };
                    const inner = p.data?.[key];
                    return Array.isArray(inner) ? inner : [];
                } catch {
                    return [];
                }
            }
            return [];
        };

        const [cRes, eRes, nRes] = await Promise.all([
            this.run(['console'], true),
            this.run(['errors'], true),
            this.run(['network', 'requests', '--type', 'xhr,fetch'], true),
        ]);

        empty.consoleMessages = pullArray(cRes, 'messages') as AgentBrowserConsoleMessage[];
        empty.pageErrors = pullArray(eRes, 'errors') as AgentBrowserPageErrorEntry[];
        empty.networkRequests = pullArray(nRes, 'requests') as AgentBrowserNetworkRequestEntry[];

        return empty;
    }
}
