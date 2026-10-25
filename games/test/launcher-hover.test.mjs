import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCardHover, cardHoverPose } from '../launcher/cardHoverMotion.ts';

test('hover gently enlarges, tilts and lifts the complete card', () => {
  assert.deepEqual(cardHoverPose(0), { scale: 1, rotation: -0, lift: -0 });
  const pose = cardHoverPose(1);
  assert.equal(pose.scale, 1.045); assert.equal(pose.lift, -2);
  assert.ok(Math.abs(pose.rotation * 180 / Math.PI + 1.2) < .00001);
  assert.deepEqual(cardHoverPose(2), pose); assert.deepEqual(cardHoverPose(-1), cardHoverPose(0));
});

test('hover animation is frame independent, reverses smoothly, and returns exactly to rest', () => {
  let regular = 0, slow = 0;
  for (let frame = 0; frame < 12; frame++) regular = advanceCardHover(regular, true, 1 / 60, true);
  for (let frame = 0; frame < 6; frame++) slow = advanceCardHover(slow, true, 1 / 30, true);
  assert.ok(Math.abs(regular - slow) < .00001); assert.ok(regular > .8 && regular < 1);
  const retreat = advanceCardHover(regular, false, 1 / 60, true);
  assert.ok(retreat > 0 && retreat < regular);
  for (let frame = 0; frame < 60; frame++) regular = advanceCardHover(regular, false, 1 / 60, true);
  assert.equal(regular, 0);
});

test('reduced motion disables card movement without leaving a tilted pose behind', () => {
  assert.equal(advanceCardHover(.75, true, .016, false), 0);
  assert.equal(advanceCardHover(0, true, .5, false), 0);
  assert.equal(advanceCardHover(.3, true, -1, true), .3);
});
