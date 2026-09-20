import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarRasterSurface } from '../calendar-puzzle/raster-surface.ts';

function factory() {
  const canvases = [];
  return { canvases, create(width, height) {
    const context = { transforms: [], clears: [], setTransform(...value) { this.transforms.push(value); }, clearRect(...value) { this.clears.push(value); } };
    const canvas = { width, height, context, getContext: () => context };
    canvases.push(canvas);
    return canvas;
  } };
}
test('1000 copied text updates use one surface and reset transforms before each redraw', () => {
  const f = factory(), raster = new CalendarRasterSurface(f.create, true);
  for (let i = 0; i < 1000; i++) {
    const width = i % 2 ? 256 : 512;
    const canvas = raster.acquire(width, 64);
    assert.equal(canvas.width, width);
    assert.deepEqual(canvas.context.transforms.at(-1), [1, 0, 0, 1, 0, 0]);
    assert.deepEqual(canvas.context.clears.at(-1), [0, 0, width, 64]);
  }
  assert.equal(f.canvases.length, 1);
  raster.dispose();
  assert.notEqual(raster.acquire(256, 64), f.canvases[0]);
});
test('web materials retain independent canvas sources after another label is drawn', () => {
  const f = factory(), raster = new CalendarRasterSurface(f.create, false);
  const first = raster.acquire(64, 64), next = raster.acquire(128, 32);
  assert.notEqual(first, next);
  assert.equal(first.width, 64);
  assert.equal(first.height, 64);
  assert.equal(first.context.clears.length, 1);
});
