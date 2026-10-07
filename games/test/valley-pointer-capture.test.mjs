import assert from 'node:assert/strict';
import test from 'node:test';
import { guardDeferredPointerCapture } from '../valley-of-light/canvasInput.ts';

test('queued GUI release cannot cancel a newer gesture with the same mouse ID',()=>{
  class Canvas extends EventTarget {
    captured=new Set();
    hasPointerCapture(id){return this.captured.has(id);}
    setPointerCapture(id){this.captured.add(id);}
    releasePointerCapture(id){this.captured.delete(id);}
  }
  const canvas=new Canvas(),abort=new AbortController();
  const cancel=guardDeferredPointerCapture(canvas,abort.signal);
  const emit=type=>canvas.dispatchEvent(Object.assign(new Event(type),{pointerId:1}));
  emit('pointerdown');canvas.setPointerCapture(1);emit('pointerup');
  emit('pointerdown');canvas.setPointerCapture(1);
  canvas.releasePointerCapture(1);assert.equal(canvas.hasPointerCapture(1),true,'late release from previous gesture must be ignored');
  cancel(1);assert.equal(canvas.hasPointerCapture(1),false,'explicit host cancellation releases active capture');
  canvas.setPointerCapture(1);emit('pointerup');canvas.releasePointerCapture(1);assert.equal(canvas.hasPointerCapture(1),false);
  canvas.setPointerCapture(1);assert.equal(canvas.hasPointerCapture(1),false,'ended pointers cannot be captured by queued GUI work');
  emit('pointerdown');canvas.setPointerCapture(1);abort.abort();assert.equal(canvas.hasPointerCapture(1),false);
  assert.equal(Object.hasOwn(canvas,'setPointerCapture'),false);assert.equal(Object.hasOwn(canvas,'releasePointerCapture'),false);
});
