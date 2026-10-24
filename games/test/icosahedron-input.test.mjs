import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardGesture } from '../icosahedron-minesweeper/input/BoardGesture.ts';

test('individual mouse buttons reveal and flag once despite compatibility mouseup', () => {
  for (const [button, buttons, kind] of [[0, 1, 'reveal'], [2, 2, 'flag']]) {
    const gesture = new BoardGesture();
    gesture.begin(100, 100, button, buttons, 1, 42);
    assert.deepEqual(gesture.release(100, 100, 0, 42), { cellId: 42, kind });
    assert.equal(gesture.release(100, 100, 0, 42), null);
  }
});

test('both chord press orders and both release orders produce exactly one chord', () => {
  for (const first of [0, 2]) for (const remaining of [1, 2]) {
    const gesture = new BoardGesture();
    gesture.begin(100, 100, first, first === 0 ? 1 : 2, 1, 42);
    // Native pointerdown is absent for the second button: mousedown/move carry buttons=3.
    gesture.move(101, 101, 3);
    assert.equal(gesture.chording, true);
    assert.deepEqual(gesture.release(101, 101, remaining, 42), { cellId: 42, kind: 'chord' });
    assert.equal(gesture.active, true);
    assert.equal(gesture.release(101, 101, 0, 42), null);
    assert.equal(gesture.release(101, 101, 0, 42), null);
    assert.equal(gesture.active, false);
  }
});

test('release packet with another button held also identifies a chord', () => {
  const gesture = new BoardGesture();
  gesture.begin(0, 0, 0, 1, 1, 8);
  assert.deepEqual(gesture.release(0, 0, 2, 8), { cellId: 8, kind: 'chord' });
});

test('dragging, cancellation, changing target and multi-touch cannot accidentally reveal a cell', () => {
  const gesture = new BoardGesture();
  gesture.begin(0, 0, 0, 1, 1, 8); gesture.move(7, 0, 1); gesture.move(0, 0, 0);
  assert.equal(gesture.release(0, 0, 0, 8), null, 'Returning to origin does not convert a drag to a click');
  gesture.begin(0, 0, 0, 1, 1, 8); gesture.cancel();
  assert.equal(gesture.release(0, 0, 0, 8), null);
  gesture.begin(0, 0, 0, 1, 1, 8);
  assert.equal(gesture.release(0, 0, 0, 9), null);
  gesture.begin(0, 0, 0, 1, 1, 8); gesture.begin(0, 0, 0, 1, 2, 8);
  assert.equal(gesture.release(0, 0, 0, 8), null);
});
