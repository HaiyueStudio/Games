import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const hook = registerHooks({ resolve(s, c, n) { return n(/^\.{1,2}\//.test(s) && !/\.[a-z0-9]+$/i.test(s) ? `${s}.ts` : s, c); } });
const { VersusMatch, seededTile, evaluateChoices, greedyChoice, isMatchRecord, cellKey, connectedPort, opposite } = await import('../entanglement-path/game/VersusRules.ts');
const { createBoardShape } = await import('../entanglement-path/game/boardShapes.ts');
const { savedBoardIndex, savedBestScores } = await import('../entanglement-path/game/boardCatalog.ts');
const { shortestRotationAngle, turnProgress, swapFrame, hitCurrentTile, hitRect, rotationButtonCenter } = await import('../entanglement-path/game/BoardInteraction.ts');
hook.deregister();

test('removing the spiral keeps legacy scores and saved reference boards attached to their identities', () => {
  const ids = JSON.parse(readFileSync(new URL('../entanglement-path/levels.json', import.meta.url))).levels.map(l => l.id);
  assert.deepEqual(ids, ['classic', 'compact', 'trident', 'blossom']);
  assert.equal(savedBoardIndex({ levelIndex: 2 }, ids), null);
  assert.equal(savedBoardIndex({ levelIndex: 3 }, ids), 2);
  assert.equal(savedBoardIndex({ levelIndex: 4 }, ids), 3);
  assert.equal(savedBoardIndex({ levelIndex: 3, levelId: 'trident' }, ids), 2);
  assert.deepEqual(savedBestScores([10,20,999,30,40], undefined, ids), [10,20,30,40]);
  assert.deepEqual(savedBestScores([40,30,20,10], [...ids].reverse(), ids), [10,20,30,40]);
});

test('shared interaction math handles turn wrapping, swap endpoints and exact pointer targets', () => {
  assert.ok(Math.abs(shortestRotationAngle(5, 0) + Math.PI / 3) < 1e-10);
  assert.ok(Math.abs(shortestRotationAngle(0, 5) - Math.PI / 3) < 1e-10);
  assert.equal(turnProgress(80), .875); assert.equal(turnProgress(160), 1);
  assert.deepEqual(swapFrame(0), { progress: 0, eased: 0, arc: 0 });
  assert.equal(swapFrame(260).eased, 1); assert.equal(swapFrame(130).arc, 1);
  const center = { x: 200, y: 100 }, button = rotationButtonCenter(center, 1);
  assert.deepEqual(button, { x: 243.5, y: 146.5 });
  assert.ok(hitCurrentTile(center, center, 38)); assert.ok(!hitCurrentTile(button, center, 38));
  assert.ok(hitRect(button, { x: 227.5, y: 129, w: 32, h: 35 }));
});
const library = [
  [[0, 7], [1, 10], [2, 5], [3, 8], [4, 11], [6, 9]],
  [[0, 4], [1, 9], [2, 7], [3, 11], [5, 8], [6, 10]],
  [[0, 11], [1, 6], [2, 9], [3, 5], [4, 8], [7, 10]],
  [[0, 8], [1, 3], [2, 10], [4, 7], [5, 11], [6, 9]],
];
function level(radius = 3, startWall = true) {
  const cells = [], wallKeys = new Set();
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (d > radius) continue; cells.push({ q, r }); if (d === radius) wallKeys.add(`${q},${r}`);
  }
  if (startWall) wallKeys.add('0,0');
  return { cells, wallKeys, start: { q: 0, r: 0 }, entry: 4, startWall, randomStartExit: true, tileLibrary: library };
}
const onlyCell = () => ({ cells: [{ q: 0, r: 0 }], wallKeys: new Set(), start: { q: 0, r: 0 }, entry: 4,
  startWall: false, randomStartExit: false, tileLibrary: library });

test('equal seeds give independent boards the same source and indexed deck, without global randomness', () => {
  const random = Math.random; Math.random = () => { throw Error('global random'); };
  try {
    const l = level(), match = new VersusMatch(l, 12345, 'race');
    assert.deepEqual(match.human, match.machine); assert.notEqual(match.human, match.machine);
    assert.notEqual(match.human.placed, match.machine.placed);
    for (let i = 1; i <= 200; i++) assert.deepEqual(seededTile(l, 12345, i), seededTile(l, 12345, i));
    assert.notDeepEqual(Array.from({ length: 20 }, (_, i) => seededTile(l, 1, i)), Array.from({ length: 20 }, (_, i) => seededTile(l, 2, i)));
    const before = JSON.stringify(match.machine.next);
    match.play('human', greedyChoice(l, match.seed, match.human));
    assert.equal(JSON.stringify(match.machine.next), before); assert.equal(match.machine.placed.size, 0);
    match.machineMove(); assert.equal(match.machine.serial, match.human.serial);
    assert.deepEqual(match.human.next, match.machine.next);
  } finally { Math.random = random; }
});

test('greedy search considers reserve and all six rotations, avoids losing moves, and never mutates either board', () => {
  let reserve = false, rotated = false, fatal = false, multi = false;
  for (let seed = 0; seed < 48; seed++) {
    const l = level(), match = new VersusMatch(l, seed, 'shared');
    for (let n = 0; n < 80 && !match.winner; n++) {
      const before = structuredClone(match.human), options = evaluateChoices(l, seed, match.human);
      assert.equal(options.length, 12); assert.deepEqual(match.human, before);
      const choice = greedyChoice(l, seed, match.human), selected = options.find(o => o.swap === choice.swap && o.rotation === choice.rotation);
      const safe = options.filter(o => !o.ended), pool = safe.length ? safe : options;
      assert.equal(selected.ended, !safe.length); assert.equal(selected.gain, Math.max(...pool.map(o => o.gain)));
      const startScore = match.human.score;
      reserve ||= choice.swap; rotated ||= choice.rotation > 0; fatal ||= options.some(o => o.ended) && safe.length > 0; multi ||= selected.gain > 1;
      match.play(match.turn, choice); assert.equal(match.human.score - startScore, selected.gain);
      assert.ok(match.human.routes.length <= match.human.placed.size * 12);
    }
    assert.ok(match.winner, 'bounded greedy games terminate');
  }
  assert.ok(reserve && rotated && fatal && multi, 'fixtures exercise reserve, rotation, traps and multi-segment scoring');
});

test('shared board alternates exactly once, and the player causing a dead end loses', () => {
  const m = new VersusMatch(onlyCell(), 0, 'shared');
  assert.equal(m.machine, m.human);
  assert.throws(() => m.play('machine', { swap: false, rotation: 0 }), /turn/);
  m.play('human', { swap: false, rotation: 0 });
  assert.equal(m.winner, 'machine'); assert.equal(m.moves.length, 1);
  assert.throws(() => m.play('human', { swap: false, rotation: 0 }), /turn/);
  let machineLoss = false;
  for (let seed = 0; seed < 50 && !machineLoss; seed++) {
    const n = new VersusMatch(level(2), seed, 'shared');
    while (!n.winner) n.play(n.turn, greedyChoice(n.level, seed, n.human));
    machineLoss = n.moves.at(-1).player === 'machine';
    if (machineLoss) assert.equal(n.winner, 'human');
  }
  assert.ok(machineLoss);
});

test('race waits for both endings, including a human dead end, and supports a tie', () => {
  const m = new VersusMatch(onlyCell(), 91, 'race');
  m.play('human', { swap: true, rotation: 2 });
  assert.equal(m.human.ended, true); assert.equal(m.winner, null); assert.equal(m.turn, 'machine');
  m.machineMove(); assert.equal(m.winner, 'draw'); assert.equal(m.human.score, 1); assert.equal(m.machine.score, 1);
});

test('race continues the living board and awards victory strictly by final score', () => {
  const results = new Set(), continued = new Set();
  for (let seed = 0; seed < 80; seed++) {
    const m = new VersusMatch(level(), seed, 'race');
    for (let n = 0; !m.winner && n < 200; n++) {
      const board = m.board(m.turn), options = evaluateChoices(m.level, seed, board);
      // Deliberately varied human choices make both early-human and early-machine endings observable.
      const choice = m.turn === 'machine' ? greedyChoice(m.level, seed, board) : options[(seed + n * 7) % options.length];
      const player = m.turn; m.play(player, choice);
      if (!m.winner && m.human.ended) { assert.equal(m.turn, 'machine'); continued.add('machine'); }
      if (!m.winner && m.machine.ended) { assert.equal(m.turn, 'human'); continued.add('human'); }
    }
    assert.ok(m.human.ended && m.machine.ended);
    assert.equal(m.winner, m.human.score === m.machine.score ? 'draw' : m.human.score > m.machine.score ? 'human' : 'machine');
    results.add(m.winner);
  }
  assert.ok(continued.has('human') && continued.has('machine')); assert.ok(results.size >= 2);
});

test('records replay the entire round and resume an outstanding machine turn exactly', () => {
  for (const mode of ['shared', 'race']) {
    const l = level(), a = new VersusMatch(l, 98, mode);
    a.play('human', greedyChoice(l, a.seed, a.human));
    const b = VersusMatch.restore(l, a.record()); assert.equal(b.turn, 'machine'); assert.deepEqual(b.human, a.human);
    while (!a.winner) {
      const player = a.turn, choice = greedyChoice(l, a.seed, a.board(player));
      a.play(player, choice); b.play(player, choice);
      assert.deepEqual(b.human, a.human); assert.deepEqual(b.machine, a.machine); assert.equal(b.winner, a.winner);
    }
    assert.deepEqual(VersusMatch.restore(l, a.record()).record(), a.record());
  }
});

test('reserve swaps consume the chosen tile and keep future draws indexed by placements', () => {
  const l = level(), m = new VersusMatch(l, 4, 'race'), next = m.human.next, reserve = m.human.reserve;
  const safe = evaluateChoices(l, m.seed, m.human).find(o => o.swap && !o.ended);
  assert.ok(safe); m.play('human', safe);
  assert.equal([...m.human.placed.values()][0].tile.id, reserve.id);
  assert.deepEqual(m.human.reserve, next); assert.deepEqual(m.human.next, seededTile(l, 4, 3));
});

test('ports are bijective through rotation, and malformed or impossible saved actions are rejected', () => {
  const l = level(), tile = seededTile(l, 9, 1);
  for (let rot = 0; rot < 6; rot++) for (let port = 0; port < 12; port++) {
    assert.equal(connectedPort(tile, rot, connectedPort(tile, rot, port)), port); assert.equal(opposite(opposite(port)), port);
  }
  for (const record of [null, {}, { version: 1, mode: 'race', seed: -1, moves: [] },
    { version: 1, mode: 'shared', seed: 1, moves: [{ player: 'human', rotation: 6, swap: false }] }]) assert.equal(isMatchRecord(record), false);
  assert.throws(() => VersusMatch.restore(l, { version: 1, mode: 'shared', seed: 1, moves: [{ player: 'machine', rotation: 0, swap: false }] }), /turn/);
  assert.throws(() => new VersusMatch(l, 2 ** 32, 'race'), /uint32/);
  const m = new VersusMatch(l, 1, 'race'); const snapshot = structuredClone(m.human);
  assert.throws(() => m.play('human', { swap: false, rotation: -1 }), /Invalid/); assert.deepEqual(m.human, snapshot);
  assert.equal(cellKey(m.human.current), cellKey(m.human.start));
});

test('closed loops lose immediately, and returning through an old tile scores only its newly used segment', () => {
  const l = { ...onlyCell(), cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }], entry: 0,
    tileLibrary: [[[0,1], [2,3], [4,5], [6,7], [8,9], [10,11]]] };
  const loop = new VersusMatch(l, 0, 'shared');
  loop.play('human', { swap: false, rotation: 0 }); assert.equal(loop.winner, null);
  loop.play('machine', { swap: false, rotation: 0 });
  assert.equal(loop.winner, 'human'); assert.equal(loop.human.score, 2); assert.equal(loop.human.length, 2);
  assert.equal(loop.human.routes.length, 2);
  const route = new VersusMatch({ ...l, entry: 6, cells: [...l.cells, { q: 0, r: 1 }] }, 0, 'shared');
  route.human.next = { id: 1, variant: 0, pairs: [[6,0], [1,2], [3,4], [5,7], [8,9], [10,11]] };
  route.play('human', { swap: false, rotation: 0 });
  route.human.next = { id: 3, variant: 0, pairs: [[7,6], [0,1], [2,3], [4,5], [8,9], [10,11]] };
  route.play('machine', { swap: false, rotation: 0 });
  assert.equal(route.human.length, 3); assert.equal(route.human.score, 4, 'one initial segment plus a two-segment triangular combo');
  assert.deepEqual(route.human.current, { q: 0, r: 1 }); assert.equal(route.human.incoming, 9);
  assert.equal(route.winner, null);
});

test('reference boards preserve the three-prong and six-petal silhouettes with a closed mountain rim', () => {
  const directions = [[1,0], [0,1], [-1,1], [-1,0], [0,-1], [1,-1]];
  for (const [shape, total, wallCount, columns] of [
    ['trident', 52, 25, [3,4,7,8,8,8,7,4,3]],
    ['blossom', 103, 36, [3,4,9,10,11,10,9,10,11,10,9,4,3]],
  ]) {
    const { cells, walls } = createBoardShape(shape), all = new Set(cells.map(cellKey)), rim = new Set(walls.map(cellKey));
    assert.equal(all.size, total); assert.equal(rim.size, wallCount);
    assert.ok(cells.every(c => Number.isInteger(c.q) && Number.isInteger(c.r)));
    const counts = new Map(); for (const c of cells) counts.set(-c.r, (counts.get(-c.r) ?? 0) + 1);
    assert.deepEqual([...counts].sort((a,b) => a[0]-b[0]).map(c => c[1]), columns);
    for (const c of cells.filter(c => !rim.has(cellKey(c)))) for (const [dq, dr] of directions) {
      assert.ok(all.has(`${c.q + dq},${c.r + dr}`), 'every exposed water edge meets an actual wall cell');
    }
    rim.add('0,0');
    const playable = new Set(cells.filter(c => !rim.has(cellKey(c))).map(cellKey)), queue = [playable.values().next().value], seen = new Set();
    for (const id of queue) {
      if (seen.has(id)) continue; seen.add(id); const [q,r] = id.split(',').map(Number);
      for (const [dq,dr] of directions) { const neighbor = `${q+dq},${r+dr}`; if (playable.has(neighbor) && !seen.has(neighbor)) queue.push(neighbor); }
    }
    assert.equal(seen.size, playable.size, 'the central spring does not disconnect a lobe');
    const l = { ...level(), cells, wallKeys: rim };
    for (const mode of ['shared', 'race']) {
      const m = new VersusMatch(l, 177, mode);
      for (let n = 0; !m.winner && n < total * 2; n++) m.play(m.turn, greedyChoice(l, m.seed, m.board(m.turn)));
      assert.ok(m.winner, `${shape} ${mode} ends correctly`);
      assert.deepEqual(VersusMatch.restore(l, m.record()).record(), m.record());
    }
  }
});
