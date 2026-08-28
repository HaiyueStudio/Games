import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALENDAR_BOARD_CELLS,
  CALENDAR_PIECES,
  calendarCellKey,
  isCalendarPuzzleSaveData,
  normalizeCalendarCells,
} from '../calendar-puzzle/model.ts';

test('Calendar puzzle model defines unique playable cells and pieces', () => {
  assert.equal(CALENDAR_BOARD_CELLS.length, 50);
  assert.equal(new Set(CALENDAR_BOARD_CELLS.map(cell => cell.key)).size, 50);
  assert.equal(CALENDAR_PIECES.length, 10);
  assert.equal(calendarCellKey(3, 4), '3,4');
});

test('Calendar puzzle normalizes transformed piece coordinates', () => {
  assert.deepEqual(
    normalizeCalendarCells([{ x: 4, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 2 }]),
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
  );
});

test('Calendar puzzle save validation checks dates and piece state', () => {
  const piece = {
    rotation: 0,
    flipped: false,
    layer: 1,
    x: 20,
    y: 30,
    placed: false,
    row: 0,
    col: 0,
  };
  const save = { month: 8, day: 29, weekday: 6, pieces: [piece] };

  assert.equal(isCalendarPuzzleSaveData(save), true);
  assert.equal(isCalendarPuzzleSaveData({ ...save, month: 13 }), false);
  assert.equal(isCalendarPuzzleSaveData({ ...save, pieces: [{ ...piece, x: Number.NaN }] }), false);
});
