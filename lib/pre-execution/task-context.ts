import { supabase } from '@/lib/supabase';
import { ProjectProfiler } from '@/lib/profiler';

const MAX_SNIPPET = 12_000;

/**
 * 플랜·명확화 LLM에 넣을 프로젝트 맥락 문자열. 실패 시 빈 문자열.
 */
export async function getCodebaseSnippetForTask(taskId: string): Promise<{ projectPath: string; snippet: string }> {
    let projectPath = process.cwd();
    let snippet = '';

    try {
        const { data: task, error: taskErr } = await supabase.from('Tasks').select('project_id').eq('id', taskId).single();
        if (taskErr || !task?.project_id) {
            return { projectPath, snippet: '' };
        }
        const { data: project, error: projErr } = await supabase.from('Projects').select('path').eq('id', task.project_id).single();
        if (projErr || !project?.path) {
            return { projectPath, snippet: '' };
        }
        projectPath = project.path;
        const profiler = new ProjectProfiler(projectPath);
        snippet = await profiler.getContextString();
        if (snippet.length > MAX_SNIPPET) {
            snippet = `${snippet.slice(0, MAX_SNIPPET)}\n...[truncated]`;
        }
    } catch {
        snippet = '';
    }

    return { projectPath, snippet };
}
