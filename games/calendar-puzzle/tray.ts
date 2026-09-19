import { CALENDAR_PIECES, normalizeCalendarCells, type CalendarPoint } from './model';
export function calendarOrientedCells(cells: readonly CalendarPoint[], rotation: number, flipped: boolean) {
  let result = cells.map(p => ({ x: flipped ? -p.x : p.x, y: p.y }));
  for (let i = 0; i < rotation % 4; i++) result = result.map(p => ({ x: p.y, y: -p.x }));
  return normalizeCalendarCells(result);
}
/** Seeded rectangle packing: every shuffled piece remains visible and selectable. */
export function calendarTray(width: number, height: number, seed: number, orientations?: Array<{ rotation: number; flipped: boolean }>) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const pieces = CALENDAR_PIECES.map((p, i) => {
    const rotation = orientations?.[i]?.rotation ?? Math.floor(random() * 4);
    const flipped = orientations?.[i]?.flipped ?? random() > 0.5;
    const cells = calendarOrientedCells(p.cells, rotation, flipped);
    return { index: i, rotation, flipped, w: Math.max(...cells.map(c => c.x)) * 74 + 64, h: Math.max(...cells.map(c => c.y)) * 74 + 64, order: random() };
  }).sort((a, b) => b.w * b.h - a.w * a.h || a.order - b.order);
  for (let scale = 0.85; scale >= 0.25; scale -= 0.025) {
    const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
    const result = new Array<{ x: number; y: number; rotation: number; flipped: boolean; scale: number }>(pieces.length);
    let fits = true;
    for (const p of pieces) {
      const w = p.w * scale + 20, h = p.h * scale + 20;
      const xs = [0, ...occupied.map(r => r.x + r.width)].sort((a,b) => a-b);
      const ys = [0, ...occupied.map(r => r.y + r.height)].sort((a,b) => a-b);
      let found = false;
      for (const y of ys) { for (const x of xs) {
        if (x+w > width || y+h > height || occupied.some(r => x < r.x+r.width && x+w > r.x && y < r.y+r.height && y+h > r.y)) continue;
        occupied.push({ x, y, width: w, height: h });
        result[p.index] = { x: x+8, y: y+8, rotation:p.rotation, flipped:p.flipped, scale };
        found = true; break;
      } if (found) break; }
      if (!found) { fits = false; break; }
    }
    if (fits) return result;
  }
  throw new Error('Calendar tray is too small for all pieces.');
}
