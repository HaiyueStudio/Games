import type { Item, Point } from '../rules/model';

export const JUICE_VARIANTS = 12;
export const STAIN_SECONDS = 28;
export const DRIPS_PER_STAIN = 3;
export interface JuiceDrip { x: number; start: number; length: number; width: number; delay: number; duration: number }
export interface JuiceMark extends Point {
  radius: number; angle: number; fruit: number; age: number;
  variant: number; stretch: number; squash: number; opacity: number; mirror: number; drips: JuiceDrip[];
}

export function juiceRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

/** Local visual RNG never consumes the round's gameplay RNG. */
export function createJuiceMark(item: Item): JuiceMark {
  const random = juiceRandom(Math.imul(item.id, 2654435761) ^ Math.round(item.x * 31 + item.y * 17));
  const variant = Math.floor(random() * JUICE_VARIANTS);
  const mark: JuiceMark = { x: item.x, y: item.y, radius: item.radius, fruit: item.fruit, age: 0,
    variant, angle: random() * Math.PI * 2, stretch: .8 + random() * .45, squash: .65 + random() * .45,
    opacity: .54 + random() * .2, mirror: random() < .5 ? -1 : 1, drips: [] };
  const count = 2 + Math.floor(random() * (DRIPS_PER_STAIN - 1));
  for (let i = 0; i < count; i++) mark.drips.push({
    x: (i - (count - 1) / 2) * item.radius * .65 + (random() - .5) * item.radius * .28,
    start: item.radius * (.12 + random() * .45), length: item.radius * (1.5 + random() * 3.3),
    width: item.radius * (.045 + random() * .055), delay: .25 + random() * .8, duration: 2 + random() * 3,
  });
  return mark;
}

/** Absolute-age sampling keeps gravity and pause behavior independent of frame rate. */
export function sampleJuiceDrip(drip: JuiceDrip, age: number) {
  const elapsed = Math.max(0, age - drip.delay), progress = Math.min(1, elapsed / drip.duration);
  const length = drip.length * (1 - (1 - progress) ** 1.6);
  const falling = Math.max(0, elapsed - drip.duration), dropOffset = 210 * falling * falling;
  return { length, dropOffset, visible: age > drip.delay, dropVisible: age > drip.delay && falling < .85,
    opacity: Math.max(0, Math.min(1, (STAIN_SECONDS - age) / 8)), progress };
}
