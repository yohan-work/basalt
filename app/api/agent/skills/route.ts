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
        const { skillName, args } = body;

        if (!skillName || typeof skillName !== 'string') {
            return NextResponse.json({ error: 'Invalid skillName' }, { status: 400 });
        }

        const skillFunction = (skills as any)[skillName];

        let result;

        if (skillFunction) {
            // Execute the TS skill function
            // Supports passing args as array (for spread) or single object/value
            if (Array.isArray(args)) {
                result = await skillFunction(...args);
            } else {
                result = await skillFunction(args);
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
