import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';

const MODIFY_LOCK_KEY = 'modifyElementInProgress';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId, filePath, elementDescriptor, request: userRequest } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }
        const descriptor = typeof elementDescriptor === 'string'
            ? elementDescriptor.trim()
            : (elementDescriptor?.text ?? '').trim() || String(elementDescriptor ?? '').trim();
        const requestText = typeof userRequest === 'string' ? userRequest.trim() : '';
        if (!requestText) {
            return NextResponse.json({ error: 'request is required (e.g. "component 요소를 제거해줘")' }, { status: 400 });
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
                { error: `Task must be testing, review, or done to modify element (current: ${status})` },
                { status: 400 }
            );
        }

        const metadata = ((task as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
        if (metadata[MODIFY_LOCK_KEY]) {
            return NextResponse.json(
                { error: 'Another element modification is already in progress for this task' },
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
        let targetPath: string;
        let currentContent: string;

        if (filePath && typeof filePath === 'string' && filePath.trim()) {
            targetPath = filePath.trim();
            const readResult = await skills.read_codebase(targetPath, projectPath);
            if (typeof readResult !== 'string' || readResult.startsWith('File "')) {
                return NextResponse.json({ error: `File not found: ${targetPath}` }, { status: 400 });
            }
            currentContent = readResult;
        } else if (fileChanges?.length) {
            // Use first changed file if no filePath provided
            targetPath = fileChanges[0].filePath;
            currentContent = fileChanges[0].after;
        } else {
            return NextResponse.json({ error: 'No file to modify. Provide filePath or ensure task has file changes.' }, { status: 400 });
        }

        await supabase
            .from('Tasks')
            .update({ metadata: { ...metadata, [MODIFY_LOCK_KEY]: true } })
            .eq('id', taskId);

        try {
            const prompt = `You are modifying a single file. The user wants to change a specific element.

Element to find (describe which part of the UI/code): ${descriptor || 'the main visible element the user is referring to'}

User request: ${requestText}

Current file (path: ${targetPath}):

\`\`\`
${currentContent}
\`\`\`

Apply the user's request ONLY to the element described. Return the COMPLETE file content with that change. Output in this exact format and nothing else:

File: ${targetPath}
\`\`\`tsx
<entire modified file content>
\`\`\``;

            const context = `File path: ${targetPath}. Element: ${descriptor || 'unspecified'}. Request: ${requestText}.`;
            const codeResult = await llm.generateCode(prompt, context);

            if (codeResult.error || !codeResult.files?.length) {
                throw new Error(codeResult.content || 'No modified file generated');
            }

            const modified = codeResult.files.find(f => f.path === targetPath || f.path.endsWith(targetPath)) || codeResult.files[0];
            const writeResult = await skills.write_code(modified.path, modified.content, projectPath);
            if (!writeResult || typeof writeResult !== 'object' || !('filePath' in writeResult)) {
                throw new Error('Failed to write modified file');
            }

            const wr = writeResult as { filePath: string; before: string | null; after: string; isNew: boolean };
            const existingChanges = (metadata.fileChanges || []) as Array<{
                filePath: string;
                before: string | null;
                after: string;
                isNew: boolean;
                agent: string;
                stepIndex: number;
            }>;
            existingChanges.push({
                filePath: wr.filePath,
                before: wr.before,
                after: wr.after,
                isNew: wr.isNew,
                agent: 'user-edit-element',
                stepIndex: -1
            });

            await supabase
                .from('Tasks')
                .update({
                    metadata: {
                        ...metadata,
                        fileChanges: existingChanges,
                        [MODIFY_LOCK_KEY]: undefined
                    }
                })
                .eq('id', taskId);

            return NextResponse.json({
                success: true,
                message: `Modified element in ${wr.filePath}`,
                filePath: wr.filePath
            });
        } finally {
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
            const meta = (current?.metadata || {}) as Record<string, unknown>;
            if (meta[MODIFY_LOCK_KEY]) {
                await supabase
                    .from('Tasks')
                    .update({ metadata: { ...meta, [MODIFY_LOCK_KEY]: undefined } })
                    .eq('id', taskId);
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[modify-element]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
