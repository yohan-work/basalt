
const { AgentLoader } = require('../lib/agent-loader');

// Mock process.cwd since we are running via ts-node or node directly
// Adjust if necessary depending on execution context, but usually process.cwd() is root
try {
    console.log('--- Testing AgentLoader ---');

    // Test 1: Load Main Agent
    console.log('\nLoading Main Agent...');
    const mainAgent = AgentLoader.loadAgent('main-agent');
    console.log('Success! Main Agent Name:', mainAgent.name);
    console.log('Sub-Agents:', mainAgent.subAgents);
    console.log('Skills:', mainAgent.skills);

    // Test 2: Load Software Engineer
    console.log('\nLoading Software Engineer...');
    const swe = AgentLoader.loadAgent('software-engineer');
    console.log('Success! SWE Name:', swe.name);
    console.log('SWE Skills:', swe.skills);

    // Test 3: Load a Skill
    console.log('\nLoading Skill: read_codebase...');
    const skill = AgentLoader.loadSkill('read_codebase');
    console.log('Success! Skill Name:', skill.name);
    console.log('Instructions length:', skill.instructions.length);

} catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
}
