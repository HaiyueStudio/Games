import type { Transform3D } from '@haiyue/engine/components';

export const CELL_SIZE = 1.48;
export const FLOOR_HEIGHT = 0.22;
export const FLOOR_COLLIDER_HEIGHT = 0.56;
export const FLOOR_COLLIDER_OVERLAP = 0.08;
export const WALL_HEIGHT = 0.82;
export const WALL_THICKNESS = 0.13;
export const BALL_RADIUS = 0.31;
export const MAX_TILT = 0.29;
export const BOARD_Y = 0;

export interface BoardPiece {
  readonly transform: Transform3D;
  readonly localPosition: readonly [number, number, number];
}
