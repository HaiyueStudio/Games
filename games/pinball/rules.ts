/** Pure pinball rules. All time is supplied by the fixed-step simulation. */
export type Phase = 'ready' | 'playing' | 'over';
export interface PinballState {
  phase: Phase;
  score: number;
  balls: number;
  combo: number;
  lastHit: number;
  charge: number;
  targets: number;
  lanes: number;
  spins: number;
}
export const BUMPERS = [
  { x: -100, y: 175, radius: 37 },
  { x: 65, y: 145, radius: 37 },
  { x: -20, y: 35, radius: 42 },
] as const;
export const TARGETS = [{ x: -140, y: 285 }, { x: -35, y: 308 }, { x: 70, y: 285 }] as const;
export const STEP = 1 / 120;
export function newGame(): PinballState {
  return { phase: 'ready', score: 0, balls: 3, combo: 0, lastHit: -100, charge: 0, targets: 0, lanes: 0, spins: 0 };
}
export function chargeBall(state: PinballState, delta: number): void {
  if (state.phase === 'ready') state.charge = Math.min(1, state.charge + Math.max(0, delta) * 0.8);
}
export function launchBall(state: PinballState, quick = false): number {
  if (state.phase !== 'ready') return 0;
  const speed = 11.8 + (quick ? 0.65 : state.charge) * 2.8;
  state.phase = 'playing';
  state.charge = 0;
  return speed;
}
export function hit(state: PinballState, time: number, target = -1): number {
  if (state.phase !== 'playing') return 0;
  state.combo = time - state.lastHit <= 2.2 ? Math.min(5, state.combo + 1) : 1;
  state.lastHit = time;
  let points = (target >= 0 ? 150 : 100) * state.combo;
  if (target >= 0 && target < 3) {
    state.targets |= 1 << target;
    if (state.targets === 7) { points += 1500; state.targets = 0; }
  }
  state.score += points;
  return points;
}
export function loseBall(state: PinballState): boolean {
  if (state.phase !== 'playing') return false;
  state.balls = Math.max(0, state.balls - 1);
  state.phase = state.balls ? 'ready' : 'over';
  state.combo = 0;
  state.lastHit = -100;
  state.charge = 0;
  state.targets = 0;
  state.lanes = 0;
  state.spins = 0;
  return true;
}
/** Scene bonuses stay independent from the star/letter combo multiplier. */
export function scoreScene(state: PinballState, kind: 'mushroom' | 'spinner' | 'lane', lane = -1): number {
  if (state.phase !== 'playing') return 0;
  let points = 200;
  if (kind === 'spinner') {
    state.spins++;
    points = 250;
    if (state.spins === 5) { points += 1000; state.spins = 0; }
  } else if (kind === 'lane') {
    if ((lane !== 0 && lane !== 1) || (state.lanes & (1 << lane))) return 0;
    state.lanes |= 1 << lane;
    points = 300;
    if (state.lanes === 3) points += 800;
  }
  state.score += points;
  return points;
}
export type Control = 'left' | 'right' | 'charge' | 'launch' | 'pause' | 'restart';
export function controlFor(code: string): Control | undefined {
  return ({ ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'charge', KeyS: 'charge', ArrowUp: 'launch', KeyW: 'launch',
    Space: 'launch', KeyP: 'pause', Escape: 'pause', KeyR: 'restart' } as Record<string, Control>)[code];
}
