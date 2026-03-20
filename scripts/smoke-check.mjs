/**
 * 레포 구조 스모크: 핵심 엔트리·신규 게이트 API 파일 존재 여부를 검사합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REQUIRED_PATHS = [
    'lib/agents/Orchestrator.ts',
    'lib/agent-roster-heuristics.ts',
    'lib/project-dev-server.ts',
    'lib/qa/page-smoke-check.ts',
    'lib/qa/infer-route-from-files.ts',
    'lib/qa/artifact-slots.ts',
    'lib/qa/artifact-paths.ts',
    'lib/qa/signoff-report.ts',
    'app/api/project/qa-artifact/route.ts',
    'lib/skills/index.ts',
    'docs/templates/new-agent-AGENT.md',
    'docs/target-workspace-environment.md',
    'lib/pre-execution/gates.ts',
    'lib/pre-execution/task-context.ts',
    'app/api/agent/clarify/generate/route.ts',
    'app/api/agent/clarify/submit/route.ts',
    'app/api/agent/execution/acknowledge-impact/route.ts',
    'components/KanbanBoard.tsx',
    'components/TaskDetailsModal.tsx',
];

let failed = false;
for (const rel of REQUIRED_PATHS) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
        console.error(`[smoke-check] missing: ${rel}`);
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}

console.log('[smoke-check] ok');
