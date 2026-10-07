/** Collectible state is independent of ball lives and never allocates physics bodies. */
export const RIVER_LOTUSES = [{ x: -65, y: -132 }, { x: 15, y: -187 }, { x: 83, y: -132 }] as const;
export const LOTUS_POINTS = 250, LOTUS_BONUS = 2000, LOTUS_RESPAWN_SECONDS = 1;
export function newGarden() { return { collected: 0, rounds: 0, respawnAt: -1 }; }
export type GardenState = ReturnType<typeof newGarden>;
export function collectLotus(state: GardenState, index: number, time: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 2 || state.collected & (1 << index)) return 0;
  state.collected |= 1 << index;
  if (state.collected === 7) { state.rounds++; state.respawnAt = time + LOTUS_RESPAWN_SECONDS; return LOTUS_POINTS + LOTUS_BONUS; }
  return LOTUS_POINTS;
}
export function advanceGarden(state: GardenState, time: number): boolean {
  if (state.respawnAt < 0 || time < state.respawnAt) return false;
  state.collected = 0; state.respawnAt = -1; return true;
}
