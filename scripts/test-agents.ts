
import {
    analyze_task,
    create_workflow,
    read_codebase,
    write_code,
    verify_final_output,
    manage_git,
    list_directory
} from '../lib/skills/index';

import { AgentLoader } from '../lib/agent-loader';

async function runTests() {
    console.log('--- Starting Agent Skills Verification ---');

    // 1. Loading Agents
    console.log('\n[Test 1] Loading Agents...');
    const agents = AgentLoader.listAgents();
    if (agents.length > 0) {
        console.log(`✅ Loaded ${agents.length} agents: ${agents.map(a => a.name).join(', ')}`);
    } else {
        console.error('❌ Failed to load agents.');
    }

    // 2. Test manage_git (status) - This was the failure point
    console.log('\n[Test 2] Testing manage_git (status)...');
    const gitStatus = await manage_git('status', '');
    if (typeof gitStatus === 'string' && !gitStatus.includes('Invalid action')) {
        console.log('✅ manage_git (status) executed successfully.');
        console.log('   Output snippet:', gitStatus.substring(0, 50).replace(/\n/g, ' '));
    } else {
        console.error('❌ manage_git (status) failed:', gitStatus);
    }

    // 3. Test File Operations
    console.log('\n[Test 3] Testing File Operations...');
    const listDir = await list_directory('.');
    if (Array.isArray(listDir)) {
        console.log('✅ list_directory executed successfully.');
    } else {
        console.error('❌ list_directory failed:', listDir);
    }

    // 4. Test Task Analysis (LLM/Fallback)
    console.log('\n[Test 4] Testing Task Analysis...');
    const analysis = await analyze_task('Create a simple todo list app', agents);
    if (analysis && (analysis.complexity || analysis.summary)) {
        console.log('✅ analyze_task executed successfully.', analysis);
    } else {
        console.error('❌ analyze_task failed:', analysis);
    }

    // 5. Test Workflow Creation
    console.log('\n[Test 5] Testing Workflow Creation...');
    const workflow = await create_workflow(analysis, agents);
    if (workflow && workflow.steps && workflow.steps.length > 0) {
        console.log('✅ create_workflow executed successfully.');
        console.log(`   Generated ${workflow.steps.length} steps.`);
    } else {
        console.error('❌ create_workflow failed.');
    }

    console.log('\n--- Verification Completed ---');
}

runTests().catch(console.error);
