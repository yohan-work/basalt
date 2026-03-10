
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';
import { AgentLoader, AgentDefinition } from '../agent-loader';
import { ContextManager } from '../context-manager';
import { StreamEmitter } from '../stream-emitter';
import { ProjectProfiler } from '../profiler';
import { MODEL_CONFIG } from '../model-config';

interface AgentTask {
    id: string; // Supabase UUID
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done' | 'failed';
    metadata?: any; // JSONB for storing plan, workflow, results
}

interface ErrorMetadata {
    lastError: string;
    failedStep: number;
    failedAction: string;
    failedAgent: string;
    retryCount: number;
    failedAt: string;
    previousStatus: string;
}

interface ProgressInfo {
    currentStep: number;      // 현재 실행 중인 step (0-based)
    totalSteps: number;       // 전체 step 수
    currentAction: string;    // 현재 실행 중인 action 이름
    currentAgent: string;     // 현재 담당 agent 이름
    completedSteps: string[]; // 완료된 step action 목록
    startedAt?: string;       // 실행 시작 시간
    stepStatus: 'pending' | 'running' | 'completed' | 'failed'; // 현재 step 상태
}

export class Orchestrator {
    private taskId: string;
    private mainAgentDef: AgentDefinition;
    private contextManager: ContextManager;
    private profiler: ProjectProfiler;
    private emitter: StreamEmitter | null;

    // Simple in-memory lock to prevent concurrent executions of the same task
    private static runningTasks = new Set<string>();

    constructor(taskId: string, emitter?: StreamEmitter) {
        this.taskId = taskId;
        this.mainAgentDef = AgentLoader.loadAgent('main-agent');
        this.contextManager = new ContextManager(taskId);
        this.profiler = new ProjectProfiler(process.cwd()); // Default to current dir
        this.emitter = emitter || null;
    }

    private async log(agentName: string, message: string, metadata: any = {}) {
        console.log(`[${agentName}] ${message}`, metadata);
        try {
            await supabase.from('Execution_Logs').insert({
                task_id: this.taskId,
                agent_role: agentName,
                message: message,
                metadata: metadata,
                created_at: new Date().toISOString()
            });
        } catch (e: any) {
            console.error('Supabase Log Error:', e);
        }
    }

    private async updateStatus(status: AgentTask['status']) {
        try {
            await supabase.from('Tasks').update({ status }).eq('id', this.taskId);
        } catch (e: any) {
            console.error('Supabase Status Update Error:', e);
        }
    }

    private async updateMetadata(data: any) {
        try {
            // Fetch current metadata first to merge? Or just upsert?
            // Since we don't have existing metadata in memory, let's just fetch and merge or just update top level keys
            // Simplify: We assume 'data' is the partial update
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
            const newMetadata = { ...(current?.metadata || {}), ...data };

            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);
        } catch (e: any) {
            console.error('Supabase Metadata Update Error:', e);
        }
    }

    private async updateProgress(progress: Partial<ProgressInfo>) {
        try {
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
            const currentProgress = current?.metadata?.progress || {};
            const newProgress: ProgressInfo = {
                ...currentProgress,
                ...progress
            };
            await supabase.from('Tasks').update({
                metadata: { ...(current?.metadata || {}), progress: newProgress }
            }).eq('id', this.taskId);
        } catch (e: any) {
            console.error('Supabase Progress Update Error:', e);
        }
    }

    private async getTask(): Promise<AgentTask | null> {
        const { data, error } = await supabase.from('Tasks').select('*').eq('id', this.taskId).single();
        if (error || !data) return null;
        return data as AgentTask;
    }

    private getSkillFunction(skillName: string) {
        return (skills as any)[skillName];
    }

    // --- Phase 1: Planning ---
    public async plan(taskDescription: string) {
        try {
            const mainAgentName = this.mainAgentDef.name;
            await this.log(mainAgentName, `Initialized Planning Phase.`);
            await this.updateStatus('planning');
            this.emitter?.emit({ type: 'phase_start', phase: 'planning', taskId: this.taskId });

            // Fetch Project Path if available
            let projectPath = process.cwd();
            let codebaseContext = '';

            const task = await this.getTask();
            if (task && (task as any).project_id) {
                const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
                if (project?.path) {
                    projectPath = project.path;
                    this.profiler = new ProjectProfiler(projectPath);
                    await this.log(mainAgentName, `Scanning project at: ${projectPath}`, { type: 'System' });

                    try {
                        const profilerContext = await this.profiler.getContextString();
                        codebaseContext = profilerContext;

                        // Also Add package.json explicitly for more depth if needed
                        const pkgJson = await skills.read_codebase('package.json', projectPath);
                        this.contextManager.addFile('package.json', pkgJson);
                    } catch (error: any) {
                        await this.log(mainAgentName, `Initial scan failed: ${error.message}`, { type: 'WARNING' });
                    }
                }
            }

            // Load all available agents
            const availableAgents = AgentLoader.listAgents();
            await this.log(mainAgentName, `Loaded ${availableAgents.length} potential agents.`);

            // Analyze with context
            this.emitter?.emit({ type: 'skill_execute', skill: 'analyze_task' });
            const analysis = await skills.analyze_task(taskDescription, availableAgents, codebaseContext, this.emitter);
            await this.log(mainAgentName, 'Task Analysis Completed', analysis);
            this.emitter?.emit({ type: 'skill_result', skill: 'analyze_task', summary: analysis.summary || 'Analysis complete' });

            // Create Workflow with context
            this.emitter?.emit({ type: 'skill_execute', skill: 'create_workflow' });

            // Inject consultation process - Agent Discussion Simulation
            await this.log(mainAgentName, "에이전트 그룹 논의 시작: 작업 범위를 확정하고 최적의 실행 계획을 수립합니다.", { type: 'THOUGHT' });
            this.emitter?.emit({ type: 'skill_execute', skill: 'consult_agents' });

            const discussion = await skills.consult_agents(analysis, availableAgents, codebaseContext, this.emitter);

            // Log each individual thought from the discussion
            console.log(`[Orchestrator] Saving ${discussion.length} discussion items to DB...`);
            for (const item of discussion) {
                if (!item.agent || !item.thought) continue;
                console.log(`[Orchestrator] Logging thought from ${item.agent}: ${item.thought.substring(0, 30)}...`);
                await this.log(item.agent, item.thought, { type: 'THOUGHT', thought_type: item.type || 'idea' });
                // Small delay to make it feel more natural in the UI if needed
                await new Promise(resolve => setTimeout(resolve, 300));
            }


            const workflow = await skills.create_workflow(analysis, availableAgents, codebaseContext, this.emitter);

            // Log the discussion wrap-up in Korean
            await this.log(mainAgentName, '에이전트 간 협의가 완료되었습니다. 수립된 워크플로우를 저장합니다.', workflow);
            this.emitter?.emit({ type: 'skill_result', skill: 'create_workflow', summary: `${workflow.steps?.length || 0}개 단계의 워크플로우가 생성되었습니다.` });


            // Save Plan to Metadata
            await this.updateMetadata({ analysis, workflow });

            // Wait for user confirmation
            await this.log(mainAgentName, 'Plan created. Waiting for user approval.');
            this.emitter?.emit({ type: 'done', status: 'planning_complete' });
        } catch (error: any) {
            await this.log('System', `Planning Phase Failed: ${error.message}`, { type: 'ERROR' });
            this.emitter?.emit({ type: 'error', message: error.message });
        }
    }

    // --- Phase 2: Execution ---

    // Skills that only need a file path or simple string — FAST model is sufficient
    private static readonly FAST_ARG_SKILLS = [
        'read_codebase', 'list_directory', 'check_environment', 'manage_git',
        'lint_code', 'typecheck', 'check_responsive'
    ];

    private async generateSkillArguments(
        skillName: string,
        taskDescription: string,
        projectPath: string,
        techStack: string,
        stepDescription?: string
    ): Promise<any[]> {
        const skillDef = AgentLoader.loadSkill(skillName);
        const inputsDef = skillDef.inputs ? `\nInputs Definition:\n${skillDef.inputs}` : '';

        // Get Optimized Context
        const dynamicContext = this.contextManager.getOptimizedContext(10000);

        // Route to FAST model for skills that just need a path/simple arg
        const model = Orchestrator.FAST_ARG_SKILLS.includes(skillName)
            ? MODEL_CONFIG.FAST_MODEL
            : MODEL_CONFIG.SMART_MODEL;

        const systemPrompt = `
You are an intelligent agent orchestrator.
Your goal is to generate the exact arguments needed to call a TypeScript function for a specific skill.

Skill Name: ${skillName}
Skill Instructions: ${skillDef.instructions}
${inputsDef}

Current Step Goal: ${stepDescription || taskDescription}
Overall Task: ${taskDescription}
Project Path: ${projectPath}
Tech Stack: ${techStack}

${await this.profiler.getContextString()}

${dynamicContext}

IMPORTANT RULES:
1. MANDATORY: ALWAYS use relative paths from the project root. DO NOT start with "/".
   GOOD: "app/some-feature/page.tsx", "components/Button.tsx", "src/utils/helpers.ts"
   BAD: "/app/some-feature/page.tsx", "/Users/yohan/projects/...", "/pages/login"
2. DO NOT include the Project Path in the arguments.
3. Generate ACTUAL values — NO placeholders like "filePath", "content".
4. Match the function signature exactly.
5. ROUTE MAPPING: When creating a new route page "[route-name]", ensure the file is generated inside the correct subfolder (e.g., "app/[route-name]/page.tsx"). DO NOT overwrite the root app/page.tsx.

Return ONLY a JSON object with a key "arguments" which is an array of actual values.
Example for read_codebase: { "arguments": ["package.json"] }
Example for write_code: { "arguments": ["app/some-feature/page.tsx", "export default function..."] }

IMPORTANT: All reasoning, documentation summaries, and user-facing messages MUST be in KOREAN.
중요: 모든 분석 결과와 설명, 메시지는 한국어로 작성하세요.
`;


        try {
            const response = await llm.generateJSONStream(
                systemPrompt,
                "Generate valid arguments for this skill based on the task.",
                '{ "arguments": [] }',
                this.emitter,
                model,
                () => this.refreshLock()
            );

            if (response.__tokens) {
                await this.accumulateTokens(response.__tokens.prompt_eval_count, response.__tokens.eval_count);
            }

            return response.arguments || [];
        } catch (e: any) {
            console.error(`Failed to generate arguments for ${skillName}`, e);
            return [];
        }
    }

    private async refreshLock() {
        try {
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
            const newMetadata = {
                ...(current?.metadata || {}),
                lock: {
                    held_since: Date.now(),
                    process_id: process.pid
                }
            };
            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);
            // console.log(`[System] Lock refreshed at ${new Date().toLocaleTimeString()}`);
        } catch (e) {
            console.error('Failed to refresh lock:', e);
        }
    }

    private async accumulateTokens(promptTokens: number, evalTokens: number) {
        try {
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
            const existingTokens = current?.metadata?.tokens || { prompt: 0, completion: 0, total: 0 };
            
            const newTokens = {
                prompt: existingTokens.prompt + promptTokens,
                completion: existingTokens.completion + evalTokens,
                total: existingTokens.total + promptTokens + evalTokens
            };

            const newMetadata = {
                ...(current?.metadata || {}),
                tokens: newTokens
            };
            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);

            // Emit token update to UI if needed
            this.emitter?.emit({ type: 'llm_token_usage', tokens: newTokens });
        } catch (e) {
            console.error('Failed to record token usage:', e);
        }
    }

    public async execute(startFromStep?: number) {
        try {
            // Check if task exists and its status
            const { data: task, error: fetchError } = await supabase.from('Tasks').select('*').eq('id', this.taskId).single();
            if (fetchError || !task) {
                console.error('Task not found:', this.taskId);
                this.emitter?.emit({ type: 'error', message: 'Task not found' });
                return;
            }

            // --- Persistent Lock Check ---
            const currentLock = task.metadata?.lock;
            const now = Date.now();
            const LOCK_TIMEOUT = 60_000;

            if (task.status === 'working' && currentLock) {
                const lockAge = now - currentLock.held_since;
                if (lockAge < LOCK_TIMEOUT) {
                    console.log(`[System] Execution blocked: Task is already active (Lock held since ${new Date(currentLock.held_since).toISOString()}).`, {});
                    this.emitter?.emit({ type: 'error', message: `Task is currently being processed by another instance (Lock age: ${Math.round(lockAge / 1000)}s)` });
                    return;
                } else {
                    console.log(`[System] Detected stale lock (${Math.round(lockAge / 1000)}s). Proceeding with execution takeover.`, {});
                }
            }

            // 2. Acquire/Refresh Lock
            await this.updateMetadata({
                lock: { held_since: now, process_id: process.pid }
            });

            // Prevent auto-resume if task already failed (unless explicitly called via retry)
            if (task.status === 'failed' && startFromStep === undefined) {
                await this.log('System', 'Task is in a failed state. Skipping auto-resume. Use retry.');
                this.emitter?.emit({ type: 'done', status: 'failed_auto_halt' });
                return;
            }

            // Determine where to start: explicit arg > saved progress > 0
            const lastStep = task.metadata?.progress?.currentStep;
            const resumeFrom = startFromStep !== undefined ? startFromStep : (lastStep !== undefined ? lastStep : 0);

            // Fetch Project Path if available
            let projectPath = process.cwd();
            if ((task as any).project_id) {
                const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
                if (project?.path) {
                    projectPath = project.path;
                    this.profiler = new ProjectProfiler(projectPath);
                    this.log('System', `Using Project Path: ${projectPath}`);
                }
            }

            const workflow = task.metadata.workflow;
            await this.updateStatus('working');
            const mainAgentName = this.mainAgentDef.name;
            this.emitter?.emit({ type: 'phase_start', phase: 'execution', taskId: this.taskId });

            // Create a new branch for this task BEFORE making any changes
            const branchName = `feature/task-${this.taskId.slice(0, 8)}`;
            try {
                await this.log(mainAgentName, `Creating feature branch: ${branchName}`);
                await skills.manage_git('checkout', `-b ${branchName}`, projectPath);
                await this.updateMetadata({ branchName });
                await this.log(mainAgentName, `Switched to branch: ${branchName}`);
            } catch (branchError: any) {
                // Branch might already exist, try to switch to it
                await this.log(mainAgentName, `Branch creation failed, attempting to switch: ${branchError.message}`);
                try {
                    await skills.manage_git('checkout', branchName, projectPath);
                    await this.updateMetadata({ branchName });
                } catch (switchError: any) {
                    await this.log(mainAgentName, `Warning: Could not switch to feature branch: ${switchError.message}`, { type: 'WARNING' });
                }
            }

            // 1. Scan Project Context and Tech Stack
            // (Simplified for now, in reality we might want a 'ProjectAnalyst' agent to do this)
            const dirList = await skills.list_directory('.', projectPath);
            const isNode = Array.isArray(dirList) && dirList.some((f: string) => f.includes('package.json'));
            let techStack = 'static-html';

            if (isNode) {
                try {
                    const pkgJson = await skills.read_codebase('package.json', projectPath);
                    // Add package.json to context so the agent knows about dependencies (tailwind, shadcn, etc.)
                    this.contextManager.addFile('package.json', pkgJson);

                    if (pkgJson.includes('next')) techStack = 'nextjs';
                    else if (pkgJson.includes('react')) techStack = 'react';
                    else techStack = 'react'; // Changed from 'node-generic' to 'react' as per instruction
                } catch (e: any) { /* ignore */ }
            }
            await this.log(mainAgentName, `Detected Tech Stack: ${techStack}`);

            // Initial Scan
            try {
                const initialDirList = await skills.list_directory('.', projectPath);
                this.contextManager.addLog('System', `Initial Directory Scan: ${JSON.stringify(initialDirList?.slice(0, 5))}...`);
            } catch (e: any) { }

            // Initialize progress tracking
            const totalSteps = workflow.steps.length;
            const existingCompleted = task.metadata?.progress?.completedSteps || [];
            await this.updateProgress({
                currentStep: resumeFrom,
                totalSteps,
                currentAction: '',
                currentAgent: '',
                completedSteps: existingCompleted,
                startedAt: resumeFrom === 0 ? new Date().toISOString() : (task.metadata?.progress?.startedAt || new Date().toISOString()),
                stepStatus: 'pending'
            });

            if (resumeFrom > 0) {
                await this.log(mainAgentName, `Resuming execution from step ${resumeFrom + 1} of ${totalSteps}.`);
            }

            for (let stepIndex = resumeFrom; stepIndex < workflow.steps.length; stepIndex++) {
                // Heartbeat/Lock Refresh: Update metadata periodically to show we are still alive
                if (stepIndex > resumeFrom) {
                    await this.updateMetadata({ lock: { held_since: Date.now(), process_id: process.pid } });
                }

                const step = workflow.steps[stepIndex];
                const { agent, action } = step;
                const agentRoleSlug = agent.toLowerCase().replace(/[\s_]+/g, '-');

                try {
                    const stepAgentDef = AgentLoader.loadAgent(agentRoleSlug);
                    const skillFunc = this.getSkillFunction(action);

                    // Update progress: step starting
                    await this.updateProgress({
                        currentStep: stepIndex,
                        currentAction: action,
                        currentAgent: stepAgentDef.name,
                        stepStatus: 'running'
                    });
                    this.emitter?.emit({
                        type: 'step_start',
                        step: stepIndex,
                        total: totalSteps,
                        action,
                        agent: stepAgentDef.name
                    });
                    this.emitter?.markStepStart();

                    // --- EXECUTION WITH RETRY/SELF-HEAL LOOP ---
                    let stepSuccess = false;
                    let executionError: any = null;
                    const MAX_STEP_RETRIES = 1;

                    for (let stepAttempt = 0; stepAttempt <= MAX_STEP_RETRIES; stepAttempt++) {
                        try {
                            if (stepAttempt > 0) {
                                await this.log(mainAgentName, `Self-Heal Attempt ${stepAttempt} for action: ${action}`, { type: 'WARNING' });
                                // Add log to context about the failure
                                this.contextManager.addLog('System', `Previous attempt for ${action} failed: ${executionError?.message}. Retrying with same goal.`);
                            }

                            if (skillFunc) {
                                // THOUGHT: Agent is thinking about arguments
                                await this.log(mainAgentName, `Generative Logic: Determining arguments for ${action}...`, { type: 'THOUGHT' });

                                // --- SPECIAL HANDLING: write_code uses CODING model directly ---
                                if (action === 'write_code') {
                                    const codePrompt = step.description
                                        ? `${step.description}\n\nOverall task: ${task.description}`
                                        : task.description;

                                    await this.log(stepAgentDef.name, `Generating code with CODING model for: ${step.description || task.description}`, { type: 'ACTION' });
                                    this.emitter?.emit({ type: 'skill_execute', skill: action, args: step.description });

                                    let codeResult;
                                    let contextSize = 3000;
                                    let attempt = 0;
                                    const maxAttempts = 3;

                                    while (attempt < maxAttempts) {
                                        const contextData = this.contextManager.getOptimizedContext(contextSize);
                                        let augmentedContext = contextData;
                                        if (this.profiler) {
                                            const profilerData = await this.profiler.getContextString();
                                            augmentedContext = `${profilerData}\n\n${contextData}`;
                                        }

                                        codeResult = await llm.generateCodeStream(
                                            codePrompt,
                                            augmentedContext,
                                            this.emitter,
                                            MODEL_CONFIG.CODING_MODEL,
                                            techStack,
                                            () => this.refreshLock()
                                        );

                                        if (codeResult?.tokens) {
                                            await this.accumulateTokens(codeResult.tokens.prompt_eval_count, codeResult.tokens.eval_count);
                                        }

                                        if (!codeResult.error) break;

                                        if (codeResult.content.includes('timed out') || codeResult.content.includes('AbortError') || codeResult.content.includes('too large')) {
                                            attempt++;
                                            if (attempt < maxAttempts) {
                                                contextSize = Math.floor(contextSize / 1.5);
                                                continue;
                                            }
                                        }
                                        break;
                                    }

                                    if (codeResult && !codeResult.error && codeResult.files.length > 0) {
                                        const { data: metaForChanges } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
                                        const existingChanges = metaForChanges?.metadata?.fileChanges || [];

                                        for (const file of codeResult.files) {
                                            const writeResult = await skillFunc(file.path, file.content, projectPath);
                                            if (writeResult?.filePath) {
                                                existingChanges.push({
                                                    filePath: writeResult.filePath,
                                                    before: writeResult.before,
                                                    after: writeResult.after,
                                                    isNew: writeResult.isNew,
                                                    agent: stepAgentDef.name,
                                                    stepIndex
                                                });
                                            }
                                            this.contextManager.addFile(file.path, file.content);
                                            this.contextManager.addLog(stepAgentDef.name, `Wrote ${file.path}`);
                                            await this.log(stepAgentDef.name, `Wrote file: ${file.path}`, { type: 'RESULT' });
                                        }

                                        await this.updateMetadata({ fileChanges: existingChanges });
                                        const resultSummary = `Wrote ${codeResult.files.length} file(s): ${codeResult.files.map(f => f.path).join(', ')}`;
                                        this.emitter?.emit({ type: 'skill_result', skill: action, summary: resultSummary });
                                    } else {
                                        const errMsg = codeResult?.error ? codeResult.content : 'No files generated by CODING model';
                                        if (codeResult?.content) {
                                            console.warn('[Orchestrator] Code generation failed to extract files. Raw content starts with:', codeResult.content.slice(0, 200));
                                        }
                                        throw new Error(`Code generation failed: ${errMsg}`);
                                    }
                                } else {
                                    let args = await this.generateSkillArguments(
                                        action, task.description, projectPath, techStack, step.description
                                    );

                                    const filesystemSkills = ['read_codebase', 'run_shell_command', 'manage_git', 'list_directory'];
                                    if (filesystemSkills.includes(action)) {
                                        if (args.length === 0 || args[args.length - 1] !== projectPath) {
                                            args.push(projectPath);
                                        }
                                    }

                                    await this.log(stepAgentDef.name, `Executing ${action}`, { args, type: 'ACTION' });
                                    this.emitter?.emit({ type: 'skill_execute', skill: action, args: args.length > 0 ? args[0] : undefined });

                                    // Special handling for skills that require the emitter (analyze_task, create_workflow)
                                    const metaSkills = ['analyze_task', 'create_workflow'];
                                    if (metaSkills.includes(action) && this.emitter) {
                                        // analyze_task: (taskDesc, availableAgents, codebaseContext, emitter)
                                        // Ensure we don't have too many args and append emitter at the right position (4th)
                                        if (args.length > 3) args = args.slice(0, 3);
                                        while (args.length < 3) args.push(undefined);
                                        args.push(this.emitter);
                                    }

                                    const result = await skillFunc(...args);

                                    if (action === 'read_codebase' && typeof result === 'string') {
                                        const filePath = args[0];
                                        this.contextManager.addFile(filePath, result);
                                    }
                                    else if (action === 'read_codebase' && typeof result === 'object' && result.content) {
                                        const filePath = args[0];
                                        this.contextManager.addFile(filePath, result.content);
                                    }

                                    this.contextManager.addLog(stepAgentDef.name, `Executed ${action}. Result summary: ${JSON.stringify(result).slice(0, 200)}...`);
                                    await this.log(stepAgentDef.name, `Executed ${action}`, { result, type: 'RESULT' });
                                    const resultSummary = typeof result === 'string' ? result.slice(0, 100) : (result?.message || JSON.stringify(result).slice(0, 100));
                                    this.emitter?.emit({ type: 'skill_result', skill: action, summary: resultSummary });
                                }
                                stepSuccess = true;
                                break; // Exit attempt loop on success
                            } else {
                                throw new Error(`Runtime function for skill ${action} not found.`);
                            }
                        } catch (err: any) {
                            executionError = err;
                            await this.log(mainAgentName, `Step ${stepIndex + 1} attempt ${stepAttempt + 1} failed: ${err.message}`, { type: 'WARNING' });

                            if (stepAttempt < MAX_STEP_RETRIES) {
                                // Attempt self-analysis
                                try {
                                    const analysis = await skills.analyze_error_logs(err.message);
                                    await this.log(mainAgentName, `Error Analysis: ${analysis.cause}. Recommendation: ${analysis.solution}`, { type: 'THOUGHT' });
                                    this.contextManager.addLog('System', `Error Analysis: ${analysis.cause}. Suggestion: ${analysis.solution}`);
                                } catch (analErr) { /* ignore analysis failure */ }
                                continue;
                            }
                        }
                    }

                    if (!stepSuccess) {
                        throw executionError || new Error(`Step execution failed after retries.`);
                    }

                    // Update progress: step completed
                    const stepDuration = this.emitter?.markStepEnd() || 0;
                    const { data: currentMeta } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
                    const completedSteps = currentMeta?.metadata?.progress?.completedSteps || [];
                    await this.updateProgress({
                        completedSteps: [...completedSteps, action],
                        stepStatus: 'completed'
                    });

                    // Emit step_complete with ETA
                    const eta = this.emitter?.calculateETA(stepIndex, totalSteps) || 0;
                    this.emitter?.emit({
                        type: 'step_complete',
                        step: stepIndex,
                        total: totalSteps,
                        duration: stepDuration,
                        eta
                    });
                    this.emitter?.emitProgress(stepIndex, totalSteps);

                    // Persist context state for retry recovery
                    await this.contextManager.saveState();

                } catch (err: any) {
                    await this.log(mainAgentName, `Fatal failure in agent ${agentRoleSlug} during ${action}: ${err.message}`, { type: 'ERROR' });
                    this.contextManager.addLog('System', `Error executing ${action}: ${err.message}`);
                    this.emitter?.emit({ type: 'error', message: err.message, step: stepIndex });

                    // Update progress: step failed
                    await this.updateProgress({
                        stepStatus: 'failed'
                    });

                    // Save error metadata for retry functionality
                    const errorMetadata: ErrorMetadata = {
                        lastError: err.message,
                        failedStep: stepIndex,
                        failedAction: action,
                        failedAgent: agentRoleSlug,
                        retryCount: (task.metadata?.retryCount || 0) + 1,
                        failedAt: new Date().toISOString(),
                        previousStatus: task.status
                    };
                    await this.updateMetadata(errorMetadata);
                    await this.updateStatus('failed');
                    await this.log('System', `Task marked as failed. Can be retried from step ${stepIndex + 1}.`, { type: 'ERROR' });
                    this.emitter?.emit({ type: 'done', status: 'failed' });
                    return; // Exit instead of throwing
                }
            }

            await this.updateStatus('testing');
            await this.log(mainAgentName, 'Workflow Execution Completed. Task moved to Testing phase.');
            // Release lock on success
            await this.updateMetadata({ lock: null });
            this.emitter?.emit({ type: 'done', status: 'execution_complete' });
        } catch (error: any) {
            await this.log('System', `Execution Phase Failed: ${error.message}`, { type: 'ERROR' });
            await this.updateStatus('failed');
            // Release lock on fatal error
            await this.updateMetadata({
                lock: null,
                lastError: error.message,
                failedAt: new Date().toISOString(),
                retryCount: ((await this.getTask())?.metadata?.retryCount || 0) + 1
            });
            this.emitter?.emit({ type: 'error', message: error.message });
            this.emitter?.emit({ type: 'done', status: 'failed' });
        } finally {
            // Orchestrator.runningTasks is no longer used, we rely on DB lock
        }
    }

    // --- Phase 3: Verification ---
    public async verify() {
        try {
            const mainAgentName = this.mainAgentDef.name;
            await this.updateStatus('testing');
            this.emitter?.emit({ type: 'phase_start', phase: 'verification', taskId: this.taskId });

            // Fetch Project Path
            let projectPath = process.cwd();
            const task = await this.getTask();
            if (task && (task as any).project_id) {
                const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
                if (project?.path) {
                    projectPath = project.path;
                    this.log('System', `Using Project Path for Verification: ${projectPath}`);
                }
            }

            this.emitter?.emit({ type: 'skill_execute', skill: 'verify_final_output' });
            const verification = await skills.verify_final_output(task?.description || 'No description', projectPath);
            await this.log(mainAgentName, 'Final Verification', verification);
            await this.updateMetadata({ verification });
            this.emitter?.emit({ type: 'skill_result', skill: 'verify_final_output', summary: verification.verified ? 'Verified' : 'Failed' });

            if (verification.verified) {
                await this.log(mainAgentName, 'Verification Successful. Starting Git Automation...');
                this.emitter?.emit({ type: 'skill_execute', skill: 'manage_git' });

                // Get branch name from metadata (created during execute phase)
                const branchName = task?.metadata?.branchName || `feature/task-${this.taskId.slice(0, 8)}`;
                const fileChanges = task?.metadata?.fileChanges || [];

                // Dynamic Git Details Generation (commit message and PR details)
                const fileSummary = fileChanges.map((f: any) => `- ${f.isNew ? '[NEW]' : '[MOD]'} ${f.filePath}`).join('\n');

                const systemPrompt = `
You are a Lead DevOps Engineer.
Generate a concise and professional PR description based on the task and the actual file changes.
Task: ${task?.description || 'Update'}
File Changes:
${fileSummary}

Return JSON: { "commitMessage": "feat: ...", "prTitle": "...", "prBody": "..." }
Use 'feat:', 'fix:', 'refactor:' conventions for commit messages.
`;
                let gitDetails = {
                    commitMessage: `feat: Task ${this.taskId.slice(0, 8)} implementation`,
                    prTitle: `feat: Task ${this.taskId.slice(0, 8)}`,
                    prBody: `Automated PR for task ${this.taskId}\n\n### Changes\n${fileSummary}`
                };

                try {
                    const generated = await llm.generateJSONStream(
                        systemPrompt,
                        "Generate professional git details based on changes",
                        "{}",
                        this.emitter,
                        MODEL_CONFIG.FAST_MODEL,
                        () => this.refreshLock()
                    );
                    
                    if (generated.__tokens) {
                        await this.accumulateTokens(generated.__tokens.prompt_eval_count, generated.__tokens.eval_count);
                    }

                    if (generated.commitMessage) {
                        gitDetails = { ...gitDetails, ...generated };
                    }
                } catch (e) {
                    console.warn('Failed to generate dynamic git details, using defaults.');
                }

                try {
                    // Branch was already created in execute(), just commit, push and create PR
                    await this.log(mainAgentName, 'Staging changes...');
                    await skills.manage_git('add', '.', projectPath);

                    await this.log(mainAgentName, `Committing: ${gitDetails.commitMessage}`);
                    await skills.manage_git('commit', gitDetails.commitMessage, projectPath);

                    await this.log(mainAgentName, `Pushing to ${branchName}...`);
                    await skills.manage_git('push', `origin ${branchName}`, projectPath);

                    await this.log(mainAgentName, 'Creating Pull Request...');
                    // Create PR from feature branch to main
                    await skills.manage_git('create_pr', `--fill --title "${gitDetails.prTitle}" --body "${gitDetails.prBody}"`, projectPath);

                    await this.log(mainAgentName, `Git Automation Completed (Commit, Push, PR on branch ${branchName}).`);
                    this.emitter?.emit({ type: 'skill_result', skill: 'manage_git', summary: `PR created on ${branchName}` });

                } catch (gitError: any) {
                    const errorMsg = gitError.message || String(gitError);
                    console.error('Git Automation Failed:', errorMsg);
                    await this.log(mainAgentName, `Git Automation Failed: ${errorMsg}`, { type: 'ERROR' });
                    // Even if git fails, we might want to stay in 'working' or 'testing' but for now 'failed' is clearer if the user expects a PR
                    // Actually, let's keep it in 'testing' but mark as warning if we can, or just keep it 'working'.
                    // The user said it moves to 'Review' but PR is not created.
                    // We should only move to 'review' if PR is created successfully? 
                    // Or move to 'review' and tell them to do it manually.

                    if (errorMsg.includes('gh') || errorMsg.includes('GitHub CLI')) {
                        await this.log('System', 'NOTE: PR creation skipped because GitHub CLI is not configured. Please handle the PR manually.', { type: 'ERROR' });
                    }

                    // Do NOT move to review if hit a hard git error?
                    // Let's throw so it hits the main catch and stays in 'failed'
                    throw gitError;
                }

                await this.updateStatus('review');
                await this.log(mainAgentName, 'Task moved to Review');
                // Ensure lock is cleared if it was somehow held
                await this.updateMetadata({ lock: null });
                this.emitter?.emit({ type: 'done', status: 'review' });
            } else {
                this.emitter?.emit({ type: 'done', status: 'verification_failed' });
            }
        } catch (error: any) {
            await this.log('System', `Verification Phase Failed: ${error.message}`, { type: 'ERROR' });
            await this.updateStatus('failed');
            await this.updateMetadata({
                lastError: error.message,
                failedAction: 'verify',
                failedAt: new Date().toISOString(),
                retryCount: ((await this.getTask())?.metadata?.retryCount || 0) + 1
            });
            this.emitter?.emit({ type: 'error', message: error.message });
            this.emitter?.emit({ type: 'done', status: 'failed' });
        }
    }

    // --- Retry: Resume from failed step ---
    public async retry() {
        try {
            const task = await this.getTask();
            if (!task || task.status !== 'failed') {
                await this.log('System', 'Task is not in failed state. Cannot retry.');
                return;
            }

            const failedStep = task.metadata?.failedStep;
            const failedAction = task.metadata?.failedAction;

            await this.log('System', `Retrying task from step ${failedStep !== undefined ? failedStep + 1 : 'beginning'}...`);

            // Restore context from previous execution
            await this.contextManager.restoreState();

            // If failed during verification, retry verification
            if (failedAction === 'verify') {
                await this.verify();
                return;
            }

            // Resume execution from the failed step instead of restarting
            const resumeFrom = typeof failedStep === 'number' ? failedStep : 0;
            await this.execute(resumeFrom);
        } catch (error: any) {
            await this.log('System', `Retry failed: ${error.message}`, { type: 'ERROR' });
        }
    }
}
