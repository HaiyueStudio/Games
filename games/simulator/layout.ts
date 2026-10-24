import type { DesktopRect } from '../launcher/layout';
export type DeviceMode = 'pad' | 'phone';
export type DeviceOrientation = 'portrait' | 'landscape';
export function deviceViewport(mode: DeviceMode, orientation: DeviceOrientation = 'portrait') {
  const width = mode === 'phone' ? 390 : 820, height = mode === 'phone' ? 760 : 1080;
  return orientation === 'landscape' ? { width: height, height: width } : { width, height };
}
export function deviceIconGrid(mode: DeviceMode, width: number, height: number) {
  return width > height ? { columns: 6, rows: 2 } : mode === 'phone' ? { columns: 3, rows: 4 } : { columns: 4, rows: 3 };
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
  return { body, screen, columns: mode === 'phone' ? 3 : 4, rows: mode === 'phone' ? 4 : 3, pages: 12 };
}
export function swipePage(page: number, distance: number, width: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.abs(distance) > Math.min(48, width * .16) ? page + (distance < 0 ? 1 : -1) : page));
}
export function iconRectangle(index: number, screen: DesktopRect, columns: number, rows: number): DesktopRect {
  const cellWidth = screen.width / columns, cellHeight = (screen.height - 84) / rows, size = Math.min(screen.width > 600 ? 116 : 64, cellWidth * .66, cellHeight * .62);
  return { x: index % columns * cellWidth + (cellWidth - size) / 2, y: 54 + Math.floor(index / columns) * cellHeight, width: size, height: size };
}
