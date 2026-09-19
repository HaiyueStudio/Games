/** Full surface coordinates; keep cells square without reserving letterbox bands. */
export function calendarViewport(width: number, height: number) {
  const scale = Math.max(0.0001, Math.min(height / 720, width / 1100));
  return { scale, x: 0, y: 0, width: width / scale, height: height / scale };
}
export function calendarPointer(x: number, y: number, rect: { left: number; top: number; width: number; height: number }) {
  const view = calendarViewport(rect.width, rect.height);
  return { x: (x - rect.left) / view.scale, y: (y - rect.top) / view.scale };
}
export function calendarLayout(width: number, height: number) {
  const view = calendarViewport(width, height);
  const edge = view.width > 1450 ? 94 : 28; // keep touch targets outside the iPhone cutout
  const board = { x: view.width - edge - 508, y: (view.height - 580) / 2 + 18, width: 508, height: 580 };
  const tray = { x: edge, y: 158, width: board.x - edge - 46, height: view.height - 256 };
  return { ...view, edge, board, tray };
}
