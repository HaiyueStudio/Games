import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GAME_2048_ID,
  GAME_2048_SAVE_DATA_VERSION,
  GAME_2048_SAVE_ID,
  isGame2048SaveData,
} from '../2048/saveState.ts';

const valid = {
  rows: 4,
  cols: 4,
  board: [
    [0, 2, 4, 8],
    [16, 32, 64, 128],
    [256, 512, 1024, 2048],
    [0, 0, 2, 4],
  ],
  score: 4096,
  best: 8192,
  phase: 'playing',
};

test('2048 declares one stable autosave identity and validates complete game data', () => {
  assert.equal(GAME_2048_ID, '2048');
  assert.equal(GAME_2048_SAVE_ID, 'autosave');
  assert.equal(GAME_2048_SAVE_DATA_VERSION, 1);
  assert.equal(isGame2048SaveData(valid, 4, 4), true);
});

test('2048 save validation rejects wrong board shape, illegal tiles, and incomplete scores', () => {
  assert.equal(isGame2048SaveData({ ...valid, board: [[2]] }, 4, 4), false);
  const illegalTile = structuredClone(valid);
  illegalTile.board[0][0] = 3;
  assert.equal(isGame2048SaveData(illegalTile, 4, 4), false);
  const largeTile = structuredClone(valid);
  largeTile.board[0][0] = 2 ** 40;
  assert.equal(isGame2048SaveData(largeTile, 4, 4), true);
  assert.equal(isGame2048SaveData({ ...valid, best: 1 }, 4, 4), false);
});

test('2048 persistence goes through the engine save facade without direct storage calls', async () => {
  const source = await readFile(new URL('../2048/Game2048.ts', import.meta.url), 'utf8');
  assert.match(source, /from '@haiyue\/engine\/save'/);
  assert.match(source, /maxSlots:\s*1/);
  assert.doesNotMatch(source, /localStorage\.(getItem|setItem|removeItem)/);
});
