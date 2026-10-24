export const TAU = Math.PI * 2;
export type Phase = 'ready' | 'playing' | 'paused' | 'over';
export const GATE_SHAPES = ['arc', 'split', 'crown', 'diamonds'] as const;
export type GateShape = typeof GATE_SHAPES[number];
export interface Gate { z: number; angle: number; width: number; spin: number; passed: boolean; shape: GateShape; shattered: boolean }
export interface Impact { gate: Gate; angle: number; age: number; playerAngle: number }
export const IMPACT_LIFETIME = 1.8;
export interface Round { phase: Phase; time: number; distance: number; angle: number; hits: number; flash: number; broken: number; seed: number; gates: Gate[]; impacts: Impact[] }
export function createRound(seed = 2026): Round { return { phase: 'ready', time: 0, distance: 0, angle: -Math.PI / 2, hits: 0, flash: 0, broken: 0, seed: seed >>> 0, gates: [], impacts: [] }; }
// Angular footprints at the ball's orbit (radius 4.55), shared by collision and mesh generation.
export function gateBands(gate: Pick<Gate, 'shape' | 'width'>): { offset: number; width: number }[] {
  const w = gate.width;
  switch (gate.shape) {
    case 'split': return [{ offset: 0, width: w * .5 }, { offset: Math.PI, width: w * .5 }];
    case 'crown': return [-.8, 0, .8].map(n => ({ offset: n * w, width: w * .22 }));
    case 'diamonds': return [-.65, .65].map(n => ({ offset: n * w, width: w * .38 }));
    default: return [{ offset: 0, width: w }];
  }
}
export function collidesWithGate(angle: number, gate: Gate): boolean {
  return gateBands(gate).some(band => Math.abs(deltaAngle(angle, gate.angle + band.offset)) < band.width + .13);
}
function ageEffects(r: Round, dt: number): void {
  r.flash = Math.max(0, r.flash - dt);
  for (const impact of r.impacts) impact.age += dt;
  r.impacts = r.impacts.filter(impact => impact.age < IMPACT_LIFETIME);
}
function random(r: Round): number { r.seed = (Math.imul(r.seed, 1664525) + 1013904223) >>> 0; return r.seed / 4294967296; }
export function speed(r: Round): number { return 18 + r.time * .48; }
export function deltaAngle(a: number, b: number): number { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
export function advance(r: Round, dt: number, direction = 0): void {
  if (r.phase !== 'playing') {
    if (r.phase === 'over') { const step = Math.max(0, Math.min(dt, .25)); r.broken = Math.min(3, r.broken + step); ageEffects(r, step); }
    return;
  }
  // Substeps keep both steering and swept obstacle crossing consistent at any frame rate.
  let left = Math.max(0, Math.min(dt, .25));
  while (left > 1e-8 && r.phase === 'playing') {
    const step = Math.min(left, 1 / 120); left -= step;
    r.time += step; r.angle = deltaAngle(r.angle + direction * 2.65 * step, 0);
    const travel = speed(r) * step; r.distance += travel; ageEffects(r, step);
    if (!r.gates.length) r.gates.push({ z: 65, angle: random(r) * TAU, width: .7, spin: 0, passed: false, shape: 'arc', shattered: false });
    while (r.gates[r.gates.length - 1]!.z < 170) {
      const last = r.gates[r.gates.length - 1]!;
      r.gates.push({ z: last.z + 25 + random(r) * 12, angle: random(r) * TAU, width: .65 + random(r) * .75, spin: (random(r) - .5) * .25, passed: false, shape: GATE_SHAPES[Math.floor(random(r) * GATE_SHAPES.length)]!, shattered: false });
    }
    for (const gate of r.gates) {
      const previous = gate.z; gate.z -= travel; gate.angle += gate.spin * step;
      if (!gate.passed && previous >= 3 && gate.z < 3) {
        gate.passed = true;
        if (collidesWithGate(r.angle, gate)) {
          gate.shattered = true;
          r.impacts.push({ gate, angle: gate.angle, age: 0, playerAngle: r.angle });
          r.impacts = r.impacts.slice(-8);
          r.hits++; r.flash = .6;
          if (r.hits > 3) { r.phase = 'over'; break; }
        }
      }
    }
    r.gates = r.gates.filter(g => g.z > -8);
  }
}
export interface Records { times: number[] }
export function isRecords(v: unknown): v is Records {
  if (!v || typeof v !== 'object' || !('times' in v) || !Array.isArray(v.times)) return false;
  const times: unknown[] = v.times;
  return times.length <= 5 && times.every((n: unknown, i: number) => typeof n === 'number' && Number.isFinite(n) && n > 0 && (i === 0 || typeof times[i - 1] === 'number' && (times[i - 1] as number) >= n));
}
export function rank(times: number[], time: number): number[] { return [...times, time].filter(n => Number.isFinite(n) && n > 0).sort((a, b) => b - a).slice(0, 5); }
