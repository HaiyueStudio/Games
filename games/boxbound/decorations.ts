import type { Room, Vec } from './model';

/** Numeric map-file enum; keep existing IDs stable across saves. */
export const DecorationType = {
  Rock: 1,
  Shrub: 2,
  RoundTree: 3,
  PineTree: 4,
  RedFriend: 5,
} as const;
export type DecorationKind = typeof DecorationType[keyof typeof DecorationType];
export interface Decoration {
  id: string;
  type: DecorationKind;
  pos: Vec;
  message?: string;
}
export const DECORATION_SPECS = {
  1: { name: '石头', height: 1 },
  2: { name: '灌木', height: 1 },
  3: { name: '圆冠树', height: 2 },
  4: { name: '松树', height: 3 },
  5: { name: '红方', height: 1 },
} as const;
export function isDecorationKind(value: unknown): value is DecorationKind {
  return Number.isInteger(value) && Object.hasOwn(DECORATION_SPECS, String(value));
}
export function decorationAt(room: Room, pos: Vec): Decoration | undefined {
  return room.decorations?.find((d) =>
    d.pos[0] === pos[0] && d.pos[2] === pos[2] &&
    pos[1] >= d.pos[1] && pos[1] < d.pos[1] + DECORATION_SPECS[d.type].height,
  );
}
/** Rounded rocks and foliage are obstacles, not standable platforms. */
export function decorationBlocksTop(room: Room, pos: Vec): boolean {
  return !!room.decorations?.some((d) =>
    d.pos[0] === pos[0] && d.pos[2] === pos[2] && pos[1] > d.pos[1],
  );
}
