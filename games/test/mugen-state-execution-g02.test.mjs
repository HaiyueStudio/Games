import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { compileMugenExpression } = await import('../mugen/import/expression/MugenExpressionCompiler.ts');
const { parseMugenExpressionAst } = await import('../mugen/import/expression/MugenExpressionParser.ts');
const { mugenBottom, mugenInt } = await import('../mugen/import/expression/types.ts');
const { MugenStateExecutor } = await import('../mugen/runtime/state-execution/MugenStateExecutor.ts');

const ONE = expression('1');
function expression(source) { return compileMugenExpression(parseMugenExpressionAst(source), { canonicalPath: 'g02-state.cns', line: 1, column: 1 }); }
function controller(name, options = {}) { return Object.freeze({ stateNumber: options.stateNumber ?? 0, name, type: 'null', triggerAll: Object.freeze(options.triggerAll ?? []), triggerGroups: Object.freeze(options.triggerGroups ?? [Object.freeze({ group: 1, expressions: Object.freeze([ONE]) })]), persistent: options.persistent ?? 1, ignoreHitPause: options.ignoreHitPause ?? false, parameters: Object.freeze({}), hitDefinition: null, sourcePath: 'g02-state.cns', sourceLine: options.sourceLine ?? 1 }); }
function state(number, controllers) { return Object.freeze({ number, stateType: 'S', moveType: 'I', physics: 'N', animation: null, velocity: null, control: null, controllers: Object.freeze(controllers), sourcePath: 'g02-state.cns', sourceLine: 1 }); }
function host(states, options = {}) {
  const mutable = { entityId: 'p1', stateNumber: options.stateNumber ?? 0, stateGeneration: options.stateGeneration ?? 0, hitPaused: options.hitPaused ?? false, paused: options.paused ?? false, helper: options.helper ?? false, keyControl: options.keyControl ?? true, usingOwnStateData: options.usingOwnStateData ?? true };
  const fired = []; const evaluated = new Map();
  return {
    mutable, fired, evaluated,
    snapshot: () => Object.freeze({ ...mutable }),
    state: number => states.get(number) ?? null,
    evaluate(value) { const handler = evaluated.get(value); return handler ? handler() : mugenInt(1); },
    execute(value) { fired.push(value.name); const target = options.transitions?.get(value.name); if (target !== undefined) { mutable.stateNumber = target; mutable.stateGeneration += 1; return { transitioned: true }; } return { transitioned: false }; },
  };
}

test('G02 executes -3/-2/-1/current in order, aborts transitioned states, and re-enters the new current state in the same tick', () => {
  const states = new Map([
    [-3, state(-3, [controller('-3:a', { stateNumber: -3 }), controller('-3:change', { stateNumber: -3 }), controller('-3:after', { stateNumber: -3 })])],
    [-2, state(-2, [controller('-2:a', { stateNumber: -2 })])], [-1, state(-1, [controller('-1:a', { stateNumber: -1 })])],
    [0, state(0, [controller('0:change'), controller('0:after')])], [1, state(1, [controller('1:a', { stateNumber: 1 })])],
  ]);
  const value = host(states, { transitions: new Map([['-3:change', 0], ['0:change', 1]]) }); const result = new MugenStateExecutor().executeTick(value, { trace: true });
  assert.deepEqual(value.fired, ['-3:a', '-3:change', '-2:a', '-1:a', '0:change', '1:a']);
  assert.equal(result.transitions, 2); assert.deepEqual(result.trace.filter(entry => entry.disposition === 'transition').map(entry => entry.pass), ['state--3', 'current']);
});

test('G02 custom-state players skip -3; helpers skip -3/-2 and only run -1 with key control', () => {
  const states = new Map([[-3, state(-3, [controller('-3', { stateNumber: -3 })])], [-2, state(-2, [controller('-2', { stateNumber: -2 })])], [-1, state(-1, [controller('-1', { stateNumber: -1 })])], [0, state(0, [controller('current')])]]);
  const custom = host(states, { usingOwnStateData: false }); new MugenStateExecutor().executeTick(custom); assert.deepEqual(custom.fired, ['-2', '-1', 'current']);
  const helper = host(states, { helper: true, keyControl: true }); new MugenStateExecutor().executeTick(helper); assert.deepEqual(helper.fired, ['-1', 'current']);
  const helperWithoutKeys = host(states, { helper: true, keyControl: false }); new MugenStateExecutor().executeTick(helperWithoutKeys); assert.deepEqual(helperWithoutKeys.fired, ['current']);
});

test('G02 triggerall/group evaluation short-circuits in source order and ignores groups after a numbering gap', () => {
  const a = expression('10'); const b = expression('11'); const c = expression('12'); const d = expression('13'); const e = expression('14');
  const first = controller('or-groups', { triggerAll: [a], triggerGroups: [Object.freeze({ group: 1, expressions: Object.freeze([b, c]) }), Object.freeze({ group: 2, expressions: Object.freeze([d]) }), Object.freeze({ group: 3, expressions: Object.freeze([e]) })] });
  const gap = controller('gap', { sourceLine: 2, triggerGroups: [Object.freeze({ group: 1, expressions: Object.freeze([b]) }), Object.freeze({ group: 3, expressions: Object.freeze([e]) })] });
  const states = new Map([[0, state(0, [first, gap])]]); const value = host(states); const calls = [];
  for (const [program, result] of [[a, mugenInt(1)], [b, mugenInt(0)], [c, mugenInt(1)], [d, mugenInt(1)], [e, mugenInt(1)]]) value.evaluated.set(program, () => { calls.push(program); return result; });
  const result = new MugenStateExecutor().executeTick(value, { trace: true }); assert.deepEqual(value.fired, ['or-groups']); assert.deepEqual(calls, [a, b, d, b]);
  assert.equal(result.trace[0].triggers.find(entry => entry.group === 1 && entry.index === 1).outcome, 'short-circuited');
  assert.equal(result.trace[0].triggers.find(entry => entry.group === 3).outcome, 'short-circuited'); assert.equal(result.trace[1].triggers.find(entry => entry.group === 3).outcome, 'ignored-gap');
});

test('G02 bottom is false, hitpause only evaluates ignorehitpause controllers, pause evaluates none, and persistent counts true activations', () => {
  const bottom = expression('1/0'); const p0 = controller('once', { persistent: 0, ignoreHitPause: true, triggerGroups: [Object.freeze({ group: 1, expressions: Object.freeze([ONE]) })] }); const p2 = controller('every-two', { persistent: 2, ignoreHitPause: true, sourceLine: 2 }); const blocked = controller('blocked', { sourceLine: 3 }); const bottomed = controller('bottom', { ignoreHitPause: true, sourceLine: 4, triggerGroups: [Object.freeze({ group: 1, expressions: Object.freeze([bottom]) })] });
  const states = new Map([[0, state(0, [p0, p2, blocked, bottomed])]]); const value = host(states, { hitPaused: true }); value.evaluated.set(bottom, () => mugenBottom('fixture bottom')); const executor = new MugenStateExecutor();
  for (let tick = 0; tick < 4; tick += 1) executor.executeTick(value); assert.deepEqual(value.fired, ['once', 'every-two', 'every-two']);
  value.mutable.paused = true; executor.executeTick(value); assert.deepEqual(value.fired, ['once', 'every-two', 'every-two']);
  value.mutable.paused = false; value.mutable.stateGeneration += 1; executor.executeTick(value); assert.deepEqual(value.fired.slice(-1), ['once']);
  const snapshot = executor.snapshot(); const restored = new MugenStateExecutor(); restored.restore(snapshot); assert.deepEqual(restored.snapshot(), snapshot);
});

test('G02 trace collection is observational and does not change fired state or persistent snapshots', () => {
  const states = new Map([[0, state(0, [controller('a'), controller('b', { persistent: 2, sourceLine: 2 })])]]); const tracedHost = host(states); const replayHost = host(states); const plainHost = host(states); const traced = new MugenStateExecutor(); const replay = new MugenStateExecutor(); const plain = new MugenStateExecutor(); const traces = []; const replayTraces = [];
  for (let tick = 0; tick < 3; tick += 1) { traces.push(traced.executeTick(tracedHost, { trace: true }).trace); replayTraces.push(replay.executeTick(replayHost, { trace: true }).trace); plain.executeTick(plainHost, { trace: false }); }
  assert.deepEqual(traces, replayTraces); assert.deepEqual(tracedHost.fired, plainHost.fired); assert.deepEqual(traced.snapshot(), plain.snapshot());
});

test('G02 executor rejects unbounded same-tick transitions and malformed persistent snapshots', () => {
  const states = new Map([[0, state(0, [controller('loop')])]]); const value = host(states, { transitions: new Map([['loop', 0]]) }); const executor = new MugenStateExecutor({ maxStateReentriesPerTick: 3 });
  assert.throws(() => executor.executeTick(value), /re-entry budget/u); assert.deepEqual(value.fired, ['loop', 'loop', 'loop']);
  assert.throws(() => executor.restore({ schemaVersion: 1, revision: 'm09-g02-state-executor-v1', entries: [{ key: 'duplicate', trueCount: 0, firedOnce: false }, { key: 'duplicate', trueCount: 1, firedOnce: true }] }), /snapshot is invalid|entry is invalid/u);
  assert.throws(() => executor.restore({ schemaVersion: 1, revision: 'future', entries: [] }), /snapshot is invalid/u);
});

test('G02 deterministic pause/trigger/persistent fuzz keeps debug tracing observational', () => {
  let seed = 0x6d2b79f5;
  const next = () => { seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0; return seed; };
  for (let sample = 0; sample < 256; sample += 1) {
    const controllers = Array.from({ length: 1 + next() % 6 }, (_, index) => controller(`fuzz-${index}`, { sourceLine: index + 1, persistent: next() % 4, ignoreHitPause: (next() & 1) === 1, triggerGroups: [Object.freeze({ group: 1, expressions: Object.freeze([expression(String(next() & 1))]) })] }));
    const states = new Map([[0, state(0, controllers)]]); const tracedHost = host(states); const plainHost = host(states); const traced = new MugenStateExecutor(); const plain = new MugenStateExecutor();
    for (let tick = 0; tick < 8; tick += 1) {
      const mode = next() % 5; tracedHost.mutable.paused = plainHost.mutable.paused = mode === 0; tracedHost.mutable.hitPaused = plainHost.mutable.hitPaused = mode === 1;
      const tracedResult = traced.executeTick(tracedHost, { trace: true }); const plainResult = plain.executeTick(plainHost, { trace: false });
      assert.equal(tracedResult.firedControllers, plainResult.firedControllers); assert.equal(plainResult.trace.length, 0);
    }
    assert.deepEqual(tracedHost.fired, plainHost.fired); assert.deepEqual(traced.snapshot(), plain.snapshot());
  }
});
