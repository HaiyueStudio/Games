export interface Rect { x: number; y: number; width: number; height: number }
export function tableLayout(w: number, h: number) {
  const compact = w < 900, margin = compact ? 12 : 28;
  const sidebar = compact ? 0 : Math.min(310, w * .24);
  const contentWidth = w - margin * 2 - sidebar - (compact ? 0 : 22), top = compact ? 116 : 88;
  const size = Math.max(180, Math.min(contentWidth, h - top - (compact ? 304 : 76)));
  const table: Rect = { x: margin + (contentWidth - size) / 2, y: top, width: size, height: size };
  const center = { x: table.x + size / 2, y: table.y + size / 2 };
  return { compact, table, center, panel: { x: w - sidebar - margin, y: 102, width: sidebar, height: h - 130 },
    handY: compact ? h - 170 : table.y + size - 76, handWidth: Math.min(700, size - 24), tile: Math.min(38, (size - 44) / 15.5),
    controlsY: compact ? h - 61 : h - 44, statusY: compact ? h - 118 : table.y + size + 2,
    actionY: compact ? table.y + size + 52 : table.y + size - 230,
    meldTile: Math.min(26, size * .033), topTile: Math.min(32, (size - 112) / 15.5) };
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
