import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { resolveQaPageUrlWithDiagnostics } from '@/lib/project-dev-server';

/**
 * 태스크 메타·변경 파일 휴리스틱으로 대상 앱 dev 미리보기 URL을 계산합니다.
 * (QA 파이프라인의 resolveQaPageUrl과 동일한 규칙)
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const taskId = searchParams.get('taskId');

        if (!taskId) {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }

        const { data: task, error: taskErr } = await supabase
            .from('Tasks')
            .select('project_id, metadata')
            .eq('id', taskId)
            .single();

        if (taskErr || !task?.project_id) {
            return NextResponse.json({ error: 'Task not found or has no project' }, { status: 404 });
        }

        const { data: project, error: projErr } = await supabase
            .from('Projects')
            .select('path')
            .eq('id', task.project_id)
            .single();

        if (projErr || !project?.path) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const projectPath = (project as { path: string }).path;
        const metadata = (task.metadata && typeof task.metadata === 'object' ? task.metadata : {}) as Record<
            string,
            unknown
        >;

        const { url, inferenceWarning } = resolveQaPageUrlWithDiagnostics(projectPath, metadata);

        return NextResponse.json({
            url,
            inferenceWarning: inferenceWarning ?? null,
            projectId: task.project_id,
        });
    } catch (err) {
        console.error('task-preview-url error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
