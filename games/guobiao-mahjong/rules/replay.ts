import { applyAction, createMatch, nextHand } from './match';
import type { Match, Scorer, Seat } from './types';
export interface Replay { protocol: 'haiyue.mcr/1'; seed: number; handIndex: number; players: string[]; actions: Match['actions'] }
export interface BrowserModelSettings { version: 1; backend: 'webgpu' | 'wasm'; assignments: (string | null)[]; temperature: number; seed: number }
export interface SavedGame { browserModels?: BrowserModelSettings; version: 1; replay: Replay; human: Seat | null; delayMs: number; externalSeats?: Seat[] }
export function isSavedGame(value: unknown): value is SavedGame {
  if (!value || typeof value !== 'object') return false;
  const v = value as SavedGame, r = v.replay;
  if (v.externalSeats !== undefined && (!Array.isArray(v.externalSeats) || v.externalSeats.some(i => !Number.isInteger(i) || i < 0 || i > 3))) return false;
  const b = v.browserModels;
  if (b !== undefined && (!b || b.version !== 1 || !['webgpu', 'wasm'].includes(b.backend) || !Array.isArray(b.assignments) || b.assignments.length !== 4 || b.assignments.some(id => id !== null && id !== 'builtin' && !['browser-kd-s0','browser-kd-s1','browser-kd-s2','browser-kdens3','browser-kd-s0-safe','browser-kd-s0-learned','browser-kd-s0-value','browser-kd-s0-distilled','browser-kd-s0-joint'].includes(id)) || !Number.isFinite(b.temperature) || b.temperature < 0 || b.temperature > 2 || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 0xffffffff)) return false;
  return v.version === 1 && (v.human === null || Number.isInteger(v.human) && v.human >= 0 && v.human <= 3) && Number.isFinite(v.delayMs) && v.delayMs >= 0 && v.delayMs <= 30000 && !!r && r.protocol === 'haiyue.mcr/1' && Number.isInteger(r.seed) && r.seed >= 0 && r.seed <= 0xffffffff && Number.isInteger(r.handIndex) && r.handIndex >= 0 && r.handIndex < 16 && Array.isArray(r.players) && r.players.length === 4 && r.players.every(n => typeof n === 'string' && n.length <= 80) && Array.isArray(r.actions) && r.actions.length <= 12000 && r.actions.every(a => a && Number.isInteger(a.hand) && a.hand >= 0 && a.hand < 16 && Number.isInteger(a.seat) && a.seat >= 0 && a.seat <= 3 && Number.isInteger(a.revision) && a.action && typeof a.action.type === 'string');
}
export function exportReplay(s: Match): Replay { return structuredClone({ protocol: 'haiyue.mcr/1', seed: s.seed, handIndex: s.handIndex, players: s.players.map(p => p.name), actions: s.actions }); }
/** Re-apply every recorded decision through the referee; never deserialize unchecked rules state. */
export function replayMatch(replay: Replay, scorer: Scorer): Match {
  const s = createMatch(replay.seed, replay.players);
  for (const record of replay.actions) {
    if (record.hand === s.handIndex + 1) nextHand(s);
    if (record.hand !== s.handIndex) throw new Error('Replay hand order is invalid');
    applyAction(s, record.seat, record.action, scorer, record.revision);
  }
  if (replay.handIndex === s.handIndex + 1) nextHand(s);
  if (replay.handIndex !== s.handIndex) throw new Error('Replay is incomplete');
  return s;
}
