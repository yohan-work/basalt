
// Set env vars BEFORE any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-key';

async function main() {
    // Dynamic import to ensure env vars are set first
    const { Orchestrator } = await import('../lib/agents/Orchestrator');

    console.log('--- Testing Orchestrator Integration ---');

    // 1. Instantiate
    const taskId = 'test-task-' + Date.now();
    console.log(`Creating Orchestrator for Task ID: ${taskId}`);
    const orchestrator = new Orchestrator(taskId);

    // 2. Run Task
    const taskDescription = "Create a modern login page with Next.js and Tailwind";
    console.log(`\nInvoking run() with task: "${taskDescription}"`);

    try {
        // 2. Plan
        console.log(`\n--- [Phase 1] Planning ---`);
        await orchestrator.plan(taskDescription);

        // 3. Execute
        console.log(`\n--- [Phase 2] Execution ---`);
        await orchestrator.execute();

        // 4. Verify
        console.log(`\n--- [Phase 3] Verification ---`);
        await orchestrator.verify();

        console.log('\n--- Orchestrator Workflow Completed Successfully ---');
    } catch (error) {
        console.error('\n--- Orchestrator Run Failed ---', error);
    }
}

main();
