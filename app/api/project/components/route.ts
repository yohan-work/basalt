import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export interface ComponentItem {
    filePath: string;
    displayName: string;
}

function listComponentFiles(dirPath: string, baseDir: string): Array<{ filePath: string; displayName: string }> {
    const result: Array<{ filePath: string; displayName: string }> = [];
    if (!fs.existsSync(dirPath)) return result;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            result.push(...listComponentFiles(fullPath, baseDir));
        } else if (entry.isFile() && /\.(tsx|jsx)$/i.test(entry.name)) {
            const displayName = entry.name.replace(/\.(tsx|jsx)$/i, '');
            result.push({ filePath: relativePath, displayName });
        }
    }
    return result;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');
        const taskId = searchParams.get('taskId');

        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        const { data: project, error: projError } = await supabase
            .from('Projects')
            .select('path')
            .eq('id', projectId)
            .single();

        if (projError || !project?.path) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const projectPath = (project as { path: string }).path;
        const components: ComponentItem[] = [];

        // 1. From project filesystem: components folder
        const componentsDir = path.join(projectPath, 'components');
        const fromFs = listComponentFiles(componentsDir, projectPath);
        components.push(...fromFs);

        // 2. Optionally from a task's fileChanges (e.g. completed task's output)
        if (taskId) {
            const { data: task, error: taskError } = await supabase
                .from('Tasks')
                .select('metadata')
                .eq('id', taskId)
                .single();

            if (!taskError && task?.metadata) {
                const meta = task.metadata as { fileChanges?: Array<{ filePath: string }> };
                const fileChanges = meta.fileChanges || [];
                const seen = new Set(components.map(c => c.filePath));
                for (const fc of fileChanges) {
                    const fp = fc.filePath;
                    if (/\.(tsx|jsx)$/i.test(fp) && !seen.has(fp)) {
                        seen.add(fp);
                        const displayName = path.basename(fp).replace(/\.(tsx|jsx)$/i, '');
                        components.push({ filePath: fp, displayName });
                    }
                }
            }
        }

        return NextResponse.json({ components });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[project/components]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
