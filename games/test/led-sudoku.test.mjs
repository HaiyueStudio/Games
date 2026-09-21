import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('./') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { generate, DEFAULT_OPTIONS, SEGMENTS, DIGITS, candidates, ledAllows, search, units, validBoard, findHint, isSaveData, exclusionDigits, exclusionCells, cellRuleDetails, analyzeSingles, meetsChallenge } = await import('../led-sudoku/rules.ts');
const { place, complete } = await import('../led-sudoku/session.ts');
const blank = (opts = {}) => ({ version: 1, seed: 1, options: { ...DEFAULT_OPTIONS, ...opts }, givens: Array(81).fill(0), lights: Array(81).fill(0), blocked: Array(81).fill(false), cages: [], lines: [], dots: [] });
const saved = g => ({ ...g, board: g.puzzle.givens.slice(), notes: Array(81).fill(0), elapsed: 12, assisted: false });

test('middle LED tube eliminates exactly 1 and 7; dark segments remain unknown', () => {
  const p = blank(); p.lights[40] = 64;
  assert.deepEqual(candidates(p, p.givens, 40, false), DIGITS);
  assert.deepEqual(candidates(p, p.givens, 40), [2, 3, 4, 5, 6, 8, 9]);
  assert(ledAllows(6, 8)); assert(ledAllows(6, 1)); assert(!ledAllows(64, 1));
  for (let d = 1; d <= 9; d++) assert(ledAllows(SEGMENTS[d], d));
});
test('diagonals and black cells affect constraints, not just rendering', () => {
  const p = blank({ diagonal: true }); const b = p.givens.slice(); b[0] = 5;
  assert(!candidates(p, b, 40).includes(5));
  assert(candidates(blank(), b, 40).includes(5));
  p.blocked[40] = true; assert.deepEqual(candidates(p, b, 40), []);
});
test('hidden-single hints mention diagonals only when that rule is enabled', () => {
  for (const diagonal of [false, true]) {
    const p = blank({ diagonal });
    for (let i = 1; i < 9; i++) p.lights[i] = 64;
    const hint = findHint(p, p.givens);
    assert.equal(hint.cell, 0); assert.equal(hint.value, 1);
    assert.match(hint.explanation, /此完整行、列、宫/);
    assert.equal(hint.explanation.includes('对角线'), diagonal);
  }
});
test('killer sums enforce completion, feasible distinct combinations, and no repeated values', () => {
  const p = blank({ killer: true }); p.cages = [{ cells: [0, 1, 10], sum: 6 }];
  assert.deepEqual(candidates(p, p.givens, 0), [1, 2, 3]);
  const b = p.givens.slice(); b[1] = 1; b[10] = 2;
  assert.deepEqual(candidates(p, b, 0), [3]);
  p.cages[0].sum = 4; assert.deepEqual(candidates(p, b, 0), []);
});
test('Renban accepts unordered consecutive sets and rejects duplicates or excessive span', () => {
  const p = blank({ renban: true }); p.lines = [[0, 1, 2]];
  const b = p.givens.slice(); b[0] = 4; b[2] = 3;
  assert.deepEqual(candidates(p, b, 1), [2, 5]);
  b[2] = 6; assert.deepEqual(candidates(p, b, 1), [5]);
});
test('consecutive dots use both positive and negative constraints', () => {
  const p = blank({ consecutive: true }); p.dots = [[0, 1]];
  const b = p.givens.slice(); b[0] = 5;
  assert.deepEqual(candidates(p, b, 1), [4, 6]);
  assert(!candidates(p, b, 9).includes(4)); assert(!candidates(p, b, 9).includes(6));
});
test('search distinguishes contradictions, multiple solutions and budget exhaustion', () => {
  const p = blank(); const many = search(p); assert.equal(many.count, 2); assert(!many.exhausted);
  const bounded = search(p, p.givens, 2, 1); assert(bounded.exhausted);
  p.givens[0] = p.givens[1] = 5; assert.equal(search(p).count, 0);
});
for (let flags = 0; flags < 32; flags++) test(`all rule combinations retain exactly one solution (flags ${flags})`, () => {
  const keys = ['diagonal', 'missing', 'killer', 'renban', 'consecutive'];
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const options = { ...DEFAULT_OPTIONS, difficulty, ...Object.fromEntries(keys.map((k, i) => [k, !!(flags & 1 << i)])) };
    const g = generate(options, 813 + flags), { puzzle: p, solution } = g;
    assert(validBoard(p, solution, true));
    const proof = search(p); assert.equal(proof.count, 1); assert.equal(proof.exhausted, false); assert.deepEqual(proof.solution, solution);
    assert(p.lights.filter(Boolean).length >= 5);
    p.lights.forEach((mask, i) => { if (mask) { assert.equal(p.givens[i], 0); assert(ledAllows(mask, solution[i])); assert.notEqual(mask, SEGMENTS[solution[i]]); } });
    if (options.missing) { assert.equal(p.blocked.filter(Boolean).length, 9); assert(units({ ...p, options: { ...options, diagonal: false } }).every(u => u.length === 8)); }
    if (options.renban) assert(p.lines.length >= 1);
    if (options.killer) assert.equal(p.cages.flatMap(c => c.cells).length, options.missing ? 72 : 81);
    assert(isSaveData(saved(g)));
    if (difficulty === 'hard') assert(meetsChallenge(analyzeSingles(p)));
    const h = findHint(p, p.givens); if (h) assert.equal(h.value, solution[h.cell]);
  }
});
test('LED constraints are essential to uniqueness and generation is deterministic', () => {
  const g = generate(DEFAULT_OPTIONS, 20260920); assert.deepEqual(generate(DEFAULT_OPTIONS, 20260920), g);
  assert.equal(search({ ...g.puzzle, lights: Array(81).fill(0) }).count, 2);
});
test('placement preserves givens, filters LED candidates and immutably supports notes/erase', () => {
  const s = saved(generate(DEFAULT_OPTIONS, 7));
  const i = s.puzzle.lights.findIndex(Boolean), v = s.solution[i], given = s.puzzle.givens.findIndex(Boolean);
  assert.equal(place(s, given, 0), null);
  const noted = place(s, i, v, true); assert(noted); assert.equal(noted.board[i], 0); assert(noted.crossed[i] & 1<<(v-1)); assert.equal(s.notes[i], 0);
  const filled = place(noted, i, v); assert.equal(filled.board[i], v); assert.equal(filled.notes[i], 0); assert.equal(s.board[i], 0);
  const erased = place(filled, i, 0); assert.equal(erased.board[i], 0); assert.equal(erased.puzzle.lights[i], s.puzzle.lights[i]);
  const invalid = DIGITS.find(d => !candidates(s.puzzle, s.board, i).includes(d)); if (invalid) assert.equal(place(s, i, invalid), null);
  assert(!complete(s)); assert(complete({ ...s, board: s.solution.slice() }));
});
test('missing-cell hints never require an absent digit in an eight-cell unit', () => {
  const g = generate({ ...DEFAULT_OPTIONS, missing: true }, 39), b = g.puzzle.givens.slice();
  for (let n = 0; n < 72; n++) { const h = findHint(g.puzzle, b); if (!h) break; assert.equal(h.value, g.solution[h.cell]); b[h.cell] = h.value; }
});
test('save validator rejects corruption but retains editable player mistakes', () => {
  const s = saved(generate({ ...DEFAULT_OPTIONS, killer: true, missing: true }, 10));
  assert(isSaveData(s)); assert(!isSaveData({ ...s, elapsed: Infinity })); assert(!isSaveData({ ...s, notes: [0] }));
  const bad = structuredClone(s); bad.puzzle.cages[0].cells = [999]; assert(!isSaveData(bad));
  const altered = structuredClone(s); altered.solution[altered.puzzle.givens.findIndex(Boolean)] = 0; assert(!isSaveData(altered));
  const missingCage = structuredClone(s); missingCage.puzzle.cages.pop(); assert(!isSaveData(missingCage));
  const mistaken = structuredClone(s); const i = s.puzzle.lights.findIndex(Boolean); mistaken.board[i] = s.solution[i] % 9 + 1; assert(isSaveData(mistaken));
});

test('worker cancellation settles old generation and ignores late replies', async () => {
  const { GeneratorClient } = await import('../led-sudoku/generator-client.ts');
  const originalWorker = globalThis.Worker, originalWindow = globalThis.window, workers = [];
  class FakeWorker {
    constructor() { workers.push(this); }
    postMessage(data) { this.request = data; }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = FakeWorker; globalThis.window = { location: { href: 'http://localhost/games/led-sudoku/' } };
  const client = new GeneratorClient();
  try {
    const old = client.generate(DEFAULT_OPTIONS, 1); const next = client.generate(DEFAULT_OPTIONS, 2);
    assert.equal(await old, null); assert(workers[0].terminated);
    workers[0].onmessage({ data: { kind: 'led-sudoku-generated', id: workers[0].request.id, result: {} } });
    assert(!workers[1].terminated);
    const expected = generate(DEFAULT_OPTIONS, 2);
    workers[1].onmessage({ data: { kind: 'led-sudoku-generated', id: workers[1].request.id, result: expected } });
    assert.deepEqual(await next, expected); assert(workers[1].terminated);
    const disposed = client.generate(DEFAULT_OPTIONS, 3); client.dispose(); assert.equal(await disposed, null);
    const failed = client.generate(DEFAULT_OPTIONS, 4); workers[3].onerror(); await assert.rejects(failed, /出题线程不可用/);
  } finally { client.dispose(); globalThis.Worker = originalWorker; globalThis.window = originalWindow; }
});

test('LED rule defaults on and an explicit off switch removes the segment constraint', () => {
  assert.equal(DEFAULT_OPTIONS.led, true);
  const p = blank(); p.lights[40] = 64;
  assert.deepEqual(candidates(p, p.givens, 40), [2, 3, 4, 5, 6, 8, 9]);
  p.options.led = false;
  assert.deepEqual(candidates(p, p.givens, 40), DIGITS);
});

for (const difficulty of ['easy', 'normal', 'hard']) test(`classic ${difficulty} has a unique solution without hidden LED clues`, () => {
  const g = generate({ ...DEFAULT_OPTIONS, difficulty, led: false }, 20260920);
  assert(g.puzzle.lights.every(v => v === 0));
  assert(g.puzzle.givens.filter(Boolean).length < 60);
  assert.equal(g.puzzle.options.led, false);
  assert.equal(search(g.puzzle).count, 1);
  assert(validBoard(g.puzzle, g.solution, true));
  assert(isSaveData(saved(g)));
  assert.deepEqual(generate({ ...DEFAULT_OPTIONS, difficulty, led: false }, 20260920), g);
});

test('classic presentation combines with all additional rules and restores its setting', () => {
  const g = generate({ ...DEFAULT_OPTIONS, led: false, diagonal: true, missing: true, killer: true, renban: true, consecutive: true }, 74);
  assert.equal(search(g.puzzle).count, 1);
  assert(g.puzzle.lights.every(v => !v));
  assert(isSaveData(saved(g)));
  const bad = saved(g); bad.puzzle.lights[bad.puzzle.blocked.findIndex(b => !b)] = 64;
  assert.equal(isSaveData(bad), false);
});

test('older saves without the LED flag retain their LED constraints', () => {
  const s = saved(generate(DEFAULT_OPTIONS, 20260920));
  delete s.puzzle.options.led;
  assert(isSaveData(s));
  assert.deepEqual(candidates(s.puzzle, s.board, 2), [6]);
  s.puzzle.options.led = 'off';
  assert.equal(isSaveData(s), false);
});

test('inequalities filter both orientations, empty endpoints, and contradictions', () => {
  const p = blank({ inequality: true }); p.inequalities = [[0, 1]];
  assert.deepEqual(candidates(p, p.givens, 0), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(candidates(p, p.givens, 1), [2, 3, 4, 5, 6, 7, 8, 9]);
  const b = p.givens.slice(); b[1] = 5;
  assert.deepEqual(candidates(p, b, 0), [1, 2, 3, 4]);
  b[0] = 6; assert.equal(validBoard(p, b), false); assert.equal(search(p, b).count, 0);
  b[0] = 3; b[1] = 0; assert.deepEqual(candidates(p, b, 1), [4, 5, 6, 7, 8, 9]);
  p.inequalities = [[9, 0]];
  assert.deepEqual(candidates(p, p.givens, 9), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(cellRuleDetails(p, 9).join(''), /R2C1 < R1C1/);
});

test('edge-to-edge slants enforce distinct digits without requiring all nine digits', () => {
  const p = blank({ multiDiagonal: true }); p.slants = [[3, 13, 23, 33, 43, 53], [27, 37, 47, 57, 67, 77]];
  const b = p.givens.slice(); b[3] = 5;
  assert(candidates(blank(), b, 43).includes(5)); assert(!candidates(p, b, 43).includes(5));
  b[43] = 5; assert(!validBoard(p, b));
  assert.equal(findHint(p, p.givens), null);
  p.blocked[3] = true;
  assert(units(p).some(u => u.length === 5 && u.includes(43)));
  assert.match(cellRuleDetails(p, 43).join(''), /斜线 1/);
});

test('exclusion circles apply to all four surrounding cells and no others', () => {
  const p = blank({ exclusion: true }); p.exclusions = [{ at: 0, digit: 5, mask: 0 }];
  for (const i of [0, 1, 9, 10]) assert(!candidates(p, p.givens, i).includes(5));
  assert(candidates(p, p.givens, 2).includes(5));
  const b = p.givens.slice(); b[10] = 5; assert(!validBoard(p, b));
});

test('partial exclusion LEDs exclude every matching digit, independently of cell LEDs', () => {
  const p = blank({ exclusion: true }); const clue = { at: 30, digit: 0, mask: 32 }; p.exclusions = [clue];
  assert.deepEqual(exclusionDigits(clue), [4, 5, 6, 8, 9]);
  for (const i of exclusionCells(clue.at)) assert.deepEqual(candidates(p, p.givens, i), [1, 2, 3, 7]);
  clue.mask |= 8; assert.deepEqual(exclusionDigits(clue), [5, 6, 8, 9]);
  p.lights[30] = 64;
  assert.deepEqual(candidates(p, p.givens, 30, false), [1, 2, 3, 4, 7]);
  assert.deepEqual(candidates(p, p.givens, 30), [2, 3, 4]);
  assert.match(cellRuleDetails(p, 30).join(''), /5、6、8、9/);
});

test('parity backgrounds filter odd/even digits and combine with cell LEDs', () => {
  const p = blank({ parity: true }); p.parity = Array(81).fill(0); p.parity[0] = 1; p.parity[1] = 2;
  assert.deepEqual(candidates(p, p.givens, 0), [1, 3, 5, 7, 9]);
  assert.deepEqual(candidates(p, p.givens, 1), [2, 4, 6, 8]);
  assert.deepEqual(candidates(p, p.givens, 2), DIGITS);
  p.lights[0] = 64; assert.deepEqual(candidates(p, p.givens, 0), [3, 5, 9]);
  const b = p.givens.slice(); b[1] = 3; assert(!validBoard(p, b));
  assert.match(cellRuleDetails(p, 1).join(''), /蓝底/);
});

for (let flags = 1; flags < 16; flags++) for (const led of [true, false]) test(`new rule combinations remain uniquely solvable (flags ${flags}, LED ${led})`, () => {
  const keys = ['inequality', 'multiDiagonal', 'exclusion', 'parity'];
  const options = { ...DEFAULT_OPTIONS, led, ...Object.fromEntries(keys.map((k, i) => [k, !!(flags & 1 << i)])) };
  // Exercise simultaneous old and new variants, plus all three difficulties.
  Object.assign(options, { difficulty: ['easy', 'normal', 'hard'][flags % 3], diagonal: flags % 2 === 0, missing: flags % 3 === 0, killer: flags % 4 === 0, renban: flags % 5 === 0, consecutive: flags % 6 === 0 });
  const g = generate(options, 1040 + flags), p = g.puzzle;
  assert(validBoard(p, g.solution, true)); assert(isSaveData(saved(g)));
  const proof = search(p); assert.equal(proof.count, 1); assert(!proof.exhausted); assert.deepEqual(proof.solution, g.solution);
  if (options.difficulty === 'hard') assert(meetsChallenge(analyzeSingles(p)));
  if (options.inequality) { assert(p.inequalities.length >= 1 && p.inequalities.length <= (options.difficulty === 'hard' ? 12 : 24)); assert(p.inequalities.every(([a,b]) => !(p.givens[a] && p.givens[b]) && p.givens[a] !== 1 && p.givens[b] !== 9)); for (const [a, b] of p.inequalities) assert(g.solution[a] < g.solution[b]); }
  if (options.multiDiagonal) { assert(p.slants.length >= 2 && p.slants.length <= 3); for (const line of p.slants) { const vs = line.filter(i => !p.blocked[i]).map(i => g.solution[i]); assert.equal(new Set(vs).size, vs.length); } }
  if (options.parity) { assert(p.parity.some(Boolean)); assert(p.parity.every((v,i) => !v || !p.givens[i])); assert(p.parity.every((v, i) => !v || g.solution[i] % 2 === (v === 1 ? 1 : 0))); }
  if (options.exclusion) { assert(p.exclusions.length >= 1); for (const e of p.exclusions) { assert(exclusionCells(e.at).every(i => !exclusionDigits(e).includes(g.solution[i]))); if (!led) assert.equal(e.mask, 0); } }
  if (!led) assert(p.lights.every(v => !v));
  const hint = findHint(p, p.givens); if (hint) assert.equal(hint.value, g.solution[hint.cell]);
});

test('all ten rules combine deterministically and new clue corruption is rejected', () => {
  const opts = { ...DEFAULT_OPTIONS, diagonal: true, missing: true, killer: true, renban: true, consecutive: true, inequality: true, multiDiagonal: true, exclusion: true, parity: true };
  const g = generate(opts, 20260920), s = saved(g);
  assert.deepEqual(generate(opts, 20260920), g); assert(isSaveData(s)); assert.equal(search(g.puzzle).count, 1);
  for (const corrupt of [
    p => { p.inequalities[0] = [0, 80]; },
    p => { p.inequalities[0].reverse(); },
    p => { p.slants[0] = [1, 11, 21, 31]; },
    p => { p.exclusions[0].at = 80; },
    p => { p.exclusions[0].mask = 128; },
    p => { const e = p.exclusions[0]; e.mask = 0; e.digit = g.solution[e.at]; },
    p => { p.parity[0] = 3; },
    p => { const i = p.parity.findIndex(Boolean); p.parity[i] = 3 - p.parity[i]; },
    p => { p.options.inequality = false; },
    p => { p.options.parity = 'true'; },
    p => { p.exclusions = []; },
  ]) { const bad = structuredClone(s); corrupt(bad.puzzle); assert(!isSaveData(bad)); }
  const legacy = saved(generate(DEFAULT_OPTIONS, 7));
  for (const key of ['inequality', 'multiDiagonal', 'exclusion', 'parity']) delete legacy.puzzle.options[key];
  for (const key of ['inequalities', 'slants', 'exclusions', 'parity']) delete legacy.puzzle[key];
  assert(isSaveData(legacy));
});
