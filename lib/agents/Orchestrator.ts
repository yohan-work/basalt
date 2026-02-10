
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';
import { AgentLoader, AgentDefinition } from '../agent-loader';
import { ContextManager } from '../context-manager';
import { StreamEmitter } from '../stream-emitter';

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
    private emitter: StreamEmitter | null;

    constructor(taskId: string, emitter?: StreamEmitter) {
        this.taskId = taskId;
        this.mainAgentDef = AgentLoader.loadAgent('main-agent');
        this.contextManager = new ContextManager(taskId);
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
        } catch (e) {
            console.error('Supabase Log Error:', e);
        }
    }

    private async updateStatus(status: AgentTask['status']) {
        try {
            await supabase.from('Tasks').update({ status }).eq('id', this.taskId);
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
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

            // Load all available agents to determine who can do the task
            const availableAgents = AgentLoader.listAgents();
            await this.log(mainAgentName, `Loaded ${availableAgents.length} potential agents.`);

            // Analyze
            this.emitter?.emit({ type: 'skill_execute', skill: 'analyze_task' });
            const analysis = await skills.analyze_task(taskDescription, availableAgents);
            await this.log(mainAgentName, 'Task Analysis Completed', analysis);
            this.emitter?.emit({ type: 'skill_result', skill: 'analyze_task', summary: analysis.summary || 'Analysis complete' });

            // Create Workflow
            this.emitter?.emit({ type: 'skill_execute', skill: 'create_workflow' });
            const workflow = await skills.create_workflow(analysis, availableAgents);
            await this.log(mainAgentName, 'Workflow Created', workflow);
            this.emitter?.emit({ type: 'skill_result', skill: 'create_workflow', summary: `${workflow.steps?.length || 0} steps created` });

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
    private async generateSkillArguments(
        skillName: string,
        taskDescription: string,
        projectPath: string,
        techStack: string
        // contextData removed, using contextManager
    ): Promise<any[]> {
        const skillDef = AgentLoader.loadSkill(skillName);
        const inputsDef = skillDef.inputs ? `\nInputs Definition:\n${skillDef.inputs}` : '';

        // Get Optimized Context
        const dynamicContext = this.contextManager.getOptimizedContext(6000);

        const systemPrompt = `
You are an intelligent agent orchestrator.
Your goal is to generate the exact arguments needed to call a TypeScript function for a specific skill.

Skill Name: ${skillName}
Skill Instructions: ${skillDef.instructions}
${inputsDef}

Context:
- Task: ${taskDescription}
- Project Path: ${projectPath}
- Tech Stack: ${techStack}

${dynamicContext}

IMPORTANT RULES:
1. Generate ACTUAL values, NOT placeholder names like "filePath", "content", "args" etc.
2. For file paths, use real paths like "components/MyComponent.tsx", "app/page.tsx", "lib/utils.ts"
3. For code content, generate the COMPLETE working code that fulfills the task.
4. Consider the Tech Stack when choosing file extensions (.tsx for React/Next.js, .ts for TypeScript, etc.)
5. If creating a new component/page, ensure it has proper imports and exports.

Return ONLY a JSON object with a key "arguments" which is an array of actual values to pass to the function.
Example for write_code: { "arguments": ["components/Button.tsx", "import React from 'react';\\n\\nexport function Button() { return <button>Click</button>; }"] }
Example for read_codebase: { "arguments": ["package.json"] }
Do not return markdown or placeholders.
`;

        try {
            const response = await llm.generateJSONStream(
                systemPrompt,
                "Generate valid arguments for this skill based on the task.",
                '{ "arguments": [] }',
                this.emitter
            );
            return response.arguments || [];
        } catch (e) {
            console.error(`Failed to generate arguments for ${skillName}`, e);
            return [];
        }
    }

    public async execute(startFromStep: number = 0) {
        try {
            const task = await this.getTask();
            if (!task || !task.metadata?.workflow) {
                await this.log('System', 'No workflow found in metadata. Please run planning first.');
                return;
            }

            // Fetch Project Path if available
            let projectPath = process.cwd();
            if ((task as any).project_id) {
                const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
                if (project?.path) {
                    projectPath = project.path;
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
                    else techStack = 'node-generic';
                } catch (e) { /* ignore */ }
            }
            await this.log(mainAgentName, `Detected Tech Stack: ${techStack}`);

            // Initial Scan
            try {
                const initialDirList = await skills.list_directory('.', projectPath);
                this.contextManager.addLog('System', `Initial Directory Scan: ${JSON.stringify(initialDirList?.slice(0, 5))}...`);
            } catch (e) { }

            // Initialize progress tracking
            const totalSteps = workflow.steps.length;
            const existingCompleted = task.metadata?.progress?.completedSteps || [];
            await this.updateProgress({
                currentStep: startFromStep,
                totalSteps,
                currentAction: '',
                currentAgent: '',
                completedSteps: existingCompleted,
                startedAt: startFromStep === 0 ? new Date().toISOString() : (task.metadata?.progress?.startedAt || new Date().toISOString()),
                stepStatus: 'pending'
            });

            if (startFromStep > 0) {
                await this.log(mainAgentName, `Resuming execution from step ${startFromStep + 1} of ${totalSteps}.`);
            }

            for (let stepIndex = startFromStep; stepIndex < workflow.steps.length; stepIndex++) {
                const step = workflow.steps[stepIndex];
                const { agent, action } = step;
                const agentRoleSlug = agent.toLowerCase().replace(/\s+/g, '-');

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

                    if (skillFunc) {
                        // THOUGHT: Agent is thinking about arguments
                        await this.log(mainAgentName, `Generative Logic: Determining arguments for ${action}...`, { type: 'THOUGHT' });

                        // Generate Arguments with Context Manager
                        let args = await this.generateSkillArguments(action, task.description, projectPath, techStack);

                        // Safety Injection (Project Path)
                        const filesystemSkills = ['read_codebase', 'write_code', 'run_shell_command', 'manage_git', 'list_directory'];
                        if (filesystemSkills.includes(action)) {
                            if (args.length === 0 || args[args.length - 1] !== projectPath) {
                                args.push(projectPath);
                            }
                        }

                        // ACTION: Agent is about to execute
                        await this.log(stepAgentDef.name, `Executing ${action}`, { args, type: 'ACTION' });
                        this.emitter?.emit({ type: 'skill_execute', skill: action, args: args.length > 0 ? args[0] : undefined });

                        // --- EXECUTE ---
                        const result = await skillFunc(...args);

                        // --- CAPTURE CONTEXT ---
                        // If read_codebase, store content
                        if (action === 'read_codebase' && typeof result === 'string') {
                            const filePath = args[0]; // Convention: first arg is file path
                            this.contextManager.addFile(filePath, result);
                            this.log('System', `Captured file content for ${filePath} into memory.`, { type: 'System' });
                        }
                        else if (action === 'read_codebase' && typeof result === 'object' && result.content) {
                            // Some skills might return object
                            const filePath = args[0];
                            this.contextManager.addFile(filePath, result.content);
                        }

                        // Capture file changes for diff viewer
                        if (action === 'write_code' && result?.filePath) {
                            const { data: metaForChanges } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
                            const existingChanges = metaForChanges?.metadata?.fileChanges || [];
                            existingChanges.push({
                                filePath: result.filePath,
                                before: result.before,
                                after: result.after,
                                isNew: result.isNew,
                                agent: stepAgentDef.name,
                                stepIndex
                            });
                            await this.updateMetadata({ fileChanges: existingChanges });
                        }

                        this.contextManager.addLog(stepAgentDef.name, `Executed ${action}. Result summary: ${JSON.stringify(result).slice(0, 200)}...`);

                        // RESULT: Execution finished
                        await this.log(stepAgentDef.name, `Executed ${action}`, { result, type: 'RESULT' });
                        const resultSummary = typeof result === 'string' ? result.slice(0, 100) : (result?.message || JSON.stringify(result).slice(0, 100));
                        this.emitter?.emit({ type: 'skill_result', skill: action, summary: resultSummary });

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
                    } else {
                        await this.log(mainAgentName, `Runtime function for skill ${action} not found.`, { type: 'ERROR' });
                    }

                } catch (err: any) {
                    await this.log(mainAgentName, `Failed to load or execute agent ${agentRoleSlug}: ${err.message}`, { type: 'ERROR' });
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
            this.emitter?.emit({ type: 'done', status: 'execution_complete' });
        } catch (error: any) {
            await this.log('System', `Execution Phase Failed: ${error.message}`, { type: 'ERROR' });
            await this.updateStatus('failed');
            await this.updateMetadata({
                lastError: error.message,
                failedAt: new Date().toISOString(),
                retryCount: ((await this.getTask())?.metadata?.retryCount || 0) + 1
            });
            this.emitter?.emit({ type: 'error', message: error.message });
            this.emitter?.emit({ type: 'done', status: 'failed' });
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

                // Dynamic Git Details Generation (commit message and PR details only)
                const systemPrompt = `
    You are a DevOps Engineer.
    Based on the task description, generate a commit message and PR details.
    Task: ${task?.description || 'Update'}
    Return JSON: { "commitMessage": "feat: ...", "prTitle": "...", "prBody": "..." }
    `;
                let gitDetails = {
                    commitMessage: `feat: Task ${this.taskId.slice(0, 8)} implementation`,
                    prTitle: `feat: Task ${this.taskId.slice(0, 8)}`,
                    prBody: `Automated PR for task ${this.taskId}`
                };

                try {
                    const generated = await llm.generateJSONStream(systemPrompt, "Generate git details", "{}", this.emitter);
                    if (generated.commitMessage) {
                        gitDetails = { ...gitDetails, ...generated };
                    }
                } catch (e) {
                    console.warn('Failed to generate dynamic git details, using defaults.');
                }

                try {
                    // Branch was already created in execute(), just commit, push and create PR
                    await skills.manage_git('add', '.', projectPath);
                    await skills.manage_git('commit', gitDetails.commitMessage, projectPath);
                    await skills.manage_git('push', `origin ${branchName}`, projectPath);
                    // Create PR from feature branch to main
                    await skills.manage_git('create_pr', `--fill --title "${gitDetails.prTitle}" --body "${gitDetails.prBody}"`, projectPath);

                    await this.log(mainAgentName, `Git Automation Completed (Commit, Push, PR on branch ${branchName}).`);
                    this.emitter?.emit({ type: 'skill_result', skill: 'manage_git', summary: `PR created on ${branchName}` });

                } catch (gitError: any) {
                    await this.log(mainAgentName, `Git Automation Warning: ${gitError.message}`);
                }

                await this.updateStatus('review');
                await this.log(mainAgentName, 'Task moved to Review');
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
