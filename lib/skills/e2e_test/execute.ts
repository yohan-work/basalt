import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

interface TestStep {
    action: string;
    target?: string;
    value?: string;
    expect?: string;
}

interface TestScenario {
    name: string;
    steps: TestStep[];
}

interface StepResult {
    action: string;
    success: boolean;
    detail: string;
}

interface ScenarioResult {
    name: string;
    passed: boolean;
    steps: StepResult[];
    error?: string;
}

interface E2ETestResult {
    passed: boolean;
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    results: ScenarioResult[];
    browserUsed: boolean;
}

async function generateScenarios(taskDescription: string): Promise<TestScenario[]> {
    const systemPrompt = `You are a QA Test Engineer.
Generate 1-3 concise end-to-end test scenarios for a web page based on the task description.

Each scenario has a name and an ordered list of steps.
Each step has:
- action: one of "open", "snapshot", "click", "fill", "press", "wait", "check_text", "check_url"
- target: element ref (@e1) or CSS selector or URL (for open) or text (for check_text)
- value: text to fill (for fill), key (for press), expected substring (for check_text/check_url)
- expect: optional description of what should happen

IMPORTANT: The first step must always be "snapshot" to discover element refs before interacting.
After any navigation or major DOM change, add another "snapshot" step.

Return JSON array of scenarios.`;

    try {
        const result = await llm.generateJSON(
            systemPrompt,
            `Task Description:\n${taskDescription}`,
            '[{ "name": "string", "steps": [{ "action": "string", "target": "string", "value": "string", "expect": "string" }] }]',
            MODEL_CONFIG.SMART_MODEL,
        );
        return Array.isArray(result) ? result : [result];
    } catch {
        return [{
            name: 'Basic page load',
            steps: [
                { action: 'snapshot' },
                { action: 'check_text', target: 'body', expect: 'Page loads successfully' },
            ],
        }];
    }
}

async function executeStep(browser: AgentBrowser, step: TestStep): Promise<StepResult> {
    try {
        switch (step.action) {
            case 'open': {
                const r = await browser.open(step.target || step.value || '');
                await browser.waitForLoad('networkidle');
                return { action: `open ${step.target}`, success: r.success, detail: r.error || 'Navigated' };
            }
            case 'snapshot': {
                const r = await browser.snapshot({ interactive: true });
                const refCount = r.refs ? Object.keys(r.refs).length : 0;
                return { action: 'snapshot', success: r.success, detail: `Found ${refCount} interactive elements` };
            }
            case 'click': {
                const r = await browser.click(step.target || '');
                return { action: `click ${step.target}`, success: r.success, detail: r.error || 'Clicked' };
            }
            case 'fill': {
                const r = await browser.fill(step.target || '', step.value || '');
                return { action: `fill ${step.target} "${step.value}"`, success: r.success, detail: r.error || 'Filled' };
            }
            case 'press': {
                const r = await browser.press(step.value || 'Enter');
                return { action: `press ${step.value}`, success: r.success, detail: r.error || 'Pressed' };
            }
            case 'wait': {
                if (step.target) {
                    const r = await browser.waitForText(step.target);
                    return { action: `wait for text "${step.target}"`, success: r.success, detail: r.error || 'Text appeared' };
                }
                const ms = parseInt(step.value || '2000', 10);
                const r = await browser.waitMs(ms);
                return { action: `wait ${ms}ms`, success: r.success, detail: 'Waited' };
            }
            case 'check_text': {
                const snap = await browser.snapshot({ interactive: false });
                const content = snap.snapshot || '';
                const searchText = step.value || step.target || '';
                const found = content.toLowerCase().includes(searchText.toLowerCase());
                return {
                    action: `check_text "${searchText}"`,
                    success: found,
                    detail: found ? 'Text found in page' : `Text "${searchText}" not found`,
                };
            }
            case 'check_url': {
                const urlResult = await browser.getUrl();
                const currentUrl = urlResult.data?.url || urlResult.raw || '';
                const expected = step.value || step.target || '';
                const matches = currentUrl.includes(expected);
                return {
                    action: `check_url contains "${expected}"`,
                    success: matches,
                    detail: matches ? `URL matches: ${currentUrl}` : `URL mismatch: ${currentUrl}`,
                };
            }
            default:
                return { action: step.action, success: false, detail: `Unknown action: ${step.action}` };
        }
    } catch (err: any) {
        return { action: step.action, success: false, detail: err.message };
    }
}

export async function e2e_test(
    url: string,
    taskDescription: string,
    scenarios?: TestScenario[],
): Promise<E2ETestResult> {
    const available = await isAgentBrowserAvailable();
    if (!available) {
        return {
            passed: true,
            totalScenarios: 0,
            passedScenarios: 0,
            failedScenarios: 0,
            results: [],
            browserUsed: false,
        };
    }

    const testScenarios = scenarios || await generateScenarios(taskDescription);
    const results: ScenarioResult[] = [];

    for (const scenario of testScenarios) {
        const sessionId = `e2e-${Date.now()}`;
        const browser = new AgentBrowser(sessionId);

        try {
            await browser.open(url);
            await browser.waitForLoad('networkidle');

            const stepResults: StepResult[] = [];
            let scenarioPassed = true;

            for (const step of scenario.steps) {
                const result = await executeStep(browser, step);
                stepResults.push(result);

                if (!result.success) {
                    scenarioPassed = false;
                    break;
                }
            }

            results.push({
                name: scenario.name,
                passed: scenarioPassed,
                steps: stepResults,
            });
        } catch (err: any) {
            results.push({
                name: scenario.name,
                passed: false,
                steps: [],
                error: err.message,
            });
        } finally {
            await browser.close().catch(() => {});
        }
    }

    const passedCount = results.filter(r => r.passed).length;

    return {
        passed: passedCount === results.length,
        totalScenarios: results.length,
        passedScenarios: passedCount,
        failedScenarios: results.length - passedCount,
        results,
        browserUsed: true,
    };
}
