import { NextRequest, NextResponse } from 'next/server';
import * as skills from '@/lib/skills';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { skillName, args, projectPath } = body;

        if (!skillName || typeof skillName !== 'string') {
            return NextResponse.json({ error: 'Invalid skillName' }, { status: 400 });
        }

        const skillFunction = (skills as any)[skillName];

        let result;

        if (skillFunction) {
            // For write_code: if projectPath is provided and args has 2 elements [filePath, content], append projectPath as baseDir
            let finalArgs = Array.isArray(args) ? [...args] : args;
            if (skillName === 'write_code' && typeof projectPath === 'string' && projectPath.trim()) {
                if (Array.isArray(finalArgs) && finalArgs.length === 2) {
                    finalArgs = [finalArgs[0], finalArgs[1], projectPath.trim()];
                }
            }
            if (Array.isArray(finalArgs)) {
                result = await skillFunction(...finalArgs);
            } else {
                result = await skillFunction(finalArgs);
            }
        } else {
            // Modular Asset Fallback: Check for scripts/run.sh
            const scriptPath = path.join(process.cwd(), 'lib', 'skills', skillName, 'scripts', 'run.sh');
            if (fs.existsSync(scriptPath)) {
                // Pass arguments to the bash script safely
                const argsArray = Array.isArray(args) ? args : [args];
                // Escape quotes for bash
                const argsString = argsArray.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
                
                const { stdout, stderr } = await execAsync(`bash "${scriptPath}" ${argsString}`);
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
