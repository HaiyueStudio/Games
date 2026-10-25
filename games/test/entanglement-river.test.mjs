import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { RiverFlow, riverCurve, riverPointAt, riverCrossings } = await import('../entanglement-path/art/riverFlow.ts');
hook.deregister();

test('riverheads advance by arc length, preserving exact port endpoints in both directions', () => {
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) {
    const curve = riverCurve(a, b), reverse = riverCurve(b, a);
    assert.ok(Math.abs(curve.length - reverse.length) < 1e-8);
    assert.deepEqual(riverPointAt(curve, -1), curve.points[0]);
    assert.deepEqual(riverPointAt(curve, 1e6), curve.points.at(-1));
    let previous = riverPointAt(curve, 0);
    for (let i = 1; i <= 200; i++) {
      const next = riverPointAt(curve, curve.length * i / 200);
      const step = Math.hypot(next.x - previous.x, next.y - previous.y);
      assert.ok(step <= curve.length / 200 + 1e-8 && step > curve.length / 200 * .94, 'near-uniform spatial speed');
      previous = next;
    }
  }
});

test('crossing geometry finds isolated bridges without turning close parallel channels into junctions', () => {
  const lower = riverCurve(0, 6), upper = riverCurve(3, 9);
  const crossings = riverCrossings(lower, upper);
  assert.ok(crossings.length > 0 && crossings.length < 4);
  assert.ok(crossings.every(d => d > 18 && d < upper.length - 18));
  assert.deepEqual(riverCrossings(riverCurve(0, 1), riverCurve(2, 3)), []);
});

test('new channels fill in traversal order with one speed, including re-entry into an existing piece', () => {
  const flow = new RiverFlow(), routes = [{ cell: 'A', entry: 0, exit: 1 }, { cell: 'B', entry: 0, exit: 6 }];
  flow.connect(routes, 1000);
  const a = riverCurve(0, 1).length, b = riverCurve(0, 6).length;
  const duration = Math.min(1200, Math.max(650, (a + b) * 3.4)), first = duration * a / (a + b);
  assert.equal(flow.wetness('B', 1000 + first - 1)[0].progress, 0);
  const speedA = flow.wetness('A', 1000 + first / 2)[0].progress * a / (first / 2);
  const speedB = flow.wetness('B', 1000 + first + 20)[0].progress * b / 20;
  assert.ok(Math.abs(speedA - speedB) < 1e-8);
  flow.connect([...routes, { cell: 'A', entry: 2, exit: 7 }], 2400);
  assert.equal(flow.size, 3, 'revisited cells can acquire a second independent river');
  assert.equal(flow.wetness('A', 2400)[0].progress, 1, 'old channel remains wet');
  assert.equal(flow.wetness('A', 2400)[1].progress, 0, 'new channel begins at its own entry');
  assert.equal(flow.wetness('A', 2400)[1].bank, 0, 'bank soaking follows the waterhead');
  flow.connect([{ cell: 'A', entry: 1, exit: 0 }], 5000);
  assert.equal(flow.size, 3, 'the same segment reversed is not replayed');
});

test('rapid moves remain bounded; reset and saved-game restore leave no stale pours', () => {
  const flow = new RiverFlow();
  for (let i = 0; i < 60; i++) flow.connect([{ cell: `${i}`, entry: 0, exit: 6 }], 1000 + i);
  assert.equal(flow.size, 60);
  assert.ok(flow.movingCells(1060).size <= 2, 'old pours settle instead of building a long queue');
  assert.equal(flow.movingCells(3000).size, 0);
  flow.clear(); assert.equal(flow.size, 0); assert.equal(flow.movingCells(3000).size, 0);
  flow.connect([{ cell: 'restored', entry: 3, exit: 8 }], 3000, true);
  assert.deepEqual(flow.wetness('restored', 3000), [{ entry: 3, exit: 8, progress: 1, bank: 1 }]);
});
