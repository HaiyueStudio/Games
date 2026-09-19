import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDaysInMonth, calendarWeekday, calendarDateKey, calendarMonthCells, shiftCalendarMonth, recordCalendarCompletion, isCalendarDateKey, isCalendarPuzzleSaveData } from '../calendar-puzzle/model.ts';

test('perpetual calendar handles Gregorian century leap years and years below 100', () => {
  assert.equal(calendarDaysInMonth(1900, 2), 28); assert.equal(calendarDaysInMonth(2000, 2), 29);
  assert.equal(calendarDaysInMonth(2024, 2), 29); assert.equal(calendarDaysInMonth(2100, 2), 28);
  assert.equal(calendarWeekday(1, 1, 1), 1); assert.equal(calendarWeekday(2024, 2, 29), 4);
  assert.equal(calendarWeekday(2026, 9, 19), 6);
});
test('month grid aligns dates to weekdays, including six-week months', () => {
  for (const year of [1, 99, 1900, 2000, 2024, 2026, 9999]) for (let month=1; month<=12; month++) {
    const cells=calendarMonthCells(year,month); assert.equal(cells.length,42);
    assert.equal(cells.filter(Boolean).length,calendarDaysInMonth(year,month));
    cells.forEach((day,i)=>{if(day)assert.equal(i%7,calendarWeekday(year,month,day));});
  }
  assert.equal(calendarMonthCells(2026,8)[36],31);
});
test('month/year navigation rolls over December and clamps calendar endpoints', () => {
  assert.deepEqual(shiftCalendarMonth(2024,1,-1),{year:2023,month:12});
  assert.deepEqual(shiftCalendarMonth(2024,12,1),{year:2025,month:1});
  assert.deepEqual(shiftCalendarMonth(1,1,-12),{year:1,month:1});
  assert.deepEqual(shiftCalendarMonth(9999,12,12),{year:9999,month:12});
});
test('history is immutable, year-specific, deduplicated and rejects invalid dates', () => {
  const before=['2024-02-28']; const after=recordCalendarCompletion(before,'2024-02-29');
  assert.deepEqual(before,['2024-02-28']);assert.deepEqual(recordCalendarCompletion(after,'2024-02-28'),after);
  assert.equal(recordCalendarCompletion(after,'2025-02-28').length,3);
  assert.equal(isCalendarDateKey('2025-02-29'),false);assert.equal(isCalendarDateKey('0000-01-01'),false);
  assert.equal(calendarDateKey(1,1,1),'0001-01-01');
  const save={year:2024,month:2,day:29,weekday:4,completedDates:after,pieces:[]};
  assert.equal(isCalendarPuzzleSaveData(save),true);
  assert.equal(isCalendarPuzzleSaveData({...save,year:2025}),false);
  assert.equal(isCalendarPuzzleSaveData({...save,completedDates:['2024-02-30']}),false);
  assert.equal(isCalendarPuzzleSaveData({month:9,day:19,weekday:6,pieces:[]}),true);
});
