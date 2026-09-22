import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(s, c, n) {
    return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? `${s}.ts` : s, c);
  },
});
const { SudokuController } = await import('../led-sudoku/gui-controller.ts');
const { sudokuLayout, wrapGuiText } = await import('../led-sudoku/gui-layout.ts');
const { preferences } = await import('../led-sudoku/preferences.ts');
const { isSaveData, generate, DEFAULT_OPTIONS } = await import('../led-sudoku/rules.ts');
const fixture = JSON.parse(
  readFileSync(new URL('../led-sudoku/evidence/hints/elimination.json', import.meta.url), 'utf8'),
);
function controller(generator = async (o, s) => generate(o, s)) {
  const saves = [],
    events = [];
  const c = new SudokuController(
    {
      generate: generator,
      save: (s) => saves.push(s),
      preferences: () => {},
      changed: () => events.push({ page: c.page, loading: c.loading }),
    },
    preferences({}),
  );
  return { c, saves, events };
}
test('shared GUI controller saves candidate-hint undo and restores exact steps', () => {
  const { c, saves } = controller();
  c.restore(fixture);
  const before = structuredClone(c.session.state);
  c.hint(true);
  assert.equal(c.session.hint.kind, 'elimination');
  while (c.lesson >= 0) c.moveLesson(1);
  assert.equal(c.session.history.length, 1);
  assert(isSaveData(saves.at(-1)));
  const n = controller().c;
  n.restore(JSON.parse(JSON.stringify(saves.at(-1))));
  n.undo();
  assert.deepEqual(n.session.state, { ...before, deductionSteps: 0 });
  assert.equal(n.session.history.length, 0);
});
test('new puzzle returns to board with loading state before worker resolves and blocks edits', async () => {
  let resolve;
  const { c, events } = controller(() => new Promise((r) => (resolve = r)));
  c.restore(fixture);
  const before = structuredClone(c.session.state);
  c.page = 'new';
  const pending = c.newGame(DEFAULT_OPTIONS, 39);
  assert.deepEqual(events.at(-1), { page: 'game', loading: true });
  c.input(1);
  assert.deepEqual(c.session.state, before);
  resolve(generate(DEFAULT_OPTIONS, 39));
  await pending;
  assert(!c.loading);
  assert.equal(c.session.state.puzzle.seed, 39);
  assert.equal(c.session.history.length, 0);
});
test('generation errors restore controls and leave existing puzzle intact', async () => {
  const { c } = controller(async () => {
    throw Error('worker failed');
  });
  c.restore(fixture);
  const before = structuredClone(c.session.state);
  await c.newGame();
  assert(!c.loading);
  assert.match(c.status, /出题失败/);
  assert.deepEqual(c.session.state, before);
});
test('manual mode and display preferences preserve their dependencies', () => {
  const { c } = controller();
  c.setPreferences({ ...c.preferences, showCandidates: true });
  assert(c.preferences.showCandidates);
  c.setPreferences({ ...c.preferences, manualCandidates: true });
  assert(!c.session.filterCandidates);
  assert(!c.preferences.showCandidates);
  c.setPreferences({ ...c.preferences, language: 'ja', theme: 'light-blue' });
  assert.equal(c.text('newGame'), '新しい数独');
});
test('phone GUI layout keeps square board and separate accessible touch rows', () => {
  for (const [w, h] of [
    [320, 568],
    [360, 736],
    [390, 763],
    [430, 839],
    [1280, 720],
  ]) {
    const l = sudokuLayout(w, h);
    assert.equal(l.board.width, l.board.height);
    assert(l.tools >= 44);
    assert(l.keyHeight - 6 >= 44);
    assert(l.keyTop + 3 * l.keyHeight - 6 <= l.bottom);
    assert(l.bottom + 44 <= h);
    assert(l.panel.x + l.panel.width <= w);
  }
});
test('GUI text wrapping keeps explicit paragraphs and does not drop characters', () => {
  const text = '候选数 Candidates 日本語\n第二行';
  const lines = wrapGuiText(text, 80, 14);
  assert(lines.length >= 3);
  assert.equal(lines.join('').replaceAll(' ', ''), text.replace(/[\n ]/g, ''));
});
test('saved undo accepts legacy saves and rejects malformed board history', () => {
  const { c, saves } = controller();
  c.restore(fixture);
  c.hint(true);
  while (c.lesson >= 0) c.moveLesson(1);
  const saved = saves.at(-1);
  assert(isSaveData(fixture));
  assert(isSaveData(saved));
  for (const change of [
    (s) => s.undoHistory[0].board.pop(),
    (s) => (s.undoHistory[0].deductionSteps = 99999),
    (s) => (s.undoHistory = Array(201).fill(s.undoHistory[0])),
  ]) {
    const bad = structuredClone(saved);
    change(bad);
    assert(!isSaveData(bad));
  }
});
