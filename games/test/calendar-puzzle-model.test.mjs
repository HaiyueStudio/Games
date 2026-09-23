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

test('all six language choices survive save validation without losing progress', async () => {
  const { CALENDAR_LANGUAGES } = await import('../calendar-puzzle/model.ts');
  const { CALENDAR_COPY, CALENDAR_GLYPHS } = await import('../calendar-puzzle/locale.ts');
  const save = { year: 2026, month: 9, day: 20, weekday: 0, completedDates: ['2026-09-19'], starredDates: ['2026-09-19'], pieces: [] };
  assert.deepEqual(CALENDAR_LANGUAGES.map(option => option.value), ['zh', 'en', 'ja', 'fr', 'de', 'es']);
  for (const { value } of CALENDAR_LANGUAGES) {
    assert.equal(isCalendarPuzzleSaveData({ ...save, language: value }), true);
    const copy = CALENDAR_COPY[value];
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(CALENDAR_COPY.en).sort());
    assert.equal(copy.months.length, 12); assert.equal(copy.weekdays.length, 7);
    for (const text of Object.values(copy).flat()) {
      assert.ok(text.length > 0);
      for (const glyph of text) assert.ok(CALENDAR_GLYPHS.includes(glyph), `missing ${glyph} for ${value}`);
    }
  }
  assert.equal(isCalendarPuzzleSaveData({ ...save, language: 'invalid' }), false);
});

test('older and unknown skin preferences preserve playable saves and fall back to white', async () => {
  const { calendarSkinId, CALENDAR_SKINS } = await import('../calendar-puzzle/calendar-style.ts');
  const save = { year: 2026, month: 9, day: 23, weekday: 3, completedDates: ['2026-09-22'], pieces: [] };
  for (const skin of [undefined, 'future-skin', null]) {
    assert.equal(isCalendarPuzzleSaveData({ ...save, skin }), true);
    assert.equal(calendarSkinId(skin), 'white');
  }
  for (const skin of ['white', 'blue', 'purple']) {
    const restored = JSON.parse(JSON.stringify({ ...save, skin }));
    assert.equal(isCalendarPuzzleSaveData(restored), true);
    assert.equal(calendarSkinId(restored.skin), skin);
    assert.deepEqual(restored.completedDates, save.completedDates);
  }
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const [skin, palette] of Object.entries(CALENDAR_SKINS)) {
    for (const [fg, bg] of [[palette.colors.text, palette.colors.surface], [palette.colors.textMuted, palette.colors.background], [palette.cell.text, palette.cell.background], [palette.selected.text, palette.selected.background]]) {
      const a = luminance(fg), b = luminance(bg);
      assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${skin}: readable ${fg} on ${bg}`);
    }
  }
});
