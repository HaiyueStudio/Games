/** Board-specific rescue springs; simulation time is supplied by the game. */
export const POCKET_SPRINGS = [
  { x: -219, y: -153, inward: 1, clearY: -65 },
  { x: 174, y: -153, inward: -1, clearY: -65 },
] as const;
export interface SpringState {
  phase: 'idle' | 'compressing' | 'launching' | 'cooldown';
  since: number;
  launches: number;
}
export function newSpring(): SpringState { return { phase: 'idle', since: 0, launches: 0 }; }
export function advanceSpring(state: SpringState, time: number, touching: boolean, y: number, vy: number, clearY: number): 'launch' | 'steer' | null {
  const elapsed = time - state.since;
  if (state.phase === 'cooldown' && elapsed >= 0.65) state.phase = 'idle';
  if (state.phase === 'idle' && touching && vy <= 0.5) {
    state.phase = 'compressing'; state.since = time;
  } else if (state.phase === 'compressing' && elapsed >= 0.1) {
    // A fast ball that has already left the pocket must not be pulled back.
    if (!touching) { state.phase = 'idle'; return null; }
    state.phase = 'launching'; state.since = time; state.launches++;
    return 'launch';
  } else if (state.phase === 'launching') {
    if (y > clearY) {
      state.phase = 'cooldown'; state.since = time;
      return 'steer';
    }
    // A new impact must never leave the spring permanently disarmed.
    if (elapsed >= 1) { state.phase = 'cooldown'; state.since = time; }
  }
  return null;
}
export function springCompression(state: SpringState, time: number): number {
  if (state.phase === 'compressing') return Math.min(1, Math.max(0, (time - state.since) / 0.1));
  if (state.phase === 'launching') return Math.max(0, 1 - (time - state.since) / 0.12);
  return 0;
}
