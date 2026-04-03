import assert from 'node:assert/strict';
import test from 'node:test';

import { parseThoughtsFromRawText } from './execute';

test('parseThoughtsFromRawText handles pipe-delimited lines', () => {
    const thoughts = parseThoughtsFromRawText(`
product-manager | critique | 수용 기준이 더 분명해야 합니다.
software-engineer | idea | 구현은 가장 단순한 경로로 가야 합니다.
qa | critique | 실패 케이스와 경계값이 빠지면 안 됩니다.
`);

    assert.equal(thoughts.length, 3);
    assert.equal(thoughts[0].agent, 'product-manager');
    assert.equal(thoughts[0].type, 'critique');
    assert.equal(thoughts[1].agent, 'software-engineer');
    assert.equal(thoughts[1].thought, '구현은 가장 단순한 경로로 가야 합니다.');
    assert.equal(thoughts[2].agent, 'qa');
});

test('parseThoughtsFromRawText handles labelled fallback lines', () => {
    const thoughts = parseThoughtsFromRawText(`
- agent: product-manager | type: critique | thought: 수용 기준을 먼저 고정해야 합니다.
- agent: qa | thought: 롤백 경로가 필요합니다.
`);

    assert.equal(thoughts.length, 2);
    assert.equal(thoughts[0].agent, 'product-manager');
    assert.equal(thoughts[0].type, 'critique');
    assert.equal(thoughts[1].agent, 'qa');
    assert.equal(thoughts[1].type, 'idea');
});
