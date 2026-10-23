export const GAME_2048_ID = '2048';
export const GAME_2048_SAVE_ID = 'autosave';
export const GAME_2048_SAVE_DATA_VERSION = 1;

export type Game2048Phase = 'playing' | 'won' | 'lost';

export interface Game2048SaveData {
  rows: number;
  cols: number;
  board: number[][];
  score: number;
  best: number;
  phase: Game2048Phase;
  dismissedModalPhase?: Exclude<Game2048Phase, 'playing'> | null;
}

export function isGame2048SaveData(value: unknown, rows: number, cols: number): value is Game2048SaveData {
  if (!isRecord(value)) return false;
  if (value.rows !== rows || value.cols !== cols) return false;
  if (!isScore(value.score) || !isScore(value.best) || value.best < value.score) return false;
  if (value.phase !== 'playing' && value.phase !== 'won' && value.phase !== 'lost') return false;
  if ('dismissedModalPhase' in value
    && value.dismissedModalPhase !== null
    && value.dismissedModalPhase !== 'won'
    && value.dismissedModalPhase !== 'lost') return false;
  return Array.isArray(value.board)
    && value.board.length === rows
    && value.board.every(row => Array.isArray(row) && row.length === cols && row.every(isTileValue));
}

function isScore(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isTileValue(value: unknown): value is number {
  return value === 0 || (
    Number.isSafeInteger(value)
    && Number(value) >= 2
    && Number.isInteger(Math.log2(Number(value)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
