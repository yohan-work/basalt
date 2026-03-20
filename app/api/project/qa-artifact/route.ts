import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { supabase } from '@/lib/supabase';
import { getQaArtifactFilePath } from '@/lib/qa/artifact-paths';
import { isQaArtifactSlot } from '@/lib/qa/artifact-slots';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const taskId = searchParams.get('taskId');
        const slot = searchParams.get('slot');

        if (!taskId || !slot) {
            return NextResponse.json({ error: 'taskId and slot are required' }, { status: 400 });
        }

        if (!isQaArtifactSlot(slot)) {
            return NextResponse.json({ error: 'invalid slot' }, { status: 400 });
        }

        const { data: task, error: taskError } = await supabase
            .from('Tasks')
            .select('project_id')
            .eq('id', taskId)
            .single();

        if (taskError || !task?.project_id) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const { data: project, error: projError } = await supabase
            .from('Projects')
            .select('path')
            .eq('id', task.project_id)
            .single();

        if (projError || !project?.path) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const projectPath = project.path as string;
        const filePath = getQaArtifactFilePath(projectPath, taskId, slot);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
        }

        const buf = await fs.promises.readFile(filePath);
        return new NextResponse(buf, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'private, max-age=3600',
            },
        });
    } catch (err) {
        console.error('qa-artifact error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
