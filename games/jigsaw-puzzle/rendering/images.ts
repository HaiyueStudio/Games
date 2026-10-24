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
    const bevel = Math.max(.65, Math.min(1.8, Math.min(w, h) * .022));
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#172a3466'; ctx.shadowBlur = 3.5 * scale;
    ctx.shadowOffsetX = .6 * scale; ctx.shadowOffsetY = 1.8 * scale;
    ctx.fillStyle = '#faf6e9'; ctx.fill(path); ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.save(); ctx.clip(path);
    ctx.drawImage(image, -piece.col * w, -piece.row * h, puzzle.width, puzzle.height);
    // Offset strokes clipped to the actual silhouette light every curved shoulder
    // and socket by its direction. Bake once, so dragging needs no extra passes.
    const rim = (offset: number, color: string, width: number) => {
      ctx.save(); ctx.translate(offset, offset); ctx.strokeStyle = color;
      ctx.lineWidth = width; ctx.stroke(path); ctx.restore();
    };
    rim(bevel * .8, '#fff9e99c', bevel * 1.5);
    rim(-bevel * .8, '#1829367a', bevel * 1.5);
    rim(bevel * .35, '#ffffffb8', bevel * .55);
    rim(-bevel * .35, '#25303b80', bevel * .55);
    ctx.restore();
    ctx.strokeStyle = '#26343b66'; ctx.lineWidth = .55; ctx.stroke(path);
    textures.push({ canvas, path, padding });
    // Bound image preparation per frame; textures are prepared once, never during dragging.
    if (piece.id % 8 === 7) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return textures;
}
