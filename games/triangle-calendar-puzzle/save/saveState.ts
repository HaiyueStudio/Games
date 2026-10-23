import type { PieceState } from '../game/model';
import { isFiniteNumber, isNonNegativeInteger, isRecord } from '../../save/SingleSlotGameSave';
export interface TriangleCalendarSaveData {
    month: number;
    day: number;
    weekday: number;
    pieces: Array<Pick<PieceState, 'rotation' | 'flipped' | 'pivotX' | 'pivotY' | 'placed' | 'occupiedKeys'>>;
}
export function isTriangleCalendarSaveData(value: unknown): value is TriangleCalendarSaveData {
    return isRecord(value)
        && isNonNegativeInteger(value.month) && value.month >= 1 && value.month <= 12
        && isNonNegativeInteger(value.day) && value.day >= 1 && value.day <= 31
        && isNonNegativeInteger(value.weekday) && value.weekday <= 6
        && Array.isArray(value.pieces)
        && value.pieces.every(piece => isRecord(piece)
            && isNonNegativeInteger(piece.rotation)
            && typeof piece.flipped === 'boolean'
            && isFiniteNumber(piece.pivotX) && isFiniteNumber(piece.pivotY)
            && typeof piece.placed === 'boolean'
            && Array.isArray(piece.occupiedKeys) && piece.occupiedKeys.every(key => typeof key === 'string'));
}
