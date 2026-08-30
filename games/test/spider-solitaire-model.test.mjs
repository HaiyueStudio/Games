import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPIDER_COLUMN_COUNT,
  cloneSpiderColumns,
  createSpiderDeck,
  isSpiderCompleteRun,
  isSpiderMovableRun,
  isSpiderSaveData,
  shuffleSpiderCards,
} from '../spider-solitaire/model.ts';

test('Spider Solitaire clones nested card state without sharing references', () => {
  const source = Array.from({ length: SPIDER_COLUMN_COUNT }, (_, column) => [
    { id: column, rank: 1, suit: 'spades', faceUp: column === 0 },
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
    difficulty: 'normal',
    columns,
    stock: [{ id: 1, rank: 13, suit: 'hearts', faceUp: false }],
    completedRuns: 0,
    completedSuits: [],
    moves: 4,
  };

  assert.equal(isSpiderSaveData(valid), true);
  assert.equal(isSpiderSaveData({ ...valid, columns: columns.slice(1) }), false);
  assert.equal(isSpiderSaveData({ ...valid, difficulty: 'expert' }), false);
  assert.equal(isSpiderSaveData({ ...valid, stock: [{ id: 1, rank: 14, suit: 'spades', faceUp: false }] }), false);
  assert.equal(isSpiderSaveData({ ...valid, stock: [{ id: 1, rank: 13, suit: 'stars', faceUp: false }] }), false);
});

test('Spider Solitaire builds 104-card decks for all three suit difficulties', () => {
  const easy = createSpiderDeck('easy', () => 0.5);
  const normal = createSpiderDeck('normal', () => 0.5);
  const hard = createSpiderDeck('hard', () => 0.5);

  assert.equal(easy.length, 104);
  assert.deepEqual(new Set(easy.map(card => card.suit)), new Set(['spades']));
  assert.deepEqual(new Set(normal.map(card => card.suit)), new Set(['spades', 'hearts']));
  assert.deepEqual(new Set(hard.map(card => card.suit)), new Set(['spades', 'hearts', 'diamonds', 'clubs']));
  for (const suit of ['spades', 'hearts']) {
    assert.equal(normal.filter(card => card.suit === suit).length, 52);
  }
  for (const suit of ['spades', 'hearts', 'diamonds', 'clubs']) {
    assert.equal(hard.filter(card => card.suit === suit).length, 26);
  }
});

test('Spider Solitaire only moves and completes descending runs of one suit', () => {
  const card = (id, rank, suit = 'spades') => ({ id, rank, suit, faceUp: true });
  const sameSuit = [card(1, 5), card(2, 4), card(3, 3)];
  const mixedSuit = [card(1, 5), card(2, 4, 'hearts'), card(3, 3, 'hearts')];
  const complete = Array.from({ length: 13 }, (_, index) => card(index + 1, 13 - index, 'clubs'));

  assert.equal(isSpiderMovableRun(sameSuit), true);
  assert.equal(isSpiderMovableRun(mixedSuit), false);
  assert.equal(isSpiderCompleteRun(complete), true);
  assert.equal(isSpiderCompleteRun(complete.map((value, index) => index === 8 ? { ...value, suit: 'diamonds' } : value)), false);
});
