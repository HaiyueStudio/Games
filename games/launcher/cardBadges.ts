export const GENRE_COLORS: Record<string, string> = { '益智': '#f59e0b', '街机': '#f43f77', '物理': '#00b8a4', '音乐': '#a855f7', '沙盒': '#57b82c', '纸牌': '#ff783d' };
export function inputIcon(kind: 'gamepad' | 'mobile' | 'keyboard'): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 48;
  const context = canvas.getContext('2d')!; context.scale(2, 2); context.lineWidth = 1.7; context.strokeStyle = '#ffffff'; context.lineCap = 'round'; context.lineJoin = 'round';
  context.fillStyle = { gamepad: '#ef4586', mobile: '#00ad93', keyboard: '#347cf4' }[kind]; context.beginPath(); context.roundRect(0, 0, 24, 24, 4); context.fill();
  context.beginPath();
  if (kind === 'gamepad') {
    context.moveTo(6, 7); context.lineTo(18, 7); context.bezierCurveTo(21, 7, 23, 18, 20, 18); context.lineTo(16, 15); context.lineTo(8, 15); context.lineTo(4, 18); context.bezierCurveTo(1, 18, 3, 7, 6, 7);
    context.moveTo(7, 10); context.lineTo(7, 14); context.moveTo(5, 12); context.lineTo(9, 12); context.moveTo(16, 10); context.lineTo(16.01, 10); context.moveTo(19, 13); context.lineTo(19.01, 13);
  } else if (kind === 'mobile') {
    context.roundRect(6.5, 2.5, 11, 19, 2.3); context.moveTo(10, 5); context.lineTo(14, 5); context.moveTo(10.5, 18.5); context.lineTo(13.5, 18.5);
  } else {
    context.roundRect(2, 6, 20, 13, 2); for (const row of [10, 13]) for (const column of [6, 10, 14, 18]) { context.moveTo(column, row); context.lineTo(column + .2, row); } context.moveTo(7, 16); context.lineTo(17, 16);
  }
  context.stroke(); return canvas;
}
