export type CalendarCellKind = 'month' | 'day' | 'weekday';

export interface CalendarPoint {
  x: number;
  y: number;
}

export interface CalendarBoardCell {
  row: number;
  col: number;
  key: string;
  label: string;
  kind: CalendarCellKind;
}

export interface CalendarPieceDefinition {
  id: string;
  name: string;
  color: string;
  cells: CalendarPoint[];
}

export interface CalendarPieceSaveState {
  scale?: number;
  rotation: number;
  flipped: boolean;
  layer: number;
  x: number;
  y: number;
  placed: boolean;
  row: number;
  col: number;
}

export interface CalendarPuzzleSaveData {
  language?: 'zh' | 'en' | 'ja';
  year?: number;
  completedDates?: string[];
  layoutVersion?: number;
  layoutWidth?: number;
  layoutHeight?: number;
  month: number;
  day: number;
  weekday: number;
  pieces: CalendarPieceSaveState[];
}

export const CALENDAR_MONTHS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
] as const;

export const CALENDAR_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export const CALENDAR_BOARD_CELLS: CalendarBoardCell[] = [
  ...CALENDAR_MONTHS.slice(0, 6).map((label, index) => ({
    row: 0,
    col: index,
    key: `m${index + 1}`,
    label,
    kind: 'month' as const,
  })),
  ...CALENDAR_MONTHS.slice(6).map((label, index) => ({
    row: 1,
    col: index,
    key: `m${index + 7}`,
    label,
    kind: 'month' as const,
  })),
  ...Array.from({ length: 28 }, (_, index) => {
    const day = index + 1;
    return {
      row: 2 + Math.floor(index / 7),
      col: index % 7,
      key: `d${day}`,
      label: String(day),
      kind: 'day' as const,
    };
  }),
  { row: 6, col: 0, key: 'd29', label: '29', kind: 'day' },
  { row: 6, col: 1, key: 'd30', label: '30', kind: 'day' },
  { row: 6, col: 2, key: 'd31', label: '31', kind: 'day' },
  { row: 6, col: 3, key: 'w1', label: '周一', kind: 'weekday' },
  { row: 6, col: 4, key: 'w2', label: '周二', kind: 'weekday' },
  { row: 6, col: 5, key: 'w3', label: '周三', kind: 'weekday' },
  { row: 6, col: 6, key: 'w4', label: '周四', kind: 'weekday' },
  { row: 7, col: 4, key: 'w5', label: '周五', kind: 'weekday' },
  { row: 7, col: 5, key: 'w6', label: '周六', kind: 'weekday' },
  { row: 7, col: 6, key: 'w0', label: '周日', kind: 'weekday' },
];

export const CALENDAR_PIECES: CalendarPieceDefinition[] = [
  { id: 'a', name: 'A', color: '#ef6f6c', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }] },
  { id: 'b', name: 'B', color: '#f59f42', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] },
  { id: 'c', name: 'C', color: '#f4c95d', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }] },
  { id: 'd', name: 'D', color: '#70c1b3', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }] },
  { id: 'e', name: 'E', color: '#3fb8af', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }] },
  { id: 'f', name: 'F', color: '#4d96d7', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] },
  { id: 'g', name: 'G', color: '#7c6ee6', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }] },
  { id: 'h', name: 'H', color: '#b86adf', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  { id: 'i', name: 'I', color: '#e86aa7', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }] },
  { id: 'j', name: 'J', color: '#8bc34a', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
];

export function calendarCellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function normalizeCalendarCells(cells: readonly CalendarPoint[]): CalendarPoint[] {
  const minX = Math.min(...cells.map(cell => cell.x));
  const minY = Math.min(...cells.map(cell => cell.y));
  return cells
    .map(cell => ({ x: cell.x - minX, y: cell.y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function isCalendarPuzzleSaveData(value: unknown): value is CalendarPuzzleSaveData {
  return isRecord(value)
    && (value.year === undefined || (isNonNegativeInteger(value.year) && value.year >= 1 && value.year <= 9999 && (value.day as number) <= calendarDaysInMonth(value.year, value.month as number)))
    && (value.completedDates === undefined || (Array.isArray(value.completedDates) && value.completedDates.every(isCalendarDateKey)))
    && (value.language === undefined || ['zh','en','ja'].includes(value.language as string))
    && isNonNegativeInteger(value.month) && value.month >= 1 && value.month <= 12
    && isNonNegativeInteger(value.day) && value.day >= 1 && value.day <= 31
    && isNonNegativeInteger(value.weekday) && value.weekday <= 6
    && Array.isArray(value.pieces)
    && value.pieces.every(piece => isRecord(piece)
      && (piece.scale === undefined || (isFiniteNumber(piece.scale) && piece.scale > 0 && piece.scale <= 1))
      && isNonNegativeInteger(piece.rotation)
      && typeof piece.flipped === 'boolean'
      && isNonNegativeInteger(piece.layer)
      && isFiniteNumber(piece.x) && isFiniteNumber(piece.y)
      && typeof piece.placed === 'boolean'
      && Number.isSafeInteger(piece.row) && Number.isSafeInteger(piece.col));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Gregorian calendar helpers use UTC and explicitly handle years 1–99. */
export function calendarDaysInMonth(year: number, month: number): number {
  return month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function calendarWeekday(year: number, month: number, day: number): number {
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(12, 0, 0, 0); return date.getUTCDay();
}
export function calendarDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function isCalendarDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= calendarDaysInMonth(year, month);
}
export function calendarMonthCells(year: number, month: number): Array<number | null> {
  const start = calendarWeekday(year, month, 1), days = calendarDaysInMonth(year, month);
  return Array.from({ length: 42 }, (_, i) => i >= start && i < start + days ? i - start + 1 : null);
}
export function shiftCalendarMonth(year: number, month: number, offset: number) {
  const index = Math.min(9999 * 12 - 1, Math.max(0, (year - 1) * 12 + month - 1 + offset));
  return { year: Math.floor(index / 12) + 1, month: index % 12 + 1 };
}
export function recordCalendarCompletion(dates: readonly string[], key: string): string[] {
  return [...new Set([...dates, key].filter(isCalendarDateKey))].sort();
}
