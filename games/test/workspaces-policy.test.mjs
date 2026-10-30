import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { loadWorkspacePlan, validatePlan, validatePackages, selectedGameIds, environmentDuration, cacheSummary, workspaceConcurrency, migrationGameIds } from '../../scripts/workspace-policy.mjs';
import { dependencyFingerprint } from '../../scripts/workspace-dependencies.mjs';

const manifest = { entries: [{ id: '2048' }, { id: 'whale-maker' }] };
const tests = ['games/test/2048.test.mjs', 'games/test/whale-maker.test.mjs', 'games/test/platform.test.mjs'];
const plan = () => ({ schemaVersion: 1, phase: 'full', games: ['2048', 'whale-maker'], testOwners: { '2048': [tests[0]], 'whale-maker': [tests[1]], platform: [tests[2]], tooling: [] } });

test('workspace selection accepts scoped aliases, deduplicates and rejects unknown games', () => {
  assert.deepEqual(selectedGameIds(manifest), ['2048', 'whale-maker']);
  assert.deepEqual(selectedGameIds(manifest, 'game:whale-maker,2048,2048'), ['whale-maker', '2048']);
  assert.throws(() => selectedGameIds(manifest, 'missing'), /Unknown game/);
});

test('rollout requires exact manifest coverage; pilot may select a subset', () => {
  const p = plan(); validatePlan(p, manifest, tests);
  p.games.pop(); assert.throws(() => validatePlan(p, manifest, tests), /Every manifest game/);
  p.phase = 'pilot'; validatePlan(p, manifest, tests);
  p.games.push('unknown'); assert.throws(() => validatePlan(p, manifest, tests), /Invalid workspace/);
  p.games = ['2048', '2048']; assert.throws(() => validatePlan(p, manifest, tests), /Invalid workspace/);
});

test('completed rollout cannot be accidentally rewritten into an incomplete pilot', () => {
  assert.deepEqual(migrationGameIds(manifest, null, true), ['2048', 'whale-maker']);
  assert.deepEqual(migrationGameIds(manifest, { phase: 'pilot' }, false), ['2048', 'whale-maker']);
  assert.throws(() => migrationGameIds(manifest, { phase: 'full' }, true), /Full rollout already exists/);
});

test('builds retain serial Rollup isolation while lightweight tasks may run concurrently', () => {
  assert.equal(workspaceConcurrency('build'), 1);
  assert.equal(workspaceConcurrency('test'), 2);
  assert.equal(workspaceConcurrency('typecheck'), 2);
  assert.equal(workspaceConcurrency('build', { GAME_WORKSPACE_CONCURRENCY: '3' }), 3);
  assert.throws(() => workspaceConcurrency('build', { GAME_WORKSPACE_CONCURRENCY: '-1' }), /positive integer/);
});

test('test partition prevents omitted, duplicated, foreign and empty game suites', () => {
  let p = plan(); p.testOwners.platform = []; assert.throws(() => validatePlan(p, manifest, tests), /Unowned/);
  p = plan(); p.testOwners.platform.push(tests[0]); assert.throws(() => validatePlan(p, manifest, tests), /duplicated/);
  p = plan(); p.testOwners.platform.push('games/test/missing.test.mjs'); assert.throws(() => validatePlan(p, manifest, tests), /Unknown/);
  p = plan(); p.testOwners.foreign = []; assert.throws(() => validatePlan(p, manifest, tests), /Unknown test owner/);
  p = plan(); delete p.testOwners.tooling; assert.throws(() => validatePlan(p, manifest, tests), /Missing test owner/);
  p = plan(); p.testOwners.tooling.push(...p.testOwners['2048']); p.testOwners['2048'] = [];
  assert.throws(() => validatePlan(p, manifest, tests), /needs an existing test/);
});

test('build timeouts preserve positive integer validation and zero exit grace', () => {
  assert.equal(environmentDuration({}, 'TIME', 100), 100);
  assert.equal(environmentDuration({ TIME: '0' }, 'TIME', 100, true), 0);
  for (const TIME of ['0', '-1', '1.5', '300ms', '']) assert.throws(() => environmentDuration({ TIME }, 'TIME', 100));
});

test('cache evidence requires explicit task counts from Lerna', () => {
  assert.deepEqual(cacheSummary('Cache:             2/3 hit (67%)'), { hits: 2, tasks: 3 });
  assert.deepEqual(cacheSummary('Nx read the output from the cache instead of running the command for 3 out of 3 tasks.'), { hits: 3, tasks: 3 });
  assert.throws(() => cacheSummary('Successfully ran target build'), /did not report/);
});

test('installed package contents invalidate same-version candidate caches deterministically', () => {
  const root = mkdtempSync(join(tmpdir(), 'haiyue-workspace-fingerprint-'));
  try {
    const a = resolve(root, 'node_modules/@haiyue/engine'), b = resolve(root, 'node_modules/other');
    for (const directory of [a, b]) mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(a, 'package.json'), '{"version":"0.2.2"}');
    writeFileSync(resolve(a, 'index.js'), 'original'); writeFileSync(resolve(b, 'index.js'), 'other');
    const first = dependencyFingerprint(root, ['@haiyue/engine', 'other']);
    assert.equal(first, dependencyFingerprint(root, ['other', '@haiyue/engine']));
    writeFileSync(resolve(a, 'index.js'), 'modified');
    assert.notEqual(first, dependencyFingerprint(root, ['@haiyue/engine', 'other']));
    writeFileSync(resolve(a, 'index.js'), 'original');
    assert.equal(first, dependencyFingerprint(root, ['@haiyue/engine', 'other']));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('real repository has one owner per suite, complete packages and explicit cache outputs', () => {
  const root = resolve(import.meta.dirname, '../..'), { manifest, plan, tests } = loadWorkspacePlan(root);
  validatePackages(root, manifest, plan);
  assert.equal(Object.values(plan.testOwners).flat().length, tests.length);
  const json = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  const nx = json('nx.json');
  assert.deepEqual(nx.targetDefaults.build.dependsOn, ['^build']);
  assert.ok(nx.namedInputs.sharedGlobals.some(input => input.runtime?.includes('workspace-dependencies')));
  assert.ok(!nx.namedInputs.testGlobals.some(input => input.startsWith('!')), 'shared fixture exclusions must not mask explicitly owned test inputs');
  for (const id of plan.games) {
    const pkg = json(`games/${id}/package.json`);
    assert.deepEqual(pkg.nx.targets.build.outputs, id === 'gravity-maze' ? ['{projectRoot}/dist'] : id === 'entanglement-path' ? ['{projectRoot}/bundle.js', '{projectRoot}/bundle.js.map', '{projectRoot}/terrain-raster.worker.js', '{projectRoot}/terrain-raster.worker.js.map'] : ['{projectRoot}/bundle.js', '{projectRoot}/bundle.js.map']);
    for (const file of plan.testOwners[id]) assert.ok(pkg.nx.targets.test.inputs.includes(`{workspaceRoot}/${file}`));
    for (const name of Object.keys(json('package.json').dependencies)) {
      assert.equal(pkg.peerDependencies[name], '*');
      assert.equal(pkg.dependencies[name], undefined, 'runtime candidate must not be shadowed by a pinned workspace copy');
    }
  }
  for (const file of ['terrain-raster.worker.js', 'terrain-raster.worker.js.map']) {
    assert.ok(nx.namedInputs.default.includes(`!{projectRoot}/${file}`), 'generated terrain workers must not invalidate their own cache inputs');
  }
  if (plan.phase === 'full') {
    assert.equal(json('games/ink-pinball/package.json').dependencies['@haiyue/game-pinball'], '0.1.0');
    assert.equal(json('games/pad-simulator/package.json').dependencies['@haiyue/game-sudoku'], '0.1.0');
  }
});
