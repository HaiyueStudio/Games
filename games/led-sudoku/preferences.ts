import type { ThemeId } from './theme';
import { logicalCandidateMasks } from './logical-hints';
import { languageOf, type Language } from './i18n';
import { boardCandidateMasks, candidates, DIGITS, type SaveData } from './rules';
export interface Preferences { language: Language; theme: ThemeId; filterCandidates: boolean; showCandidates: boolean; manualCandidates: boolean; }
export function preferences(value: unknown, systemLanguage = 'zh'): Preferences {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Preferences>;
  const filterCandidates = typeof v.filterCandidates === 'boolean' ? v.filterCandidates : true;
  const manualCandidates=v.manualCandidates===true;
  return { manualCandidates, theme: v.theme === 'light-blue' ? 'light-blue' : 'dark', language: v.language === 'zh' || v.language === 'en' || v.language === 'ja' ? v.language : languageOf(systemLanguage), filterCandidates, showCandidates: !manualCandidates && filterCandidates && v.showCandidates === true };
}
/** Manual play overrides automatic assistance while preserving its preference. */
export function autoCandidateFiltering(value: Pick<Preferences,'filterCandidates'|'manualCandidates'>): boolean { return value.filterCandidates && !value.manualCandidates; }
/** UI assistance only: never consult the saved solution. */
export function inputChoices(state: SaveData, cell: number, filter = true): number[] {
  if (cell < 0 || cell >= state.board.length || state.puzzle.blocked[cell] || state.puzzle.givens[cell]) return [];
  return filter ? state.board[cell] ? candidates(state.puzzle, state.board, cell) : maskValues(logicalCandidateMasks(state)[cell]!) : DIGITS.slice();
}
export function candidateMasks(state: SaveData): number[] {
  return logicalCandidateMasks(state);
}

function maskValues(mask: number): number[] { return DIGITS.filter(d => mask & (1 << (d - 1))); }

/** Only crosses still allowed by the base rules remain visible/restorable. */
export function noteChoices(state: SaveData, cell: number, filter = true): number[] {
  if (cell < 0 || cell >= state.board.length || state.board[cell] || state.puzzle.blocked[cell] || state.puzzle.givens[cell]) return [];
  const allowed=inputChoices(state,cell,filter);
  const base=filter ? candidates(state.puzzle,state.board,cell).reduce((mask,d)=>mask|1<<(d-1),0) : 511;
  const crossed=(state.crossed?.[cell]??0)&base;
  return DIGITS.filter(d=>allowed.includes(d)||!!(crossed & (1<<(d-1))));
}
/** Candidate display only; handwritten exclusions never become solver premises. */
export function noteDisplayMasks(state: SaveData, selected: number, pencil: boolean, filter=true, showAll=false): number[] {
  const legal=filter?logicalCandidateMasks(state):Array(state.board.length).fill(511);
  return legal.map((m,i)=>!state.board[i]&&!state.puzzle.blocked[i]&&(showAll||state.notes[i]||state.crossed?.[i]||pencil&&selected===i)?m:0);
}

/** Filter display marks with base rules, retaining advanced exclusions as crosses.
 * Keep the original marks intact so undo/erasing a peer restores the notebook. */
export function noteCrossedMasks(state: SaveData, filter=true): number[] {
  if(!state.crossed?.some(Boolean))return Array(state.board.length).fill(0);
  const base=filter ? boardCandidateMasks(state.puzzle,state.board) : Array(state.board.length).fill(511);
  return base.map((mask,i)=>!state.board[i]&&!state.puzzle.blocked[i] ? (state.crossed?.[i]??0)&mask : 0);
}
