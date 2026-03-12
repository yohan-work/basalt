import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, issueNumber, title: titleOverride, body: bodyOverride } = body;

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
        let title: string;
        let description: string;

        if (titleOverride && bodyOverride) {
            title = titleOverride;
            description = bodyOverride;
        } else if (issueNumber != null) {
            const token = process.env.GITHUB_TOKEN;
            if (!token) {
                return NextResponse.json({ error: 'GITHUB_TOKEN required to fetch issue by number' }, { status: 400 });
            }
            const repo = await getRepoFromPath(projectPath);
            if (!repo) {
                return NextResponse.json({ error: 'No GitHub remote for this project' }, { status: 400 });
            }
            const res = await fetch(
                `https://api.github.com/repos/${repo.owner}/${repo.repo}/issues/${issueNumber}`,
                {
                    headers: {
                        Accept: 'application/vnd.github.v3+json',
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return NextResponse.json(
                    { error: err.message || `GitHub API error: ${res.status}` },
                    { status: res.status === 404 ? 404 : 400 }
                );
            }
            const issue = await res.json();
            title = issue.title || `Issue #${issueNumber}`;
            description = (issue.body || '') + `\n\n---\n관련 이슈: ${issue.html_url || ''}`;
        } else {
            return NextResponse.json({ error: 'Provide issueNumber or both title and body' }, { status: 400 });
        }

        const { data: newTask, error: insertError } = await supabase
            .from('Tasks')
            .insert({
                title: title.trim(),
                description: description.trim(),
                status: 'pending',
                project_id: projectId,
            })
            .select('id, title')
            .single();

        if (insertError) {
            console.error('[create-task-from-issue]', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            taskId: (newTask as { id: string }).id,
            title: (newTask as { title: string }).title,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[create-task-from-issue]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
