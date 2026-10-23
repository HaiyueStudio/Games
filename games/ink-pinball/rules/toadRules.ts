/** Independent from the shared paper-pinball spring rules. All times are simulation seconds. */
export const TOAD_DIVE_SECONDS = 1.1, TOAD_REST_SECONDS = 30, TOAD_RETURN_SECONDS = .7;
export type ToadPhase = 'perched' | 'diving' | 'submerged' | 'returning';
export interface ToadCycle { phase: ToadPhase; launchedAt: number; returnAt: number }
export function newToadCycle(): ToadCycle { return { phase: 'perched', launchedAt: -100, returnAt: -1 }; }
export function diveToad(state: ToadCycle, time: number): void {
 state.phase = 'diving'; state.launchedAt = time; state.returnAt = time + TOAD_DIVE_SECONDS + TOAD_REST_SECONDS;
}
export function advanceToad(state: ToadCycle, time: number): 'dive' | 'return' | 'perch' | null {
 if (state.phase === 'diving' && time >= state.launchedAt + TOAD_DIVE_SECONDS) { state.phase = 'submerged'; return 'dive'; }
 if (state.phase === 'submerged' && time >= state.returnAt) { state.phase = 'returning'; return 'return'; }
 if (state.phase === 'returning' && time >= state.returnAt + TOAD_RETURN_SECONDS) { state.phase = 'perched'; return 'perch'; }
 return null;
}
export function toadGateOpen(state: ToadCycle, time: number): boolean {
 return state.phase !== 'perched' && (state.phase !== 'diving' || time - state.launchedAt >= .46);
}
/** Offset from the leaf: rescue hop first, then a visible downward dive; return follows an arc. */
export function toadPose(state: ToadCycle, time: number, depth: number) {
 if (state.phase === 'submerged') return { lift: -depth, opacity: 0, rotation: 0 };
 if (state.phase === 'diving') {
  const elapsed = time - state.launchedAt;
  if (elapsed < .46) return { lift: Math.sin(Math.max(0, elapsed) / .46 * Math.PI) * 38, opacity: 1, rotation: 0 };
  const p = Math.min(1, (elapsed - .46) / (TOAD_DIVE_SECONDS - .46));
  return { lift: -depth * p * p, opacity: 1 - Math.max(0, (p - .8) / .2), rotation: p * 20 };
 }
 if (state.phase === 'returning') {
  const p = Math.min(1, Math.max(0, (time - state.returnAt) / TOAD_RETURN_SECONDS));
  return { lift: -depth * (1 - p) + 100 * Math.sin(Math.PI * p), opacity: Math.min(1, p * 5), rotation: -15 * Math.sin(Math.PI * p) };
 }
 return { lift: 0, opacity: 1, rotation: 0 };
}
