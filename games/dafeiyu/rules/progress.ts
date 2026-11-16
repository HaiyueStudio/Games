import { isNonNegativeInteger, isRecord } from '../../save/SingleSlotGameSave';
import type { GameState } from './game';
import { INTRO } from '../levels/pack';

export interface Progress {
  stage: number;
  state: GameState;
  completed: string[];
}

export function isProgress(value: unknown): value is Progress {
  if (!isRecord(value) || !isNonNegativeInteger(value.stage) || Number(value.stage) > INTRO.length ||
      !Array.isArray(value.completed) || value.completed.some(id => !INTRO.some(entry => entry[0] === id)) || !isRecord(value.state)) return false;
  const { state } = value;
  if (!isNonNegativeInteger(state.nextId) || !isNonNegativeInteger(state.turn) || typeof state.won !== 'boolean' ||
      typeof state.waiting !== 'boolean' || !Array.isArray(state.units) || state.units.length > 12000) return false;
  if (state.bonus !== undefined && !isNonNegativeInteger(state.bonus)) return false;
  if (state.conversion !== undefined && (!Array.isArray(state.conversion) ||
      state.conversion.some(target => typeof target !== 'string' || target.length > 128))) return false;
  const occupiedIds = new Set<number>();
  for (const unit of state.units) {
    if (!isRecord(unit) || !isNonNegativeInteger(unit.id) || Number(unit.id) >= Number(state.nextId) || occupiedIds.has(Number(unit.id)) ||
        !isNonNegativeInteger(unit.x) || !isNonNegativeInteger(unit.y) || !isNonNegativeInteger(unit.dir) || Number(unit.dir) > 3 ||
        !Number.isSafeInteger(unit.type) || !Number.isSafeInteger(unit.layer) || typeof unit.name !== 'string' || unit.name.length > 128) return false;
    occupiedIds.add(Number(unit.id));
  }
  return true;
}
