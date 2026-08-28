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
    && isNonNegativeInteger(value.month) && value.month >= 1 && value.month <= 12
    && isNonNegativeInteger(value.day) && value.day >= 1 && value.day <= 31
    && isNonNegativeInteger(value.weekday) && value.weekday <= 6
    && Array.isArray(value.pieces)
    && value.pieces.every(piece => isRecord(piece)
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
