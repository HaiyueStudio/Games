import { HEX_RADIUS, HEX_TEXTURE_STRETCH, hexPoint } from './hexGeometry';
import { inkHash, inkNoise } from './inkNoise';
import { ridgePort, terrainHeight, type TerrainNode, type TerrainWorld } from './terrainWfc';

const makeCanvas = (w = 256, h = w): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function hexClip(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath(); for (let d = 0; d < 6; d++) { const p = hexPoint(d, HEX_RADIUS + .5); if (d) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); } ctx.closePath(); ctx.clip();
}
function logicalOrigin(node: TerrainNode) { return { x: (node.q + node.r / 2) * HEX_RADIUS * Math.sqrt(3), y: node.r * HEX_RADIUS * 1.5 }; }

export class ConnectedTerrainArt {
  private world: TerrainWorld | null = null;
  private readonly bases = new Map<string, HTMLCanvasElement>();
  private readonly fogs = new Map<string, HTMLCanvasElement>();
  constructor(readonly atlas: HTMLImageElement) {}
  configure(world: TerrainWorld): void { this.world = world; this.bases.clear(); this.fogs.clear(); }

  private stamp(ctx: CanvasRenderingContext2D, motif: number, x: number, y: number, w: number, h = w, angle = 0): void {
    const sw = this.atlas.width / 4, sh = this.atlas.height / 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.drawImage(this.atlas, motif % 4 * sw, Math.floor(motif / 4) * sh, sw, sh, -w / 2, -h / 2, w, h); ctx.restore();
  }

  base(node: TerrainNode): HTMLCanvasElement {
    const id = `${node.q},${node.r}`, cached = this.bases.get(id); if (cached) return cached;
    const target = makeCanvas(), ctx = target.getContext('2d')!, origin = logicalOrigin(node), seed = this.world!.seed;
    ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0); hexClip(ctx);
    const small = makeCanvas(48), sctx = small.getContext('2d')!, pixels = sctx.createImageData(48, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const px = (x + .5) * 256 / 48, py = (y + .5) * 256 / 48, wx = px - 128 + origin.x, wy = py - 128 + origin.y;
      const height = terrainHeight(node, px, py, seed), t = Math.max(0, Math.min(1, (height - .37) / .21)), land = t * t * (3 - 2 * t);
      const grain = (inkNoise(wx / 19, wy / 19, seed) - .5) * 8, shore = Math.exp(-(((height - .46) / .07) ** 2)) * .45;
      const sea = [175, 201, 194], soil = [219, 222, 197], paper = [244, 239, 219], i = (y * 48 + x) * 4;
      for (let c = 0; c < 3; c++) pixels.data[i + c] = (sea[c]! * (1 - land) + soil[c]! * land) * (1 - shore) + paper[c]! * shore + grain;
      pixels.data[i + 3] = 255;
    }
    sctx.putImageData(pixels, 0, 0); ctx.drawImage(small, 0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(71,112,110,.14)'; ctx.lineWidth = 1.1;
    // World-aligned water ripples continue across tile boundaries.
    for (let row = Math.floor((origin.y - 128) / 24); row < (origin.y + 128) / 24; row++) {
      ctx.beginPath(); let pen = false;
      for (let x = -8; x <= 264; x += 8) {
        const y = row * 24 - origin.y + 128 + Math.sin((origin.x + x - 128) / 32 + seed) * 2.5;
        if (terrainHeight(node, x, y, seed) < .33) { if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; } else pen = false;
      }
      ctx.stroke();
    }
    if (node.kind === 'wall') this.drawRidges(ctx, node);
    else if (node.kind === 'sea' && node.corners === 0 && node.variant % 7 === 0) {
      ctx.globalAlpha = .82; this.stamp(ctx, 8 + node.variant % 2, 128, 128, 48, 65, inkHash(node.q, node.r, seed) * 1.7); ctx.globalAlpha = 1;
    } else if (node.corners !== 0 && node.corners !== 63 && node.variant % 6 === 0) {
      // A harbor sits on dry ground near an actual coast, with its jetty pointing toward the sea.
      let place: { x: number; y: number; angle: number } | null = null;
      for (let d = 0; d < 12 && !place; d++) {
        const angle = d * Math.PI / 6, x = 128 + Math.cos(angle) * 43, y = 128 + Math.sin(angle) * 43;
        if (terrainHeight(node, x, y, seed) > .58 && terrainHeight(node, x + Math.cos(angle) * 26, y + Math.sin(angle) * 26, seed) < .45) place = { x, y, angle };
      }
      if (place) this.stamp(ctx, 10 + node.variant % 2, place.x, place.y, 74, 58, place.angle);
    } else if (node.corners === 0 && node.variant % 17 === 0) this.stamp(ctx, 14, 128, 128, 113, 93, node.variant % 6 * Math.PI / 3);
    this.bases.set(id, target); return target;
  }

  private drawRidges(ctx: CanvasRenderingContext2D, node: TerrainNode): void {
    const ports = Array.from({ length: 6 }, (_, i) => i).filter(d => node.ridges & (1 << d));
    const paths = ports.length === 2 ? [[ports[0]!, ports[1]!]] : ports.map(d => [d, -1]);
    if (!ports.length) { this.stamp(ctx, 6, 128, 128, 135, 125, node.variant % 6 * Math.PI / 3); return; }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [side, other] of paths) {
      const a = ridgePort(side!), b = other! < 0 ? { x: 128, y: 128 } : ridgePort(other!);
      const angleA = side! * Math.PI / 3, angleB = other! * Math.PI / 3;
      const c1 = { x: a.x - Math.cos(angleA) * 62, y: a.y - Math.sin(angleA) * 62 };
      const c2 = other! < 0 ? b : { x: b.x - Math.cos(angleB) * 62, y: b.y - Math.sin(angleB) * 62 };
      const stroke = () => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y); ctx.stroke(); };
      ctx.strokeStyle = 'rgba(90,115,99,.34)'; ctx.lineWidth = 53; stroke();
      ctx.strokeStyle = '#5d7566'; ctx.lineWidth = 36; stroke();
      ctx.strokeStyle = '#c5c7a8'; ctx.lineWidth = 14; stroke();
      // The same C1 spine reaches every socket; brush detail is inset, keeping seam endpoints exact.
      for (let i = 1; i < 6; i++) {
        const t = i / 6, u = 1 - t;
        const x = u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x;
        const y = u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y;
        const dx = 3 * u * u * (c1.x - a.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (b.x - c2.x);
        const dy = 3 * u * u * (c1.y - a.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (b.y - c2.y);
        this.stamp(ctx, (node.variant + i) % 4, x, y, 82, 50, Math.atan2(dy, dx));
      }
    }
    if (ports.length > 2) this.stamp(ctx, 5, 128, 128, 70, 70);
  }

  fog(node: TerrainNode): HTMLCanvasElement {
    const id = `${node.q},${node.r}`, cached = this.fogs.get(id); if (cached) return cached;
    const target = makeCanvas(), ctx = target.getContext('2d')!, small = makeCanvas(48), sctx = small.getContext('2d')!, pixels = sctx.createImageData(48, 48);
    const origin = logicalOrigin(node), seed = this.world!.seed;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const n = inkNoise((origin.x + x * 256 / 48) / 57, (origin.y + y * 256 / 48) / 57, seed + 73), i = (y * 48 + x) * 4;
      pixels.data[i] = 233 + n * 9; pixels.data[i + 1] = 235 + n * 8; pixels.data[i + 2] = 222 + n * 10; pixels.data[i + 3] = 236 + n * 17;
    }
    sctx.putImageData(pixels, 0, 0);
    ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0); hexClip(ctx); ctx.drawImage(small, 0, 0, 256, 256);
    this.fogs.set(id, target); return target;
  }

  unexplored(node: TerrainNode): HTMLCanvasElement {
    const c = makeCanvas(), ctx = c.getContext('2d')!; ctx.drawImage(this.base(node), 0, 0); ctx.drawImage(this.fog(node), 0, 0); return c;
  }

  backdrop(cells: { node: TerrainNode; x: number; y: number }[], width: number, height: number): { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number } {
    const left = Math.min(...cells.map(c => c.x)) - width / 2, top = Math.min(...cells.map(c => c.y)) - height / 2;
    const right = Math.max(...cells.map(c => c.x)) + width / 2, bottom = Math.max(...cells.map(c => c.y)) + height / 2;
    const scale = 1024 / (right - left), c = makeCanvas(1024, Math.ceil((bottom - top) * scale)), ctx = c.getContext('2d')!;
    for (const cell of cells) ctx.drawImage(this.base(cell.node), (cell.x - width / 2 - left) * scale, (cell.y - height / 2 - top) * scale, width * scale, height * scale);
    // Keep the painted sea within the scroll paper and softly dissolve its outer map boundary.
    ctx.globalCompositeOperation = 'destination-in';
    const mask = makeCanvas(c.width, c.height), m = mask.getContext('2d')!;
    m.fillStyle = '#fff'; m.filter = 'blur(18px)';
    m.fillRect((65 - left) * scale, (81 - top) * scale, 1070 * scale, 598 * scale);
    ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over';
    return { canvas: c, x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
  }
}
