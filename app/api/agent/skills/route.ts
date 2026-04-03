import { NextRequest, NextResponse } from 'next/server';
import * as skills from '@/lib/skills';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { listSkillRegistryEntries } from '@/lib/skills/registry';
import { validateSkillArgsBeforeExecution } from '@/lib/skills/arg-schemas';
import { assertPathInsideProjectRoot } from '@/lib/path-sandbox';

const execFileAsync = promisify(execFile);

const ALLOWED_SKILLS = new Set(listSkillRegistryEntries().map((x) => x.name));

function normalizeArgs(args: unknown): unknown[] {
    return Array.isArray(args) ? args : args === undefined ? [] : [args];
}

function resolveApiProjectPath(projectPath?: string): string | undefined {
    if (typeof projectPath !== 'string' || !projectPath.trim()) return undefined;
    const resolved = path.resolve(projectPath.trim());
    if (!fs.existsSync(resolved)) {
        throw new Error(`projectPath does not exist: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        throw new Error(`projectPath must be a directory: ${resolved}`);
    }
    // Always block obvious traversal attempts when a relative path was given.
    assertPathInsideProjectRoot(resolved, resolved, 'projectPath');
    return resolved;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { skillName, args, projectPath } = body;

        if (!skillName || typeof skillName !== 'string') {
            return NextResponse.json({ error: 'Invalid skillName' }, { status: 400 });
        }
        if (!ALLOWED_SKILLS.has(skillName)) {
            return NextResponse.json({ error: `Skill "${skillName}" is not in allowlist` }, { status: 403 });
        }

        const skillFunction = (skills as any)[skillName];
        const safeProjectPath = resolveApiProjectPath(projectPath);
        const validatedArgs = validateSkillArgsBeforeExecution(skillName, normalizeArgs(args));

        let result;

        if (skillFunction) {
            // For write_code: if projectPath is provided and args has 2 elements [filePath, content], append projectPath as baseDir
            let finalArgs = [...validatedArgs];
            if (skillName === 'write_code' && safeProjectPath) {
                if (Array.isArray(finalArgs) && finalArgs.length === 2) {
                    finalArgs = [finalArgs[0], finalArgs[1], safeProjectPath];
                }
            }
            if (Array.isArray(finalArgs)) {
                result = await skillFunction(...finalArgs);
            } else {
                result = await skillFunction(finalArgs);
            }
        } else {
            if (!['1', 'true', 'yes'].includes(String(process.env.BASALT_ENABLE_SCRIPT_SKILL_FALLBACK || '').toLowerCase())) {
                return NextResponse.json({ error: 'Script skill fallback is disabled' }, { status: 403 });
            }
            // Modular Asset Fallback: Check for scripts/run.sh
            const scriptPath = path.join(process.cwd(), 'lib', 'skills', skillName, 'scripts', 'run.sh');
            if (fs.existsSync(scriptPath)) {
                const scriptArgs = validatedArgs.map((a) => String(a));
                const { stdout, stderr } = await execFileAsync('bash', [scriptPath, ...scriptArgs]);
                if (stderr && !stdout) {
                     console.warn(`[Skill API] Script stderr for ${skillName}: ${stderr}`);
                }
                result = stdout;
            } else {
                return NextResponse.json({ error: `Skill ${skillName} not found (No TS function or scripts/run.sh)` }, { status: 404 });
            }
        }

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
