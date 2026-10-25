import { ITEM_RADIUS } from '../rules/model';

export const SPRITE_SIZE = 2.65;

/** CSS-pixel sizing stays readable on phones and bounded on large desktop screens. */
export function itemRadiusScale(width: number, height: number): number {
  const sceneScale = Math.max(1, width) / 1000;
  const shortSide = Math.max(1, Math.min(width, height));
  const spritePixels = Math.max(72, Math.min(110, 32 + shortSide * .12));
  return spritePixels / (ITEM_RADIUS * SPRITE_SIZE * sceneScale);
}
