import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, chargeBall, launchBall, hit, loseBall, controlFor, scoreScene } from '../pinball/rules.ts';

test('pinball charge is bounded and a ball can only launch once', () => {
  const state = newGame(); chargeBall(state, 8); assert.equal(state.charge, 1);
  const speed = launchBall(state); assert.ok(Math.abs(speed - 14.6) < 1e-9); assert.equal(state.phase, 'playing');
  assert.equal(launchBall(state), 0); chargeBall(state, 1); assert.equal(state.charge, 0);
});
test('pinball combos expire, cap at five and award target collection bonus', () => {
  const state = newGame(); launchBall(state);
  assert.equal(hit(state, 1), 100); assert.equal(hit(state, 2), 200);
  assert.equal(hit(state, 5), 100);
  for (let i = 0; i < 10; i++) hit(state, 5 + i / 10);
  assert.equal(state.combo, 5);
  assert.equal(hit(state, 6, 0), 750); assert.equal(hit(state, 6.1, 1), 750);
  assert.equal(hit(state, 6.2, 2), 2250); assert.equal(state.targets, 0);
});
test('pinball consumes exactly three active balls and restart resets all rules', () => {
  const state = newGame(); assert.equal(loseBall(state), false);
  for (let i = 2; i >= 0; i--) { launchBall(state); assert.equal(loseBall(state), true); assert.equal(state.balls, i); assert.equal(loseBall(state), false); }
  assert.equal(state.phase, 'over'); assert.equal(launchBall(state), 0); assert.equal(hit(state, 2), 0);
  assert.deepEqual(newGame(), { phase: 'ready', score: 0, balls: 3, combo: 0, lastHit: -100, charge: 0, targets: 0, lanes: 0, spins: 0 });
});
test('WASD and arrows map to identical game controls', () => {
  for (const [a, b] of [['KeyA','ArrowLeft'], ['KeyD','ArrowRight'], ['KeyW','ArrowUp'], ['KeyS','ArrowDown']]) assert.equal(controlFor(a), controlFor(b));
  assert.equal(controlFor('KeyQ'), undefined);
});

test('scene bonuses count each lane once per ball and award five spinner hits', () => {
  const state = newGame(); assert.equal(scoreScene(state, 'mushroom'), 0); launchBall(state);
  assert.equal(scoreScene(state, 'mushroom'), 200);
  assert.equal(scoreScene(state, 'lane', 0), 300);
  assert.equal(scoreScene(state, 'lane', 0), 0);
  assert.equal(scoreScene(state, 'lane', 1), 1100);
  assert.equal(scoreScene(state, 'lane', 1), 0);
  assert.equal(scoreScene(state, 'lane', 7), 0);
  for (let i = 0; i < 4; i++) assert.equal(scoreScene(state, 'spinner'), 250);
  assert.equal(scoreScene(state, 'spinner'), 1250); assert.equal(state.spins, 0);
  scoreScene(state, 'spinner'); loseBall(state);
  assert.equal(state.spins, 0); assert.equal(state.lanes, 0);
  assert.equal(state.score, 4100);
});
