import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateSkillArgsBeforeExecution } from './arg-schemas';

test('read_codebase: accepts one non-empty path', () => {
    const out = validateSkillArgsBeforeExecution('read_codebase', ['src/foo.ts']);
    assert.deepEqual(out, ['src/foo.ts']);
});

test('read_codebase: rejects empty path string', () => {
    assert.throws(
        () => validateSkillArgsBeforeExecution('read_codebase', ['']),
        /read_codebase.*argument validation failed.*non-empty/i
    );
});

test('read_codebase: drops extra args (e.g. duplicate project path)', () => {
    const out = validateSkillArgsBeforeExecution('read_codebase', ['app/page.tsx', '/abs/project/root']);
    assert.deepEqual(out, ['app/page.tsx']);
});

test('read_codebase: rejects wrong arity', () => {
    assert.throws(
        () => validateSkillArgsBeforeExecution('read_codebase', []),
        /read_codebase.*argument validation failed/i
    );
});

test('list_directory: empty args default to dot', () => {
    const out = validateSkillArgsBeforeExecution('list_directory', []);
    assert.deepEqual(out, ['.']);
});

test('unregistered skill name: passthrough', () => {
    const raw = ['a', 2];
    const out = validateSkillArgsBeforeExecution('some_dynamic_skill_xyz', raw);
    assert.strictEqual(out, raw);
});
