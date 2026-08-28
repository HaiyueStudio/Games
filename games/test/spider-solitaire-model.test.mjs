import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPIDER_COLUMN_COUNT,
  cloneSpiderColumns,
  isSpiderSaveData,
  shuffleSpiderCards,
} from '../spider-solitaire/model.ts';

test('Spider Solitaire clones nested card state without sharing references', () => {
  const source = Array.from({ length: SPIDER_COLUMN_COUNT }, (_, column) => [
    { id: column, rank: 1, faceUp: column === 0 },
  ]);
  const clone = cloneSpiderColumns(source);

  clone[0][0].faceUp = false;

  assert.equal(source[0][0].faceUp, true);
  assert.notEqual(clone[0], source[0]);
  assert.notEqual(clone[0][0], source[0][0]);
});

test('Spider Solitaire shuffle supports deterministic random sources', () => {
  const cards = [1, 2, 3, 4];

  assert.deepEqual(shuffleSpiderCards(cards, () => 0), [2, 3, 4, 1]);
});

test('Spider Solitaire save validation rejects malformed columns and cards', () => {
  const columns = Array.from({ length: SPIDER_COLUMN_COUNT }, () => []);
  const valid = {
    columns,
    stock: [{ id: 1, rank: 13, faceUp: false }],
    completedRuns: 0,
    moves: 4,
  };

  assert.equal(isSpiderSaveData(valid), true);
  assert.equal(isSpiderSaveData({ ...valid, columns: columns.slice(1) }), false);
  assert.equal(isSpiderSaveData({ ...valid, stock: [{ id: 1, rank: 14, faceUp: false }] }), false);
});
