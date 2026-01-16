
import fs from 'fs';
import path from 'path';

async function runTest() {
    // Load .env.local manually
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        console.log('Loading environment variables...');
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value && !key.startsWith('#')) {
                process.env[key.trim()] = value.trim();
            }
        });
    }

    // Dynamic imports
    const { Orchestrator } = await import('../lib/agents/Orchestrator');
    const { supabase } = await import('../lib/supabase');

    console.log('--- Setting up Sign Up Test Data ---');

    // 1. Get Project ID (Assuming dummy project exists from previous test)
    const projectPath = '/Users/yohanchoi/dummy-project';
    let projectId: string;
    const { data: existingProject } = await supabase.from('Projects').select('id').eq('path', projectPath).single();

    if (existingProject) {
        projectId = existingProject.id;
        console.log('Using existing project:', projectId);
    } else {
        console.error('Dummy project not found. Run test-intelligence.ts first.');
        return;
    }

    // 2. Create a "Sign Up" Task
    const { data: task, error: tError } = await supabase
        .from('Tasks')
        .insert({
            title: 'Create Sign Up Page',
            description: 'Can you please create a sign up screen for new users?', // Keywords: sign up, screen
            status: 'pending',
            project_id: projectId,
            metadata: {
                workflow: {
                    steps: [
                        { agent: 'Software Engineer', action: 'write_code' }
                    ]
                }
            }
        })
        .select()
        .single();

    if (tError) {
        console.error('Failed to create task:', tError);
        return;
    }
    console.log('Created Task:', task.id);

    // 3. Run Orchestrator
    console.log('--- Executing Orchestrator ---');
    const orchestrator = new Orchestrator(task.id);
    await orchestrator.execute();

    console.log('--- Done ---');
    console.log('Check /Users/yohanchoi/dummy-project/signup.html exists.');
}

runTest();
