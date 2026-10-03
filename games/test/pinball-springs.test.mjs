import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSpring, newSpring, springCompression } from '../pinball/springRules.ts';

test('pocket spring compresses, launches vertically, then steers after rail clearance', () => {
  const state = newSpring();
  assert.equal(advanceSpring(state, 0, true, -143, 0, -65), null);
  assert.equal(state.phase, 'compressing');
  assert.equal(springCompression(state, .05), .5);
  assert.equal(advanceSpring(state, .11, true, -145, 0, -65), 'launch');
  assert.equal(state.launches, 1);
  assert.equal(advanceSpring(state, .15, false, -100, 8, -65), null);
  assert.equal(advanceSpring(state, .22, false, -60, 8, -65), 'steer');
  assert.equal(advanceSpring(state, .25, true, -140, 0, -65), null);
  assert.equal(state.phase, 'cooldown');
  advanceSpring(state, 1, true, -140, 0, -65);
  assert.equal(state.phase, 'compressing');
});
test('a passing rising ball is not captured; a departed ball is never redirected', () => {
  const state = newSpring();
  advanceSpring(state, 0, true, -140, 5, -65); assert.equal(state.phase, 'idle');
  advanceSpring(state, 1, true, -140, -3, -65);
  assert.equal(advanceSpring(state, 1.11, false, -100, 5, -65), null);
  assert.equal(state.phase, 'idle'); assert.equal(state.launches, 0);
});
test('an obstructed spring eventually rearms and reset removes pending launches', () => {
  const state = newSpring();
  advanceSpring(state, 0, true, -140, 0, -65); advanceSpring(state, .11, true, -140, 0, -65);
  advanceSpring(state, 1.2, true, -140, 0, -65); assert.equal(state.phase, 'cooldown');
  advanceSpring(state, 2, true, -140, 0, -65); assert.equal(state.phase, 'compressing');
  assert.deepEqual(newSpring(), { phase: 'idle', since: 0, launches: 0 });
});
