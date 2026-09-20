import { candidates, validBoard, type SaveData } from './rules';
export interface Move { board: number[]; notes: number[]; }
export function editable(state: SaveData, cell: number): boolean { return Number.isInteger(cell) && cell >= 0 && cell < 81 && !state.puzzle.blocked[cell] && !state.puzzle.givens[cell]; }
/** Immutable transition shared by pointer and keyboard input. */
export function place(state: SaveData, cell: number, value: number, pencil = false): SaveData | null {
  if (!editable(state, cell) || !Number.isInteger(value) || value < 0 || value > 9) return null;
  if (value && !candidates(state.puzzle, state.board, cell).includes(value)) return null;
  if (pencil && value && state.board[cell]) return null;
  const board = state.board.slice(), notes = state.notes.slice();
  if (pencil && value && !board[cell]) notes[cell] = notes[cell]! ^ 1 << (value - 1);
  else { board[cell] = value; notes[cell] = 0; }
  if (value && !pencil) for (let i = 0; i < 81; i++) if (notes[i]) {
    const possible = candidates(state.puzzle, board, i).reduce((mask, d) => mask | 1 << (d - 1), 0); notes[i] = notes[i]! & possible;
  }
  if (board.every((v, i) => v === state.board[i]) && notes.every((v, i) => v === state.notes[i])) return null;
  return { ...state, board, notes };
}
export function complete(state: SaveData): boolean { return validBoard(state.puzzle, state.board, true); }
