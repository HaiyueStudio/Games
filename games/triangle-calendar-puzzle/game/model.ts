import type { TrianglePieceDefinition } from '../rules/triangleCalendarLogic';
export interface PieceState {
    definition: TrianglePieceDefinition;
    rotation: number;
    flipped: boolean;
    pivotX: number;
    pivotY: number;
    placed: boolean;
    occupiedKeys: string[];
}
export const VIEW_WIDTH = 1200, VIEW_HEIGHT = 760, SIDE = 62, SNAP_DISTANCE = 39;
export const BOARD_ORIGIN = { x: 600, y: 154 };
export const PIECE_HOMES = [
    { x: 110, y: 180 }, { x: 285, y: 180 }, { x: 108, y: 335 }, { x: 282, y: 335 }, { x: 195, y: 525 },
    { x: 915, y: 180 }, { x: 1080, y: 180 }, { x: 915, y: 335 }, { x: 1080, y: 335 }, { x: 915, y: 520 }, { x: 1080, y: 520 },
];
export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
