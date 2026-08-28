import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseGame2048Config } from '../2048/config.ts';

async function readConfig() {
  return JSON.parse(await readFile(new URL('../2048/config.json', import.meta.url), 'utf8'));
}

test('2048 JSON config owns board, geometry, animation, input, and palette settings', async () => {
  const config = parseGame2048Config(await readConfig());

  assert.ok(config.rows >= 2 && config.cols >= 2);
  assert.equal(config.geometry.cellSize, 1.22);
  assert.equal(config.geometry.cellHeight, 0.14);
  assert.equal(config.geometry.tileHeight, 0.28);
  assert.equal(config.animation.moveDurationMs, 130);
  assert.equal(config.input.swipeThreshold, 24);
  assert.deepEqual(config.colors.tiles['2048'], { bg: '#edc22e', fg: '#f9f6f2' });
});

test('2048 config validation rejects unsafe dimensions and malformed colors', async () => {
  const raw = await readConfig();

  assert.throws(
    () => parseGame2048Config({ ...raw, geometry: { ...raw.geometry, cellSize: 0 } }),
    /geometry\.cellSize/,
  );
  assert.throws(
    () => parseGame2048Config({
      ...raw,
      colors: {
        ...raw.colors,
        tiles: { ...raw.colors.tiles, 2: { bg: 'red', fg: '#776e65' } },
      },
    }),
    /colors\.tiles\.2\.bg/,
  );
});
