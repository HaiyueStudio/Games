import { isNonNegativeInteger, isRecord } from '../../save/SingleSlotGameSave';
import type { CampaignProgress } from './campaign';
import type { GameState } from './game';
import { INTRO } from '../levels/pack';

export interface Progress {
  stage: number;
  state: GameState;
  completed: string[];
}

export interface OfficialProgress {
  campaign: CampaignProgress;
  rooms: { id: string; state: GameState; entrance?: string }[];
}

export interface SlotProgress {
  active: string;
  packs: Record<string, OfficialProgress>;
}

export function isSlotProgress(value: unknown): value is SlotProgress {
  if (!isRecord(value) || !isName(value.active) || !isRecord(value.packs)) return false;
  const packs = Object.entries(value.packs);
  return packs.length <= 8 && Object.hasOwn(value.packs, value.active) &&
    packs.every(([key, progress]) => /^[a-z][a-z0-9_-]{0,31}$/.test(key) && isOfficialProgress(progress));
}

const isName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;

export function isOfficialProgress(value: unknown): value is OfficialProgress {
  if (!isRecord(value) || !isRecord(value.campaign) || !Array.isArray(value.rooms) || !value.rooms.length || value.rooms.length > 32) return false;
  const { completed, bonuses, conversions } = value.campaign;
  return Array.isArray(completed) && completed.every(isName) &&
    Array.isArray(bonuses) && bonuses.every(item => Array.isArray(item) && item.length === 2 && isName(item[0]) && isNonNegativeInteger(item[1])) &&
    Array.isArray(conversions) && conversions.every(item => Array.isArray(item) && (item.length === 3 || item.length === 4 && isName(item[3])) &&
      isName(item[0]) && isName(item[1]) && Array.isArray(item[2]) && item[2].every(isName)) &&
    value.rooms.every(room => isRecord(room) && isName(room.id) &&
      (room.entrance === undefined || isName(room.entrance)) && isGameState(room.state));
}

export function isProgress(value: unknown): value is Progress {
  return isRecord(value) && isNonNegativeInteger(value.stage) && Number(value.stage) <= INTRO.length &&
    Array.isArray(value.completed) && value.completed.every(id => INTRO.some(entry => entry[0] === id)) && isGameState(value.state);
}

function isGameState(state: unknown): state is GameState {
  if (!isRecord(state)) return false;
  if (!isNonNegativeInteger(state.nextId) || !isNonNegativeInteger(state.turn) || typeof state.won !== 'boolean' ||
      typeof state.waiting !== 'boolean' || !Array.isArray(state.units) || state.units.length > 12000) return false;
  if (state.bonus !== undefined && !isNonNegativeInteger(state.bonus)) return false;
  if (state.island !== undefined && state.island !== true) return false;
  if (state.conversion !== undefined && (!Array.isArray(state.conversion) ||
      state.conversion.some(target => typeof target !== 'string' || target.length > 128))) return false;
  const occupiedIds = new Set<number>();
  for (const unit of state.units) {
    if (!isRecord(unit) || !isNonNegativeInteger(unit.id) || Number(unit.id) >= Number(state.nextId) || occupiedIds.has(Number(unit.id)) ||
        (unit.entrance !== undefined && !isName(unit.entrance)) ||
        !isNonNegativeInteger(unit.x) || !isNonNegativeInteger(unit.y) || !isNonNegativeInteger(unit.dir) || Number(unit.dir) > 3 ||
        !Number.isSafeInteger(unit.type) || !Number.isSafeInteger(unit.layer) || typeof unit.name !== 'string' || unit.name.length > 128) return false;
    occupiedIds.add(Number(unit.id));
  }
  return true;
}
