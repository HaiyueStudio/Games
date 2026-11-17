import type { Cell } from '../levels/editor';
import { blockedByWater, canStandOnMapLink, cursorPosition, type Puzzle } from '../rules/game';

interface RoutePoint extends Cell {
  open: boolean;
  path: boolean;
  gate: boolean;
}
interface RouteSegment {
  from: RoutePoint;
  to: RoutePoint;
  open: boolean;
}

export function mapRoutes(puzzle: Puzzle) {
  const { level, context } = puzzle;
  const { width, height, edges } = level;
  const points = new Map<number, RoutePoint>();
  const place = ({ x, y }: Cell, open: boolean, path = false, gate = false) => {
    const key = y * width + x;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height || edges.has(key)) return;
    const current = points.get(key);
    const passable = (open || !!current?.open) && (!level.island || !blockedByWater(context, x, y));
    points.set(key, { x, y, open: passable, path: path || !!current?.path, gate: !passable && (gate || !!current?.gate) });
  };

  const open = new Set(puzzle.openPaths);
  const revealed = new Set(puzzle.revealedPaths);
  for (const path of level.paths) {
    place(path, open.has(path), true, path.gate > 0 && revealed.has(path));
  }
  for (const unit of puzzle.state.units) {
    if (!unit.link || context.has(unit, 'hide')) continue;
    place(unit, canStandOnMapLink(context, unit));
  }
  const spawn = cursorPosition(level);
  if (!points.has(spawn.y * width + spawn.x)) place(spawn, true);

  const segments: RouteSegment[] = [];
  for (const [key, from] of points) {
    const neighbors = [from.x + 1 < width ? points.get(key + 1) : undefined, points.get(key + width)];
    for (const to of neighbors) {
      if (to) segments.push({ from, to, open: from.open && to.open });
    }
  }
  return { paths: [...points.values()].filter(point => point.path), segments };
}
