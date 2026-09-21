import { inputChoices, noteChoices, candidateMasks } from './preferences';
import { candidates, validBoard, type SaveData } from './rules';
export interface Move { board: number[]; notes: number[]; crossed?: number[]; deductionSteps?: number; }
export function editable(state: SaveData, cell: number): boolean { return Number.isInteger(cell) && cell >= 0 && cell < state.board.length && !state.puzzle.blocked[cell] && !state.puzzle.givens[cell]; }
/** Immutable transition shared by pointer and keyboard input. */
export function place(state: SaveData, cell: number, value: number, pencil = false, filterCandidates = true): SaveData | null {
  if (!editable(state, cell) || !Number.isInteger(value) || value < 0 || value > 9) return null;
  if (value && !(pencil ? noteChoices(state,cell,filterCandidates) : inputChoices(state,cell,filterCandidates)).includes(value)) return null;
  if (pencil && value && state.board[cell]) return null;
  const board = state.board.slice(), notes = state.notes.slice(), crossed = state.crossed?.slice() ?? Array(state.board.length).fill(0);
  if (pencil && value && !board[cell]) {
    crossed[cell] = crossed[cell]! ^ 1 << (value - 1);
    notes[cell] = (filterCandidates ? candidateMasks(state)[cell]! : 511) & ~crossed[cell]!;
  } else { board[cell] = value; notes[cell] = 0; crossed[cell] = 0; }
  if (filterCandidates && value && !pencil) for (let i = 0; i < state.board.length; i++) if (notes[i]) {
    const possible = candidates(state.puzzle, board, i).reduce((mask, d) => mask | 1 << (d - 1), 0); notes[i] = notes[i]! & possible;
  }
  if (board.every((v, i) => v === state.board[i]) && notes.every((v, i) => v === state.notes[i]) && crossed.every((v,i)=>v===(state.crossed?.[i]??0))) return null;
  return { ...state, board, notes, crossed, deductionSteps: board.some((v,i)=>v!==state.board[i]) ? 0 : state.deductionSteps ?? 0 };
}
export function complete(state: SaveData): boolean { return validBoard(state.puzzle, state.board, true); }

export function restoreMove(state: SaveData, move: Move): SaveData {
  const next={...state,...move};if(move.crossed===undefined)delete next.crossed;if(move.deductionSteps===undefined)delete next.deductionSteps;return next;
}
