import { actionKey, seat, type Action, type Observation, type Seat, type Tile } from '../rules/types';
import type { Rect } from './layout';
export interface DirectionMarker { seat: Seat; wind: Seat; position: 'bottom' | 'right' | 'top' | 'left'; active: boolean }
export function directionMarkers(o: Observation, view: Seat): DirectionMarker[] {
  return (['bottom', 'right', 'top', 'left'] as const).map((position, i) => { const who = seat(view + i); return { seat: who, wind: seat(who - o.dealer), position, active: who === o.turn && o.phase === 'turn' }; });
}
export function compassRects(center: { x: number; y: number }, table: Rect) {
  const size = Math.min(116, table.width * .30, Math.max(84, table.height * .4)) * 1.25, scale = size / 116;
  const r = (x: number, y: number, width: number, height: number): Rect => ({ x: center.x + x * scale, y: center.y + y * scale, width: width * scale, height: height * scale });
  return { scale, panel: r(-58, -58, 116, 116), inner: r(-52, -52, 104, 104), round: r(-36, -15, 72, 27), caption: r(-32, 11, 64, 16),
    markers: { bottom: r(-14, 29, 28, 25), right: r(29, -13, 26, 26), top: r(-14, -54, 28, 25), left: r(-55, -13, 26, 26) } };
}
export const isClaimAction = (a: Action): boolean => ['chow', 'pung', 'kong', 'concealed-kong', 'add-kong'].includes(a.type);
/** Original hand indices, with multiplicity; never light unrelated duplicates for a single action. */
export function claimHandIndices(hand: readonly Tile[], actions: readonly Action[], preview: string | null): Set<number> {
  const result = new Set<number>();
  for (const a of actions.filter(isClaimAction).filter(a => preview === null || actionKey(a) === preview)) {
    const need = a.type === 'chow' ? [...a.tiles!] : Array(a.type === 'pung' ? 2 : a.type === 'concealed-kong' ? 4 : a.type === 'add-kong' ? 1 : 3).fill(a.tile!) as Tile[];
    if (a.type === 'chow') need.splice(need.indexOf(a.tile!), 1);
    const used = new Set<number>();
    for (const tile of need) { const i = hand.findIndex((t, index) => t === tile && !used.has(index)); if (i >= 0) { used.add(i); result.add(i); } }
  }
  return result;
}
export interface MeldAccent { calledIndex: number | null; latest: boolean; action: string }
/** Public event order matches meld creation order; concealed kong events carry no hidden tile. */
export function meldAccent(o: Observation, who: Seat, group: number): MeldAccent {
  const creations = o.events.filter(e => e.seat === who && ['chow', 'pung', 'kong', 'concealed-kong'].includes(e.type));
  const creation = creations[group], m = o.players[who]!.melds[group];
  const latest = [...o.events].reverse().find(e => ['chow', 'pung', 'kong', 'concealed-kong', 'add-kong'].includes(e.type));
  if (!m || m.concealed) return { calledIndex: null, latest: latest?.index === creation?.index && !!creation, action: '暗杠' };
  const promoted = m.promoted ? [...o.events].reverse().find(e => e.type === 'add-kong' && e.seat === who && e.tile === m.tiles[0]) : null;
  const event = promoted ?? creation;
  const calledIndex = promoted ? m.tiles.length - 1 : m.kind === 'chow' ? (creation?.tile === undefined ? null : m.tiles.indexOf(creation.tile)) : seat(m.from - who) === 3 ? 0 : seat(m.from - who) === 2 ? 1 : m.tiles.length - 1;
  return { calledIndex: calledIndex !== null && calledIndex >= 0 ? calledIndex : null, latest: !!event && event.index === latest?.index, action: m.kind === 'chow' ? '吃' : m.kind === 'pung' ? '碰' : promoted ? '加杠' : '杠' };
}
export function flowerRects(count: number, area: Rect, width: number, vertical: boolean): Rect[] {
  const columns = vertical ? Math.min(4, count) : count, rows = vertical ? Math.ceil(count / 4) : 1;
  const w = Math.min(width, (area.width - Math.max(0, columns - 1) * 2) / Math.max(1, columns), (area.height - Math.max(0, rows - 1) * 3) / Math.max(1, rows) / 1.375);
  return Array.from({ length: count }, (_, i) => ({ x: area.x + i % Math.max(1, columns) * (w + 2), y: area.y + Math.floor(i / Math.max(1, columns)) * (w * 1.375 + 3), width: w, height: w * 1.375 }));
}
