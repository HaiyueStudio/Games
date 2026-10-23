import { pieceOutline } from '../rules/outline';
import type { Puzzle } from '../rules/model';

export interface PieceTexture { canvas: HTMLCanvasElement; path: Path2D; padding: number }
export async function loadImage(source: string | File): Promise<HTMLCanvasElement> {
  if (source instanceof File && source.size > 25 * 1024 * 1024) throw new Error('请选择小于 25 MB 的图片');
  let blob: Blob = typeof source === 'string' ? await fetch(source).then(response => {
    if (!response.ok) throw new Error('图片无法读取');
    return response.blob();
  }) : source;
  // Static hosts may serve SVG as octet-stream; our declared vector asset needs its image MIME.
  if (typeof source === 'string' && source.endsWith('.svg')) blob = new Blob([blob], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片无法读取');
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
export async function createPieceTextures(puzzle: Puzzle, image: HTMLCanvasElement, current: () => boolean): Promise<PieceTexture[]> {
  const scale = image.width / puzzle.width, w = puzzle.cellWidth, h = puzzle.cellHeight;
  const padding = Math.min(w, h) * .3 + 4;
  const textures: PieceTexture[] = [];
  for (const piece of puzzle.pieces) {
    if (!current()) return [];
    const path = new Path2D();
    for (const command of pieceOutline(w, h, piece.edges)) {
      if (command.type === 'M') path.moveTo(command.p.x, command.p.y);
      else if (command.type === 'L') path.lineTo(command.p.x, command.p.y);
      else if (command.type === 'C') path.bezierCurveTo(command.a.x, command.a.y, command.b.x, command.b.y, command.p.x, command.p.y);
      else path.closePath();
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((w + 2 * padding) * scale); canvas.height = Math.ceil((h + 2 * padding) * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(canvas.width / (w + 2 * padding), canvas.height / (h + 2 * padding)); ctx.translate(padding, padding);
    ctx.shadowColor = '#253c4555'; ctx.shadowBlur = 4 * scale; ctx.shadowOffsetY = 2 * scale;
    ctx.fillStyle = '#faf6e9'; ctx.fill(path); ctx.shadowColor = 'transparent';
    ctx.save(); ctx.clip(path); ctx.drawImage(image, -piece.col * w, -piece.row * h, puzzle.width, puzzle.height); ctx.restore();
    ctx.strokeStyle = '#f5ead3b0'; ctx.lineWidth = .9; ctx.stroke(path);
    textures.push({ canvas, path, padding });
    // Bound image preparation per frame; textures are prepared once, never during dragging.
    if (piece.id % 8 === 7) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return textures;
}
