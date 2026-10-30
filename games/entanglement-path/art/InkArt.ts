import { ConnectedTerrainArt } from './ConnectedTerrainArt';
import { INK, boardPigmentAt, inkHash, paperEdgeFade, pigmentAt, revealProgress, scrollProgress, veilAlpha } from './inkNoise';
import { brushEdgePoint, HEX_RADIUS, HEX_TEXTURE_STRETCH, pathCurve } from './hexGeometry';
import { makeTerrainPlan, terrainPairKey, type TerrainPairs } from './topdownTerrain';
import { riverCurve, riverPointAt, type RiverWetness } from './riverFlow';

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
    readonly arrowImage: HTMLImageElement, readonly mountainImage: HTMLImageElement, connectorImage: HTMLImageElement) { this.connected = new ConnectedTerrainArt(connectorImage); }
  readonly connected: ConnectedTerrainArt;
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  private readonly washLayers = new Map<string, HTMLCanvasElement>();
  private readonly terrainLayers = new Map<string, HTMLCanvasElement>();
  private readonly tintedGlyphs = new Map<string, HTMLCanvasElement>();
  readonly bitmapDraws = { count: 0 };

  static async load(): Promise<InkArt> {
    const [landscape, ui, digits, metrics, titleImage, arrowImage, mountainImage, connectorImage] = await Promise.all([
      imageAt('./assets/ink/scroll-topdown-map.png'), imageAt('./assets/ink/ui-atlas.png'), imageAt('./assets/ink/digits.png'),
      fetch('./assets/ink/digits.json').then(response => { if (!response.ok) throw new Error('Missing ink bitmap font metrics'); return response.json() as Promise<FontMetrics>; }),
      imageAt('./assets/ink/title-qianmo.png'),
      imageAt('./assets/ink/rotate-brush.png'),
      imageAt('./assets/ink/terrain-topdown-atlas.png'),
      imageAt('./assets/ink/terrain-connectors.png'),
    ]);
    return new InkArt(landscape, ui, digits, metrics, titleImage, arrowImage, mountainImage, connectorImage);
  }

  title(width: number, height: number): HTMLCanvasElement {
    const target = canvas(width, height), ctx = target.getContext('2d')!;
    const scale = Math.min(width / this.titleImage.width, height / this.titleImage.height);
    const w = this.titleImage.width * scale, h = this.titleImage.height * scale;
    ctx.drawImage(this.titleImage, (width - w) / 2, (height - h) / 2, w, h);
    return target;
  }

  tile(kind: 'pigment' | 'wall' | 'path' | 'source', seed: number, pairs: TerrainPairs = [], rotation = 0): HTMLCanvasElement {
    const id = `${kind}:${seed}:${terrainPairKey(pairs)}:${rotation % 6}`;
    const cached = this.tiles.get(id); if (cached) return cached;
    const target = canvas(256), ctx = target.getContext('2d')!, wash = this.wash(kind, seed);
    ctx.save(); ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0);
    ctx.globalAlpha = kind === 'source' ? .46 : kind === 'pigment' ? .76 : 1;
    ctx.drawImage(this.terrainLayer(seed, pairs, kind === 'wall', rotation), 0, 0); ctx.restore();
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(wash, 0, 0);
    ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(wash, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (this.tiles.size >= 192) this.tiles.delete(this.tiles.keys().next().value!);
    this.tiles.set(id, target); return target;
  }

  private wash(kind: 'pigment' | 'wall' | 'path' | 'source', seed: number): HTMLCanvasElement {
    const id = `${kind}:${seed}`, cached = this.washLayers.get(id); if (cached) return cached;
    const target = canvas(256), ctx = target.getContext('2d')!;
    ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0);
    const hex = new Path2D();
    const edges = Array.from({ length: 6 }, (_, edge) => Array.from({ length: 23 }, (_, i) => brushEdgePoint(edge, i / 22, seed)));
    for (const [edge, points] of edges.entries()) for (const [i, point] of points.entries()) {
      if (!edge && !i) hex.moveTo(point.x, point.y); else hex.lineTo(point.x, point.y);
    }
    hex.closePath(); ctx.save(); ctx.clip(hex);
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
      const color = boardPigmentAt(x * 4, y * 4, seed);
      // One mineral hue, diluted into the same paper as the landscape; terrain supplies the darks.
      const strength = kind === 'wall' ? .49 : kind === 'source' ? .34 : kind === 'path' ? .51 : .45;
      for (let c = 0; c < 3; c++) pixels.data[offset + c] = mix(paper[c]! * (1 - strength) + color[c]! * strength, c);
      pixels.data[offset + 3] = fade.alpha * 255;
    }
    const pigment = canvas(64); pigment.getContext('2d')!.putImageData(pixels, 0, 0);
    ctx.drawImage(pigment, 0, 0, 256, 256);
    ctx.restore();
    if (this.washLayers.size >= 128) this.washLayers.delete(this.washLayers.keys().next().value!);
    this.washLayers.set(id, target); return target;
  }

  private terrainLayer(seed: number, pairs: TerrainPairs, wall: boolean, rotation = 0): HTMLCanvasElement {
    const id = `${seed}:${terrainPairKey(pairs)}:${wall}`;
    let layer = this.terrainLayers.get(id);
    if (!layer) {
      layer = canvas(256); const ctx = layer.getContext('2d')!;
      const plan = makeTerrainPlan(seed, pairs, wall);
      for (const stamp of plan.stamps) {
        ctx.save(); ctx.translate(stamp.x, stamp.y); ctx.rotate(stamp.angle); ctx.globalAlpha = stamp.opacity;
        this.drawTerrainStamp(ctx, stamp.motif, -stamp.width / 2, -stamp.height / 2, stamp.width, stamp.height);
        ctx.restore();
      }
      // Continuous soft valleys are cut through the whole terrain, following the actual river curves.
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round';
      for (const [a, b] of pairs) {
        const c = pathCurve(a, b);
        for (const [width, alpha] of [[36, .26], [28, .44], [18, 1]] as const) {
          ctx.strokeStyle = `rgba(0,0,0,${alpha})`; ctx.lineWidth = width;
          ctx.beginPath(); ctx.moveTo(c.start.x, c.start.y);
          ctx.bezierCurveTo(c.control1.x, c.control1.y, c.control2.x, c.control2.y, c.end.x, c.end.y); ctx.stroke();
        }
      }
      ctx.restore();
      // Terrain fades radially before the shared river ports; only the paper wash reaches the seam.
      ctx.globalCompositeOperation = 'destination-in';
      const fade = ctx.createRadialGradient(128, 128, 70, 128, 128, 106);
      fade.addColorStop(0, '#fff'); fade.addColorStop(.55, 'rgba(255,255,255,.8)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fade; ctx.fillRect(0, 0, 256, 256); ctx.globalCompositeOperation = 'source-over';
      if (this.terrainLayers.size >= 96) this.terrainLayers.delete(this.terrainLayers.keys().next().value!);
      this.terrainLayers.set(id, layer);
    }
    if (rotation % 6 === 0) return layer;
    const turned = canvas(256), ctx = turned.getContext('2d')!;
    ctx.translate(128, 128); ctx.rotate(rotation * Math.PI / 3); ctx.drawImage(layer, -128, -128);
    return turned;
  }

  private drawTerrainStamp(ctx: CanvasRenderingContext2D, motif: number, x: number, y: number, w: number, h: number): void {
    const image = this.mountainImage, sizeX = image.width / 4, sizeY = image.height / 4;
    ctx.drawImage(image, (motif % 4) * sizeX, Math.floor(motif / 4) * sizeY, sizeX, sizeY, x, y, w, h);
  }

  growBank(ctx: CanvasRenderingContext2D, seed: number, wetness: readonly RiverWetness[]): void {
    ctx.save(); ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0);
    for (const wet of wetness) {
      if (wet.bank < .8) continue;
      const curve = riverCurve(wet.entry, wet.exit), at = curve.length * (.32 + inkHash(seed, wet.entry) * .32);
      const p = riverPointAt(curve, at), next = riverPointAt(curve, at + 2);
      const angle = Math.atan2(next.y - p.y, next.x - p.x), side = seed % 2 ? 1 : -1;
      const x = p.x + Math.sin(angle) * 19 * side, y = p.y - Math.cos(angle) * 19 * side;
      if (Math.hypot(x - 128, y - 128) > 68) continue;
      ctx.globalAlpha = Math.min(.66, (wet.bank - .8) * 3.3);
      this.drawTerrainStamp(ctx, 10 + seed % 2, x - 16, y - 16, 32, 32);
      if (seed % 3 === 0) {
        ctx.globalAlpha *= .55;
        this.drawTerrainStamp(ctx, 12 + seed % 2, p.x - 8, p.y - 8, 16, 16);
      }
    }
    ctx.restore();
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

  score(score: number, length: number, _tiles: number, best: number): HTMLCanvasElement {
    const target = canvas(200, 170), ctx = target.getContext('2d')!;
    ctx.fillStyle = INK; ctx.font = `18px ${INK_FONT}`; ctx.fillText('本 局', 8, 22);
    this.drawNumber(ctx, score, 6, 32, 48);
    ctx.font = `16px ${INK_FONT}`; ctx.fillText('最 佳', 8, 112);
    this.drawNumber(ctx, best, 92, 91, 24, INK);
    ctx.globalAlpha = .7; ctx.font = `14px ${INK_FONT}`; ctx.fillText('通水河段', 8, 147);
    this.drawNumber(ctx, length, 94, 129, 21, INK);
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
