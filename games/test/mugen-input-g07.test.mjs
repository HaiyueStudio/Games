import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { FixedStepClock, hashSimulationState } from '@haiyue/engine/experimental/simulation';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const {
  createMugenReplayHeader,
  MUGEN_DEFAULT_PLAYER_BINDINGS,
  MugenBrowserInput,
  MugenFixedStepInputDriver,
  MugenInputHistory,
  MugenInputReplayRecorder,
} = await import('../mugen/runtime/input/MugenInputRuntime.ts');
const { MugenLegacyAiInput } = await import('../mugen/runtime/input/MugenLegacyAiInput.ts');

test('MUGEN input maps screen directions to facing-relative directions for both players', () => {
  const history = new MugenInputHistory();
  const first = history.push(source(1, [
    player('P1', { right: state(1, true, true), a: state(1, true, true) }),
    player('P2', { left: state(1, true, true), x: state(1, true, true) }),
  ]), { P1: 1, P2: -1 });
  assert.deepEqual(first.players.map(value => ({ id: value.playerId, screen: value.screenDirection, facing: value.facingDirection, axes: value.facingAxes })), [
    { id: 'P1', screen: 'R', facing: 'F', axes: [1, 0] },
    { id: 'P2', screen: 'L', facing: 'F', axes: [1, 0] },
  ]);
  assert.deepEqual(first.players[0].pressed, ['right', 'a']);

  const second = history.push(source(2, [
    player('P1', { left: state(1, true, true), up: state(1, true, true) }),
    player('P2', { right: state(1, true, true), down: state(1, true, true) }),
  ]), { P1: -1, P2: 1 });
  assert.deepEqual(second.players.map(value => [value.screenDirection, value.facingDirection]), [['UL', 'UF'], ['DR', 'DF']]);
});

test('MUGEN input history is bounded, tick exact and resets without retaining held state', () => {
  const history = new MugenInputHistory(3);
  for (let tick = 1; tick <= 5; tick += 1) history.push(source(tick, [player('P1', { a: state(1, true, tick === 1) })]), { P1: 1 });
  assert.equal(history.length, 3);
  assert.equal(history.at('P1', 0).tick, 5);
  assert.equal(history.at('P1', 2).tick, 3);
  assert.throws(() => history.push(source(7, [player('P1', {})]), { P1: 1 }), /advance exactly/u);
  history.reset();
  assert.equal(history.length, 0);
  assert.equal(history.at('P1'), null);
  history.push(source(1, [player('P1', {})]), { P1: 1 });
  assert.deepEqual(history.at('P1').held, []);
});

test('60 Hz MUGEN input trace is byte-exact across 30/60/120 Hz and jittered display cadence', () => {
  const schedules = [Array(60).fill(1_000 / 30), Array(120).fill(1_000 / 60), Array(240).fill(1_000 / 120), variableSchedule(2_000), [1_000, ...Array(60).fill(1_000 / 60)]];
  const traces = schedules.map(runSchedule);
  assert.deepEqual(traces.map(value => value.tick), [120, 120, 120, 120, 120]);
  for (const trace of traces.slice(1)) assert.deepEqual(trace, traces[0]);
});

test('replay header freezes package/profile/seed/revision and recorder rejects gaps or overflow', () => {
  const header = createMugenReplayHeader({
    profile: 'mugen-1.1b1-strict', seed: 'round-001', runtimeRevision: 'g07-test',
    players: [{ id: 'P1', packageSha256: 'a'.repeat(64) }, { id: 'P2', packageSha256: 'b'.repeat(64) }],
  });
  const history = new MugenInputHistory();
  const recorder = new MugenInputReplayRecorder(header, 2);
  recorder.record(history.push(source(1, [player('P1', { a: state(1, true, true) }), player('P2', {})]), { P1: 1, P2: -1 }));
  recorder.record(history.push(source(2, [player('P1', { a: state(0, false, false, true) }), player('P2', {})]), { P1: 1, P2: -1 }));
  const replay = recorder.finish();
  assert.equal(replay.header.tickRateHz, 60);
  assert.equal(replay.ticks.length, 2);
  assert.equal(JSON.stringify(replay), JSON.stringify(recorder.finish()));
  assert.throws(() => recorder.record(history.push(source(3, [player('P1', {}), player('P2', {})]), { P1: 1, P2: -1 })), /exceeds/u);
  assert.throws(() => createMugenReplayHeader({ profile: 'bad profile', seed: 1, runtimeRevision: 'x', players: [{ id: 'P1', packageSha256: 'no' }] }));
});

test('AILevel and direct CPU commands are normalized into deterministic replay input', () => {
  const commands = Object.freeze({ schemaVersion: 1, revision: 'm08-g08b-command-v1', commands: Object.freeze(['AI0', 'walk', 'punch'].map((name, index) => Object.freeze({ name, foldedName: name.toLowerCase(), steps: Object.freeze([]), time: index === 0 ? 0 : 15, bufferTime: 1, sourcePath: 'ai.cmd', sourceLine: index + 1 }))) });
  const ai = new MugenLegacyAiInput([{ playerId: 'P2', aiLevel: 4, seed: 'round-ai', commands }]);
  const first = []; const second = [];
  for (let tick = 1; tick <= 30; tick += 1) {
    const raw = source(tick, [player('P1', {}), player('P2', { a: state(1, true, true) })]);
    first.push(ai.apply(raw)); second.push(ai.apply(raw));
  }
  assert.deepEqual(first, second);
  assert.equal(first.every(value => value.players[1].aiLevel === 4 && value.players[1].actions.length === 0), true);
  assert.equal(first.some(value => value.players[1].aiCommands.length === 1), true);
  const history = new MugenInputHistory();
  const resolved = history.push(first[0], { P1: 1, P2: -1 });
  assert.equal(resolved.players[0].aiLevel, 0);
  assert.equal(resolved.players[1].aiLevel, 4);
  assert.deepEqual(resolved.players[1].aiCommands, first[0].players[1].aiCommands);
  assert.throws(() => history.push({ tick: 2, players: [{ id: 'P1', actions: [], aiCommands: ['AI0'] }] }, { P1: 1 }), /require an AI level/u);
});

test('recorded tick snapshots replay one complete headless round byte-exact', () => {
  const header = createMugenReplayHeader({
    profile: 'mugen-1.1b1-strict', seed: 'headless-round', runtimeRevision: 'g07-test',
    players: [{ id: 'P1', packageSha256: 'a'.repeat(64) }, { id: 'P2', packageSha256: 'b'.repeat(64) }],
  });
  const history = new MugenInputHistory(180);
  const recorder = new MugenInputReplayRecorder(header, 180);
  for (let tick = 1; tick <= 180; tick += 1) {
    const p1Attack = tick % 15 === 0 && tick <= 150;
    const p2Attack = tick % 40 === 0 && tick <= 120;
    recorder.record(history.push(source(tick, [
      player('P1', { a: state(Number(p1Attack), p1Attack, p1Attack) }),
      player('P2', { x: state(Number(p2Attack), p2Attack, p2Attack) }),
    ]), { P1: 1, P2: -1 }));
  }
  const replay = recorder.finish();
  const first = runHeadlessRound(replay.ticks);
  const second = runHeadlessRound(replay.ticks);
  assert.deepEqual(first, second);
  assert.deepEqual({ winner: first.winner, koTick: first.koTick, p1Life: first.p1Life, p2Life: first.p2Life }, { winner: 'P1', koTick: 150, p1Life: 70, p2Life: 0 });
});

test('default bindings provide independent keyboard and standard gamepad controls for P1/P2', () => {
  assert.deepEqual(MUGEN_DEFAULT_PLAYER_BINDINGS.map(value => [value.id, value.gamepadIndex]), [['P1', 0], ['P2', 1]]);
  assert.deepEqual(MUGEN_DEFAULT_PLAYER_BINDINGS.map(value => value.bindings.left.keys[0]), ['KeyA', 'ArrowLeft']);
  for (const descriptor of MUGEN_DEFAULT_PLAYER_BINDINGS) assert.deepEqual(Object.keys(descriptor.bindings).sort(), ['a', 'b', 'c', 'down', 'left', 'right', 'start', 'up', 'x', 'y', 'z']);
});

test('MUGEN browser adapter consumes the packed Engine sampler and tears down idempotently', () => {
  const target = new EventTarget();
  const input = new MugenBrowserInput({ eventTarget: target, visibilityTarget: target });
  const down = new Event('keydown', { cancelable: true });
  Object.defineProperty(down, 'code', { value: 'KeyD' });
  target.dispatchEvent(down);
  const tick = input.sample(1, { P1: 1, P2: -1 });
  assert.equal(tick.players[0].facingDirection, 'F');
  assert.equal(tick.players[0].pressed.includes('right'), true);
  input.reset().reset();
  assert.equal(input.sample(1, { P1: 1, P2: -1 }).players[0].held.length, 0);
  input.dispose(); input.dispose();
  assert.equal(input.disposed, true);
  assert.throws(() => input.sample(2, { P1: 1, P2: -1 }), /disposed/u);
});

test('G08 product input seam records CPU AILevel and package command injection in authoritative history', () => {
  const target = new EventTarget(); const commands = Object.freeze({ schemaVersion: 1, revision: 'm08-g08b-command-v1', commands: Object.freeze([Object.freeze({ name: 'AI0', foldedName: 'ai0', steps: Object.freeze([]), time: 0, bufferTime: 1, sourcePath: 'ai.cmd', sourceLine: 1 })]) });
  const ai = new MugenLegacyAiInput([{ playerId: 'P2', aiLevel: 8, seed: 'product-ai', commands }]); const input = new MugenBrowserInput({ eventTarget: target, visibilityTarget: target, transformSource: source => ai.apply(source) });
  const tick = input.sample(1, { P1: 1, P2: -1 }); assert.equal(tick.players[0].aiLevel, 0); assert.equal(tick.players[1].aiLevel, 8); assert.deepEqual(tick.players[1].held, []); assert.deepEqual(tick.players[1].aiCommands, ['ai0']); input.dispose();
});

test('MUGEN fixed-step driver pauses while hidden and discards the resume-frame wall delta', () => {
  const target = new EventTarget();
  Object.defineProperty(target, 'hidden', { value: false, writable: true });
  const driver = new MugenFixedStepInputDriver({ eventTarget: target, visibilityTarget: target });
  const ticks = [];
  const facing = () => ({ P1: 1, P2: -1 });
  driver.advance(1_000 / 60, facing, input => ticks.push(input.tick));
  assert.deepEqual(ticks, [1]);
  target.hidden = true;
  target.dispatchEvent(new Event('visibilitychange'));
  assert.equal(driver.advance(60_000, facing, input => ticks.push(input.tick)).ticks, 0);
  target.hidden = false;
  target.dispatchEvent(new Event('visibilitychange'));
  assert.equal(driver.advance(60_000, facing, input => ticks.push(input.tick)).ticks, 0, 'first visible frame establishes a fresh wall-clock origin');
  driver.advance(1_000 / 60, facing, input => ticks.push(input.tick));
  assert.deepEqual(ticks, [1, 2]);
  driver.reset().reset();
  assert.equal(driver.clock.tick, 0);
  driver.dispose(); driver.dispose();
  assert.throws(() => driver.advance(0, facing, () => undefined), /disposed/u);
});

function runSchedule(schedule) {
  const clock = new FixedStepClock({ tickRateHz: 60, maxSubSteps: 8 });
  const history = new MugenInputHistory(180);
  const trace = [];
  for (const delta of schedule) clock.advance(delta, ({ tick }) => {
    const p1Right = tick >= 1 && tick < 60;
    const p2Left = tick >= 30 && tick < 90;
    const input = history.push(source(tick, [
      player('P1', { right: state(Number(p1Right), p1Right, tick === 1, tick === 60), a: state(Number(tick === 45), tick === 45, tick === 45, tick === 46) }),
      player('P2', { left: state(Number(p2Left), p2Left, tick === 30, tick === 90) }),
    ]), { P1: 1, P2: -1 });
    trace.push(input.hash);
  });
  return { tick: clock.tick, hash: hashSimulationState(trace), trace };
}

function runHeadlessRound(ticks) {
  const state = { p1Life: 100, p2Life: 100, winner: null, koTick: null };
  const trace = [];
  for (const tick of ticks) {
    if (state.winner === null) {
      const p1 = tick.players.find(value => value.playerId === 'P1');
      const p2 = tick.players.find(value => value.playerId === 'P2');
      if (p1.pressed.includes('a')) state.p2Life = Math.max(0, state.p2Life - 10);
      if (p2.pressed.includes('x')) state.p1Life = Math.max(0, state.p1Life - 10);
      if (state.p1Life === 0 || state.p2Life === 0) { state.winner = state.p2Life === 0 ? 'P1' : 'P2'; state.koTick = tick.tick; }
    }
    trace.push(hashSimulationState({ tick: tick.tick, input: tick.hash, state }));
  }
  return { ...state, traceHash: hashSimulationState(trace) };
}

function source(tick, players) { return { tick, players }; }
function player(id, actions) { return { id, actions: Object.entries(actions).map(([action, value]) => ({ action, ...value })) }; }
function state(value, held, pressed = false, released = false) { return { value, held, pressed, released }; }

function variableSchedule(totalMs) {
  const pattern = [5, 11, 27, 8, 19, 33, 7, 15];
  const result = [];
  let total = 0; let index = 0;
  while (total < totalMs) { const next = Math.min(pattern[index++ % pattern.length], totalMs - total); result.push(next); total += next; }
  return result;
}
