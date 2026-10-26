export interface GridPoint { x: number; y: number }
export type MoveResult = { kind: 'blocked' } | { kind: 'walk' | 'push'; player: GridPoint; boxIndex: number; box: GridPoint | null };
export const pointKey = (point: GridPoint): string => `${point.x},${point.y}`;

/** A move is atomic, including the box's destination. No rendering or audio is involved. */
export function resolveMove(player: GridPoint, boxes: readonly GridPoint[], walkable: ReadonlySet<string>, direction: GridPoint): MoveResult {
  if (!Number.isInteger(direction.x) || !Number.isInteger(direction.y) || Math.abs(direction.x) + Math.abs(direction.y) !== 1) return { kind: 'blocked' };
  const next = { x: player.x + direction.x, y: player.y + direction.y };
  if (!walkable.has(pointKey(next))) return { kind: 'blocked' };
  const index = boxes.findIndex(box => pointKey(box) === pointKey(next));
  if (index < 0) return { kind: 'walk', player: next, boxIndex: -1, box: null };
  const destination = { x: next.x + direction.x, y: next.y + direction.y };
  if (!walkable.has(pointKey(destination)) || boxes.some(box => pointKey(box) === pointKey(destination))) return { kind: 'blocked' };
  return { kind: 'push', player: next, boxIndex: index, box: destination };
}
