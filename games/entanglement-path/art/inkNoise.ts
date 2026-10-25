/** Stable pigment fields: art variation never consumes the gameplay random stream. */
export const BOARD_PIGMENT = '#88a49b';
export const INK = '#202825';
export const CINNABAR = '#b63c2e';
export const PAPER = '#f3e8ce';

export function inkHash(x: number, y: number, seed = 0): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function inkNoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = inkHash(ix, iy, seed), b = inkHash(ix + 1, iy, seed);
  const c = inkHash(ix, iy + 1, seed), d = inkHash(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function pigmentAt(x: number, y: number, seed: number): number {
  return inkNoise(x / 43, y / 43, seed) * .58 + inkNoise(x / 13, y / 13, seed + 11) * .29
    + inkNoise(x / 3, y / 3, seed + 29) * .13;
}

export function cellPigment(q: number, r: number, level: number): number {
  return Math.floor(inkHash(q, r, level + 91) * 65535);
}

export function boardPigmentAt(x: number, y: number, seed: number): readonly [number, number, number] {
  const density = .91 + pigmentAt(x, y, seed) * .13 + (inkHash(seed, 23) - .5) * .06;
  const grain = (inkHash(x, y, seed) - .5) * 2.8;
  return [136 * density + grain, 164 * density + grain, 155 * density + grain];
}

export const OPEN_SCROLL_MS = 1350;
export const REVEAL_START_MS = 1150;
export const INTRO_DURATION_MS = 2900;

export function scrollProgress(elapsed: number): number {
  const t = Math.max(0, Math.min(1, elapsed / OPEN_SCROLL_MS));
  return 1 - (1 - t) ** 3;
}

export function revealProgress(elapsed: number): number {
  return Math.max(0, Math.min(1, (elapsed - REVEAL_START_MS) / (INTRO_DURATION_MS - REVEAL_START_MS)));
}

/** Soft threshold plus crossfade, with exact opaque/transparent endpoints. */
export function veilAlpha(noise: number, progress: number): number {
  if (progress <= 0) return 1;
  if (progress >= 1) return 0;
  const edge = Math.max(0, Math.min(1, (noise - (progress * 1.35 - .18)) / .22));
  return edge * edge * (3 - 2 * edge) * (1 - progress * .45);
}
