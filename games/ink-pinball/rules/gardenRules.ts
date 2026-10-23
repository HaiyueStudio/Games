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

/** Sensor flowers disappear on contact, but still impart a real outward impulse. */
export function lotusRebound(dx: number, dy: number, vx: number, vy: number) {
  let length = Math.hypot(dx, dy);
  if (length < .01) { dx = -vx; dy = -vy; length = Math.hypot(dx, dy); }
  if (length < .01) { dx = 0; dy = 1; length = 1; }
  const nx = dx / length, ny = dy / length, dot = vx * nx + vy * ny;
  let x = vx - Math.min(0, dot) * 2 * nx, y = vy - Math.min(0, dot) * 2 * ny;
  x += nx * 2; y += ny * 2;
  const speed = Math.hypot(x, y), scale = Math.max(5.8, Math.min(14, speed)) / speed;
  return { x: x * scale, y: y * scale };
}
