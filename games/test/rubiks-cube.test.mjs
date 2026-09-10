import test from 'node:test';
import assert from 'node:assert/strict';
import { CubeModel, inverse, scramble, transform, notation } from '../rubiks-cube/model.ts';
import { cubeLayout } from '../rubiks-cube/layout.ts';
for (const kind of ['2', '3', '4', 'mirror']) {
  test(`${kind}: all layers have order four and exact inverses`, () => {
    const m = new CubeModel(kind),
      initial = m.snapshot();
    assert.equal(m.cubies.length, m.order ** 3 - Math.max(0, m.order - 2) ** 3);
    for (const axis of [0, 1, 2])
      for (let layer = 0; layer < m.order; layer++)
        for (const direction of [-1, 1]) {
          const move = { axis, layer, direction };
          m.apply(move);
          m.apply(inverse(move));
          assert.equal(m.snapshot(), initial);
          for (let i = 0; i < 4; i++) m.apply(move);
          assert.equal(m.snapshot(), initial);
          assert.ok(m.solved);
        }
  });
  test(`${kind}: mixed scramble and player turns reverse exactly without coordinate drift`, () => {
    const m = new CubeModel(kind),
      initial = m.snapshot();
    const moves = [...scramble(m.order, 2026), ...scramble(m.order, 739, 500)];
    for (const move of moves) m.apply(move);
    assert.equal(m.history.length, moves.length);
    assert.equal(m.solved, false);
    assert.equal(new Set(m.cubies.map((p) => p.position.join(','))).size, m.cubies.length);
    for (const p of m.cubies)
      assert.ok(p.position.every((v) => Number.isInteger(v) && v >= 0 && v < m.order));
    while (m.history.length) m.undo();
    assert.equal(m.snapshot(), initial);
    assert.ok(m.solved);
    assert.equal(m.undo(), null);
  });
}
test('mirror is offset-cut geometry that actually changes shape', () => {
  const m = new CubeModel('mirror');
  assert.ok(new Set(m.cubies.map((p) => p.size.join(','))).size > 20);
  const bounds = () =>
    m.cubies.map((p) => {
      const c = transform(p.basis, p.center),
        s = transform(p.basis, p.size).map(Math.abs);
      return c.map((v, a) => [v - s[a] / 2, v + s[a] / 2]);
    });
  const before = bounds();
  m.apply({ axis: 0, layer: 2, direction: 1 });
  assert.notDeepEqual(bounds(), before);
  assert.equal(m.solved, false);
  m.undo();
  assert.deepEqual(bounds(), before);
});
test('scramble is deterministic, valid, and avoids trivial cancellations', () => {
  assert.deepEqual(scramble(4, 123), scramble(4, 123));
  assert.notDeepEqual(scramble(4, 123), scramble(4, 124));
  const moves = scramble(4, 1);
  assert.ok(moves.some((m) => m.layer === 1 || m.layer === 2));
  assert.ok(moves.every((m, i) => !i || m.axis !== moves[i - 1].axis));
  assert.equal(notation({ axis: 0, layer: 2, direction: -1 }, 3), 'R');
  assert.equal(notation({ axis: 0, layer: 2, direction: 1 }, 4), "2R'");
});
test('invalid move leaves state and history untouched', () => {
  const m = new CubeModel(),
    before = m.snapshot();
  for (const move of [
    { axis: 3, layer: 0, direction: 1 },
    { axis: 0, layer: 3, direction: 1 },
    { axis: 0, layer: 0.5, direction: 1 },
    { axis: 0, layer: 0, direction: 0 },
  ])
    assert.throws(() => m.apply(move));
  assert.equal(m.snapshot(), before);
  assert.equal(m.history.length, 0);
});
test('portrait and landscape keep controls and interaction stage disjoint', () => {
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1024, 768],
    [768, 1024],
  ]) {
    const { stage, panel, landscape } = cubeLayout(w, h);
    for (const r of [stage, panel])
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= h);
    assert.ok(landscape ? stage.x + stage.width <= panel.x : stage.y + stage.height <= panel.y);
    assert.ok(stage.width > 0 && stage.height > 0);
  }
});

// Node's TS stripping keeps extensionless imports; resolve this one shared runtime dependency explicitly.
const { readFileSync } = await import('node:fs');
const { stripTypeScriptTypes } = await import('node:module');
const sessionCode = stripTypeScriptTypes(
  readFileSync(new URL('../rubiks-cube/session.ts', import.meta.url), 'utf8'),
  { mode: 'transform' },
).replace("'./model'", JSON.stringify(new URL('../rubiks-cube/model.ts', import.meta.url).href));
const { CubeSession } = await import(
  `data:text/javascript;base64,${Buffer.from(sessionCode).toString('base64')}`
);
function finish(s) {
  let frames = 0;
  while (s.busy && frames++ < 10000) s.update(1 / 60);
  assert.ok(!s.busy);
}
test('animation commits once, rejects overlapping input, and stop completes the current transaction', () => {
  const s = new CubeSession('4'),
    initial = s.model.snapshot();
  assert.equal(s.turn({ axis: 0, layer: 1, direction: 1 }), true);
  assert.equal(s.turn({ axis: 1, layer: 0, direction: -1 }), false);
  s.update(0);
  assert.equal(s.model.history.length, 0);
  s.stop();
  finish(s);
  assert.equal(s.model.history.length, 1);
  s.undo();
  finish(s);
  assert.equal(s.model.snapshot(), initial);
  assert.equal(s.model.history.length, 0);
});
for (const kind of ['2', '3', '4', 'mirror'])
  test(`${kind}: animated shuffle, stop, user turn, undo and history restore stay consistent`, () => {
    const s = new CubeSession(kind),
      initial = s.model.snapshot();
    s.shuffle(26);
    finish(s);
    const count = s.model.history.length;
    assert.equal(count, s.model.order === 2 ? 16 : s.model.order === 4 ? 40 : 25);
    assert.ok(!s.model.solved);
    s.turn({ axis: 2, layer: 0, direction: 1 });
    finish(s);
    s.restore();
    s.update(0.02);
    s.stop();
    finish(s);
    assert.equal(s.model.history.length, count);
    s.restore();
    finish(s);
    assert.equal(s.model.snapshot(), initial);
    assert.ok(s.model.solved);
    assert.equal(s.model.history.length, 0);
  });

test('mirror maintains compatible cut planes after arbitrary mixed-axis turns', () => {
  const m = new CubeModel('mirror');
  for (const move of scramble(3, 482, 300)) {
    m.apply(move);
    for (const p of m.cubies) {
      const center = transform(p.basis, p.center), size = transform(p.basis, p.size).map(Math.abs);
      for (let a = 0; a < 3; a++) {
        if (p.position[a] === 1) { assert.ok(Math.abs(center[a]) < 1e-8); assert.ok(Math.abs(size[a] - 1) < 1e-8); }
        else if (p.position[a] === 0) assert.ok(Math.abs(center[a] + size[a] / 2 + .5) < 1e-8);
        else assert.ok(Math.abs(center[a] - size[a] / 2 - .5) < 1e-8);
      }
    }
  }
});
