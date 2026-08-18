import type { GemKind } from './Match3Board';

export type Match3Color = readonly [number, number, number, number];

/** High-separation palette tuned for the dark match-3 board. */
export const MATCH3_GEM_COLORS: readonly Match3Color[] = [
  [1.00, 0.00, 0.00, 1], // pure red
  [1.00, 0.92, 0.00, 1], // vivid yellow
  [0.20, 0.85, 0.2902, 1], // vivid green #33FF4A
  [0.00, 0.88, 1.00, 1], // electric cyan
  [0.12, 0.28, 1.00, 1], // royal blue
  [1.00, 0.12, 0.78, 1], // magenta
];

export function colorForGem(kind: GemKind): Match3Color {
  const color = MATCH3_GEM_COLORS[kind];
  if (!color) throw new RangeError(`Match-3 palette is missing gem color ${kind}.`);
  return color;
}
