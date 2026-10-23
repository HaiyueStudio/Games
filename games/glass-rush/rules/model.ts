export const TAU = Math.PI * 2;
export type Phase = 'ready' | 'playing' | 'paused' | 'over';
export interface Gate { z: number; angle: number; width: number; spin: number; passed: boolean }
export interface Round { phase: Phase; time: number; distance: number; angle: number; hits: number; flash: number; broken: number; seed: number; gates: Gate[] }
export function createRound(seed = 2026): Round { return { phase: 'ready', time: 0, distance: 0, angle: -Math.PI / 2, hits: 0, flash: 0, broken: 0, seed: seed >>> 0, gates: [] }; }
function random(r: Round): number { r.seed = (Math.imul(r.seed, 1664525) + 1013904223) >>> 0; return r.seed / 4294967296; }
export function speed(r: Round): number { return 18 + r.time * .48; }
export function deltaAngle(a: number, b: number): number { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
export function advance(r: Round, dt: number, direction = 0): void {
  if (r.phase !== 'playing') { if (r.phase === 'over') r.broken = Math.min(3, r.broken + dt); return; }
  // Substeps keep both steering and swept obstacle crossing consistent at any frame rate.
  let left = Math.max(0, Math.min(dt, .25));
  while (left > 1e-8 && r.phase === 'playing') {
    const step = Math.min(left, 1 / 120); left -= step;
    r.time += step; r.angle = deltaAngle(r.angle + direction * 2.65 * step, 0);
    const travel = speed(r) * step; r.distance += travel; r.flash = Math.max(0, r.flash - step);
    if (!r.gates.length) r.gates.push({ z: 65, angle: random(r) * TAU, width: .7, spin: 0, passed: false });
    while (r.gates[r.gates.length - 1]!.z < 170) {
      const last = r.gates[r.gates.length - 1]!;
      r.gates.push({ z: last.z + 25 + random(r) * 12, angle: random(r) * TAU, width: .65 + random(r) * .75, spin: (random(r) - .5) * .25, passed: false });
    }
    for (const gate of r.gates) {
      const previous = gate.z; gate.z -= travel; gate.angle += gate.spin * step;
      if (!gate.passed && previous >= 3 && gate.z < 3) {
        gate.passed = true;
        if (Math.abs(deltaAngle(r.angle, gate.angle)) < gate.width + .13) {
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
