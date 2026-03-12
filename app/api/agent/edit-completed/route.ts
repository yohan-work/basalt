import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';

const EDIT_LOCK_KEY = 'editInProgress';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId, instructions } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }
        if (!instructions || typeof instructions !== 'string' || !instructions.trim()) {
            return NextResponse.json({ error: 'instructions is required' }, { status: 400 });
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
                { error: `Task must be testing, review, or done to edit (current: ${status})` },
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

        const fileChanges = metadata.fileChanges as Array<{ filePath: string; after: string }> | undefined;
        if (!fileChanges || fileChanges.length === 0) {
            return NextResponse.json(
                { error: 'No file changes in this task to edit' },
                { status: 400 }
            );
        }

        // Lock
        await supabase
            .from('Tasks')
            .update({
                metadata: { ...metadata, [EDIT_LOCK_KEY]: true }
            })
            .eq('id', taskId);

        try {
            const context = fileChanges
                .map(f => `--- ${f.filePath} ---\n${f.after}`)
                .join('\n\n');

            const prompt = `User instructions: ${instructions.trim()}\n\nApply these instructions to the relevant file(s). Output ONLY the modified file(s) in this exact format (no other text):\n\nFile: <path>\n\`\`\`<lang>\n<content>\n\`\`\`\n\nPreserve file paths and only change what the user asked. If multiple files need changes, output each in the same format.`;

            const codeResult = await llm.generateCode(prompt, context);
            if (codeResult.error || !codeResult.files?.length) {
                throw new Error(codeResult.content || 'No modified files generated');
            }

            const existingChanges = (metadata.fileChanges || []) as Array<{
                filePath: string;
                before: string | null;
                after: string;
                isNew: boolean;
                agent: string;
                stepIndex: number;
            }>;

            for (const file of codeResult.files) {
                const writeResult = await skills.write_code(file.path, file.content, projectPath);
                if (writeResult && typeof writeResult === 'object' && 'filePath' in writeResult) {
                    const wr = writeResult as { filePath: string; before: string | null; after: string; isNew: boolean };
                    existingChanges.push({
                        filePath: wr.filePath,
                        before: wr.before,
                        after: wr.after,
                        isNew: wr.isNew,
                        agent: 'user-edit',
                        stepIndex: -1
                    });
                }
            }

            const { error: updateErr } = await supabase
                .from('Tasks')
                .update({
                    metadata: {
                        ...metadata,
                        fileChanges: existingChanges,
                        [EDIT_LOCK_KEY]: undefined
                    }
                })
                .eq('id', taskId);

            if (updateErr) {
                console.error('[edit-completed] Failed to update metadata:', updateErr);
            }

            return NextResponse.json({
                success: true,
                message: `Applied edits to ${codeResult.files.length} file(s)`,
                filesModified: codeResult.files.map(f => f.path)
            });
        } finally {
            // Ensure lock is cleared on failure
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
            const meta = (current?.metadata || {}) as Record<string, unknown>;
            if (meta[EDIT_LOCK_KEY]) {
                await supabase
                    .from('Tasks')
                    .update({
                        metadata: { ...meta, [EDIT_LOCK_KEY]: undefined }
                    })
                    .eq('id', taskId);
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[edit-completed]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
