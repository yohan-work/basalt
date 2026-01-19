
import {
    create_workflow,
    AgentDefinition
} from '../lib/skills/index';

import { Orchestrator } from '../lib/agents/Orchestrator';

// Mock Agent Definition for testing
const mockAgents: AgentDefinition[] = [
    { name: 'main-agent', role: 'main-agent', description: '', systemPrompt: '', skills: [], subAgents: [] },
    { name: 'git-manager', role: 'git-manager', description: '', systemPrompt: '', skills: ['manage_git'], subAgents: [] },
    { name: 'software-engineer', role: 'software-engineer', description: '', systemPrompt: '', skills: ['read_codebase', 'write_code'], subAgents: [] }
];

async function runTests() {
    console.log('--- Starting Orchestrator Args Verification ---');

    // Test Workflow Generation with Args
    console.log('\n[Test 1] Testing Workflow Generation (Args)...');

    const analysis = {
        complexity: 'medium',
        required_agents: ['software-engineer', 'git-manager'],
        summary: 'Write a new component and submit it.'
    };

    const workflow = await create_workflow(analysis, mockAgents);

    // Check if args are present in the output steps
    console.log('Generated Steps:');
    let hasArgs = false;
    workflow.steps.forEach((step: any, index: number) => {
        console.log(`${index + 1}. [${step.agent}] ${step.action} - Args: ${JSON.stringify(step.args || [])}`);
        if (step.args && step.args.length > 0) hasArgs = true;
    });

    if (hasArgs) {
        console.log('✅ Workflow correctly generated steps with args.');
    } else {
        // Did we hit fallback? Fallback now has args too!
        console.log('⚠️ Workflow might be from fallback, but should still have args.');
        const isFallback = workflow.steps.some((s: any) => s.reason?.includes('Fallback'));
        if (workflow.steps[0].args && workflow.steps[0].args.length > 0) {
            console.log('✅ Fallback args present.');
        } else {
            console.error('❌ Workflow steps missing args completely.');
        }
    }

    console.log('\n--- Verification Completed ---');
}

runTests().catch(console.error);
