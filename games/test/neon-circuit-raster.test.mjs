import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadNeonCanvas } from '../neon-circuit/NeonRaster.ts';

globalThis.GPUTextureUsage ??= { TEXTURE_BINDING: 4, COPY_DST: 2 };
test('native raster upload preserves the exact straight-alpha pixel view and array layer', () => {
  const texture = {}, calls = [], rgba = new Uint8Array([99, 255, 40, 20, 128, 66]);
  const device = { queue: { writeTexture: (...args) => calls.push(args) } };
  const raster = { pixels: () => rgba.subarray(1,5) };
  assert.equal(uploadNeonCanvas(device, raster, { width: 1, height: 1 }, texture, 3), texture);
  assert.deepEqual(calls[0][0], { texture, origin: { x:0, y:0, z:3 } });
  assert.deepEqual([...calls[0][1]], [255,40,20,128]);
  assert.deepEqual(calls[0][2], { bytesPerRow: 4 });
  assert.deepEqual(calls[0][3], [1,1]);
});
test('failed upload releases a newly allocated texture but leaves borrowed atlas ownership intact', () => {
  let destroyed = 0;
  const texture = { destroy: () => destroyed++ };
  const device = { createTexture: () => texture, queue: { writeTexture() { throw Error('upload failed'); } } };
  const raster = { pixels: () => new Uint8Array(4) };
  assert.throws(() => uploadNeonCanvas(device, raster, { width: 1, height: 1 }), /upload failed/);
  assert.equal(destroyed, 1);
  assert.throws(() => uploadNeonCanvas(device, raster, { width: 1, height: 1 }, texture), /upload failed/);
  assert.equal(destroyed, 1);
});
