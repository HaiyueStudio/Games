import { clone, copyState, type BoxTransfer, type State, type PlayerCrossing } from './model';
export interface UndoEntry {
  state: State;
  jump: boolean;
  transfers: BoxTransfer[];
  reset?: boolean;
  playerCrossing?: PlayerCrossing;
}
export const HISTORY_LIMIT = 300;
/** All history producers, including R, share the same bounded snapshot policy. */
export function remember(history: UndoEntry[], state: State, jump = false, transfers: BoxTransfer[] = [], reset = false, playerCrossing?: PlayerCrossing): void {
  history.push({ state: copyState(state), jump, transfers: clone(transfers), reset,
    ...(playerCrossing ? { playerCrossing: clone(playerCrossing) } : {}) });
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
}
