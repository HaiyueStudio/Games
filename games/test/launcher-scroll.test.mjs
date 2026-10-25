import test from 'node:test';
import assert from 'node:assert/strict';
import { MomentumScrollView } from '../launcher/MomentumScrollView.ts';

function shelf() {
  const view = new MomentumScrollView({ width: 400, height: 200, inertia: true });
  view.layout({ x: 0, y: 0, width: 400, height: 200 }); view.setContentHeight(2000);
  return view;
}

test('wheel input continues smoothly after the final event and settles without overshoot', () => {
  const view = shelf(); view.scrollBy(240);
  assert.equal(view.scrollY, 0); assert.equal(view.animating, true);
  view.advanceAnimation(16); const first = view.scrollY;
  view.advanceAnimation(100);
  assert.ok(first > 0 && view.scrollY > first && view.scrollY < 240);
  for (let frame = 0; frame < 120; frame++) { view.advanceAnimation(16); assert.ok(view.scrollY <= 240); }
  assert.equal(view.scrollY, 240); assert.equal(view.animating, false);
});

test('wheel momentum is independent of animation cadence and consecutive events accumulate', () => {
  const regular = shelf(), slow = shelf();
  for (const view of [regular, slow]) { view.scrollBy(120); view.scrollBy(120); view.scrollBy(120); }
  for (let frame = 0; frame < 60; frame++) regular.advanceAnimation(1000 / 60);
  for (let frame = 0; frame < 30; frame++) slow.advanceAnimation(1000 / 30);
  assert.ok(Math.abs(regular.scrollY - slow.scrollY) < .001);
  assert.ok(regular.scrollY > 359 && regular.scrollY <= 360);
});

test('reversing the wheel responds immediately and direct scrolling cancels the pending motion', () => {
  const view = shelf(); view.scrollBy(800); view.advanceAnimation(100);
  const beforeReverse = view.scrollY; view.scrollBy(-100); view.advanceAnimation(16);
  assert.ok(view.scrollY < beforeReverse);
  view.scrollTo(30); view.advanceAnimation(400);
  assert.equal(view.scrollY, 30); assert.equal(view.animating, false);
  view.scrollBy(500); view.stopInertia(); view.advanceAnimation(400);
  assert.equal(view.scrollY, 30); assert.equal(view.animating, false);
});

test('scroll bounds, touch fling and reduced motion retain their native contracts', () => {
  const view = shelf(); view.scrollBy(10000); view.advanceAnimation(3000);
  assert.equal(view.scrollY, view.maxScrollY); assert.equal(view.animating, false);
  view.scrollTo(200); view.scrollBy(300); view.fling(800); view.advanceAnimation(100);
  assert.ok(view.scrollY > 200 && view.scrollY < 300, 'touch fling replaces the wheel target');
  view.stopInertia(); view.inertia = false; view.scrollBy(120);
  assert.equal(view.animating, false);
  const still = view.scrollY; view.advanceAnimation(500); assert.equal(view.scrollY, still);
  for (const delta of [NaN, Infinity, -Infinity]) view.scrollBy(delta);
  assert.equal(view.scrollY, still);
});
