import type { DesktopRect } from '../launcher/layout';
export type DeviceMode = 'pad' | 'phone';
export type DeviceOrientation = 'portrait' | 'landscape';
export function deviceViewport(mode: DeviceMode, orientation: DeviceOrientation = 'portrait') {
  const width = mode === 'phone' ? 390 : 820, height = mode === 'phone' ? 760 : 1080;
  return orientation === 'landscape' ? { width: height, height: width } : { width, height };
}
export function deviceIconGrid(mode: DeviceMode, width: number, height: number) {
  const rows = mode === 'phone' ? 7 : 5;
  return width > height ? { columns: rows, rows: 4 } : { columns: 4, rows };
}
export function phoneHomeRectangle(width: number, height: number, hit = false): DesktopRect {
  const barWidth = Math.min(144, width * .3), barHeight = hit ? 24 : 5;
  return { x: (width - barWidth) / 2 - (hit ? 12 : 0), y: height - (hit ? 24 : 13), width: barWidth + (hit ? 24 : 0), height: barHeight };
}
export function volumeRectangle(width: number, height: number): DesktopRect {
  const panelWidth = Math.min(360, width - 48), panelHeight = width < 500 || height < 500 ? 64 : 76;
  return { x: (width - panelWidth) / 2, y: 28, width: panelWidth, height: panelHeight };
}
export function gameRectangle(screen: DesktopRect, viewport: DesktopRect): DesktopRect {
  return { x: screen.x + viewport.x * screen.width, y: screen.y + viewport.y * screen.height, width: viewport.width * screen.width, height: viewport.height * screen.height };
}
export function deviceLayout(width: number, height: number, mode: DeviceMode) {
  const ratio = mode === 'phone' ? 390 / 760 : 820 / 1080;
  const available = Math.max(180, height - 150), border = 12;
  const screenHeight = Math.min(available - 48, (width - 52 - border * 2) / ratio), screenWidth = screenHeight * ratio;
  const body = { x: (width - screenWidth - border * 2) / 2, y: 78, width: screenWidth + border * 2, height: screenHeight + 48 };
  const screen = { x: body.x + border, y: body.y + 30, width: screenWidth, height: screenHeight };
  const grid = deviceIconGrid(mode, screen.width, screen.height);
  return { body, screen, ...grid, pages: grid.columns * grid.rows };
}
export function swipePage(page: number, distance: number, width: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.abs(distance) > Math.min(48, width * .16) ? page + (distance < 0 ? 1 : -1) : page));
}
export function iconLabelHeight(screen: DesktopRect, rows: number): number {
  const top = Math.min(54, screen.height * .1), bottom = Math.min(42, screen.height * .08);
  return Math.min(24, (screen.height - top - bottom) / rows * .32);
}
export function iconRectangle(index: number, screen: DesktopRect, columns: number, rows: number): DesktopRect {
  const top = Math.min(54, screen.height * .1), bottom = Math.min(42, screen.height * .08);
  const cellWidth = screen.width / columns, cellHeight = (screen.height - top - bottom) / rows, size = Math.max(1, Math.min(screen.width > 600 ? 116 : 64, cellWidth * .66, cellHeight * .62, cellHeight - iconLabelHeight(screen, rows) - 4));
  return { x: index % columns * cellWidth + (cellWidth - size) / 2, y: top + Math.floor(index / columns) * cellHeight, width: size, height: size };
}
