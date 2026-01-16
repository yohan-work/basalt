
import fs from 'fs';
import path from 'path';

// Mock Supabase calls specifically for this test
// We can't easily mock the import, so we'll rely on inserting REAL data into Supabase 
// and then running it.

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

    // Dynamic imports to ensure env is set before Supabase initializes
    const { Orchestrator } = await import('../lib/agents/Orchestrator');
    const { supabase } = await import('../lib/supabase');

    console.log('--- Setting up Test Data ---');

    // 1. Create a Project Entry
    const projectPath = '/Users/yohanchoi/dummy-project';
    // Use upsert or select to avoid duplicates if re-running
    // For simplicity, just insert and ignore error or handle it

    // Check if project exists
    let projectId: string;
    const { data: existingProject } = await supabase.from('Projects').select('id').eq('path', projectPath).single();

    if (existingProject) {
        projectId = existingProject.id;
        console.log('Using existing project:', projectId);
    } else {
        const { data: project, error: pError } = await supabase
            .from('Projects')
            .insert({ name: 'Dummy HTML Project', path: projectPath })
            .select()
            .single();

        if (pError) {
            console.error('Failed to create project:', pError);
            return;
        }
        projectId = project.id;
        console.log('Created Project:', projectId);
    }

    // 2. Create a Task linked to this project
    const { data: task, error: tError } = await supabase
        .from('Tasks')
        .insert({
            title: 'Create Login Page',
            description: 'Can you add a login screen?',
            status: 'pending',
            project_id: projectId,
            metadata: {
                // Pre-populate workflow to skip planning phase for this test
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
    console.log('Check /Users/yohanchoi/dummy-project/login.html exists.');
}

runTest();
