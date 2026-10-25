import type { Point } from './model';
export type PathCommand = { type: 'M' | 'L'; p: Point } | { type: 'C'; a: Point; b: Point; p: Point } | { type: 'Z' };

/** Clockwise edges use an outward normal. Complementary neighbors reuse the whole symmetric cut. */
export function pieceOutline(width: number, height: number, edges: readonly number[]): PathCommand[] {
  const commands: PathCommand[] = [{ type: 'M', p: { x: 0, y: 0 } }];
  const corners = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const size = Math.min(width, height);
  corners.forEach((start, side) => {
    const end = corners[(side + 1) % 4]!, length = Math.hypot(end.x - start.x, end.y - start.y);
    const dx = (end.x - start.x) / length, dy = (end.y - start.y) / length, sign = edges[side] ?? 0;
    const point = (u: number, v: number): Point => ({ x: start.x + dx * (length / 2 + u * size) + dy * v * size * sign,
      y: start.y + dy * (length / 2 + u * size) - dx * v * size * sign });
    if (sign) {
      // Bow the shoulders too: no straight runs into a circular tab. The neck,
      // bulb and shoulders meet with matching tangents, including at the crown.
      const half = length / (2 * size);
      commands.push(
        { type: 'C', a: point(-half + .12, .035), b: point(-.25, -.055), p: point(-.13, -.035) },
        { type: 'C', a: point(-.01, -.015), b: point(-.17, .10), p: point(-.17, .16) },
        { type: 'C', a: point(-.17, .23), b: point(-.09, .26), p: point(0, .26) },
        { type: 'C', a: point(.09, .26), b: point(.17, .23), p: point(.17, .16) },
        { type: 'C', a: point(.17, .10), b: point(.01, -.015), p: point(.13, -.035) },
        { type: 'C', a: point(.25, -.055), b: point(half - .12, .035), p: end });
    } else commands.push({ type: 'L', p: end });
  });
  commands.push({ type: 'Z' });
  return commands;
}
