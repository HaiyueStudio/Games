import type { Meld, Tile } from '../rules/types';
import type { Rect } from './layout';
export interface HandTile { tile: Tile; index: number; drawn: boolean }
/** Preserve the exact source index even when the drawn tile duplicates another tile. */
export function handTiles(hand: readonly Tile[], drawn: Tile | null): HandTile[] {
  const drawnIndex = drawn === null ? -1 : hand.lastIndexOf(drawn);
  const standing = hand.map((tile, index) => ({ tile, index, drawn: false })).filter(t => t.index !== drawnIndex).sort((a, b) => a.tile - b.tile || a.index - b.index);
  return drawnIndex < 0 ? standing : [...standing, { tile: hand[drawnIndex]!, index: drawnIndex, drawn: true }];
}
export function handTileRects(tiles: readonly HandTile[], area: Rect, width: number): Rect[] {
  const gap = Math.max(2, width * .085), drawGap = tiles.some(t => t.drawn) ? width * .38 : 0;
  const total = tiles.length * width + Math.max(0, tiles.length - 1) * gap + drawGap;
  const x = area.x + (area.width - total) / 2;
  return tiles.map((t, i) => ({ x: x + i * (width + gap) + (t.drawn ? drawGap : 0), y: area.y, width, height: width * 176 / 128 }));
}
export interface MeldTile { tile: Tile | null; group: number; index: number; rect: Rect }
/** Keep every meld atomic. Four-tile kongs cannot flow into the next group's row. */
export function meldTileRects(melds: ReadonlyArray<Pick<Meld, 'kind'> & { tiles: readonly (Tile | null)[] }>, area: Rect, requestedWidth: number, vertical = false): MeldTile[] {
  const gapRatio = .06, groupGapRatio = .45;
  const units = melds.reduce((n, m) => n + m.tiles.length + Math.max(0, m.tiles.length - 1) * gapRatio, 0) + Math.max(0, melds.length - 1) * groupGapRatio;
  const width = Math.min(requestedWidth, area.width / Math.max(1, vertical ? 4.18 : units), area.height / Math.max(1, vertical ? melds.length * (176 / 128 + groupGapRatio) : 176 / 128));
  let offset = 0;
  return melds.flatMap((m, group) => {
    const row = m.tiles.map((tile, index) => ({ tile, group, index, rect: { x: area.x + (vertical ? index * width * (1 + gapRatio) : offset + index * width * (1 + gapRatio)), y: area.y + (vertical ? group * width * (176 / 128 + groupGapRatio) : 0), width, height: width * 176 / 128 } }));
    offset += width * (m.tiles.length + Math.max(0, m.tiles.length - 1) * gapRatio + groupGapRatio); return row;
  });
}
