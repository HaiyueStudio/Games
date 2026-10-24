import { createPuzzle, type Group, type Puzzle } from '../rules/model';
import { isJigsawPreferences, type JigsawPreferences } from './preferences';

export interface JigsawSavedImage { dataUrl: string; width: number; height: number }
export interface JigsawSaveData extends JigsawPreferences {
  seed: number;
  image: JigsawSavedImage;
  groups: Group[];
  moves: number;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Reject incomplete partitions and disconnected groups before rebuilding any rendering resources. */
export function isJigsawSaveData(value: unknown): value is JigsawSaveData {
  if (!record(value) || !isJigsawPreferences(value)) return false;
  const { rows, cols, allowRotation } = value;
  const data = value as unknown as Record<string, unknown>;
  if (!integer(data.seed) || data.seed > 0xffffffff || !integer(data.moves) || !record(data.image)) return false;
  const image = data.image;
  if (![image.width, image.height].every(n => integer(n) && n >= 1 && n <= 1400)
    || typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/png;base64,')
    || image.dataUrl.length <= 22 || image.dataUrl.length > 12 * 1024 * 1024) return false;
  const count = rows * cols;
  if (!Array.isArray(data.groups) || !data.groups.length || data.groups.length > count) return false;
  const seen = new Set<number>(), orders = new Set<number>();
  for (const group of data.groups) {
    if (!record(group) || !integer(group.id) || !integer(group.order) || orders.has(group.order)
      || !integer(group.angle) || group.angle > 3 || (!allowRotation && group.angle !== 0)
      || ![group.x, group.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7)
      || !Array.isArray(group.pieces) || !group.pieces.length || group.pieces.length > count || !group.pieces.includes(group.id)) return false;
    orders.add(group.order);
    const members = new Set<number>();
    for (const id of group.pieces) {
      if (!integer(id) || id >= count || seen.has(id)) return false;
      members.add(id); seen.add(id);
    }
    const queue = [group.id]; members.delete(group.id);
    for (const id of queue) for (const next of members) {
      if (Math.abs(Math.floor(id / cols) - Math.floor(next / cols)) + Math.abs(id % cols - next % cols) !== 1) continue;
      queue.push(next); members.delete(next);
    }
    if (members.size) return false;
  }
  return seen.size === count;
}

export function captureJigsawSave(puzzle: Puzzle, seed: number, image: JigsawSavedImage): JigsawSaveData {
  return { rows: puzzle.rows, cols: puzzle.cols, allowRotation: puzzle.allowRotation, seed, image: { ...image },
    groups: structuredClone(puzzle.groups), moves: puzzle.moves };
}

/** Recreate cuts from the original seed; keep the saved rigid groups and their stacking order. */
export function restoreJigsawPuzzle(saved: JigsawSaveData): Puzzle {
  const puzzle = createPuzzle(saved.rows, saved.cols, saved.image.width / saved.image.height, saved.allowRotation, saved.seed);
  puzzle.groups = structuredClone(saved.groups); puzzle.moves = saved.moves;
  return puzzle;
}
