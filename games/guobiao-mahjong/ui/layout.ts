export interface Rect { x: number; y: number; width: number; height: number }
export function tableLayout(w: number, h: number) {
  const compact = w < 900, margin = compact ? 12 : 28;
  const sidebar = compact ? 0 : Math.min(310, w * .24);
  const table: Rect = { x: margin, y: compact ? 116 : 102, width: w - margin * 2 - sidebar - (compact ? 0 : 22), height: h - (compact ? 360 : 266) };
  table.height = Math.max(180, table.height);
  const center = { x: table.x + table.width / 2, y: table.y + table.height / 2 };
  return { compact, table, center, panel: { x: w - sidebar - margin, y: 102, width: sidebar, height: h - 130 },
    handY: compact ? h - 170 : h - 143, handWidth: Math.min(700, table.width - 24), tile: Math.min(46, (table.width - 44) / 15),
    controlsY: h - 67 };
}
