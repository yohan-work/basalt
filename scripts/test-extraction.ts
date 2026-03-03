
import { extractFilesFromRaw } from '../lib/llm';

const testCases = [
    {
        name: 'Standard Raw Format',
        input: `Here is the code:
File: app/page.tsx
\`\`\`tsx
export default function Page() { return <div>Hello</div> }
\`\`\`
`,
        expected: [{ path: 'app/page.tsx', content: 'export default function Page() { return <div>Hello</div> }' }]
    },
    {
        name: 'Multiple Files',
        input: `I have updated two files.
File: lib/utils.ts
\`\`\`ts
export const add = (a, b) => a + b;
\`\`\`

File: components/Button.tsx
\`\`\`tsx
export const Button = () => <button>Click</button>;
\`\`\`
`,
        expected: [
            { path: 'lib/utils.ts', content: 'export const add = (a, b) => a + b;' },
            { path: 'components/Button.tsx', content: 'export const Button = () => <button>Click</button>;' }
        ]
    }
];

function runTests() {
    let success = true;
    for (const tc of testCases) {
        const result = extractFilesFromRaw(tc.input);
        if (JSON.stringify(result) === JSON.stringify(tc.expected)) {
            console.log(`✅ [PASS] ${tc.name}`);
        } else {
            console.error(`❌ [FAIL] ${tc.name}`);
            console.error('Expected:', tc.expected);
            console.error('Got:', result);
            success = false;
        }
    }
    process.exit(success ? 0 : 1);
}

runTests();
