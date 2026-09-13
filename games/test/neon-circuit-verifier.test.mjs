import assert from 'node:assert/strict';
import test from 'node:test';
import { NEON_SCENES, selectNeonScenes } from '../../scripts/neon-circuit-scenes.mjs';

test('neon browser verifier defaults to the full unique scenario matrix', () => {
  assert.equal(selectNeonScenes().length,24);
  assert.equal(new Set(NEON_SCENES.map(row => row[0])).size,24);
  assert.ok(NEON_SCENES.every(row => row.length === 5 && row[3] > 0 && row[4] > 0));
});
test('targeted neon verification preserves named scenarios and rejects typos', () => {
  assert.deepEqual(selectNeonScenes(['high-speed-mobile','idle','idle']).map(row => row[0]),['idle','high-speed-mobile']);
  assert.throws(() => selectNeonScenes(['not-a-scene']), /Unknown neon-circuit scene/);
});
