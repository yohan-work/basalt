
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

    console.log('--- Setting up Planning Test Data ---');

    // 1. Create a Project Entry
    const projectPath = '/Users/yohanchoi/dummy-project';
    // Ensure project exists (reuse existing logic from previous tests)
    let projectId: string;
    const { data: existingProject } = await supabase.from('Projects').select('id').eq('path', projectPath).single();
    if (existingProject) projectId = existingProject.id;
    else {
        const { data: project } = await supabase.from('Projects').insert({ name: 'Dummy Project', path: projectPath }).select().single();
        projectId = project.id;
    }

    // 2. Create a Task *without* pre-filled workflow
    const taskDesc = 'Create a secure login page with two-factor authentication support.';
    const { data: task, error: tError } = await supabase
        .from('Tasks')
        .insert({
            title: 'Plan Secure Login',
            description: taskDesc,
            status: 'pending',
            project_id: projectId,
            metadata: {} // Empty metadata
        })
        .select()
        .single();

    if (tError) {
        console.error('Failed to create task:', tError);
        return;
    }
    console.log('Created Task:', task.id);

    // 3. Run Orchestrator Plan Phase
    console.log('--- Executing Orchestrator Planning Phase ---');
    const orchestrator = new Orchestrator(task.id);
    await orchestrator.plan(taskDesc);

    // 4. Verify Result
    const { data: updatedTask } = await supabase.from('Tasks').select('metadata, status').eq('id', task.id).single();

    console.log('--- Planning Result ---');
    console.log('Status:', updatedTask.status);
    console.log('Analysis:', JSON.stringify(updatedTask.metadata.analysis, null, 2));
    console.log('Workflow:', JSON.stringify(updatedTask.metadata.workflow, null, 2));

    if (updatedTask.metadata.analysis && updatedTask.metadata.workflow && updatedTask.metadata.workflow.steps.length > 0) {
        console.log('SUCCESS: Plan generated.');
    } else {
        console.log('FAILURE: Plan generation failed or empty.');
    }
}

runTest();
