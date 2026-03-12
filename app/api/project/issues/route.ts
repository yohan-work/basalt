import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitHubIssue {
    number: number;
    title: string;
    body: string | null;
    url: string;
    state: string;
}

async function getRepoFromPath(projectPath: string): Promise<{ owner: string; repo: string } | null> {
    try {
        const { stdout } = await execAsync('git remote get-url origin', { cwd: projectPath });
        const url = (stdout || '').trim();
        const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
        if (match) return { owner: match[1], repo: match[2] };
    } catch {
        // no git or no remote
    }
    return null;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');
        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            return NextResponse.json(
                { issues: [], message: 'GITHUB_TOKEN not set. Set it in .env.local to enable GitHub issues.' },
                { status: 200 }
            );
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
        const repo = await getRepoFromPath(projectPath);
        if (!repo) {
            return NextResponse.json(
                { issues: [], message: 'No GitHub remote found for this project.' },
                { status: 200 }
            );
        }

        const res = await fetch(
            `https://api.github.com/repos/${repo.owner}/${repo.repo}/issues?state=open&per_page=30`,
            {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        if (!res.ok) {
            const text = await res.text();
            console.error('[project/issues] GitHub API error:', res.status, text);
            return NextResponse.json(
                { issues: [], error: `GitHub API error: ${res.status}` },
                { status: 200 }
            );
        }
        const data = await res.json();
        const issues: GitHubIssue[] = (data || [])
            .filter((i: { pull_request?: unknown }) => !i.pull_request)
            .map((i: { number: number; title: string; body: string | null; html_url: string; state: string }) => ({
                number: i.number,
                title: i.title,
                body: i.body,
                url: i.html_url,
                state: i.state,
            }));

        return NextResponse.json({ issues });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[project/issues]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
