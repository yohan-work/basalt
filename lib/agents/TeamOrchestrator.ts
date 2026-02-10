
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';
import { AgentLoader, AgentDefinition } from '../agent-loader';
import { ContextManager } from '../context-manager';
import { TeamState, TaskBoard, TeamMessage, AgentAction } from '../team-types';
// import { v4 as uuidv4 } from 'uuid'; // Removed unused import to avoid dependency issues
const generateId = () => Math.random().toString(36).substring(2, 9);

export class TeamOrchestrator {
    private taskId: string;
    private contextManagers: Map<string, ContextManager> = new Map(); // AgentName -> ContextManager
    private teamState: TeamState;

    constructor(taskId: string, initialTeamState?: TeamState) {
        this.taskId = taskId;
        // Default State
        this.teamState = initialTeamState || {
            name: 'Dev Team',
            leader: 'product-manager',
            members: ['product-manager', 'software-engineer', 'qa'], // Default members
            messages: [],
            board: {
                todo: [],
                in_progress: [],
                review: [],
                done: []
            },
            metadata: { round: 0 }
        };
    }

    /**
     * Initialize or Restore team state
     */
    public async initialize() {
        // Try to load state from Supabase first
        const { data } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
        if (data?.metadata?.teamState) {
            this.teamState = data.metadata.teamState;
            console.log('Restored Team State');
        } else {
            // Initializing new team
            console.log('Initializing New Team');
            // If no members, maybe dynamic loading? For now use defaults or from constructor
        }

        // Initialize Context Managers for each member
        for (const member of this.teamState.members) {
            if (!this.contextManagers.has(member)) {
                this.contextManagers.set(member, new ContextManager(this.taskId));
            }
        }
    }

    private async saveState() {
        try {
            // We save the entire team state into metadata.teamState
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
            const newMetadata = {
                ...(current?.metadata || {}),
                teamState: this.teamState
            };

            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);
        } catch (e) {
            console.error('Failed to save team state:', e);
        }
    }

    /**
     * The Main Cycle: Round-Robin Execution
     */
    public async runTeamLoop(maxRounds: number = 20) {
        await this.initialize();

        for (let i = 0; i < maxRounds; i++) {
            this.teamState.metadata.round = i;
            console.log(`--- Round ${i} ---`);

            // Check termination condition: All items done? Leader says stop? 
            // Simplified: If todo and in_progress are empty and we have at least 1 done item, stop.
            if (this.teamState.board.todo.length === 0 &&
                this.teamState.board.in_progress.length === 0 &&
                this.teamState.board.done.length > 0) {
                console.log('All tasks completed. Team finished.');
                break;
            }

            for (const agentName of this.teamState.members) {
                await this.executeAgentTurn(agentName);
            }

            await this.saveState();
        }
    }

    private async executeAgentTurn(agentName: string) {
        console.log(`[${agentName}] is thinking...`);
        const agentDef = AgentLoader.loadAgent(agentName); // Assumes folder name matches agent name for simplification
        const ctxManager = this.contextManagers.get(agentName)!;

        // 1. Construct Prompt
        const teamContext = ctxManager.getTeamContext(this.teamState, agentName);
        const systemPrompt = `
You are ${agentDef.name}, a member of a software engineering team.
Role Description: ${agentDef.description}

${agentDef.systemPrompt}

### COLLABORATION PROTOCOL
You work in a team with a Shared Task Board and a Chat Channel.
You must communicate with your team, pick up tasks, and execute them.

AVAILABLE ACTIONS (JSON):
1. send_message: { "type": "send_message", "payload": { "content": "..." } }
2. create_task: { "type": "create_task", "payload": { "description": "...", "assignee": "optional_agent_name" } }
3. claim_task: { "type": "claim_task", "payload": { "taskId": "..." } }
4. submit_task: { "type": "submit_task", "payload": { "taskId": "...", "result": "..." } }
5. call_skill: { "type": "call_skill", "payload": { "skill": "skill_name", "args": [...] } }

RULES:
- Be proactive. If there are tasks in TODO, claim them.
- If you claimed a task, use 'call_skill' to do the work.
- After work is done, use 'submit_task'.
- Communicate via 'send_message' to coordinate.
- Output a SINGLE JSON object with "thought" and "actions" (array).

Context:
${teamContext}
`;

        // 2. LLM Call
        try {
            const response = await llm.generateJSON(
                systemPrompt,
                "Analyze the situation and decide your next move.",
                `{ "thought": "...", "actions": [] }`
            );

            // 3. Process Actions
            if (response.thought) {
                console.log(`[${agentName} Thought]: ${response.thought}`);
            }

            if (Array.isArray(response.actions)) {
                for (const action of response.actions) {
                    await this.processAction(agentName, action, ctxManager);
                }
            }

        } catch (e) {
            console.error(`Agent ${agentName} crashed:`, e);
        }
    }

    private async processAction(agentName: string, action: AgentAction, ctxManager: ContextManager) {
        console.log(`[${agentName} Action]: ${action.type}`, action.payload);

        switch (action.type) {
            case 'send_message':
                this.teamState.messages.push({
                    id: generateId(),
                    sender: agentName,
                    content: action.payload.content,
                    timestamp: Date.now()
                });
                break;

            case 'create_task':
                this.teamState.board.todo.push({
                    id: generateId(),
                    description: action.payload.description,
                    assignee: action.payload.assignee || null,
                    status: 'todo',
                    creator: agentName,
                    created_at: Date.now(),
                    updated_at: Date.now()
                });
                break;

            case 'claim_task':
                // Find task in todo
                const taskIndex = this.teamState.board.todo.findIndex(t => t.id === action.payload.taskId);
                if (taskIndex !== -1) {
                    const task = this.teamState.board.todo.splice(taskIndex, 1)[0];
                    task.status = 'in_progress';
                    task.assignee = agentName;
                    task.updated_at = Date.now();
                    this.teamState.board.in_progress.push(task);
                }
                break;

            case 'submit_task':
                // Find in in_progress
                const progIndex = this.teamState.board.in_progress.findIndex(t => t.id === action.payload.taskId);
                if (progIndex !== -1) {
                    const task = this.teamState.board.in_progress.splice(progIndex, 1)[0];
                    task.status = 'done'; // Skip review for simplicity in v1
                    task.result = action.payload.result;
                    task.updated_at = Date.now();
                    this.teamState.board.done.push(task);

                    // Auto-notify
                    this.teamState.messages.push({
                        id: generateId(),
                        sender: 'system',
                        content: `Task ${task.description} completed by ${agentName}.`,
                        timestamp: Date.now()
                    });
                }
                break;

            case 'call_skill':
                const { skill, args } = action.payload;
                try {
                    const skillFunc = (skills as any)[skill];
                    if (skillFunc) {
                        const result = await skillFunc(...args);

                        // Capture result in context
                        ctxManager.addLog(agentName, `Called skill ${skill}`, result);

                        // If reading file, cache it
                        if (skill === 'read_codebase' && typeof result === 'string') {
                            ctxManager.addFile(args[0], result);
                        } else if (skill === 'read_codebase' && result.content) {
                            ctxManager.addFile(args[0], result.content);
                        }

                    } else {
                        console.error(`Skill ${skill} not found`);
                    }
                } catch (e: any) {
                    console.error(`Skill execution failed: ${e.message}`);
                    ctxManager.addLog(agentName, `Skill ${skill} failed`, e.message);
                }
                break;
        }
    }
}
