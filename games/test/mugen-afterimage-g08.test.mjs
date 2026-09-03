import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { MugenAfterImageHistory } = await import('../mugen/game/MugenAfterImageHistory.ts');

const EFFECT = Object.freeze({ remainingTicks: 8, length: 4, paletteColor: 256, paletteInvertAll: false, paletteBright: [30, 30, 30], paletteContrast: [120, 120, 220], palettePostBright: [0, 0, 0], paletteAdd: [10, 10, 25], paletteMultiply: [.65, .65, .75], timeGap: 2, frameGap: 2, transparency: 'add1' });
const source = (entityId, value, effect = EFFECT) => Object.freeze({ entityId, value, effect });

test('G08 AfterImage history samples on simulation ticks and selects framegap capture offsets', () => {
  const history = new MugenAfterImageHistory();
  assert.deepEqual(history.advance(0, [source('P1', 'tick-0')]), []);
  assert.deepEqual(history.advance(1, [source('P1', 'tick-1')]), []);
  assert.deepEqual(history.advance(2, [source('P1', 'tick-2')]).map(value => [value.value, value.generation]), [['tick-0', 0]]);
  history.advance(3, [source('P1', 'tick-3')]); history.advance(4, [source('P1', 'tick-4')]); history.advance(5, [source('P1', 'tick-5')]);
  assert.deepEqual(history.advance(6, [source('P1', 'tick-6')]).map(value => [value.value, value.generation]), [['tick-4', 0], ['tick-0', 1]]);
  assert.strictEqual(history.advance(6, [source('P1', 'ignored-same-tick')]), history.visibleTrails());
});

test('G08 AfterImage history drains old captures after recording ends and stays bounded', () => {
  const history = new MugenAfterImageHistory({ maxEntities: 1, maxVisibleTrails: 1 });
  for (let tick = 0; tick <= 6; tick += 1) history.advance(tick, [source('P1', tick)]);
  assert.equal(history.visibleTrails().length, 1);
  assert.deepEqual(history.advance(7, []).map(value => value.value), [4]);
  history.advance(8, []); history.advance(9, []); history.advance(10, []); history.advance(11, []); history.advance(12, []); history.advance(13, []); history.advance(14, []);
  assert.equal(history.trackedEntityCount, 0); assert.deepEqual(history.visibleTrails(), []);
  assert.throws(() => history.advance(15, [source('P1', 1), source('P2', 2)]), /tracked-entity budget 1 exceeded/u);
});

test('G08 AfterImage history resets a ring when visual settings change', () => {
  const history = new MugenAfterImageHistory();
  history.advance(0, [source('P1', 0)]); history.advance(1, [source('P1', 1)]); history.advance(2, [source('P1', 2)]);
  assert.equal(history.visibleTrails().length, 1);
  const changed = Object.freeze({ ...EFFECT, frameGap: 1 });
  assert.deepEqual(history.advance(3, [source('P1', 3, changed)]).map(value => [value.value, value.generation]), [[3, 0]]);
});
