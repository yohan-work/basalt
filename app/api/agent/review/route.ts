import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }

        const { data: task, error: taskError } = await supabase
            .from('Tasks')
            .select('id, description, project_id, metadata')
            .eq('id', taskId)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        let projectPath = process.cwd();
        const projectId = (task as { project_id?: string }).project_id;
        if (projectId) {
            const { data: project } = await supabase
                .from('Projects')
                .select('path')
                .eq('id', projectId)
                .single();
            if (project?.path) projectPath = (project as { path: string }).path;
        }

        const metadata = ((task as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
        const fileChanges = metadata.fileChanges as Array<{ filePath: string; after: string }> | undefined;

        let codeToReview = '';
        const context = (task as { description?: string }).description || '';

        if (fileChanges?.length) {
            codeToReview = fileChanges
                .map((fc) => `--- ${fc.filePath} ---\n${fc.after}`)
                .join('\n\n');
        } else {
            const dirList = await skills.list_directory('.', projectPath);
            const str = typeof dirList === 'string' ? dirList : JSON.stringify(dirList);
            if (str.includes('package.json')) {
                const pkg = await skills.read_codebase('package.json', projectPath);
                codeToReview = `package.json:\n${pkg}\n\n`;
            }
            const appDir = await skills.list_directory('app', projectPath).catch(() => '');
            if (typeof appDir === 'string' && appDir.length) codeToReview += `app/ listing: ${appDir}\n`;
        }

        if (!codeToReview.trim()) {
            return NextResponse.json({ error: 'No code to review for this task' }, { status: 400 });
        }

        const executeSkill = (skills as { execute_skill?: (name: string, inputs: unknown, ctx?: string) => Promise<unknown> }).execute_skill;
        if (!executeSkill) {
            return NextResponse.json({ error: 'execute_skill not available' }, { status: 500 });
        }

        const reviewResult = await executeSkill('deep_code_review', {
            codeToReview: codeToReview.slice(0, 30000),
            context,
        }, '');

        const reviewText = typeof reviewResult === 'string'
            ? reviewResult
            : (reviewResult && typeof (reviewResult as { content?: string }).content === 'string')
                ? (reviewResult as { content: string }).content
                : (reviewResult && typeof (reviewResult as { result?: unknown }).result === 'string')
                    ? (reviewResult as { result: string }).result
            : (reviewResult && typeof (reviewResult as { message?: string }).message === 'string')
                ? (reviewResult as { message: string }).message
                : JSON.stringify(reviewResult);

        await supabase
            .from('Tasks')
            .update({
                metadata: { ...metadata, reviewResult: reviewText, reviewAt: new Date().toISOString() },
            })
            .eq('id', taskId);

        return NextResponse.json({ success: true, review: reviewText });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[review]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
