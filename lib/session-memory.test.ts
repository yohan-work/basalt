import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    appendSessionMemoryEntry,
    loadRelevantSessionMemory,
    resolveSessionMemoryRoot,
} from './session-memory';

test('appendSessionMemoryEntry writes a readable memory file', async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-session-memory-'));
    try {
        const filePath = await appendSessionMemoryEntry({
            projectPath,
            taskId: 'task-123',
            kind: 'plan',
            title: 'Plan: billing dashboard',
            summary: 'Build a billing dashboard with local mock data.',
            body: '## Notes\nUse plain HTML table.',
            keywords: ['billing', 'dashboard'],
            source: 'test',
            metadata: { priority: 'high' },
        });

        assert.equal(filePath.startsWith(resolveSessionMemoryRoot(projectPath)), true);
        assert.equal(fs.existsSync(filePath), true);

        const content = fs.readFileSync(filePath, 'utf8');
        assert.match(content, /kind: plan/);
        assert.match(content, /title: "Plan: billing dashboard"/);
        assert.match(content, /summary: "Build a billing dashboard with local mock data\."?/);
    } finally {
        fs.rmSync(projectPath, { recursive: true, force: true });
    }
});

test('loadRelevantSessionMemory returns the most relevant memories first', async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-session-memory-'));
    try {
        await appendSessionMemoryEntry({
            projectPath,
            taskId: 'task-plan',
            kind: 'plan',
            title: 'Plan: billing dashboard',
            summary: 'Build a billing dashboard with charts and invoices.',
            body: 'Focus on billing, invoices, and payment history.',
            keywords: ['billing', 'dashboard', 'invoices'],
            source: 'test',
        });

        await appendSessionMemoryEntry({
            projectPath,
            taskId: 'task-qa',
            kind: 'qa',
            title: 'QA: profile screen',
            summary: 'Profile screen smoke test passed.',
            body: 'No billing content here.',
            keywords: ['profile'],
            source: 'test',
        });

        const result = await loadRelevantSessionMemory(projectPath, 'billing invoices', { limit: 1, maxChars: 2000 });
        assert.match(result, /SESSION_MEMORY/);
        assert.match(result, /\[plan\] Plan: billing dashboard/);
        assert.doesNotMatch(result, /\[qa\] QA: profile screen/);
    } finally {
        fs.rmSync(projectPath, { recursive: true, force: true });
    }
});
