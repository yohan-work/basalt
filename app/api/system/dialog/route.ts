
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
    try {
        // Only for Mac for now
        if (process.platform !== 'darwin') {
            return NextResponse.json({ error: 'Only supported on macOS' }, { status: 400 });
        }

        // Ensure the prompt is distinct
        const script = `osascript -e 'POSIX path of (choose folder with prompt "Select Project Folder (Agent Workspace)")'`;

        const { stdout } = await execAsync(script);
        return NextResponse.json({ path: stdout.trim() });
    } catch (error: any) {
        // User cancelled
        if (error.message && error.message.includes('(-128)')) {
            return NextResponse.json({ cancelled: true });
        }
        console.error('Dialog Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
