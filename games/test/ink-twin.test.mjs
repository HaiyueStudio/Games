import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjacent, coveredCells, createPuzzle, dailySeed, hint, INKS, isInkTwinSave, lineComplete, move, newGame, nextNumber, restoreGame, trimPath, undo } from '../ink-twin/rules/model.ts';
import { InkStrokeReveal } from '../ink-twin/art/strokeReveal.ts';

const play = (state, ink, cells) => {
  for (const cell of cells) { const result = move(state, ink, cell); assert.equal(result.kind, 'moved', result.reason); state = result.state; }
  return state;
};
const fixture = () => ({ size: 4, seed: 0, difficulty: 'easy',
  solution: { black: [0, 1, 2, 3, 7, 6], white: [5, 4, 8, 9, 10, 11, 15, 14, 13, 12] },
  clues: { black: [{ cell: 0, number: 1 }, { cell: 3, number: 2 }, { cell: 6, number: 3 }], white: [{ cell: 5, number: 1 }, { cell: 10, number: 2 }, { cell: 12, number: 3 }] } });

test('seeded boards have independent unequal routes, separate clues and a guaranteed full-board solution', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) for (let seed = 0; seed < 100; seed++) {
    const puzzle = createPuzzle(difficulty, seed), { size, solution } = puzzle;
    assert.deepEqual(puzzle, createPuzzle(difficulty, seed));
    assert.notEqual(solution.black.length, solution.white.length, 'board is not tied to equal rotated halves');
    assert.equal(new Set([...solution.black, ...solution.white]).size, size * size);
    assert.equal(solution.black.length + solution.white.length, size * size);
    for (const ink of INKS) {
      const route = solution[ink];
      assert.ok(route.slice(1).every((cell, i) => adjacent(route[i], cell, size)));
      assert.equal(puzzle.clues[ink][0].cell, route[0]); assert.equal(puzzle.clues[ink].at(-1).cell, route.at(-1));
      assert.equal(new Set(puzzle.clues[ink].map(clue => clue.cell)).size, puzzle.clues[ink].length);
    }
    let state = newGame(puzzle);
    for (const ink of seed % 2 ? ['white', 'black'] : INKS) {
      const stationary = state.paths[ink === 'black' ? 'white' : 'black'];
      state = play(state, ink, solution[ink].slice(1));
      assert.equal(state.paths[ink === 'black' ? 'white' : 'black'], stationary);
      assert.ok(lineComplete(state, ink)); assert.equal(nextNumber(state, ink), puzzle.clues[ink].length + 1);
    }
    assert.equal(state.won, true); assert.equal(coveredCells(state), size * size);
  }
});
test('different seeds vary the asymmetric layout; daily seeds reproduce a date and difficulty', () => {
  assert.equal(dailySeed('2026-11-01', 'easy'), dailySeed('2026-11-01', 'easy'));
  assert.notEqual(dailySeed('2026-11-01', 'easy'), dailySeed('2026-11-02', 'easy'));
  assert.notEqual(dailySeed('2026-11-01', 'easy'), dailySeed('2026-11-01', 'hard'));
  assert.equal(new Set(Array.from({ length: 30 }, (_, seed) => JSON.stringify(createPuzzle('hard', seed).solution))).size, 30);
});
test('colors advance independently and reserve every opposite-color number, even before it is connected', () => {
  const start = newGame(fixture()), a = move(start, 'black', 1).state;
  assert.deepEqual(a.paths, { black: [0, 1], white: [5] }); assert.deepEqual(start.paths, { black: [0], white: [5] });
  assert.equal(move(a, 'black', 5).kind, 'blocked', 'opposite start is occupied');
  const b = play(start, 'black', [4, 8, 9]);
  assert.equal(move(b, 'black', 10).kind, 'blocked', 'opposite future number is reserved');
  const c = move(start, 'white', 4).state;
  assert.equal(move(c, 'black', 4).kind, 'blocked', 'cannot cross the other line');
  assert.equal(nextNumber(a, 'black'), 2); assert.equal(nextNumber(a, 'white'), 2);
});
test('rules reject diagonals, row wrapping, skipped numbers, extending a completed line, and an unfilled double finish', () => {
  const start = newGame(fixture());
  for (const cell of [-1, 16, 1.5, NaN, 5, 15]) assert.equal(move(start, 'black', cell).kind, 'blocked');
  assert.equal(move(play(start, 'black', [1, 2]), 'black', 6).kind, 'blocked', 'must visit black 2 before black 3');
  assert.equal(move(play(start, 'black', [1, 2, 3]), 'black', 4).kind, 'blocked', 'row wrapping');
  const blackDone = play(start, 'black', fixture().solution.black.slice(1));
  assert.ok(lineComplete(blackDone, 'black')); assert.equal(blackDone.won, false);
  assert.equal(move(blackDone, 'black', 10).kind, 'blocked');
  const shortWhite = play(blackDone, 'white', [9, 10, 14, 13]);
  assert.equal(move(shortWhite, 'white', 12).kind, 'blocked', 'both endpoints alone do not win');
  assert.equal(shortWhite.won, false);
});
test('undo, clicking an earlier point and retracing affect only the selected color and preserve prior states', () => {
  const start = newGame(fixture()), a = play(start, 'black', [1, 2]), b = play(a, 'white', [4, 8]);
  assert.equal(undo(b, 'black').paths.white, b.paths.white); assert.deepEqual(undo(b, 'black').paths.black, [0, 1]);
  assert.equal(undo(start, 'black'), start);
  const c = move(b, 'white', 4).state; assert.deepEqual(c.paths.white, [5, 4]); assert.equal(c.paths.black, b.paths.black);
  assert.deepEqual(trimPath(b, 'black', 1).paths.black, [0]); assert.deepEqual(b.paths.black, [0, 1, 2]);
  let won = play(start, 'black', fixture().solution.black.slice(1)); won = play(won, 'white', fixture().solution.white.slice(1));
  assert.ok(won.won); assert.equal(undo(won, 'white').won, false); assert.equal(undo(won, 'white').paths.black, won.paths.black);
});
test('hints preserve viable prefixes, rewind conflicting branches and switch away from a finished color', () => {
  let state = play(newGame(fixture()), 'black', [4, 8]); state = play(state, 'white', [9]);
  const result = hint(state, 'black'); assert.ok(result.rewound); assert.equal(result.ink, 'black');
  assert.deepEqual(result.state.paths, { black: [0, 1], white: [5] });
  state = result.state;
  for (let i = 0; i < 30 && !state.won; i++) state = hint(state, 'black').state;
  assert.ok(state.won); assert.equal(hint(state, 'white').state, state);
});
test('ink tips reveal partial segments, animate both colors independently, retract cleanly and finish bounded queues', () => {
  const reveal = new InkStrokeReveal(), start = newGame(fixture()); reveal.setState(start); reveal.advance(0);
  let state = move(start, 'black', 1).state; reveal.setState(state);
  assert.deepEqual(reveal.distances, { black: 0, white: 0 }); assert.ok(reveal.animating);
  reveal.advance(35); assert.ok(reveal.distances.black > 0 && reveal.distances.black < 1); assert.equal(reveal.distances.white, 0);
  state = move(state, 'white', 4).state; reveal.setState(state); reveal.advance(70);
  assert.ok(reveal.distances.white > 0 && reveal.distances.white < 1); assert.ok(reveal.distances.black > reveal.distances.white);
  reveal.setState(undo(state, 'black')); assert.equal(reveal.distances.black, 0); assert.ok(reveal.distances.white > 0);
  const puzzle = createPuzzle('hard', 123), base = newGame(puzzle);
  reveal.setState(base); const filled = play(base, 'black', puzzle.solution.black.slice(1)); reveal.setState(filled);
  assert.ok(reveal.animating);
  for (let time = 100; time <= 3000; time += 16) reveal.advance(time);
  assert.equal(reveal.distances.black, puzzle.solution.black.length - 1); assert.equal(reveal.animating, false);
  assert.equal(reveal.advance(3016), false, 'settled ink does not request texture uploads');
  reveal.setState(newGame(createPuzzle('easy', 6))); assert.deepEqual(reveal.distances, { black: 0, white: 0 });
  reveal.setState(filled); assert.equal(reveal.animating, false, 'new/restored puzzles snap to their saved strokes');
});
test('reduced-motion rendering snaps pending strokes while leaving logical paths unchanged', () => {
  const state = newGame(fixture()), reveal = new InkStrokeReveal(); reveal.setState(state); reveal.advance(0);
  const updated = move(state, 'black', 1).state; reveal.setState(updated); reveal.advance(16, true);
  assert.equal(reveal.animating, false); assert.equal(reveal.distances.black, 1); assert.deepEqual(updated.paths.black, [0, 1]);
});
test('generated bitmap font has ten bounded glyphs and a genuine RGBA PNG source', () => {
  const font = JSON.parse(readFileSync(new URL('../ink-twin/assets/brush-digits.fnt.json', import.meta.url)));
  const png = readFileSync(new URL('../ink-twin/assets/brush-digits.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), font.common.scaleW); assert.equal(png.readUInt32BE(20), font.common.scaleH); assert.equal(png[25], 6);
  assert.deepEqual(font.chars.map(char => char.id), Array.from({ length: 10 }, (_, i) => 48 + i));
  for (const char of font.chars) { assert.ok(char.width > 30 && char.height > 100); assert.ok(char.x >= 0 && char.y >= 0 && char.x + char.width <= font.common.scaleW && char.y + char.height <= font.common.scaleH); }
});
test('versioned saves validate and restore each independently drawn color and reject legacy/corrupt paths', () => {
  const seed = dailySeed('2026-11-01', 'hard'), puzzle = createPuzzle('hard', seed);
  const saved = { schemaVersion: 2, date: '2026-11-01', difficulty: 'hard', mode: 'daily', seed, paths: { black: puzzle.solution.black.slice(0, 15), white: puzzle.solution.white.slice(0, 9) }, active: 'white', seconds: 120, hints: 2, practiceIndex: 0 };
  assert.ok(isInkTwinSave(saved)); assert.deepEqual(restoreGame(saved).paths, saved.paths);
  assert.ok(isInkTwinSave({ ...saved, paths: puzzle.solution })); assert.equal(restoreGame({ ...saved, paths: puzzle.solution }).won, true);
  for (const data of [null, {}, { ...saved, schemaVersion: 1 }, { ...saved, seed: seed + 1 }, { ...saved, active: 'red' }, { ...saved, seconds: -1 }, { ...saved, difficulty: 'insane' }, { ...saved, paths: null }, { ...saved, paths: { ...saved.paths, white: [] } }, { ...saved, paths: { ...saved.paths, black: [puzzle.solution.black[0], puzzle.solution.black[2]] } }, { ...saved, paths: { ...saved.paths, white: [puzzle.solution.white[0], 0.5] } }]) assert.equal(isInkTwinSave(data), false);
  const restored = restoreGame(saved); assert.notEqual(restored.paths.black, saved.paths.black); assert.notEqual(restored.paths.white, saved.paths.white);
});
