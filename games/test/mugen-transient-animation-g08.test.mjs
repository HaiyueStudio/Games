import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });
const { MugenTransientAnimationLifecycle } = await import('../mugen/game/MugenTransientAnimationLifecycle.ts');

const spawn = (id, lifetimeTicks = 3) => Object.freeze({ id, kind: 'hit-spark', animationOwnerId: 'fight', animationNumber: 2, position: [12.5, -8], facing: -1, layer: 'above', lifetimeTicks });

test('G08 transient AIR events start at age zero and expire on simulation ticks', () => {
  const lifecycle = new MugenTransientAnimationLifecycle();
  assert.deepEqual(lifecycle.advance(10, [spawn('spark:10')]).map(value => [value.id, value.age, value.facing]), [['spark:10', 0, -1]]);
  assert.deepEqual(lifecycle.advance(11, []).map(value => value.age), [1]);
  assert.strictEqual(lifecycle.advance(11, [spawn('ignored')]), lifecycle.visible());
  assert.deepEqual(lifecycle.advance(12, []).map(value => value.age), [2]);
  assert.deepEqual(lifecycle.advance(13, []), []); assert.equal(lifecycle.activeCount, 0);
});

test('G08 transient AIR events fail closed on duplicate ids and lifecycle budgets', () => {
  const lifecycle = new MugenTransientAnimationLifecycle({ maxActive: 1, maxLifetimeTicks: 4 });
  assert.throws(() => lifecycle.advance(0, [spawn('same'), spawn('same')]), /duplicated/u);
  lifecycle.clear(); assert.throws(() => lifecycle.advance(0, [spawn('too-long', 5)]), /lifetime budget 4/u);
  lifecycle.clear(); lifecycle.advance(0, [spawn('first')]); assert.throws(() => lifecycle.advance(1, [spawn('second')]), /active budget 1 exceeded/u);
});

test('G08 transient AIR event order is deterministic across source ordering', () => {
  const lifecycle = new MugenTransientAnimationLifecycle(); const frames = lifecycle.advance(5, [spawn('b'), spawn('a')]); assert.deepEqual(frames.map(value => value.id), ['a', 'b']);
  lifecycle.advance(6, [Object.freeze({ ...spawn('c'), kind: 'legacy-animation', layer: 'below' })]); assert.deepEqual(lifecycle.visible().map(value => [value.id, value.age]), [['a', 1], ['b', 1], ['c', 0]]);
});
