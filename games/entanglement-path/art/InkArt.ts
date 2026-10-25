import { CINNABAR, BOARD_PIGMENT, INK, boardPigmentAt, inkHash, paperEdgeFade, pigmentAt, revealProgress, scrollProgress, veilAlpha } from './inkNoise';
import { brushEdgePoint, HEX_RADIUS, HEX_TEXTURE_STRETCH } from './hexGeometry';

export const INK_FONT = '"KaiTi", "STKaiti", "FangSong", "Noto Serif CJK SC", serif';
export interface GlyphRect { x: number; y: number; width: number; height: number }
interface FontMetrics { glyphs: Record<string, GlyphRect> }

function canvas(width: number, height = width): HTMLCanvasElement {
  const target = document.createElement('canvas'); target.width = width; target.height = height; return target;
}

async function imageAt(url: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = url; await image.decode(); return image;
}

export class InkArt {
  private constructor(readonly landscape: HTMLImageElement, readonly ui: HTMLImageElement,
    readonly digits: HTMLImageElement, readonly metrics: FontMetrics, readonly titleImage: HTMLImageElement,
    readonly arrowImage: HTMLImageElement) {}
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  private readonly tintedGlyphs = new Map<string, HTMLCanvasElement>();
  readonly bitmapDraws = { count: 0 };

  static async load(): Promise<InkArt> {
    const [landscape, ui, digits, metrics, titleImage, arrowImage] = await Promise.all([
      imageAt('./assets/ink/scroll-landscape.png'), imageAt('./assets/ink/ui-atlas.png'), imageAt('./assets/ink/digits.png'),
      fetch('./assets/ink/digits.json').then(response => { if (!response.ok) throw new Error('Missing ink bitmap font metrics'); return response.json() as Promise<FontMetrics>; }),
      imageAt('./assets/ink/title-qianmo.png'),
      imageAt('./assets/ink/rotate-brush.png'),
    ]);
    return new InkArt(landscape, ui, digits, metrics, titleImage, arrowImage);
  }

  title(width: number, height: number): HTMLCanvasElement {
    const target = canvas(width, height), ctx = target.getContext('2d')!;
    const scale = Math.min(width / this.titleImage.width, height / this.titleImage.height);
    const w = this.titleImage.width * scale, h = this.titleImage.height * scale;
    ctx.drawImage(this.titleImage, (width - w) / 2, (height - h) / 2, w, h);
    return target;
  }

  tile(kind: 'pigment' | 'wall' | 'path' | 'source', seed: number): HTMLCanvasElement {
    const id = `${kind}:${seed}`; const cached = this.tiles.get(id); if (cached) return cached;
    const target = canvas(256), ctx = target.getContext('2d')!;
    ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0);
    const hex = new Path2D();
    const edges = Array.from({ length: 6 }, (_, edge) => Array.from({ length: 23 }, (_, i) => brushEdgePoint(edge, i / 22, seed)));
    for (const [edge, points] of edges.entries()) for (const [i, point] of points.entries()) {
      if (!edge && !i) hex.moveTo(point.x, point.y); else hex.lineTo(point.x, point.y);
    }
    hex.closePath(); ctx.save(); ctx.clip(hex);
    const color = kind === 'wall' || kind === 'source' ? INK : kind === 'path' ? CINNABAR : BOARD_PIGMENT;
    const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
    const pixels = ctx.createImageData(64, 64);
    const paper = [243, 232, 206];
    const normals = Array.from({ length: 6 }, (_, edge) => ({ x: Math.cos(edge * Math.PI / 3), y: Math.sin(edge * Math.PI / 3) }));
    const rimWidth = 16 + inkHash(seed, 91) * 5;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const offset = (y * 64 + x) * 4;
      const dx = x * 4 + 2 - 128, dy = y * 4 + 2 - 128;
      let edge = 0, projection = -Infinity;
      for (let side = 0; side < 6; side++) {
        const normal = normals[side]!, p = dx * normal.x + dy * normal.y;
        if (p > projection) { projection = p; edge = side; }
      }
      const normal = normals[edge]!, tangent = -dx * normal.y + dy * normal.x;
      const t = Math.max(0, Math.min(22, (.5 + tangent / HEX_RADIUS) * 22));
      const lo = Math.floor(t), hi = Math.min(22, lo + 1), a = edges[edge]![lo]!, b = edges[edge]![hi]!;
      const wander = a.offset + (b.offset - a.offset) * (t - lo);
      const fade = paperEdgeFade(HEX_RADIUS * Math.cos(Math.PI / 6) - projection + wander, rimWidth);
      const mix = (channel: number, c: number) => channel * fade.pigment + paper[c]! * (1 - fade.pigment);
      if (kind === 'pigment') {
        const color = boardPigmentAt(x * 4, y * 4, seed);
        for (let c = 0; c < 3; c++) pixels.data[offset + c] = mix(color[c]!, c);
        pixels.data[offset + 3] = fade.alpha * 255;
        continue;
      }
      const wash = pigmentAt(x * 4, y * 4, seed);
      const grain = (inkHash(x, y, seed) - .5) * 15;
      const density = .65 + wash * .63;
      for (let c = 0; c < 3; c++) pixels.data[offset + c] = mix(Math.min(255, rgb[c]! * density + grain + (kind === 'wall' || kind === 'source' ? wash * 11 : 0)), c);
      pixels.data[offset + 3] = fade.alpha * 255;
    }
    const pigment = canvas(64); pigment.getContext('2d')!.putImageData(pixels, 0, 0);
    ctx.drawImage(pigment, 0, 0, 256, 256);
    ctx.restore();
    this.tiles.set(id, target); return target;
  }

  panel(kind: 'score' | 'reserve' | 'dark', width: number, height: number): HTMLCanvasElement {
    const target = canvas(width, height), ctx = target.getContext('2d')!;
    const w = this.ui.width, h = this.ui.height;
    const rect = kind === 'score' ? [.012, .078, .474, .294] : kind === 'reserve' ? [.503, .078, .48, .294] : [.012, .574, .54, .29];
    ctx.drawImage(this.ui, rect[0]! * w, rect[1]! * h, rect[2]! * w, rect[3]! * h, 0, 0, width, height);
    return target;
  }

  drawNumber(ctx: CanvasRenderingContext2D, text: string | number, x: number, y: number, height: number, color = INK, align: CanvasTextAlign = 'left'): void {
    const chars = String(text).split(''); const advance = height * .63;
    const width = chars.length * advance - height * .08;
    let left = x - (align === 'center' ? width / 2 : align === 'right' ? width : 0);
    for (const char of chars) {
      const rect = this.metrics.glyphs[char]; if (!rect) throw new Error(`Unsupported bitmap digit: ${char}`);
      const key = `${char}:${color}`; let glyph = this.tintedGlyphs.get(key);
      if (!glyph) {
        glyph = canvas(rect.width, rect.height); const brush = glyph.getContext('2d')!;
        brush.drawImage(this.digits, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
        brush.globalCompositeOperation = 'source-in'; brush.fillStyle = color; brush.fillRect(0, 0, glyph.width, glyph.height);
        this.tintedGlyphs.set(key, glyph);
      }
      const glyphWidth = Math.min(advance, height * rect.width / rect.height);
      ctx.drawImage(glyph, left + (advance - glyphWidth) / 2, y, glyphWidth, height);
      left += advance; this.bitmapDraws.count++;
    }
  }

  score(score: number, length: number, tiles: number, best: number): HTMLCanvasElement {
    const target = canvas(200, 170), ctx = target.getContext('2d')!;
    ctx.fillStyle = INK; ctx.font = `18px ${INK_FONT}`; ctx.fillText('本 局', 8, 22);
    this.drawNumber(ctx, score, 8, 33, 42);
    for (const [i, label, value] of [[0, '最长纪录', best], [1, '路径长度', length], [2, '落子数量', tiles]] as const) {
      const y = 91 + i * 25; ctx.font = `16px ${INK_FONT}`; ctx.fillText(label, 8, y + 17);
      this.drawNumber(ctx, value, 106, y, 21, INK);
    }
    return target;
  }

  rotationArrow(clockwise: boolean): HTMLCanvasElement {
    const target = canvas(96), ctx = target.getContext('2d')!;
    const wash = ctx.createRadialGradient(48, 48, 20, 48, 48, 46);
    wash.addColorStop(0, 'rgba(243,232,206,.94)'); wash.addColorStop(.65, 'rgba(243,232,206,.85)'); wash.addColorStop(1, 'rgba(243,232,206,0)');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 96, 96);
    const width = this.arrowImage.width / 2, height = this.arrowImage.height, scale = Math.min(92 / width, 92 / height);
    const w = width * scale, h = height * scale;
    ctx.drawImage(this.arrowImage, clockwise ? width : 0, 0, width, height, (96 - w) / 2, (96 - h) / 2, w, h);
    return target;
  }
}

/** One persistent raster surface and one upload texture; never creates per-frame GPU assets. */
export class ScrollReveal {
  readonly canvas = canvas(600, 380);
  private readonly noise = new Float32Array(600 * 380);
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  constructor(private readonly art: InkArt) {
    const small = canvas(75, 48), context = small.getContext('2d')!, pixels = context.createImageData(75, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 75; x++) {
      const i = (y * 75 + x) * 4, value = pigmentAt(x * 6, y * 6, 947) * 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0); this.ctx.drawImage(small, 0, 0, 600, 380);
    const field = this.ctx.getImageData(0, 0, 600, 380).data;
    for (let i = 0; i < this.noise.length; i++) this.noise[i] = field[i * 4]! / 255;
  }
  draw(elapsed: number): HTMLCanvasElement {
    const ctx = this.ctx, image = this.art.landscape, open = scrollProgress(elapsed), reveal = revealProgress(elapsed);
    ctx.clearRect(0, 0, 600, 380); ctx.fillStyle = '#1b2927'; ctx.fillRect(0, 0, 600, 380);
    const half = 278 * open, left = 300 - half, right = 300 + half;
    ctx.save(); ctx.beginPath(); ctx.rect(left, 0, right - left, 380); ctx.clip(); ctx.drawImage(image, 0, 0, 600, 380); ctx.restore();
    const rodWidth = image.width * .04;
    ctx.drawImage(image, 0, 0, rodWidth, image.height, left - 20, 0, 24, 380);
    ctx.drawImage(image, image.width - rodWidth, 0, rodWidth, image.height, right - 4, 0, 24, 380);
    if (reveal > 0) {
      const pixels = ctx.getImageData(0, 0, 600, 380);
      for (let i = 0; i < this.noise.length; i++) pixels.data[i * 4 + 3] = Math.round(veilAlpha(this.noise[i]!, reveal) * 255);
      ctx.putImageData(pixels, 0, 0);
    }
    return this.canvas;
  }
}
