import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, createRound, slice, intersects, resizeRound, MAX_ITEMS, FRUIT_COUNT, comboBonus, endStroke } from '../fruit-ninja/rules/model.ts';
import { Swipe } from '../fruit-ninja/rules/swipe.ts';
import { isBestScore } from '../fruit-ninja/save/best.ts';
function playing() { const round = createRound(1042); round.phase = 'playing'; return round; }
function item(id, kind = 'fruit', x = 100) { return { id, kind, fruit: 0, x, y: 100, radius: 30, vx: 0, vy: 0, angle: 0, spin: 0 }; }
test('timer starts at one minute, ready and paused states do not consume time', () => {
  const round = createRound(12); advance(round, 12); assert.equal(round.remaining, 60);
  round.phase = 'playing'; advance(round, 2); assert.ok(Math.abs(round.remaining - 58) < 1e-6);
  round.phase = 'paused'; const before = structuredClone(round); advance(round, 30); assert.deepEqual(round, before);
  assert.deepEqual(slice(round, { x: 0, y: 100 }, { x: 1000, y: 100 }), []);
});
test('swept segments catch fast cuts, do not hit distant fruit or stationary pointer', () => {
  assert.equal(intersects({ x: 0, y: 100 }, { x: 1000, y: 100 }, item(1)), true);
  assert.equal(intersects({ x: 0, y: 140 }, { x: 1000, y: 140 }, item(1)), false);
  assert.equal(intersects({ x: 100, y: 100 }, { x: 100, y: 100 }, item(1)), false);
});
test('fruit scores once, clock adds ten seconds and neither costs a life', () => {
  const round = playing(); round.items = [item(1), item(2, 'clock', 200)];
  assert.equal(slice(round, { x: 0, y: 100 }, { x: 400, y: 100 }).length, 2);
  assert.equal(round.score, 10); assert.equal(round.remaining, 70); assert.equal(round.bombs, 0);
  assert.equal(slice(round, { x: 0, y: 100 }, { x: 400, y: 100 }).length, 0); assert.equal(round.score, 10);
});
test('third bomb ends immediately and later objects on the swipe cannot score or extend time', () => {
  const round = playing(); round.items = [item(4, 'clock', 400), item(3, 'bomb', 300), item(5, 'fruit', 500), item(1, 'bomb', 100), item(2, 'bomb', 200)];
  const hits = slice(round, { x: 0, y: 100 }, { x: 600, y: 100 });
  assert.deepEqual(hits.map(hit => hit.id), [1, 2, 3]); assert.equal(round.bombs, 3); assert.equal(round.reason, 'bombs'); assert.equal(round.phase, 'over');
  assert.equal(round.score, 0); assert.equal(round.remaining, 60); advance(round, 10); assert.equal(round.remaining, 60);
});
test('clock near zero extends an active round, but cannot revive an expired one', () => {
  const round = playing(); round.remaining = .01; round.items = [item(1, 'clock')];
  slice(round, { x: 0, y: 100 }, { x: 200, y: 100 }); assert.equal(round.remaining, 10.01);
  advance(round, 11); assert.equal(round.remaining, 0); assert.equal(round.reason, 'time');
  round.items = [item(2, 'clock')]; slice(round, { x: 0, y: 100 }, { x: 200, y: 100 }); assert.equal(round.remaining, 0);
});
test('seeded waves contain fruit, random bombs and clocks; missed fruit has no penalty; capacity stays bounded', () => {
  const a = playing(), b = playing(), kinds = new Set();
  for (let i = 0; i < 3600; i++) { advance(a, 1 / 60); advance(b, 1 / 60); for (const value of a.items) kinds.add(value.kind); assert.ok(a.items.length <= MAX_ITEMS); }
  assert.deepEqual(a, b); assert.deepEqual(kinds, new Set(['fruit', 'bomb', 'clock']));
  assert.equal(a.phase, 'over'); assert.equal(a.reason, 'time'); assert.equal(a.bombs, 0);
  assert.equal(a.score, 0);
});
test('resize preserves flight proportion and ignores invalid timer deltas', () => {
  const round = playing(); round.items = [item(1)]; round.items[0].vy = -100;
  resizeRound(round, 1200); assert.equal(round.items[0].y, 200); assert.equal(round.items[0].vy, -200);
  for (const dt of [-1, NaN, Infinity]) advance(round, dt); assert.equal(round.remaining, 60);
});
test('best score save rejects corrupted values', () => {
  assert.equal(isBestScore({ best: 100 }), true);
  for (const value of [null, {}, { best: -1 }, { best: 1.5 }, { best: Infinity }, { best: '100' }]) assert.equal(isBestScore(value), false);
});

test('all eight fruits appear in seeded waves', () => {
  const round = playing(), fruits = new Set();
  for (let i = 0; i < 3600; i++) { advance(round, 1 / 60); for (const fruit of round.items) if (fruit.kind === 'fruit') fruits.add(fruit.fruit); }
  assert.equal(FRUIT_COUNT, 8); assert.deepEqual([...fruits].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
});
test('one sweep awards increasing extra points, independent of pointer event subdivision', () => {
  const a = playing(), b = playing(); a.items = [item(1), item(2, 'fruit', 200), item(3, 'fruit', 300), item(4, 'fruit', 400)]; b.items = structuredClone(a.items);
  slice(a, { x: 0, y: 100 }, { x: 500, y: 100 });
  for (let x = 0; x < 500; x += 10) slice(b, { x, y: 100 }, { x: x + 10, y: 100 });
  assert.equal(a.score, 70); assert.equal(b.score, a.score); assert.deepEqual(a.combo, { count: 4, bonus: 30 }); assert.deepEqual(b.combo, a.combo);
  assert.deepEqual([1, 2, 3, 4, 5].map(comboBonus), [0, 5, 15, 30, 50]);
  slice(a, { x: 500, y: 100 }, { x: 0, y: 100 }); assert.equal(a.score, 70, 'removed fruit cannot be counted twice');
});
test('separate strokes and bombs reset combo; clocks never count as fruit', () => {
  const round = playing(); round.items = [item(1), item(2, 'clock', 200), item(3, 'fruit', 300)];
  slice(round, { x: 0, y: 100 }, { x: 400, y: 100 }); assert.equal(round.score, 25); assert.deepEqual(round.combo, { count: 2, bonus: 5 });
  endStroke(round); round.items = [item(4)]; slice(round, { x: 0, y: 100 }, { x: 200, y: 100 }); assert.equal(round.score, 35);
  round.items = [item(5, 'bomb', 300), item(6, 'fruit', 400)];
  slice(round, { x: 200, y: 100 }, { x: 500, y: 100 }); assert.equal(round.score, 45); assert.deepEqual(round.combo, { count: 1, bonus: 0 });
});
test('idle gaps, reversal, maximum duration, pointer changes and explicit end separate swipes', () => {
  const swipe = new Swipe(), p = x => ({ x, y: 100 });
  assert.equal(swipe.move(p(0), 0, 1), null);
  assert.equal(swipe.move(p(50), 30, 1).newStroke, false);
  assert.equal(swipe.move(p(100), 60, 1).newStroke, false);
  assert.equal(swipe.move(p(50), 90, 1).newStroke, true, 'reversal');
  assert.equal(swipe.move(p(0), 250, 1), null, 'idle gap cannot bridge a blade segment');
  for (let n = 1; n < 7; n++) assert.equal(swipe.move(p(n * 10), 250 + n * 100, 1).newStroke, false);
  assert.equal(swipe.move(p(70), 950, 1).newStroke, true, 'continuous motion cannot combine multiple waves forever');
  assert.equal(swipe.move(p(80), 960, 2), null, 'different pointer');
  swipe.clear(); assert.equal(swipe.move(p(90), 970, 2), null, 'release, UI, pause and blur use clear');
  swipe.move(p(90), 1100, 2); assert.equal(swipe.move(p(100), 1121, 2), null, 'stationary events do not extend a swipe');
});
