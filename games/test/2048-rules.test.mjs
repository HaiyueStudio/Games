import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateMove, canMove } from '../2048/rules.ts';

test('2048 move rules merge each tile once and report gained score', () => {
  const result = calculateMove([[2, 2, 2, 2]], 'left');
  assert.deepEqual(result.board, [[4, 4, 0, 0]]);
  assert.equal(result.gained, 8);

  const chained = calculateMove([[2, 2, 4, 0]], 'left');
  assert.deepEqual(chained.board, [[4, 4, 0, 0]]);
  assert.equal(chained.gained, 4);
});

test('2048 move availability detects empty and adjacent matching cells', () => {
  assert.equal(canMove([[2, 4], [8, 16]]), false);
  assert.equal(canMove([[2, 2], [8, 16]]), true);
  assert.equal(canMove([[2, 4], [0, 16]]), true);
});
