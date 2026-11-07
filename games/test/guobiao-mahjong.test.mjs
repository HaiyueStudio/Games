import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(/^\.{1,2}\//.test(s) && !/\.[a-z0-9]+$/i.test(s) ? s + '.ts' : s, c); } });
const { createScorer } = await import('../guobiao-mahjong/rules/scorer.ts');
const { createMatch, legalActions, applyAction, observe, evaluateWin, nextHand, remaining } = await import('../guobiao-mahjong/rules/match.ts');
const { decide } = await import('../guobiao-mahjong/ai/strategy.ts');
const { runTournament } = await import('../guobiao-mahjong/api/tournament.ts');
const { MatchController } = await import('../guobiao-mahjong/app/MatchController.ts');
const { exportReplay, replayMatch, isSavedGame } = await import('../guobiao-mahjong/rules/replay.ts');
const { httpAgent } = await import('../guobiao-mahjong/api/agents.ts');
const bytes = readFileSync(new URL('../guobiao-mahjong/assets/mcr.wasm', import.meta.url));
const scorer = await createScorer(bytes);
const chow = (a, from = 0) => ({ kind: 'chow', tiles: [a, a + 1, a + 2], from, concealed: false, promoted: false });
const pung = (t, from = 0) => ({ kind: 'pung', tiles: [t, t, t], from, concealed: false, promoted: false });
const passAll = s => { while (s.phase === 'response') { const i = [0, 1, 2, 3].find(i => i !== s.last.seat && !s.responses[i]); applyAction(s, i, { type: 'pass' }, scorer); } };

test('WASM is self-contained; all 81 standard fan and the combined kong adjustment are present', () => {
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  assert.equal(scorer.catalog.length, 82);
  for (const name of ['大四喜', '九莲宝灯', '十三幺', '七对', '全不靠', '组合龙', '无番和', '花牌']) assert.ok(scorer.catalog.some(f => f.name === name));
});
test('all upstream regression hands exactly match native C++ total and exclusion/multiplicity tables', () => {
  const cases = JSON.parse(readFileSync(new URL('fixtures/mahjong-scoring.json', import.meta.url)));
  assert.ok(cases.length >= 200);
  for (const c of cases) {
    const win = scorer.score(c.hand, c.melds, c.win, 0, c.flags, c.round, c.seat);
    assert.equal(win?.total, c.total, c.source);
    assert.deepEqual(win.items.map(f => [f.id, f.count]), c.fans, c.source);
  }
});
test('flowers cannot qualify a hand below eight fan; qualifying flowers add to the payment', () => {
  const s = createMatch(1); s.phase = 'turn'; s.turn = 0; s.drawn = 23; s.head = 65;
  s.players[0].melds = [chow(1), chow(12), chow(24)];
  s.players[0].hand = [19, 20, 21, 23, 23]; s.players[0].flowers = [34, 35, 36, 37, 38, 39, 40, 41];
  assert.equal(evaluateWin(s, 0, scorer), null);
  s.players[0].melds = [chow(0), chow(9), chow(18)];
  s.players[0].hand = [24, 25, 26, 22, 22]; s.drawn = 22;
  const win = evaluateWin(s, 0, scorer); assert.ok(win?.fan >= 8); assert.equal(win.total, win.fan + 8);
});
test('seeded deal, flower replacement and every tile are conserved during legal play', () => {
  const s = createMatch(12345); assert.deepEqual(s, createMatch(12345));
  for (let n = 0; n < 180 && !s.phase.endsWith('over'); n++) {
    const physical = [...s.wall.slice(s.head, s.tail + 1), ...s.players.flatMap(p => [...p.hand, ...p.flowers, ...p.river, ...p.melds.flatMap(m => m.tiles)])];
    assert.equal(physical.length, 144);
    for (let t = 0; t < 42; t++) assert.equal(physical.filter(x => x === t).length, t < 34 ? 4 : 1);
    assert.ok(s.players.every(p => p.hand.every(t => t < 34)));
    if (s.phase === 'turn') applyAction(s, s.turn, legalActions(s, s.turn, scorer).find(a => a.type === 'discard'), scorer);
    else passAll(s);
  }
});
test('only the next seat can chow; pung beats chow independent of response order', () => {
  const s = createMatch(99); s.phase = 'response'; s.last = { seat: 0, tile: 3, robKong: false }; s.responses = {};
  s.players[0].river.push(3); s.players[1].hand = [1, 2, 5, 6, 8, 9, 11, 13, 17, 19, 20, 23, 30]; s.players[2].hand = [3, 3, 6, 9, 11, 13, 15, 17, 19, 20, 23, 25, 30];
  assert.ok(legalActions(s, 1, scorer).some(a => a.type === 'chow'));
  assert.ok(!legalActions(s, 2, scorer).some(a => a.type === 'chow'));
  applyAction(s, 1, { type: 'chow', tile: 3, tiles: [1, 2, 3] }, scorer);
  applyAction(s, 2, { type: 'pung', tile: 3 }, scorer); applyAction(s, 3, { type: 'pass' }, scorer);
  assert.equal(s.turn, 2); assert.equal(s.players[2].melds[0].kind, 'pung'); assert.equal(s.players[1].melds.length, 0);
});
test('stale, malformed and illegal actions leave state unchanged', () => {
  const s = createMatch(22), before = structuredClone(s);
  for (const [who, action, rev] of [[1, { type: 'discard', tile: 0 }, 0], [0, { type: 'chow', tile: 0, tiles: [0, 0, 0] }, 0], [0, { type: 'hu' }, 9]]) {
    assert.throws(() => applyAction(s, who, action, scorer, rev)); assert.deepEqual(s, before);
  }
});
test('a chow or pung must be followed by a discard; concealed or added kong requires a fresh draw', () => {
  const s = createMatch(18); s.phase = 'response'; s.last = { seat: 0, tile: 3, robKong: false }; s.responses = {};
  s.players[0].river.push(3); s.players[1].hand = [1, 2, 8, 8, 8, 8, 12, 15, 18, 21, 25, 30, 31];
  applyAction(s, 1, { type: 'chow', tile: 3, tiles: [1, 2, 3] }, scorer);
  applyAction(s, 2, { type: 'pass' }, scorer); applyAction(s, 3, { type: 'pass' }, scorer);
  assert.equal(s.turn, 1); assert.equal(s.drawn, null);
  assert.ok(!legalActions(s, 1, scorer).some(a => a.type.includes('kong')));
  assert.throws(() => applyAction(s, 1, { type: 'concealed-kong', tile: 8 }, scorer));
});
test('observations hide wall order, opponents hands, concealed kongs, draws and response choices', () => {
  const s = createMatch(77); s.players[1].melds.push({ kind: 'kong', tiles: [2, 2, 2, 2], from: 1, concealed: true, promoted: false });
  const o = observe(s, 0, scorer); assert.equal('wall' in o, false); assert.equal('rng' in o, false);
  assert.equal('hand' in o.players[1], false); assert.deepEqual(o.players[1].melds[0].tiles, [null, null, null, null]);
  assert.equal(o.events.filter(e => e.type === 'draw').some(e => 'tile' in e), false);
  o.hand.length = 0; assert.ok(s.players[0].hand.length);
});
test('add-kong allows robbing; nearest legal hu beats pung and pays standard zero-sum', () => {
  const s = createMatch(14); s.players[0].hand.push(4); s.players[0].melds = [pung(4)];
  s.players[1].hand = [0, 1, 2, 3, 5, 9, 10, 11, 18, 19, 20, 31, 31]; s.players[1].melds = [];
  applyAction(s, 0, { type: 'add-kong', tile: 4 }, scorer);
  assert.ok(legalActions(s, 1, scorer).some(a => a.type === 'hu'));
  applyAction(s, 1, { type: 'hu' }, scorer); applyAction(s, 2, { type: 'pass' }, scorer); applyAction(s, 3, { type: 'pass' }, scorer);
  assert.equal(s.phase, 'hand-over'); const r = s.results[0]; assert.equal(r.winner, 1); assert.ok(r.win.items.some(f => f.name === '抢杠和'));
  assert.equal(r.deltas.reduce((a, b) => a + b), 0); assert.equal(r.deltas[2], -8); assert.equal(r.deltas[0], -8 - r.win.total);
  assert.equal(s.players[0].melds[0].kind, 'pung');
});
test('concealed kong remains concealed, consumes four tiles and draws a replacement; last tile disallows kong', () => {
  const s = createMatch(13); s.players[0].hand = [1, 1, 1, 1, 4, 5, 6, 9, 12, 13, 15, 20, 23, 30]; s.drawn = 30; s.wall[s.tail] = 8;
  applyAction(s, 0, { type: 'concealed-kong', tile: 1 }, scorer);
  assert.equal(s.players[0].hand.length, 11); assert.equal(s.players[0].melds[0].concealed, true); assert.equal(s.drawn, 8); assert.equal(s.replacement, true);
  s.head = s.tail + 1; s.players[0].hand = [2, 2, 2, 2, 6, 9, 12, 13, 15, 20, 23]; s.drawn = 23;
  assert.ok(!legalActions(s, 0, scorer).some(a => a.type.includes('kong')));
});
test('four winds always finish at sixteen hands, including draws; dealer advances each hand', () => {
  const s = createMatch(8);
  for (let i = 0; i < 16; i++) {
    assert.equal(s.handIndex, i); assert.equal(s.dealer, i % 4);
    s.head = s.tail + 1; applyAction(s, s.turn, legalActions(s, s.turn, scorer).find(a => a.type === 'discard'), scorer); passAll(s);
    assert.equal(s.results.length, i + 1); if (i < 15) nextHand(s);
  }
  assert.equal(s.phase, 'match-over'); assert.throws(() => nextHand(s));
});
test('AI takes a legal eight-fan win and avoids opening a scoreless tenpai', () => {
  const s = createMatch(1); s.players[0].hand = [0, 0, 0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 8]; s.drawn = 4;
  assert.equal(decide(observe(s, 0, scorer), scorer, 1).action.type, 'hu');
  for (let seed = 1; seed <= 6; seed++) { const s = createMatch(seed), o = observe(s, 0, scorer), d = decide(o, scorer, 1); assert.ok(o.legalActions.some(a => JSON.stringify(a) === JSON.stringify(d.action))); }
});
test('calculation completes before configurable delay; pause, step, reset and disposal cancel stale work', async () => {
  const fake = { decide: async o => ({ action: o.legalActions.find(a => a.type === 'discard'), candidates: [], explanation: '', elapsedMs: 0 }) };
  const c = new MatchController(scorer, fake, 5); c.setHuman(null); c.setDelay(1000); c.start(); c.tick(100); await new Promise(r => setImmediate(r));
  const revision = c.observation().revision; assert.ok(c.waitingMs > 0); for (let i = 0; i < 8; i++) c.tick(100); assert.equal(c.observation().revision, revision);
  c.pause(true); c.tick(10000); assert.equal(c.observation().revision, revision); await c.step(); assert.ok(c.observation().revision > revision);
  c.reset(6); assert.equal(c.observation().revision, 0); assert.equal(c.paused, true); c.dispose();
});
test('headless tournament handles invalid providers, ranks by accumulated fan and completes sixteen hands', async () => {
  const agents = Array.from({ length: 4 }, (_, i) => ({ name: `Fixture ${i}`, decide: o => o.legalActions.find(a => a.type === 'hu') ?? o.legalActions.find(a => a.type === 'pass') ?? o.legalActions.find(a => a.type === 'discard') }));
  const t = await runTournament(scorer, agents, [41], { rotateSeats: false }); assert.equal(t.matches[0].results.length, 16); assert.equal(t.ranking.reduce((s, a) => s + a.score, 0), 0); assert.ok(t.ranking.every(a => a.faults === 0));
});
test('replay reconstructs the exact wall, private hands, scores and pending responses; tampering is rejected', () => {
  const s = createMatch(31337);
  for (let n = 0; n < 45; n++) {
    if (s.phase === 'turn') applyAction(s, s.turn, legalActions(s, s.turn, scorer).find(a => a.type === 'discard'), scorer);
    else passAll(s);
  }
  const r = exportReplay(s); assert.deepEqual(replayMatch(r, scorer), s);
  assert.ok(isSavedGame({ version: 1, replay: r, human: 2, delayMs: 1500 }));
  r.actions[0].action = { type: 'hu' }; assert.throws(() => replayMatch(r, scorer));
  assert.equal(isSavedGame({ version: 1, replay: r, human: 8, delayMs: 0 }), false);
});
test('HTTP agent binds request id, revision and legal action; interactive invalid provider pauses', async () => {
  const o = observe(createMatch(19), 0, scorer), original = globalThis.fetch, signal = new AbortController().signal;
  try {
    const reply = { requestId: 'case', revision: o.revision, action: o.legalActions[0] };
    globalThis.fetch = async (_url, init) => { const body = JSON.parse(init.body); assert.equal(body.requestId, 'case'); assert.equal('wall' in body.observation, false); return new Response(JSON.stringify(reply)); };
    const a = httpAgent('Model', 'http://127.0.0.1/agent'); assert.deepEqual(await a.decide(o, { signal, requestId: 'case' }), reply.action);
    reply.revision++; await assert.rejects(a.decide(o, { signal, requestId: 'case' })); reply.revision--;
    reply.action = { type: 'hu' }; await assert.rejects(a.decide(o, { signal, requestId: 'case' }));
  } finally { globalThis.fetch = original; }
  const c = new MatchController(scorer, {}, 19); c.setHuman(null); c.setAgent(0, { name: 'Invalid', decide: () => ({ type: 'hu' }) }); c.start(); c.tick(1); await new Promise(r => setImmediate(r));
  assert.equal(c.paused, true); assert.equal(c.revision, 0); assert.match(c.status, /非法/); c.dispose();
});
test('built-in algorithms complete sixteen hands with legal eight-fan wins and zero-sum settlement', async () => {
  const agents = Array.from({ length: 4 }, (_, i) => ({ name: `Built-in ${i}`, decide: o => decide(o, scorer, 1).action }));
  const result = await runTournament(scorer, agents, [20261105], { rotateSeats: false });
  assert.equal(result.matches[0].results.length, 16); assert.equal(result.ranking.reduce((n, p) => n + p.score, 0), 0);
  assert.ok(result.ranking.every(p => p.faults === 0));
  assert.ok(result.matches[0].results.filter(r => r.win).length >= 4);
  for (const r of result.matches[0].results) if (r.win) assert.ok(r.win.fan >= 8);
});
test('restoring an external-model seat requires reconnecting it and never silently substitutes built-in AI', async () => {
  const worker = { replay: async replay => replayMatch(replay, scorer), decide: async () => { throw new Error('Must not substitute a model'); } };
  const original = new MatchController(scorer, worker, 33); original.setHuman(null); original.setAgent(0, { name: 'Model A', decide: () => ({ type: 'hu' }) });
  const saved = original.save(); original.dispose();
  const restored = new MatchController(scorer, worker, 1); await restored.restore(saved); restored.start(); restored.tick(1);
  assert.equal(restored.paused, true); assert.equal(restored.revision, 0); assert.match(restored.status, /未连接/);
  restored.setAgent(0, null); assert.equal(restored.save().externalSeats.length, 0); restored.dispose();
});
test('a restored human seat retains its missing external provider when switched back to AI', async () => {
  let builtinCalls = 0;
  const worker = { replay: async replay => replayMatch(replay, scorer), decide: async () => { builtinCalls++; throw new Error('Must not substitute a model'); } };
  const original = new MatchController(scorer, worker, 33);
  original.setAgent(0, { name: 'Model A', decide: () => ({ type: 'hu' }) });
  assert.equal(original.observation().players[0].name, '玩家');
  const saved = original.save(); original.dispose();
  const restored = new MatchController(scorer, worker, 1);
  assert.equal(await restored.restore(saved), true); restored.setHuman(null); await restored.step();
  assert.equal(restored.revision, 0); assert.equal(builtinCalls, 0); assert.match(restored.status, /未连接/); restored.dispose();
});

test('browser settings never serialize a third-party provider as builtin or as an earlier browser model', async () => {
  const { ModelHub } = await import('../guobiao-mahjong/api/ModelHub.ts');
  let builtinCalls = 0;
  const worker = { replay: async replay => replayMatch(replay, scorer), decide: async () => { builtinCalls++; throw new Error('Must not substitute a model'); } };
  const c = new MatchController(scorer, worker, 33), hub = new ModelHub(c);
  c.setHuman(null);
  const external = { name: 'Third-party', decide: () => ({ type: 'hu' }) };
  c.setAgent(0, external); assert.equal(hub.savedConfiguration().assignments[0], null);
  hub.apply(['browser-kd-s0','builtin','builtin','builtin'], {temperature:0,seed:42});
  assert.equal(hub.savedConfiguration().assignments[0], 'browser-kd-s0');
  c.setAgent(0, external); assert.equal(hub.savedConfiguration().assignments[0], null);
  const saved = {...c.save(), browserModels:hub.savedConfiguration()};
  const restored = new MatchController(scorer, worker, 1), restoredHub = new ModelHub(restored);
  await restored.restore(saved); restoredHub.restoreConfiguration(saved.browserModels); await restored.step();
  assert.equal(restored.revision, 0); assert.equal(builtinCalls, 0); assert.equal(restored.agentAt(0), 'missing'); assert.match(restored.status, /未连接/);
  restoredHub.dispose(); restored.dispose(); hub.dispose(); c.dispose();
});
