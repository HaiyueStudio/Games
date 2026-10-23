import type { Point } from './model';
export type PathCommand = { type: 'M' | 'L'; p: Point } | { type: 'C'; a: Point; b: Point; p: Point } | { type: 'Z' };

/** Clockwise edges use an outward normal. Complementary neighbors reuse the same symmetric curve. */
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
      commands.push({ type: 'L', p: point(-.16, 0) },
        { type: 'C', a: point(-.08, 0), b: point(-.08, .04), p: point(-.10, .08) },
        { type: 'C', a: point(-.24, .30), b: point(.24, .30), p: point(.10, .08) },
        { type: 'C', a: point(.08, .04), b: point(.08, 0), p: point(.16, 0) });
    }
    commands.push({ type: 'L', p: end });
  });
  commands.push({ type: 'Z' });
  return commands;
}
