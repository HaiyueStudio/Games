import type { GridPoint } from './move';

const pointKey = (point: GridPoint) => `${point.x},${point.y}`;

export const LEVEL_SET_VERSION = 3;

/** Version 3 replaces the temporary workshop pack. The original sixteen boards keep their indices. */
export function isCompatibleLevel(index: number, version: number | undefined): boolean {
  return index >= 0 && (version === LEVEL_SET_VERSION || version === 2 && index < 16 || (version === undefined || version === 1) && index < 2);
}

export function validSavedBoard(player: GridPoint, boxes: readonly GridPoint[], count: number, walkable: ReadonlySet<string>): boolean {
  const keys = boxes.map(pointKey);
  return boxes.length === count && walkable.has(pointKey(player)) && !keys.includes(pointKey(player))
    && new Set(keys).size === keys.length && keys.every(key => walkable.has(key));
}
