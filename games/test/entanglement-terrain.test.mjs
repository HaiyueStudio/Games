import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { makeTerrainPlan, rotateTerrainPoint, terrainPairKey } = await import('../entanglement-path/art/topdownTerrain.ts');
const { riverCurve } = await import('../entanglement-path/art/riverFlow.ts');
const { portPoint } = await import('../entanglement-path/art/hexGeometry.ts');
hook.deregister();
const pairs = [[0, 7], [1, 9], [2, 6], [3, 11], [4, 8], [5, 10]];

test('top-down landforms use stable per-piece seeds, independent of orientation and gameplay randomness', () => {
  const original = Math.random, plans = [];
  Math.random = () => { throw Error('terrain must not consume the gameplay random stream'); };
  try {
    for (let seed = 0; seed < 100; seed++) {
      const plan = makeTerrainPlan(seed, pairs); plans.push(plan);
      assert.deepEqual(plan, makeTerrainPlan(seed, pairs));
      assert.ok(plan.stamps.length >= 2 && plan.stamps.length <= 5, 'bounded, non-empty terrain combinations');
      assert.ok(plan.stamps.every(s => Math.hypot(s.x - 128, s.y - 128) < 88 && s.width <= 108));
    }
  } finally { Math.random = original; }
  assert.equal(new Set(plans.map(p => p.family)).size, 4);
  assert.equal(new Set(plans.map(p => JSON.stringify(p.stamps))).size, 100, 'different seeds produce different maps');
  const reordered = pairs.toReversed().map(([a, b]) => [b, a]);
  assert.equal(terrainPairKey(pairs), terrainPairKey(reordered));
  assert.deepEqual(makeTerrainPlan(37, pairs), makeTerrainPlan(37, reordered));
});

test('mountain anchors leave valleys around all six riverbeds and respond to a changed route layout', () => {
  const samples = pairs.flatMap(([a, b]) => riverCurve(a, b).points);
  for (let seed = 0; seed < 50; seed++) for (const s of makeTerrainPlan(seed, pairs).stamps) {
    assert.ok(Math.min(...samples.map(p => Math.hypot(s.x - p.x, s.y - p.y))) > 12, 'peaks are placed off the riverbeds');
  }
  const alternate = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];
  assert.notDeepEqual(makeTerrainPlan(37, pairs), makeTerrainPlan(37, alternate));
});

test('terrain follows the same clockwise 60-degree coordinate transform as every river port', () => {
  for (let port = 0; port < 12; port++) for (let rotation = 0; rotation <= 6; rotation++) {
    const actual = rotateTerrainPoint(portPoint(port), rotation), expected = portPoint((port + rotation * 2) % 12);
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9);
  }
  for (const stamp of makeTerrainPlan(37, pairs).stamps) {
    const turned = rotateTerrainPoint(stamp, 1), returned = rotateTerrainPoint(turned, 5);
    assert.ok(Math.hypot(returned.x - stamp.x, returned.y - stamp.y) < 1e-9);
  }
});
