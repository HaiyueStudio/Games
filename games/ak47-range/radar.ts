import type { Point } from './rules';
export const RADAR_RANGE = 26;
/** Screen-aligned bearing; out-of-range contacts stay on the rim without changing direction. */
export function radarContact(player: Point, enemy: Point) {
  const dx = enemy.x - player.x, dy = enemy.z - player.z, distance = Math.hypot(dx, dy);
  const scale = 1 / Math.max(RADAR_RANGE, distance);
  return { x: dx * scale, y: dy * scale, onRim: distance > RADAR_RANGE };
}
