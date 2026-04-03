import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test } from 'node:test';

import { ProjectProfiler } from './profiler';

function writeJson(filePath: string, value: unknown) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('ProjectProfiler invalidateCache picks up newly added UI files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-profiler-'));
    writeJson(path.join(root, 'package.json'), {
        name: 'temp-app',
        private: true,
        dependencies: {
            next: '16.1.1',
            react: '19.2.3',
            'react-dom': '19.2.3',
            typescript: '^5.0.0',
        },
    });
    fs.mkdirSync(path.join(root, 'components', 'ui'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'components', 'ui', 'button.tsx'),
        'export const Button = () => null;\n',
        'utf8'
    );

    const profiler = new ProjectProfiler(root);
    const first = await profiler.getProfileData();
    assert.deepEqual(first.availableUIComponents, ['button']);

    fs.writeFileSync(
        path.join(root, 'components', 'ui', 'table.tsx'),
        'export const Table = () => null;\n',
        'utf8'
    );

    const cached = await profiler.getProfileData();
    assert.deepEqual(cached.availableUIComponents, ['button']);

    profiler.invalidateCache();
    const refreshed = await profiler.getProfileData();
    assert.deepEqual(refreshed.availableUIComponents.sort(), ['button', 'table']);
});

