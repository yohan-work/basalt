import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { inferDevServerFromProjectPath } from '@/lib/project-dev-server';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');

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

        const inferred = inferDevServerFromProjectPath(projectPath);
        if (inferred) {
            const url = `http://localhost:${inferred.port}`;
            return NextResponse.json({ port: inferred.port, url, inferred: inferred.inferred });
        }

        return NextResponse.json(
            { port: null, url: '', inferred: false, error: 'Could not infer dev server port from package.json' },
            { status: 200 }
        );
    } catch (err) {
        console.error('dev-server-info error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
