import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [{ MugenHeadlessMatch }, { MugenInputHistory }] = await Promise.all([
  import('../mugen/runtime/match/MugenMatchState.ts'),
  import('../mugen/runtime/input/MugenInputRuntime.ts'),
]);

test('headless match normalizes exactly two fighters into an immutable JSON snapshot', () => {
  const match = new MugenHeadlessMatch(matchConfig());
  const snapshot = match.snapshot();
  assert.deepEqual({ phase: snapshot.phase, tick: snapshot.tick, round: snapshot.roundNumber, timer: snapshot.roundTimeRemainingTicks, hash: snapshot.hash.slice(0, 8) }, { phase: 'ready', tick: 0, round: 1, timer: 60, hash: 'fnv1a64:' });
  assert.deepEqual(snapshot.fighters.map(fighter => ({ id: fighter.id, position: fighter.position, facing: fighter.facing, life: fighter.life, power: fighter.power, state: fighter.stateNumber, action: fighter.actionNumber })), [
    { id: 'P1', position: [-70, 0], facing: 1, life: 1000, power: 0, state: 0, action: 0 },
    { id: 'P2', position: [70, 0], facing: -1, life: 1000, power: 0, state: 0, action: 0 },
  ]);
  assert.equal(JSON.parse(JSON.stringify(snapshot)).hash, snapshot.hash);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.fighters), true);
  assert.equal(Object.isFrozen(snapshot.fighters[0].position), true);
  assert.throws(() => new MugenHeadlessMatch({ ...matchConfig(), fighters: [matchConfig().fighters[0], matchConfig().fighters[0]] }), /duplicated/u);
  assert.throws(() => new MugenHeadlessMatch({ ...matchConfig(), fighters: [matchConfig().fighters[0]] }), /exactly two/u);
});

test('one tick transaction owns kinematics, state, action, gauges and ordered events', () => {
  const { history, next } = inputFactory();
  void history;
  const match = new MugenHeadlessMatch(matchConfig());
  match.beginTick(next())
    .startFight()
    .setKinematics('P1', { position: [-68.25, -0], velocity: [1.75, 0], facing: 1 })
    .setFighterState('P1', 20, true)
    .setFighterAction('P1', 21)
    .addLife('P2', -125)
    .addPower('P1', 250);
  const result = match.endTick();
  assert.deepEqual(result.events.map(event => event.kind), ['round-phase', 'fighter-kinematics', 'fighter-state', 'fighter-action', 'fighter-life', 'fighter-power']);
  assert.deepEqual(result.events.map(event => event.sequence), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.events.map(event => event.id), ['mugen-event-0000000001', 'mugen-event-0000000002', 'mugen-event-0000000003', 'mugen-event-0000000004', 'mugen-event-0000000005', 'mugen-event-0000000006']);
  assert.deepEqual({ phase: result.state.phase, phaseTime: result.state.phaseTime, timer: result.state.roundTimeRemainingTicks }, { phase: 'fight', phaseTime: 0, timer: 59 });
  assert.deepEqual({ position: result.state.fighters[0].position, velocity: result.state.fighters[0].velocity, state: result.state.fighters[0].stateNumber, stateTime: result.state.fighters[0].stateTime, action: result.state.fighters[0].actionNumber, actionTime: result.state.fighters[0].actionTime, life2: result.state.fighters[1].life, power1: result.state.fighters[0].power }, { position: [-68.25, 0], velocity: [1.75, 0], state: 20, stateTime: 0, action: 21, actionTime: 0, life2: 875, power1: 250 });
  assert.match(result.stateHash, /^fnv1a64:/u); assert.match(result.eventHash, /^fnv1a64:/u); assert.match(result.traceHash, /^fnv1a64:/u);
  assert.equal(Object.isFrozen(result.events), true);
  assert.throws(() => match.endTick(), /open tick/u);
});

test('unchanged writes do not create events and completed state/action time advances exactly once', () => {
  const { next } = inputFactory();
  const match = new MugenHeadlessMatch(matchConfig());
  match.beginTick(next())
    .setKinematics('P1', { position: [-70, 0], velocity: [0, 0], facing: 1 })
    .setFighterState('P1', 0, false)
    .setFighterAction('P1', 0)
    .setLife('P1', 1000)
    .setPower('P1', 0);
  const first = match.endTick();
  assert.deepEqual(first.events, []);
  assert.deepEqual(first.state.fighters.map(value => [value.stateTime, value.actionTime]), [[1, 1], [1, 1]]);
  assert.equal(first.state.phaseTime, 1);
});

test('fighter identity order stays stable when positions cross and facing flips', () => {
  const { next } = inputFactory();
  const match = new MugenHeadlessMatch(matchConfig());
  match.beginTick(next())
    .setKinematics('P1', { position: [12, 0], velocity: [3, 0], facing: -1 })
    .setKinematics('P2', { position: [-8, 0], velocity: [-2, 0], facing: 1 });
  const result = match.endTick();
  assert.deepEqual(result.state.fighters.map(value => [value.id, value.position[0], value.velocity[0], value.facing]), [['P1', 12, 3, -1], ['P2', -8, -2, 1]]);
  assert.deepEqual(result.events.map(value => value.fighterId), ['P1', 'P2']);
});

test('round timer expiration, KO, next-round reset and match win follow legal phase transitions', () => {
  const { next } = inputFactory();
  const match = new MugenHeadlessMatch(matchConfig({ roundsToWin: 2, roundTimeTicks: 1 }));
  match.beginTick(next()).startFight();
  const timer = match.endTick();
  assert.deepEqual(timer.events.map(value => value.kind), ['round-phase', 'round-timer-expired']);

  match.beginTick(next()).addPower('P1', 500).setLife('P2', 0).declareKo('P1');
  assert.equal(match.endTick().state.phase, 'ko');
  match.beginTick(next()).completeKo();
  const roundOne = match.endTick();
  assert.deepEqual({ phase: roundOne.state.phase, wins: roundOne.state.fighters[0].roundsWon, winner: roundOne.state.roundWinnerId }, { phase: 'round-over', wins: 1, winner: 'P1' });

  match.beginTick(next()).startNextRound();
  const nextRound = match.endTick();
  assert.deepEqual({ phase: nextRound.state.phase, round: nextRound.state.roundNumber, timer: nextRound.state.roundTimeRemainingTicks, p1Power: nextRound.state.fighters[0].power, p2Life: nextRound.state.fighters[1].life, p2Position: nextRound.state.fighters[1].position }, { phase: 'ready', round: 2, timer: 1, p1Power: 500, p2Life: 1000, p2Position: [70, 0] });

  match.beginTick(next()).startFight(); match.endTick();
  match.beginTick(next()).setLife('P2', 0).declareKo('P1'); match.endTick();
  match.beginTick(next()).completeKo();
  const matchOver = match.endTick();
  assert.deepEqual({ phase: matchOver.state.phase, winner: matchOver.state.matchWinnerId, wins: matchOver.state.fighters[0].roundsWon }, { phase: 'match-over', winner: 'P1', wins: 2 });
  match.beginTick(next());
  assert.throws(() => match.startNextRound(), /match-over/u);
  match.reset();
  assert.deepEqual({ tick: match.tick, phase: match.phase, hash: match.snapshot().hash }, { tick: 0, phase: 'ready', hash: new MugenHeadlessMatch(matchConfig({ roundsToWin: 2, roundTimeTicks: 1 })).snapshot().hash });
});

test('time-over and draw resolve without smuggling winner policy into the data owner', () => {
  const winInput = inputFactory();
  const win = new MugenHeadlessMatch(matchConfig({ roundsToWin: 1 }));
  win.beginTick(winInput.next()).startFight(); win.endTick();
  win.beginTick(winInput.next()).resolveRound('P2', 'time-over');
  assert.deepEqual({ phase: win.endTick().state.phase, winner: win.snapshot().matchWinnerId }, { phase: 'match-over', winner: 'P2' });

  const drawInput = inputFactory();
  const draw = new MugenHeadlessMatch(matchConfig());
  draw.beginTick(drawInput.next()).startFight(); draw.endTick();
  draw.beginTick(drawInput.next()).resolveRound(null, 'draw');
  const result = draw.endTick();
  assert.deepEqual({ phase: result.state.phase, winner: result.state.roundWinnerId, wins: result.state.fighters.map(value => value.roundsWon) }, { phase: 'round-over', winner: null, wins: [0, 0] });
});

test('snapshot restore validates identity/hash and continues with the same state/event trace', () => {
  const source = inputFactory();
  const first = new MugenHeadlessMatch(matchConfig());
  first.beginTick(source.next()).startFight().setKinematics('P1', { position: [-65, 0], velocity: [2, 0] }).setFighterState('P1', 20, true).setFighterAction('P1', 20);
  const firstRandom = first.nextRandomUint32();
  const checkpoint = first.endTick().state;
  const restored = MugenHeadlessMatch.restore(matchConfig(), JSON.parse(JSON.stringify(checkpoint)));
  const nextInput = source.next();
  first.beginTick(nextInput).addPower('P1', 100).addLife('P2', -50);
  restored.beginTick(nextInput).addPower('P1', 100).addLife('P2', -50);
  assert.equal(restored.nextRandomUint32(), first.nextRandomUint32());
  assert.equal(Number.isSafeInteger(firstRandom), true);
  assert.deepEqual(restored.endTick(), first.endTick());
  assert.throws(() => MugenHeadlessMatch.restore(matchConfig(), { ...checkpoint, hash: 'fnv1a64:0000000000000000' }), /hash is invalid/u);
  assert.throws(() => MugenHeadlessMatch.restore(matchConfig({ roundTimeTicks: 120 }), checkpoint), /config hash/u);
  const nonCanonicalFighter = { ...checkpoint.fighters[0], position: [0.1, 0] };
  assert.throws(() => MugenHeadlessMatch.restore(matchConfig(), { ...checkpoint, fighters: [nonCanonicalFighter, checkpoint.fighters[1]] }), /canonical float32/u);
  assert.throws(() => MugenHeadlessMatch.restore(matchConfig(), { ...checkpoint, roundWinnerId: 'P1' }), /active round/u);
});

test('same recorded input drives a complete headless match to a byte-exact state/event trace', () => {
  const replay = createReplayInputs(180);
  const first = runReplay(replay);
  const second = runReplay(replay);
  assert.deepEqual(first, second);
  assert.deepEqual({ phase: first.final.phase, winner: first.final.matchWinnerId, p1X: first.final.fighters[0].position[0], p2Life: first.final.fighters[1].life }, { phase: 'match-over', winner: 'P1', p1X: -40, p2Life: 0 });
  assert.equal(first.trace.length, 180);
});

test('invalid mutations, tick order and event overflow fail closed', () => {
  const source = inputFactory();
  const match = new MugenHeadlessMatch(matchConfig({ maxEventsPerTick: 1 }));
  assert.throws(() => match.setLife('P1', 10), /open tick/u);
  assert.throws(() => match.nextRandomUint32(), /open tick/u);
  assert.throws(() => match.beginTick({ ...source.next(), tick: 2 }), /advance exactly/u);
  match.beginTick(inputFactory().next()).startFight();
  assert.throws(() => match.setFighterAction('P1', 20), /exceeds 1 events/u);
  match.reset();
  const clean = inputFactory();
  match.beginTick(clean.next());
  assert.throws(() => match.setKinematics('P1', { position: [Number.NaN, 0] }), /finite/u);
  assert.throws(() => match.setLife('P1', 1001), /from 0 to 1000/u);
  assert.throws(() => match.resolveRound('P1', 'time-over'), /from ready/u);
  assert.throws(() => new MugenHeadlessMatch({ ...matchConfig(), fighters: [{ ...matchConfig().fighters[0], initialControl: 'yes' }, matchConfig().fighters[1]] }), /must be boolean/u);
  const invalidReason = new MugenHeadlessMatch(matchConfig());
  invalidReason.beginTick(inputFactory().next()).startFight();
  assert.throws(() => invalidReason.resolveRound(null, 'invalid'), /result reason/u);
});

function runReplay(inputs) {
  const match = new MugenHeadlessMatch(matchConfig({ roundsToWin: 1, roundTimeTicks: null }));
  const trace = [];
  for (const input of inputs) {
    match.beginTick(input);
    const p1 = input.players[0];
    const p2 = match.fighter('P2');
    if (input.tick === 1) match.startFight();
    if (match.phase === 'fight' && p1.held.includes('right')) {
      const current = match.fighter('P1');
      match.setKinematics('P1', { position: [current.position[0] + 1, current.position[1]], velocity: [1, 0], facing: 1 });
    }
    if (match.phase === 'fight' && p1.pressed.includes('a')) {
      match.setFighterState('P1', 200, false).setFighterAction('P1', 200).addLife('P2', -100).addPower('P1', 40);
      if (p2.life <= 100) match.declareKo('P1');
    }
    if (match.phase === 'ko' && match.snapshot().phaseTime >= 1) match.completeKo();
    const result = match.endTick();
    trace.push(result.traceHash);
  }
  return { final: match.snapshot(), trace };
}

function createReplayInputs(count) {
  const history = new MugenInputHistory(count);
  const result = [];
  for (let tick = 1; tick <= count; tick += 1) {
    const moving = tick <= 30;
    const attacking = tick >= 45 && tick <= 135 && tick % 10 === 5;
    result.push(history.push({ tick, players: [
      sourcePlayer('P1', { right: action(moving, tick === 1, tick === 31), a: action(attacking, attacking, !attacking && tick > 45 && tick <= 136) }),
      sourcePlayer('P2', {}),
    ] }, { P1: 1, P2: -1 }));
  }
  return result;
}

function inputFactory() {
  const history = new MugenInputHistory();
  return { history, next: () => { const tick = history.tick + 1; return history.push({ tick, players: [sourcePlayer('P1', {}), sourcePlayer('P2', {})] }, { P1: 1, P2: -1 }); } };
}

function sourcePlayer(id, states) { return { id, actions: Object.entries(states).map(([actionName, value]) => ({ action: actionName, value: Number(value.held), ...value })) }; }
function action(held, pressed = false, released = false) { return { held, pressed, released }; }
function matchConfig(overrides = {}) {
  return {
    seed: 'g08a-fixture', roundsToWin: 2, roundTimeTicks: 60, maxEventsPerTick: 64,
    fighters: [
      { id: 'P1', displayName: 'Hai', packageSha256: 'a'.repeat(64), spawn: [-70, 0], facing: 1 },
      { id: 'P2', displayName: 'Yue', packageSha256: 'b'.repeat(64), spawn: [70, 0], facing: -1 },
    ],
    ...overrides,
  };
}
