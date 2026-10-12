import assert from 'node:assert/strict';
import test from 'node:test';
import { guardQueuedPointerCapture } from '../tank-battle/pointerCapture.ts';

class CaptureCanvas extends EventTarget {
  held = new Set();
  active = new Set();
  setPointerCapture(id) { assert.ok(this.active.has(id), 'must not capture an ended pointer'); this.held.add(id); }
  releasePointerCapture(id) { assert.ok(this.active.has(id), 'native release cannot run after pointer end'); this.held.delete(id); }
  hasPointerCapture(id) { return this.held.has(id); }
  pointer(type, id) {
    if (type === 'pointerdown') this.active.add(id);
    else { this.active.delete(id); this.held.delete(id); }
    this.dispatchEvent(Object.assign(new Event(type), { pointerId: id }));
  }
}
test('queued GUI capture preserves concurrent live pointers and ignores ended touch pointers', () => {
  const canvas = new CaptureCanvas(); const restore = guardQueuedPointerCapture(canvas);
  canvas.pointer('pointerdown', 1); canvas.pointer('pointerdown', 2);
  canvas.setPointerCapture(1); canvas.setPointerCapture(2); assert.equal(canvas.held.size, 2);
  canvas.pointer('pointerup', 1); canvas.releasePointerCapture(1); canvas.setPointerCapture(1);
  assert.deepEqual([...canvas.held], [2]);
  canvas.pointer('pointerdown', 1); canvas.setPointerCapture(1); canvas.releasePointerCapture(1);
  assert.ok(canvas.hasPointerCapture(1), 'old queued release must not cancel a new gesture with the same ID');
  canvas.pointer('pointerup', 1);
  canvas.pointer('pointercancel', 2); canvas.releasePointerCapture(2); assert.equal(canvas.held.size, 0);
  restore();
});
test('capture adapter teardown releases active pointers and restores original methods', () => {
  const canvas = new CaptureCanvas(); const capture = canvas.setPointerCapture; const release = canvas.releasePointerCapture;
  const restore = guardQueuedPointerCapture(canvas); canvas.pointer('pointerdown', 3); canvas.setPointerCapture(3);
  restore(); assert.equal(canvas.held.size, 0); assert.equal(canvas.setPointerCapture, capture); assert.equal(canvas.releasePointerCapture, release);
  const again = guardQueuedPointerCapture(canvas); canvas.pointer('pointerdown', 4); canvas.setPointerCapture(4); again();
  assert.equal(canvas.held.size, 0);
});
