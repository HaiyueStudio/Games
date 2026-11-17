import { tableFrame } from '../rendering/tableModel';
export interface Rect { x: number; y: number; width: number; height: number }
export function tableLayout(w: number, h: number) {
  const frame = tableFrame(w, h), { compact, table, panel } = frame;
  return { compact, table, center: { x: frame.cx, y: frame.cy }, panel, frame,
    controlsY: h - (compact ? 43 : 41), statusY: compact ? h - 142 : 158,
    actionY: compact ? h - 192 : h - 84 };
}
/** Stable world-space surface coordinates, independent from HUD and camera framing. */
export function surfaceLayout() {
  return { table: { x: 0, y: 0, width: 1000, height: 1000 }, center: { x: 500, y: 500 },
    handY: 910, tile: 46, meldTile: 26, topTile: 36 };
}
/** Preserve complete tile faces on the sides; fit fourteen cards plus a separated draw. */
export function sideHandRects(table: Rect, count: number, right: boolean, drawn: boolean): Rect[] {
  const compact = table.width < 500, gap = compact ? 1.5 : 2, pad = compact ? 8 : 16;
  const maxWidth = compact ? 20 : 36, extra = drawn ? maxWidth * .38 : 0;
  const height = Math.min(maxWidth * 1.375, (table.height - 88 - Math.max(0, count - 1) * gap - extra) / Math.max(1, count));
  const width = height / 1.375;
  return Array.from({ length: count }, (_, i) => ({ x: right ? table.x + table.width - pad - width : table.x + pad,
    y: table.y + 64 + i * (height + gap) + (drawn && i === count - 1 ? extra : 0), width, height }));
}
