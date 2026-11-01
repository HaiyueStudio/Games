import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjacent, createPuzzle, dailySeed, hint, isInkTwinSave, move, newGame, nextNumber, restoreGame, twin, undo } from '../ink-twin/rules/model.ts';

test('paired generation is deterministic, connected, disjoint, exhaustive and solvable at every difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) for (let seed = 0; seed < 100; seed++) {
    const puzzle = createPuzzle(difficulty, seed), { size, solution } = puzzle;
    assert.deepEqual(puzzle, createPuzzle(difficulty, seed));
    assert.equal(solution.length, size * size / 2);
    assert.equal(new Set([...solution, ...solution.map(cell => twin(cell, size))]).size, size * size);
    assert.ok(solution.slice(1).every((cell, i) => adjacent(solution[i], cell, size)));
    let state = newGame(puzzle);
    for (const cell of solution.slice(1)) { const result = move(state, cell); assert.equal(result.kind, 'moved'); state = result.state; }
    assert.equal(state.won, true); assert.equal(nextNumber(state), puzzle.clues.length + 1);
    assert.equal(move(state, solution[0]).kind, 'blocked');
  }
});
test('different seeds and difficulties produce different puzzles; daily seeds reproduce their date', () => {
  assert.equal(dailySeed('2026-11-01', 'easy'), dailySeed('2026-11-01', 'easy'));
  assert.notEqual(dailySeed('2026-11-01', 'easy'), dailySeed('2026-11-02', 'easy'));
  assert.notEqual(dailySeed('2026-11-01', 'easy'), dailySeed('2026-11-01', 'hard'));
  assert.equal(new Set(Array.from({ length: 30 }, (_, seed) => JSON.stringify(createPuzzle('hard', seed).solution))).size, 30);
});
const fixture = () => ({ size: 4, seed: 0, difficulty: 'easy', solution: [0, 1, 2, 3, 7, 6, 5, 4], clues: [{ cell: 0, number: 1 }, { cell: 3, number: 2 }, { cell: 4, number: 3 }] });
test('rules reject diagonals, row wrapping, occupied twin cells, skipped numbers and an early final number', () => {
  let state = newGame(fixture());
  for (const cell of [-1, 16, 1.5, NaN, 5, 15, 4]) assert.equal(move(state, cell).kind, 'blocked', String(cell));
  state = move(state, 1).state;
  assert.equal(move(state, 5).kind, 'moved');
  state = { ...state, path: [0, 1, 2, 3] };
  assert.equal(move(state, 4).kind, 'blocked');
  assert.equal(move(newGame({ ...fixture(), clues: [{ cell: 0, number: 1 }, { cell: 1, number: 3 }, { cell: 4, number: 2 }] }), 1).kind, 'blocked');
  assert.equal(move({ ...state, path: [0, 1, 5, 9, 10] }, 14).kind, 'blocked', 'cannot enter rotated path');
});
test('undo and retracing remove both paired strokes without mutating previous states', () => {
  const start = newGame(fixture()), a = move(start, 1).state, b = move(a, 2).state;
  assert.deepEqual(start.path, [0]); assert.deepEqual(a.path, [0, 1]);
  assert.deepEqual(move(b, 1).state.path, [0, 1]);
  assert.deepEqual(undo(b).path, a.path); assert.equal(undo(start), start);
  let won = start; for (const cell of won.puzzle.solution.slice(1)) won = move(won, cell).state;
  assert.equal(won.won, true); assert.equal(undo(won).won, false);
});
test('hints follow a legal complete route and disclose rewinding a diverged suffix', () => {
  let state = newGame(fixture()); state = move(state, 1).state; state = move(state, 5).state;
  const result = hint(state); assert.equal(result.rewound, true); assert.deepEqual(result.state.path, [0, 1, 2]);
  state = result.state;
  for (let i = 0; i < 20 && !state.won; i++) state = hint(state).state;
  assert.equal(state.won, true); assert.equal(hint(state).state, state);
});
test('generated bitmap font has ten bounded glyphs and a genuine RGBA PNG source', () => {
  const font = JSON.parse(readFileSync(new URL('../ink-twin/assets/brush-digits.fnt.json', import.meta.url)));
  const png = readFileSync(new URL('../ink-twin/assets/brush-digits.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), font.common.scaleW); assert.equal(png.readUInt32BE(20), font.common.scaleH); assert.equal(png[25], 6);
  assert.deepEqual(font.chars.map(char => char.id), Array.from({ length: 10 }, (_, i) => 48 + i));
  for (const char of font.chars) { assert.ok(char.width > 30 && char.height > 100); assert.ok(char.x >= 0 && char.y >= 0 && char.x + char.width <= font.common.scaleW && char.y + char.height <= font.common.scaleH); }
});
test('saves replay legal moves and reject corrupt paths, stale daily seeds and malformed fields', () => {
  const seed = dailySeed('2026-11-01', 'hard'), puzzle = createPuzzle('hard', seed);
  const saved = { date: '2026-11-01', difficulty: 'hard', mode: 'daily', seed, path: puzzle.solution.slice(0, 15), active: 'white', seconds: 120, hints: 2, practiceIndex: 0 };
  assert.ok(isInkTwinSave(saved)); assert.deepEqual(restoreGame(saved).path, saved.path);
  assert.ok(isInkTwinSave({ ...saved, path: [...puzzle.solution] })); assert.equal(restoreGame({ ...saved, path: [...puzzle.solution] }).won, true);
  for (const data of [null, {}, { ...saved, seed: seed + 1 }, { ...saved, active: 'red' }, { ...saved, seconds: -1 }, { ...saved, difficulty: 'insane' }, { ...saved, path: [] }, { ...saved, path: [puzzle.solution[0], puzzle.solution[2]] }, { ...saved, path: [puzzle.solution[0], 0.5] }]) assert.equal(isInkTwinSave(data), false);
  const restored = restoreGame(saved); assert.notEqual(restored.path, saved.path);
});
