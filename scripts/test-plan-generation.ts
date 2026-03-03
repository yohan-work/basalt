import path from 'path';
import fs from 'fs';

// Simple manual env loading for .env.local if not already loaded
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value && !process.env[key.trim()]) {
            process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
        }
    });
}

import { AgentLoader } from '../lib/agent-loader';

async function runTest() {
    console.log('--- Testing Plan Generation ---');

    // Dynamic import to ensure env vars are loaded
    const { Orchestrator } = await import('../lib/agents/Orchestrator');
    const { supabase } = await import('../lib/supabase');


    // 1. Create a dummy task
    const testTask = {
        title: 'Build a Contact Form',
        description: 'I need a contact form with name, email, and message fields. It should look modern and use our design system.',
        status: 'pending'
    };

    const { data: task, error } = await supabase.from('Tasks').insert(testTask).select().single();
    if (error) {
        console.error('Failed to create test task:', error);
        return;
    }
    console.log('Created Test Task:', task.id);

    try {
        // 2. Instantiate Orchestrator
        console.log('Instantiating Orchestrator...');
        const orchestrator = new Orchestrator(task.id);

        // 3. Run Plan
        console.log('Running plan()...');
        await orchestrator.plan(task.description);

        // 4. Verify results
        const { data: updatedTask } = await supabase.from('Tasks').select('*, metadata').eq('id', task.id).single();

        console.log('Updated Task Full:', JSON.stringify(updatedTask, null, 2));

        console.log('Updated Status:', updatedTask.status);
        console.log('\n--- Analysis ---');
        console.log(JSON.stringify(updatedTask.metadata.analysis, null, 2));

        console.log('\n--- Workflow ---');
        console.log(JSON.stringify(updatedTask.metadata.workflow, null, 2));

        // Assertions
        const agents = updatedTask.metadata.analysis.required_agents;
        if (agents || agents.length > 0) {
            console.log(`\n✅ Success: identified ${agents.length} agents: ${agents.join(', ')}`);
        } else {
            console.log('\n❌ Failure: No agents identified.');
        }

        // Cleanup
        await supabase.from('Tasks').delete().eq('id', task.id);
        console.log('\nCleaned up test task.');

    } catch (e) {
        console.error('Test Error:', e);
    }
}

// Check if we can load agents first
try {
    const agents = AgentLoader.listAgents();
    console.log('Available Agents:', agents.map((a: any) => a.name));
    if (agents.length > 0) runTest();
    else console.error('No agents found in lib/agents');
} catch (e) {
    console.error('AgentLoader Error:', e);
}
