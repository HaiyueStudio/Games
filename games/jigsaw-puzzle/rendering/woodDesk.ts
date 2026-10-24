/** Reuse the oak grain inside the UI atlas as three joined tabletop planks. Baked once per game. */
export function createWoodDeskTexture(wood: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  const rowHeight = wood.naturalHeight / 4;
  for (let row = 0; row < 3; row++) {
    ctx.save();
    ctx.translate(row % 2 ? canvas.width : 0, row * 256); if (row % 2) ctx.scale(-1, 1);
    ctx.drawImage(wood, 48, rowHeight * 2 + 40, wood.naturalWidth - 96, rowHeight - 80, 0, 0, canvas.width, 256);
    ctx.restore();
    ctx.fillStyle = row === 1 ? '#38200c0d' : '#ffedbd12'; ctx.fillRect(0, row * 256, canvas.width, 256);
    if (row) {
      ctx.fillStyle = '#42280c42'; ctx.fillRect(0, row * 256 - 1, canvas.width, 2);
      ctx.fillStyle = '#fff0c02e'; ctx.fillRect(0, row * 256 + 1, canvas.width, 1);
    }
  }
  return canvas;
}
