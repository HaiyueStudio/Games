export const BLAST_SECONDS = 1.1;
export const SHAKE_SECONDS = .65;
export const MAX_BLASTS = 4;
export interface Blast { x: number; y: number; radius: number; age: number; seed: number }

/** Decaying, seeded camera motion; visual time stops with the rest of the scene. */
export function bombShake(blasts: readonly Blast[], scale: number): { x: number; y: number } {
  let x = 0, y = 0;
  for (const blast of blasts) {
    const decay = Math.max(0, 1 - blast.age / SHAKE_SECONDS) ** 2;
    const phase = blast.seed * 2.39996, time = blast.age;
    x += (Math.cos(time * 91 + phase) * .7 + Math.cos(time * 157 + phase) * .3) * decay;
    y += (Math.sin(time * 113 + phase) * .7 + Math.cos(time * 173 + phase) * .3) * decay;
  }
  // Multiple simultaneous bombs cannot push the camera beyond the safe overscan.
  const strength = 22 * Math.min(1.5, Math.max(.4, scale));
  return { x: Math.max(-1, Math.min(1, x)) * strength, y: Math.max(-1, Math.min(1, y)) * strength };
}
