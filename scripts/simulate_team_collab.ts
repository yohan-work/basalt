
import fs from 'fs';
import path from 'path';

// Load .env.local manually before other imports
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) {
            process.env[key.trim()] = val.trim().replace(/^["']|["']$/g, '');
        }
    });
    console.log('Environment variables loaded from .env.local');
} else {
    console.warn('.env.local not found!');
}

async function main() {
    // Dynamic imports to ensure env vars are set first
    const { supabase } = await import('../lib/supabase');
    const { TeamOrchestrator } = await import('../lib/agents/TeamOrchestrator');

    console.log('--- Starting Team Simulation ---');

    // 0. Fetch a valid project ID
    const { data: project } = await supabase.from('Projects').select('id').limit(1).single();
    const projectId = project?.id || null;
    console.log(`Using Project ID: ${projectId}`);

    // 1. Create a Test Task
    const { data: task, error } = await supabase
        .from('Tasks')
        .insert({
            title: 'Team Simulation Task - Auth System',
            description: 'Implement a secure authentication system (JWT).',
            status: 'pending',
            project_id: projectId
        })
        .select()
        .single();

    if (error || !task) {
        console.error('Failed to create test task:', error);
        return;
    }

    console.log(`Created Task: ${task.id}`);
    console.log(`Description: ${task.description}`);

    // 2. Initialize Team Orchestrator
    const orchestrator = new TeamOrchestrator(task.id, {
        name: 'Alpha Team',
        leader: 'product-manager',
        // Define members manually for test to ensure we have the right mix
        members: ['product-manager', 'software-engineer', 'qa'],
        messages: [],
        board: {
            todo: [],
            in_progress: [],
            review: [],
            done: []
        },
        metadata: { round: 0 }
    });

    // 3. Run Loop
    // We run for 3 rounds to see some interaction
    console.log('--- Running Team Loop ---');
    await orchestrator.runTeamLoop(3);

    console.log('--- Simulation Finished ---');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
