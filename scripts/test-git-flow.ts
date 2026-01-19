
import {
    manage_git,
    create_workflow,
    AgentDefinition
} from '../lib/skills/index';

import { AgentLoader } from '../lib/agent-loader';

// Mock Agent Definition for testing
const mockAgents: AgentDefinition[] = [
    { name: 'main-agent', role: 'main-agent', description: '', systemPrompt: '', skills: [], subAgents: [] },
    { name: 'git-manager', role: 'git-manager', description: '', systemPrompt: '', skills: ['manage_git'], subAgents: [] },
    { name: 'software-engineer', role: 'software-engineer', description: '', systemPrompt: '', skills: ['read_codebase', 'write_code'], subAgents: [] }
];

async function runTests() {
    console.log('--- Starting Git Automation Verification ---');

    // 1. Test manage_git: create_branch
    console.log('\n[Test 1] Testing create_branch...');
    // We use a safe branch name that is unlikely to conflict, or just dry-run by checking the command string in the skill if possible. 
    // Since we can't easily dry-run without modifying the skill to support dry-run, we will attempt it and catch error if already exists, or just log intent.
    // For safety in this environment, we rely on the fact that manage_git returns an error message if git fails, which is fine for verification.
    const branchRes = await manage_git('create_branch', 'feature/test-automation-' + Date.now());
    console.log('Result:', branchRes);

    // 2. Test manage_git: create_pr
    // This will likely fail without GH token, but we want to fail gracefully.
    console.log('\n[Test 2] Testing create_pr...');
    const prRes = await manage_git('create_pr', '--title "Test PR" --body "This is a test"');
    console.log('Result:', prRes);

    // 3. Test create_workflow (Check if Git steps are included)
    console.log('\n[Test 3] Testing Workflow Generation (Git Inclusion)...');

    // We force the LLM (or fallback) to generate a plan for a coding task
    const analysis = {
        complexity: 'medium',
        required_agents: ['software-engineer', 'git-manager'],
        summary: 'Write a new component and submit it.'
    };

    const workflow = await create_workflow(analysis, mockAgents);
    console.log('Generated Workflow Steps:');
    workflow.steps.forEach((step: any, index: number) => {
        console.log(`${index + 1}. [${step.agent}] ${step.action} - ${step.reason || ''}`);
    });

    const hasGit = workflow.steps.some((s: any) => s.action === 'manage_git');
    if (hasGit) {
        console.log('✅ Workflow correctly includes git steps.');
    } else {
        console.error('❌ Workflow MISSING git steps.');
    }

    console.log('\n--- Verification Completed ---');
}

runTests().catch(console.error);
