import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { advance, createRound, slice, intersects, resizeRound, MAX_ITEMS, FRUIT_COUNT, comboBonus, endStroke } from '../fruit-ninja/rules/model.ts';
import { Swipe } from '../fruit-ninja/rules/swipe.ts';
import { isBestScore } from '../fruit-ninja/save/best.ts';
import { bombShake, SHAKE_SECONDS, BLAST_SECONDS, MAX_BLASTS } from '../fruit-ninja/rendering/bombFeedback.ts';
import { createJuiceMark, sampleJuiceDrip, JUICE_VARIANTS, STAIN_SECONDS, DRIPS_PER_STAIN } from '../fruit-ninja/rendering/juice.ts';
import { dojoSkin } from '../fruit-ninja/ui/dojoSkin.ts';
const inputHook = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(context.parentURL?.endsWith('/BladeInput.ts') && specifier === '../rules/swipe' ? `${specifier}.ts` : specifier, context);
} });
const { BladeInput } = await import('../fruit-ninja/input/BladeInput.ts');
inputHook.deregister();
function playing() { const round = createRound(1042); round.phase = 'playing'; return round; }
function item(id, kind = 'fruit', x = 100) { return { id, kind, fruit: 0, x, y: 100, radius: 30, vx: 0, vy: 0, angle: 0, spin: 0 }; }

test('juice splashes vary across fruit hits and replay without consuming gameplay randomness', () => {
  const marks = Array.from({ length: 120 }, (_, i) => createJuiceMark(item(i + 1)));
  assert.equal(new Set(marks.map(mark => mark.variant)).size, JUICE_VARIANTS);
  assert.ok(new Set(marks.map(mark => mark.stretch)).size > 100);
  assert.deepEqual(createJuiceMark(item(1)), marks[0]);
  assert.deepEqual(new Set(marks.map(mark => mark.mirror)), new Set([-1, 1]));
  for (const mark of marks) {
    assert.ok(mark.drips.length >= 2 && mark.drips.length <= DRIPS_PER_STAIN);
    assert.ok(mark.stretch > .7 && mark.stretch < 1.3 && mark.squash > .6 && mark.squash < 1.2);
    assert.ok(mark.drips.every(drip => drip.width > 0 && drip.length <= mark.radius * 4.8));
  }
});

test('juice grows downward, releases falling drops and expires with its stain', () => {
  const drip = createJuiceMark(item(7)).drips[0];
  assert.equal(sampleJuiceDrip(drip, 0).visible, false);
  let previous = 0;
  for (let age = drip.delay; age < 10; age += 1 / 60) {
    const flow = sampleJuiceDrip(drip, age);
    assert.ok(flow.length >= previous && flow.length <= drip.length);
    previous = flow.length;
  }
  const release = drip.delay + drip.duration;
  assert.ok(sampleJuiceDrip(drip, release + .6).dropOffset > sampleJuiceDrip(drip, release + .3).dropOffset);
  assert.equal(sampleJuiceDrip(drip, release + 1).dropVisible, false);
  assert.equal(sampleJuiceDrip(drip, STAIN_SECONDS).opacity, 0);
  assert.deepEqual(sampleJuiceDrip(drip, 2.5), sampleJuiceDrip(drip, 2.5), 'paused visual age keeps the same geometry');
});

test('dojo GUI atlas skins stay inside their cells and preserve scalable borders', () => {
  const source = { naturalWidth: 1536, naturalHeight: 1024 };
  for (const name of ['plaque', 'parchment', 'primary', 'secondary']) {
    const skin = dojoSkin(source, name), [u, v, width, height] = skin.uv;
    assert.equal(skin.source, source);
    assert.ok(u >= 0 && v >= 0 && u + width <= 1 && v + height <= 1);
    assert.ok(skin.cuts[0] + skin.cuts[2] < skin.sourceWidth && skin.cuts[1] + skin.cuts[3] < skin.sourceHeight);
  }
});

test('bomb camera shake is seeded, decays to rest and stays inside background overscan', () => {
  const blast = { x: 100, y: 100, radius: 46, age: 0, seed: 7 };
  const initial = bombShake([blast], 1);
  assert.ok(Math.hypot(initial.x, initial.y) > 10);
  assert.deepEqual(bombShake([blast], 1), initial);
  const tail = bombShake([{ ...blast, age: SHAKE_SECONDS * .9 }], 1);
  assert.ok(Math.hypot(tail.x, tail.y) < 1);
  for (const age of [SHAKE_SECONDS, BLAST_SECONDS, 2]) assert.deepEqual(bombShake([{ ...blast, age }], 1), { x: 0, y: 0 });
  assert.deepEqual(bombShake([], 1), { x: 0, y: 0 });
  for (const scale of [.39, .844, 1.44, 3]) for (let age = 0; age < BLAST_SECONDS; age += 1 / 120) {
    const shaking = bombShake(Array.from({ length: MAX_BLASTS }, (_, seed) => ({ ...blast, seed, age })), scale);
    assert.ok(Math.abs(shaking.x) <= 33 && Math.abs(shaking.y) <= 33);
  }
});
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

function bladeFixture(context) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browser = new EventTarget(); Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  const canvas = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 10, top: 20 }) });
  const segments = [], actions = [];
  let endings = 0;
  const blade = new BladeInput(canvas, point => point.y >= 100, (start, end) => segments.push({ start, end }), action => actions.push(action), () => endings++);
  const pointer = (type, x, options = {}) => {
    const event = Object.assign(new Event(type), { clientX: x + 10, clientY: 220, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, ...options });
    (type === 'pointerup' ? browser : canvas).dispatchEvent(event);
  };
  context.after(() => { blade.destroy(); if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window; });
  return { blade, browser, pointer, segments, actions, endings: () => endings };
}

test('blade cuts and emits trails only during a primary-button drag started on the playfield', context => {
  const fixture = bladeFixture(context), { pointer, segments } = fixture;
  pointer('pointermove', 20, { buttons: 0 }); pointer('pointermove', 100, { buttons: 0 });
  pointer('pointerdown', 20, { button: 2, buttons: 2 }); pointer('pointermove', 100, { buttons: 2 });
  pointer('pointerdown', 20, { clientY: 30 }); pointer('pointermove', 100);
  assert.equal(segments.length, 0, 'hover, right button and a GUI press cannot start a cut');
  pointer('pointerdown', 20); pointer('pointerdown', 70, { pointerId: 2 }); pointer('pointermove', 70, { pointerId: 2 }); pointer('pointermove', 100);
  assert.equal(segments.length, 1);
  assert.deepEqual({ x: segments[0].start.x, y: segments[0].start.y }, { x: 20, y: 200 });
  assert.deepEqual(segments[0].end, { x: 100, y: 200 });
  pointer('pointermove', 200, { buttons: 0 }); pointer('pointermove', 300);
  assert.equal(segments.length, 1, 'a missed mouseup cannot bridge a new drag');
  pointer('pointerdown', 300); pointer('pointermove', 350);
  pointer('pointerup', 350, { buttons: 0 }); pointer('pointermove', 400);
  assert.equal(segments.length, 2, 'release ends the drag');
});

test('blade interruptions require a fresh press and disposal removes pointer and keyboard listeners', context => {
  const fixture = bladeFixture(context), { pointer, segments, browser, blade } = fixture;
  for (const interruption of ['pointerleave', 'pointercancel', 'lostpointercapture', 'blur', 'gui']) {
    pointer('pointerdown', 20); pointer('pointermove', 60);
    const count = segments.length, endings = fixture.endings();
    if (interruption === 'blur') browser.dispatchEvent(new Event('blur'));
    else if (interruption === 'gui') pointer('pointermove', 80, { clientY: 30 });
    else pointer(interruption, 80);
    pointer('pointermove', 120);
    assert.equal(segments.length, count, interruption);
    assert.ok(fixture.endings() > endings, `${interruption} resets the combo`);
  }
  pointer('pointerdown', 20, { pointerType: 'touch' }); pointer('pointermove', 60, { pointerType: 'touch' });
  assert.equal(segments.at(-1).end.x, 60, 'touch dragging still slices');
  blade.destroy(); const count = segments.length;
  pointer('pointerdown', 20); pointer('pointermove', 100);
  browser.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Space', repeat: false }));
  assert.equal(segments.length, count); assert.deepEqual(fixture.actions, []);
});
