export type TetrisPhase = 'playing' | 'paused' | 'lost';
export type PieceKind = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export interface TetrisConfig {
  rows: number;
  cols: number;
}

export interface TetrisPoint {
  row: number;
  col: number;
}

export interface TetrisPiece {
  kind: PieceKind;
  row: number;
  col: number;
  rotation: number;
}

export interface TetrisSaveData {
  rows: number;
  cols: number;
  board: Array<Array<PieceKind | null>>;
  current: TetrisPiece;
  nextKind: PieceKind;
  phase: TetrisPhase;
  score: number;
}

export const TETRIS_SCORE_BY_LINES = [0, 1, 4, 12, 32] as const;

export const TETRIS_COLORS: Record<PieceKind, string> = {
  I: '#22d3ee',
  J: '#2563eb',
  L: '#f97316',
  O: '#facc15',
  S: '#22c55e',
  T: '#a855f7',
  Z: '#ef4444',
};

export const TETRIS_SHAPES: Record<PieceKind, TetrisPoint[]> = {
  I: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }],
  J: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  L: [{ row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  O: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  S: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
  T: [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  Z: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
};

const TETRIS_KINDS = Object.keys(TETRIS_SHAPES) as PieceKind[];
const TETRIS_KIND_SET = new Set<string>(TETRIS_KINDS);

function requiredItemAt<T>(items: readonly T[], index: number, label: string): T {
  const value = items[index];
  if (value === undefined) throw new RangeError(`${label} index ${index} is out of bounds.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function createEmptyTetrisBoard(rows: number, cols: number): Array<Array<PieceKind | null>> {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

export function rotateTetrisPoint(
  point: TetrisPoint,
  rotation: number,
  kind: PieceKind,
): TetrisPoint {
  if (kind === 'O') return point;
  let row = point.row;
  let col = point.col;
  for (let index = 0; index < rotation % 4; index++) [row, col] = [col, 3 - row];
  return { row, col };
}

export function randomTetrisKind(random = Math.random): PieceKind {
  return requiredItemAt(
    TETRIS_KINDS,
    Math.floor(random() * TETRIS_KINDS.length),
    'Tetris piece kinds',
  );
}

export function isTetrisSaveData(value: unknown): value is TetrisSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.rows)
    && isNonNegativeInteger(value.cols)
    && Array.isArray(value.board)
    && value.board.length === value.rows
    && value.board.every(row => Array.isArray(row)
      && row.length === value.cols
      && row.every(cell => cell === null || (typeof cell === 'string' && TETRIS_KIND_SET.has(cell))))
    && isPiece(value.current)
    && typeof value.nextKind === 'string' && TETRIS_KIND_SET.has(value.nextKind)
    && (value.phase === 'playing' || value.phase === 'paused' || value.phase === 'lost')
    && isNonNegativeInteger(value.score);
}

function isPiece(value: unknown): value is TetrisPiece {
  return isRecord(value)
    && typeof value.kind === 'string' && TETRIS_KIND_SET.has(value.kind)
    && Number.isSafeInteger(value.row)
    && Number.isSafeInteger(value.col)
    && Number.isSafeInteger(value.rotation);
}
