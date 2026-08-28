import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyTetrisBoard,
  isTetrisSaveData,
  randomTetrisKind,
  rotateTetrisPoint,
} from '../tetris/rules.ts';

test('Tetris rules create boards and rotate pieces deterministically', () => {
  assert.deepEqual(createEmptyTetrisBoard(2, 3), [[null, null, null], [null, null, null]]);
  assert.deepEqual(rotateTetrisPoint({ row: 1, col: 0 }, 1, 'I'), { row: 0, col: 2 });
  assert.deepEqual(rotateTetrisPoint({ row: 0, col: 1 }, 3, 'O'), { row: 0, col: 1 });
  assert.equal(randomTetrisKind(() => 0), 'I');
  assert.equal(randomTetrisKind(() => 0.999), 'Z');
});

test('Tetris save validation rejects incomplete and malformed state', () => {
  const valid = {
    rows: 2,
    cols: 2,
    board: [['I', null], [null, 'O']],
    current: { kind: 'T', row: 0, col: 0, rotation: 0 },
    nextKind: 'Z',
    phase: 'playing',
    score: 0,
  };
  assert.equal(isTetrisSaveData(valid), true);
  assert.equal(isTetrisSaveData({ ...valid, nextKind: 'X' }), false);
  assert.equal(isTetrisSaveData({ ...valid, board: [[null]] }), false);
});
