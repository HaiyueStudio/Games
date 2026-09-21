import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBoxboundPerformance } from '../../scripts/boxbound-performance-check.mjs';
function fixture() {
  const resource = () => ({ createdParts: 750, destroyedParts: 0, entities: 750, parts: 746, geometries: 90, materials: 20, labels: 10, transformWrites: 1000, sceneExtractions: 12, gpu: { buffers: 283, textures: 13, querySets: 0, estimatedBytes: 141962360 } });
  return { wake: { jumpWoke: true, resizeWoke: true }, samples: ['start', 'walk-warm', 'walk-repeat', 'rooms-warm', 'rooms-repeat', 'transfer-warm', 'transfer-repeat', 'idle-start', 'idle-end', 'nested-warm', 'nested-repeat', 'recursive-warm', 'recursive-repeat'].map((name) => ({ name, resources: resource() })), teardown: Array.from({ length: 4 }, () => ({ entities: 0, parts: 0, geometries: 0, materials: 0, labels: 0, gpu: { buffers: 1, textures: 2, querySets: 0, estimatedBytes: 46473216 } })) };
}
test('performance diagnostic accepts stable GPU and object lifecycle channels', () => {
  assert.equal(validateBoxboundPerformance(fixture()).length, 17);
});
for (const [name, mutate] of [
  ['nested zoom GPU leak', (p) => p.samples[10].resources.gpu.buffers++],
  ['nested zoom retained meshes', (p) => p.samples[10].resources.parts++],
  ['recursive player GPU leak', (p) => p.samples.at(-1).resources.gpu.buffers++],
  ['recursive player entity churn', (p) => p.samples.at(-1).resources.createdParts++],
  ['idle input wake', (p) => { p.wake.jumpWoke = false; }],
  ['resize wake', (p) => { p.wake.resizeWoke = false; }],
  ['entity churn', (p) => p.samples[2].resources.createdParts++],
  ['GPU leak', (p) => p.samples[4].resources.gpu.buffers++],
  ['retained geometry', (p) => p.samples[6].resources.geometries++],
  ['idle matrix updates', (p) => p.samples[8].resources.transformWrites++],
  ['idle scene extraction', (p) => p.samples[8].resources.sceneExtractions++],
  ['retained labels after disposal', (p) => p.teardown[3].labels++],
  ['GPU residue after disposal', (p) => p.teardown[3].gpu.buffers++],
]) test(`performance diagnostic rejects ${name}`, () => { const p = fixture(); mutate(p); assert.throws(() => validateBoxboundPerformance(p)); });
