import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';

const EDIT_LOCK_KEY = 'editInProgress';

/**
 * Direct file patch (no LLM).
 * Use for simple text/code edits from the diff viewer.
 * Body: { taskId, filePath, content }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId, filePath, content } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }
        if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
            return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
        }
        if (typeof content !== 'string') {
            return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
        }

        const { data: task, error: taskError } = await supabase
            .from('Tasks')
            .select('id, status, project_id, metadata')
            .eq('id', taskId)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const status = (task as { status: string }).status;
        const allowedStatuses = ['testing', 'review', 'done'];
        if (!allowedStatuses.includes(status)) {
            return NextResponse.json(
                { error: `Task must be testing, review, or done to patch file (current: ${status})` },
                { status: 400 }
            );
        }

        const metadata = ((task as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
        if (metadata[EDIT_LOCK_KEY]) {
            return NextResponse.json(
                { error: 'Another edit is already in progress for this task' },
                { status: 409 }
            );
        }

        let projectPath = process.cwd();
        const projectId = (task as { project_id?: string }).project_id;
        if (projectId) {
            const { data: project, error: projError } = await supabase
                .from('Projects')
                .select('path')
                .eq('id', projectId)
                .single();
            if (!projError && project?.path) {
                projectPath = (project as { path: string }).path;
            }
        }

        const fileChanges = (metadata.fileChanges || []) as Array<{
            filePath: string;
            before: string | null;
            after: string;
            isNew: boolean;
            agent: string;
            stepIndex: number;
        }>;

        const targetPath = filePath.trim();
        const matchingIndex = fileChanges.map((f) => f.filePath).lastIndexOf(targetPath);
        if (matchingIndex === -1) {
            return NextResponse.json(
                { error: `File ${targetPath} not found in this task's changes` },
                { status: 400 }
            );
        }

        await supabase
            .from('Tasks')
            .update({ metadata: { ...metadata, [EDIT_LOCK_KEY]: true } })
            .eq('id', taskId);

        try {
            const writeResult = await skills.write_code(targetPath, content, projectPath);
            if (!writeResult || typeof writeResult !== 'object' || !('filePath' in writeResult)) {
                throw new Error('Failed to write file');
            }

            const updated = [...fileChanges];
            updated[matchingIndex] = {
                ...updated[matchingIndex],
                after: content,
                agent: 'user-edit',
            };

            await supabase
                .from('Tasks')
                .update({
                    metadata: {
                        ...metadata,
                        fileChanges: updated,
                        [EDIT_LOCK_KEY]: undefined,
                    },
                })
                .eq('id', taskId);

            return NextResponse.json({
                success: true,
                message: `Patched ${targetPath}`,
                filePath: targetPath,
                fileChanges: updated,
            });
        } finally {
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
            const meta = (current?.metadata || {}) as Record<string, unknown>;
            if (meta[EDIT_LOCK_KEY]) {
                await supabase
                    .from('Tasks')
                    .update({
                        metadata: { ...meta, [EDIT_LOCK_KEY]: undefined },
                    })
                    .eq('id', taskId);
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[patch-file]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
