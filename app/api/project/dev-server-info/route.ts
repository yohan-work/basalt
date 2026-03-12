import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

const DEFAULT_PORTS: Record<string, number> = {
    'next': 3001,
    'vite': 5173,
    'react-scripts': 3001,
    'webpack': 3001,
};

/**
 * Infer dev server port from package.json "scripts"."dev".
 * Handles: next dev, vite, react-scripts start, and --port / -p overrides.
 */
function inferPortFromPackageJson(projectPath: string): { port: number; inferred: boolean } | null {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const devScript = typeof pkg.scripts?.dev === 'string' ? pkg.scripts.dev : '';
        if (!devScript) return null;

        const script = devScript.trim();

        // Explicit --port or -p
        const portMatch = script.match(/(?:--port|-p)\s+(\d+)/);
        if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            if (port > 0 && port < 65536) return { port, inferred: false };
        }

        // Framework defaults
        if (script.includes('next')) return { port: DEFAULT_PORTS['next'], inferred: true };
        if (script.includes('vite')) return { port: DEFAULT_PORTS['vite'], inferred: true };
        if (script.includes('react-scripts')) return { port: DEFAULT_PORTS['react-scripts'], inferred: true };
        if (script.includes('webpack')) return { port: DEFAULT_PORTS['webpack'], inferred: true };

        return null;
    } catch {
        return null;
    }
}

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

        const inferred = inferPortFromPackageJson(projectPath);
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
