import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { affectedDevTargets, isDevSource, selectDevGames, SerialBuildQueue } from '../../scripts/dev-build-policy.mjs';
import { devDependencies } from '../../config/dev-dependencies.js';

const entries = ['2048', 'tank-battle', 'pinball', 'ink-pinball'].map(id => ({ id }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('dev selection follows manifest order, accepts CLI/env filters, and rejects unknown targets', () => {
  assert.deepEqual(selectDevGames(entries, []).games, entries.map(entry => entry.id));
  assert.deepEqual(selectDevGames(entries, ['--once', 'game:tank-battle, game:2048', 'game:2048'], 'pinball'), { once: true, games: ['2048', 'tank-battle'] });
  assert.deepEqual(selectDevGames(entries, [], 'tank-battle,2048').games, ['2048', 'tank-battle']);
  assert.throws(() => selectDevGames(entries, ['unknown']), /Unknown game/);
  assert.throws(() => selectDevGames(entries, [], '../outside'), /Unknown game/);
});

test('generated outputs, test files and artifacts never cause rebuild loops', () => {
  for (const path of ['games/2048/bundle.js', 'games/2048/bundle.js.map', 'games/2048/bundle.meta.json', 'games/gravity-maze/dist/chunks/abc.js', 'games/gravity-maze/dist/bundle.js', 'site/gamepad.js', 'site/gamepad.js.map', 'artifacts/dev/2048.json', 'games/test/example.test.mjs']) {
    assert.equal(isDevSource(path), false, path);
  }
  for (const path of ['games/2048/main.ts', 'games\\tank-battle\\main.ts', 'games/gamepad/lobby.ts', 'config/rollup.shared.js', 'games/pinball/fluid.wgsl']) assert.equal(isDevSource(path), true, path);
});

test('dependency routing handles owners, cross-game imports, shared files and unselected games', () => {
  const selected = ['2048', 'pinball', 'ink-pinball'];
  const all = entries.map(entry => entry.id);
  const deps = new Map([
    ['lobby', new Set(['games/gamepad/common.ts'])],
    ['2048', new Set(['games/gamepad/common.ts'])],
    ['pinball', new Set()],
    ['ink-pinball', new Set(['games/pinball/physics.ts', 'games/tank-battle/shared.ts'])],
  ]);
  const route = path => affectedDevTargets(path, selected, deps, all);
  assert.deepEqual(route('games/2048/new.ts'), ['2048']);
  assert.deepEqual(route('games/pinball/physics.ts'), ['ink-pinball', 'pinball']);
  assert.deepEqual(route('games/gamepad/common.ts'), ['lobby', '2048']);
  assert.deepEqual(route('games/gamepad/new.ts'), ['lobby', ...selected]);
  assert.deepEqual(route('games/newShared.ts'), ['lobby', ...selected]);
  assert.deepEqual(route('games/tank-battle/app/bootstrap.ts'), []);
  assert.deepEqual(route('games/tank-battle/shared.ts'), ['ink-pinball']);
  assert.deepEqual(route('config/rollup.shared.js'), ['lobby', ...selected]);
  assert.deepEqual(route('node_modules/@haiyue/engine/dist/index.js'), ['lobby', ...selected]);
  assert.deepEqual(route('games/pinball/bundle.js'), []);
});

test('missing dependency graphs retry failed targets when imported files are repaired', () => {
  const deps = new Map([
    ['lobby', new Set()],
    ['2048', new Set(['games/save/shared.ts'])],
  ]);
  assert.deepEqual(affectedDevTargets('games/save/shared.ts', ['2048', 'tank-battle'], deps), ['2048', 'tank-battle']);
  assert.deepEqual(affectedDevTargets('games/2048/rules/rules.ts', ['2048', 'tank-battle'], deps), ['tank-battle', '2048']);
});

test('queue runs one build at a time and coalesces edits during a build into one repeat', async () => {
  const started = deferred(), release = deferred(), calls = [];
  let active = 0, peak = 0;
  const queue = new SerialBuildQueue(async id => {
    peak = Math.max(peak, ++active); calls.push(id);
    if (calls.length === 1) { started.resolve(); await release.promise; }
    active--;
  });
  queue.enqueue(['2048', 'tank-battle', 'tank-battle']);
  await started.promise;
  queue.enqueue(['2048', '2048', 'tank-battle']);
  queue.enqueue(['2048']);
  release.resolve();
  await queue.idle();
  assert.equal(peak, 1);
  assert.deepEqual(calls, ['2048', 'tank-battle', '2048']);
  queue.enqueue(['pinball']);
  await queue.idle();
  assert.equal(calls.at(-1), 'pinball');
});

test('failed builds do not block other targets and are cleared after correction', async () => {
  const calls = [], errors = [];
  let fail = true;
  const queue = new SerialBuildQueue(async id => {
    calls.push(id);
    if (fail && id === '2048') throw new Error('syntax error');
  }, (id, error) => errors.push([id, error.message]));
  queue.enqueue(['2048', 'tank-battle']);
  await queue.idle();
  assert.deepEqual(calls, ['2048', 'tank-battle']);
  assert.deepEqual(errors, [['2048', 'syntax error']]);
  assert.equal(queue.failures.size, 1);
  fail = false; queue.enqueue(['2048']); await queue.idle();
  assert.equal(queue.failures.size, 0);
});

test('stopping the queue discards pending builds and rejects future work', async () => {
  const started = deferred(), release = deferred(), calls = [];
  const queue = new SerialBuildQueue(async id => { calls.push(id); started.resolve(); await release.promise; });
  queue.enqueue(['2048', 'tank-battle']); await started.promise;
  const stopped = queue.stop();
  queue.enqueue(['pinball']); release.resolve(); await stopped;
  assert.deepEqual(calls, ['2048']);
});

test('dependency capture retains resolved imports without the whole TypeScript program', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'games-dev-deps-'));
  const original = process.env.GAME_DEV_DEPENDENCIES_FILE;
  const output = resolve(directory, 'deps.json');
  try {
    process.env.GAME_DEV_DEPENDENCIES_FILE = output;
    const imported = resolve(directory, 'games/2048/main.ts');
    const unrelated = resolve(directory, 'games/tank-battle/app/bootstrap.ts');
    const shader = resolve(directory, 'games/2048/effect.wgsl');
    devDependencies().generateBundle.call({
      getModuleIds: () => [imported, '\0virtual-module'],
      getWatchFiles: () => [imported, unrelated, shader],
    });
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), [imported, shader].sort());
  } finally {
    if (original === undefined) delete process.env.GAME_DEV_DEPENDENCIES_FILE;
    else process.env.GAME_DEV_DEPENDENCIES_FILE = original;
    rmSync(directory, { recursive: true, force: true });
  }
});
