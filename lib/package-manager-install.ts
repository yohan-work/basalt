import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MAX_AUTO_INSTALL_PACKAGES = 12;
const INSTALL_TIMEOUT_MS = 420_000;

/** npm 패키지 이름(스코프 포함)만 허용 — 임의 셸 주입 방지 */
const SCOPED_PKG_RE = /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/i;
const UNSCOPED_PKG_RE = /^[a-z0-9-~][a-z0-9-._~]*$/i;

export type PackageManagerKind = 'npm' | 'pnpm' | 'yarn';

export function isAutoInstallNpmDepsEnabled(): boolean {
    const v = process.env.BASALT_AUTO_INSTALL_NPM_DEPS;
    if (v == null || v === '') return true;
    const lower = v.trim().toLowerCase();
    return lower !== '0' && lower !== 'false' && lower !== 'no' && lower !== 'off';
}

export function sanitizeNpmPackageRoots(roots: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of roots) {
        const s = String(raw).trim();
        if (!s || s.length > 214) continue;
        if (!SCOPED_PKG_RE.test(s) && !UNSCOPED_PKG_RE.test(s)) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
        if (out.length >= MAX_AUTO_INSTALL_PACKAGES) break;
    }
    return out;
}

export function detectPackageManagerKind(projectRoot: string): PackageManagerKind {
    try {
        if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
    } catch {
        /* ignore */
    }
    return 'npm';
}

export type InstallMissingNpmPackagesResult = {
    ok: boolean;
    command: string;
    manager: PackageManagerKind;
    packages: string[];
    stdout?: string;
    stderr?: string;
    error?: string;
    skipped?: boolean;
    skipReason?: string;
};

/**
 * 검증 단계에서 나온 누락 루트만 설치합니다. 화이트리스트·개수 상한 적용.
 */
export async function installMissingNpmPackages(
    projectRoot: string,
    missingRoots: string[]
): Promise<InstallMissingNpmPackagesResult> {
    if (!isAutoInstallNpmDepsEnabled()) {
        return {
            ok: false,
            command: '',
            manager: 'npm',
            packages: [],
            skipped: true,
            skipReason: 'BASALT_AUTO_INSTALL_NPM_DEPS disabled',
        };
    }

    const packages = sanitizeNpmPackageRoots(missingRoots);
    if (packages.length === 0) {
        return {
            ok: false,
            command: '',
            manager: 'npm',
            packages: [],
            skipped: true,
            skipReason: 'no valid package names after sanitize',
        };
    }

    const manager = detectPackageManagerKind(projectRoot);
    const quoted = packages.map((p) => (p.includes(' ') ? `"${p.replace(/"/g, '\\"')}"` : p));
    let command: string;
    if (manager === 'pnpm') {
        command = `pnpm add ${quoted.join(' ')}`;
    } else if (manager === 'yarn') {
        command = `yarn add ${quoted.join(' ')}`;
    } else {
        command = `npm install ${quoted.join(' ')} --save --no-fund --no-audit`;
    }

    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: projectRoot,
            maxBuffer: 20 * 1024 * 1024,
            timeout: INSTALL_TIMEOUT_MS,
        });
        return {
            ok: true,
            command,
            manager,
            packages,
            stdout: typeof stdout === 'string' ? stdout.slice(0, 8000) : undefined,
            stderr: typeof stderr === 'string' ? stderr.slice(0, 4000) : undefined,
        };
    } catch (e: unknown) {
        const err = e as { message?: string; stdout?: string; stderr?: string };
        return {
            ok: false,
            command,
            manager,
            packages,
            error: err.message || String(e),
            stdout: typeof err.stdout === 'string' ? err.stdout.slice(0, 4000) : undefined,
            stderr: typeof err.stderr === 'string' ? err.stderr.slice(0, 4000) : undefined,
        };
    }
}
