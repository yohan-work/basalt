import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test } from 'node:test';

import {
    projectTypecheckOutputHasErrors,
    stripBenignNextValidatorTs2307,
} from './next-validator-filter';

test('strip removes TS2307 when page.tsx exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-nvf-'));
    const pageDir = path.join(root, 'app', 'boards', '[boardId]');
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, 'page.tsx'), 'export default function P() { return null }\n', 'utf8');

    const line =
        ".next/types/validator.ts(42,39): error TS2307: Cannot find module '../../app/boards/[boardId]/page.js' or its corresponding type declarations.";
    const out = stripBenignNextValidatorTs2307(line, root);
    assert.equal(out.trim(), '');
    assert.equal(projectTypecheckOutputHasErrors(out), false);
});

test('strip keeps TS2307 when no source file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-nvf-'));
    const line =
        ".next/types/validator.ts(42,39): error TS2307: Cannot find module '../../app/missing/route.js' or its corresponding type declarations.";
    const out = stripBenignNextValidatorTs2307(line, root);
    assert.ok(out.includes('TS2307'));
    assert.equal(projectTypecheckOutputHasErrors(out), true);
});
