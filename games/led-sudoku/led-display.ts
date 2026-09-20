import { SEGMENTS } from './rules';

export const COLORS = { given: '#75e4ef', clue: '#ffc16a', user: '#83ffc1', wrong: '#ff6586', muted: '#29434a' };
/** Seven independent beveled tubes, shared by board and number keypad. */
export function drawDigit(c: CanvasRenderingContext2D, mask: number, x: number, y: number, size: number, color: string, glow = true): void {
  c.save(); c.translate(x, y); c.scale(size / 50, size / 50);
  const horizontal = (yy: number) => [[7, yy], [11, yy - 3], [29, yy - 3], [33, yy], [29, yy + 3], [11, yy + 3]];
  const vertical = (xx: number, yy: number) => [[xx, yy], [xx + 3, yy + 4], [xx + 3, yy + 18], [xx, yy + 22], [xx - 3, yy + 18], [xx - 3, yy + 4]];
  const shapes = [horizontal(3), vertical(34, 5), vertical(34, 29), horizontal(51), vertical(6, 29), vertical(6, 5), horizontal(27)];
  shapes.forEach((shape, i) => {
    const lit = !!(mask & 1 << i);
    c.fillStyle = lit ? color : COLORS.muted; c.shadowColor = color; c.shadowBlur = lit && glow ? 7 : 0;
    c.beginPath(); shape.forEach(([xx, yy], j) => j ? c.lineTo(xx!, yy!) : c.moveTo(xx!, yy!)); c.closePath(); c.fill();
  }); c.restore();
}
/** Clock uses the same physical segments; zero is a closed ring, never blank. */
export function drawClock(canvas: HTMLCanvasElement, text: string, glow: boolean): void {
  const width = [...text].reduce((w, char) => w + (char === ':' ? 16 : 38), 12);
  if (canvas.width !== width * 2) canvas.width = width * 2;
  if (canvas.height !== 120) canvas.height = 120;
  canvas.style.width = `${width * .75}px`;
  canvas.style.height = '45px';
  canvas.setAttribute('aria-label', `用时 ${text}`);
  const c = canvas.getContext('2d')!;
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.clearRect(0, 0, width, 60);
  let x = 6;
  for (const char of text) {
    if (char === ':') {
      c.fillStyle = COLORS.user;
      c.fillRect(x + 3, 20, 4, 4); c.fillRect(x + 3, 38, 4, 4);
      x += 16;
    } else {
      drawDigit(c, char === '0' ? 0x3f : SEGMENTS[Number(char)]!, x, 5, 44, COLORS.user, glow);
      x += 38;
    }
  }
}
