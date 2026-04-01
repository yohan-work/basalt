import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'path';
import { assertPathInsideProjectRoot, isPathInsideProjectRoot } from './path-sandbox';

test('allows file inside project', () => {
    const root = path.resolve('/tmp/basalt-sandbox-test/proj');
    const inside = path.join(root, 'src', 'a.ts');
    assert.equal(isPathInsideProjectRoot(root, inside), true);
});

test('rejects parent escape', () => {
    const root = path.resolve('/tmp/basalt-sandbox-test/proj');
    const outside = path.resolve(root, '..', 'etc');
    assert.equal(isPathInsideProjectRoot(root, outside), false);
    assert.throws(() => assertPathInsideProjectRoot(root, outside, 'test'), /outside project root/);
});
