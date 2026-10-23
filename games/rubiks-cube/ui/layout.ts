export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function cubeLayout(width: number, height: number) {
  const landscape = width > height * 1.15;
  const side = landscape ? Math.min(300, width * 0.36) : 0;
  const panel: Rect = landscape
    ? { x: width - side - 12, y: 88, width: side, height: height - 100 }
    : { x: 12, y: height - 228, width: width - 24, height: 216 };
  const stage: Rect = landscape
    ? { x: 12, y: 88, width: width - side - 36, height: height - 102 }
    : { x: 12, y: 98, width: width - 24, height: Math.max(80, height - 340) };
  return { landscape, panel, stage };
}
export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
}
