import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateMove } from '../2048/rules/rules.ts';
import { mergeMotion } from '../2048/rendering/mergeMotion.ts';

test('2048 exposes both original contributors for merges in every direction', () => {
  const board = [[2, 2, 4, 4], [2, 2, 4, 4], [8, 8, 16, 16], [8, 8, 16, 16]];
  for (const direction of ['left', 'right', 'up', 'down']) {
    const result = calculateMove(board, direction);
    assert.equal(result.merges.length, 8);
    const contributors = new Set();
    let gained = 0;
    for (const merge of result.merges) {
      assert.equal(merge.sources.length, 2);
      for (const source of merge.sources) {
        const key = `${source.fromRow}:${source.fromCol}`;
        assert.ok(!contributors.has(key), 'a source tile may be consumed only once');
        contributors.add(key);
        assert.equal(board[source.fromRow][source.fromCol] * 2, merge.value);
        assert.equal(source.toRow, merge.toRow);
        assert.equal(source.toCol, merge.toCol);
      }
      assert.equal(result.board[merge.toRow][merge.toCol], merge.value);
      gained += merge.value;
    }
    assert.equal(gained, result.gained);
  }
  assert.deepEqual(calculateMove([[2, 4, 0, 0]], 'left').merges, []);
  assert.equal(calculateMove([[2, 2, 4, 0]], 'left').merges.length, 1, 'newly merged tiles do not merge again');
});

test('forge trajectories scatter, then return exactly to a solid shell without duplicate faces', () => {
  for (let triangle = 0; triangle < 192; triangle++) for (let copy = 0; copy < 2; copy++) {
    const start = mergeMotion(0, triangle, copy), middle = mergeMotion(0.5, triangle, copy), end = mergeMotion(1, triangle, copy);
    assert.equal(Math.hypot(start.x, start.y, start.z), 0); assert.equal(start.scale, 1);
    assert.ok(Math.hypot(middle.x, middle.z) > 0.1); assert.ok(middle.y > 0.2);
    assert.ok(Math.hypot(end.x, end.y, end.z, end.rotation) < 1e-12);
    assert.equal(end.scale, copy === 0 ? 1 : 0);
    assert.deepEqual(mergeMotion(0.5, triangle, copy), middle, 'replays are deterministic');
    for (const progress of [-1, 0.01, 0.25, 0.75, 0.99, 2]) for (const value of Object.values(mergeMotion(progress, triangle, copy))) assert.ok(Number.isFinite(value));
  }
});

test('metal SFX are finite, non-clipping PCM files and all runtime assets are declared', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const entry = manifest.entries.find(entry => entry.id === '2048');
  for (const cue of ['slide', 'fracture', 'forge', 'new-game', 'blocked']) {
    const asset = `2048/assets/${cue}.wav`;
    assert.ok(entry.assets.includes(asset));
    const bytes = await readFile(new URL(`../${asset}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt16LE(20), 1); assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt32LE(24), 44100); assert.equal(bytes.readUInt16LE(34), 16);
    assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    let energy = 0, peak = 0;
    for (let offset = 44; offset < bytes.length; offset += 2) { const value = bytes.readInt16LE(offset); energy += value * value; peak = Math.max(peak, Math.abs(value)); }
    assert.ok(peak < 32767 && energy > 0);
    assert.ok(bytes.length / 88200 < 0.65, 'interaction sounds have bounded tails');
  }
  for (const asset of entry.assets) assert.ok((await readFile(new URL(`../${asset}`, import.meta.url))).length > 0);
  assert.ok(entry.capabilities.includes('pbr-workflow'));
});
