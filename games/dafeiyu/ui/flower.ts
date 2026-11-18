import { canvas } from '../rendering/animated-tiles';

export function petalIcon(): HTMLCanvasElement {
  const ctx = canvas(80, 80);
  ctx.translate(40, 40);
  ctx.rotate(.45);
  drawPetal(ctx, 0, 0, 17, 26, true);
  return ctx.canvas;
}

export function flowerIcon(petals: number, filled: number): HTMLCanvasElement {
  const ctx = canvas(96, 96);
  ctx.translate(48, 48);
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.rotate(2 * Math.PI * i / petals);
    drawPetal(ctx, 0, -28, Math.min(13, 68 / petals), 15, i < filled);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fillStyle = filled === petals ? '#fff0a4' : '#87d9c9'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#1e465d'; ctx.stroke();
  return ctx.canvas;
}

function drawPetal(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, filled: boolean): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = filled ? '#ffa4b9' : '#22495f'; ctx.fill();
  ctx.lineWidth = 2.6; ctx.strokeStyle = filled ? '#805477' : '#548899'; ctx.stroke();
  if (filled) {
    ctx.beginPath(); ctx.ellipse(x - rx * .23, y - ry * .28, rx * .34, ry * .31, -.25, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe2d9'; ctx.fill();
  }
}
