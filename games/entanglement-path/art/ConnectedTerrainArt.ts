import { HEX_RADIUS, HEX_TEXTURE_STRETCH, hexPoint } from './hexGeometry';
import { inkHash, inkNoise } from './inkNoise';
import { ridgePort, terrainHeight, type TerrainNode, type TerrainWorld } from './terrainWfc';
import { makeTerrainPlan, terrainPairKey, type TerrainPairs } from './topdownTerrain';
import { riverCurve } from './riverFlow';
import { TERRAIN_RASTER_SIZE, type TerrainRaster, type TerrainRasterResponse } from './terrainRaster';

const makeCanvas = (w = 256, h = w): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function hexClip(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath(); for (let d = 0; d < 6; d++) { const p = hexPoint(d, HEX_RADIUS + .5); if (d) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); } ctx.closePath(); ctx.clip();
}
function logicalOrigin(node: TerrainNode) { return { x: (node.q + node.r / 2) * HEX_RADIUS * Math.sqrt(3), y: node.r * HEX_RADIUS * 1.5 }; }

export class ConnectedTerrainArt {
  private world: TerrainWorld | null = null;
  private readonly bases = new Map<string, HTMLCanvasElement>();
  private readonly fogs = new Map<string, HTMLCanvasElement>();
  private readonly fittedTiles = new Map<string, HTMLCanvasElement>();
  private readonly worker = new Worker(new URL('./terrain-raster.worker.js', import.meta.url), { type: 'module', name: 'qianmo-terrain-raster' });
  private readonly rasters = new Map<string, TerrainRaster>();
  private requestId = 0;
  private pending: { resolve: (ready: boolean) => void; reject: (error: Error) => void } | null = null;
  private readonly onPageHide = () => this.dispose();
  private disposed = false;
  workerElapsedMs = 0;
  constructor(readonly atlas: HTMLImageElement) {
    this.worker.onmessage = ({ data }: MessageEvent<TerrainRasterResponse>) => {
      if (data.id !== this.requestId || !this.pending) return;
      const pending = this.pending; this.pending = null;
      if (data.error || !data.tiles) { pending.reject(new Error(data.error ?? 'Missing terrain raster response')); return; }
      this.workerElapsedMs = data.elapsedMs;
      for (const tile of data.tiles) this.rasters.set(tile.key, tile);
      pending.resolve(true);
    };
    this.worker.onerror = event => { this.pending?.reject(new Error(event.message)); this.pending = null; };
    window.addEventListener('pagehide', this.onPageHide, { once: true });
  }
  configure(world: TerrainWorld): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.pending?.resolve(false); this.world = world;
    this.bases.clear(); this.fogs.clear(); this.fittedTiles.clear(); this.rasters.clear();
    const id = ++this.requestId;
    return new Promise((resolve, reject) => { this.pending = { resolve, reject }; this.worker.postMessage({ id, seed: world.seed, nodes: [...world.nodes.values()] }); });
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.pending?.resolve(false); this.pending = null; this.worker.terminate();
    window.removeEventListener('pagehide', this.onPageHide);
    this.bases.clear(); this.fogs.clear(); this.fittedTiles.clear(); this.rasters.clear();
  }

  private stamp(ctx: CanvasRenderingContext2D, motif: number, x: number, y: number, w: number, h = w, angle = 0): void {
    const sw = this.atlas.width / 4, sh = this.atlas.height / 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.drawImage(this.atlas, motif % 4 * sw, Math.floor(motif / 4) * sh, sw, sh, -w / 2, -h / 2, w, h); ctx.restore();
  }

  base(node: TerrainNode): HTMLCanvasElement {
    const id = `${node.q},${node.r}`, cached = this.bases.get(id); if (cached) return cached;
    const target = makeCanvas(), ctx = target.getContext('2d')!, origin = logicalOrigin(node), seed = this.world!.seed;
    ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0); hexClip(ctx);
    const raster = this.rasters.get(id); if (!raster) throw new Error(`Terrain raster not ready for ${id}`);
    const size = TERRAIN_RASTER_SIZE, small = makeCanvas(size), sctx = small.getContext('2d')!;
    const pixels = sctx.createImageData(size, size); pixels.data.set(raster.pixels); sctx.putImageData(pixels, 0, 0);
    ctx.drawImage(small, 0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(71,112,110,.14)'; ctx.lineWidth = 1.1; ctx.beginPath();
    let pen = false;
    for (let i = 0; i < raster.waves.length; i += 2) {
      const x = raster.waves[i]!, y = raster.waves[i + 1]!;
      if (Number.isNaN(x)) { pen = false; continue; }
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true;
    }
    ctx.stroke();
    if (node.kind === 'wall') this.drawRidges(ctx, node);
    else if (node.kind === 'sea' && node.corners === 0 && node.variant % 7 === 0 && terrainHeight(node, 128, 128, seed) < .2) {
      ctx.globalAlpha = .9; this.stamp(ctx, 8 + node.variant % 2, 128, 128, 64, 85, inkHash(node.q, node.r, seed) * 1.7); ctx.globalAlpha = 1;
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
      ctx.strokeStyle = 'rgba(90,115,99,.18)'; ctx.lineWidth = 75; stroke();
      ctx.strokeStyle = 'rgba(58,82,69,.48)'; ctx.lineWidth = 47; stroke();
      ctx.strokeStyle = 'rgba(40,62,49,.32)'; ctx.lineWidth = 25; stroke();
      // The same C1 spine reaches every socket; brush detail is inset, keeping seam endpoints exact.
      for (let i = 1; i < 6; i++) {
        const t = i / 6, u = 1 - t;
        const x = u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x;
        const y = u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y;
        const dx = 3 * u * u * (c1.x - a.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (b.x - c2.x);
        const dy = 3 * u * u * (c1.y - a.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (b.y - c2.y);
        ctx.save(); ctx.beginPath(); ctx.arc(128, 128, 84, 0, Math.PI * 2); ctx.clip();
        this.stamp(ctx, (node.variant + i) % 4, x, y, 131, 100, Math.atan2(dy, dx)); ctx.restore();
      }
    }
    if (ports.length > 2) this.stamp(ctx, 5, 128, 128, 70, 70);
  }

  fitted(node: TerrainNode, seed: number, pairs: TerrainPairs, rotation: number): HTMLCanvasElement {
    const turned = pairs.map(([a, b]) => [(a + rotation * 2) % 12, (b + rotation * 2) % 12] as const);
    const id = `${node.q},${node.r}:${seed}:${terrainPairKey(turned)}`, cached = this.fittedTiles.get(id);
    if (cached) return cached;
    const target = makeCanvas(), ctx = target.getContext('2d')!; ctx.drawImage(this.base(node), 0, 0);
    ctx.save(); ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0);
    const plan = makeTerrainPlan(seed, turned), points = turned.flatMap(([a, b]) => riverCurve(a, b).points.filter((_, i) => i % 3 === 0));
    for (const [i, spot] of plan.stamps.entries()) {
      if (i > 2 || Math.hypot(spot.x - 128, spot.y - 128) > 77) continue;
      const free = Math.min(...points.map(p => Math.hypot(p.x - spot.x, p.y - spot.y)));
      const height = terrainHeight(node, spot.x, spot.y, this.world!.seed);
      const width = Math.min(56, free * 1.8, (90 - Math.hypot(spot.x - 128, spot.y - 128)) * 1.5);
      if (width < 16) continue;
      ctx.globalAlpha = .48;
      if (height > .61 && free > 19) this.stamp(ctx, 15, spot.x, spot.y, width, width * .8, spot.angle);
      else if (height > .18 && height < .44 && free > 20) this.stamp(ctx, 13, spot.x, spot.y, width, width * .7, spot.angle);
      else if (height < .15 && free > 27 && seed % 5 === 0) this.stamp(ctx, 14, spot.x, spot.y, width, width * .8, spot.angle);
    }
    ctx.restore();
    if (this.fittedTiles.size >= 96) this.fittedTiles.delete(this.fittedTiles.keys().next().value!);
    this.fittedTiles.set(id, target); return target;
  }

  fog(node: TerrainNode): HTMLCanvasElement {
    const id = `${node.q},${node.r}`, cached = this.fogs.get(id); if (cached) return cached;
    const target = makeCanvas(), ctx = target.getContext('2d')!, small = makeCanvas(48), sctx = small.getContext('2d')!, pixels = sctx.createImageData(48, 48);
    const origin = logicalOrigin(node), seed = this.world!.seed;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const n = inkNoise((origin.x + x * 256 / 48) / 57, (origin.y + y * 256 / 48) / 57, seed + 73), i = (y * 48 + x) * 4;
      pixels.data[i] = 222 + n * 23; pixels.data[i + 1] = 230 + n * 15; pixels.data[i + 2] = 217 + n * 22; pixels.data[i + 3] = 226 + n * 28;
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
    ctx.save(); ctx.translate(c.width / 2, c.height / 2); ctx.scale(1, c.height / c.width);
    const fade = ctx.createRadialGradient(0, 0, c.width * .31, 0, 0, c.width * .49);
    fade.addColorStop(0, '#fff'); fade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fade; ctx.fillRect(-c.width / 2, -c.width / 2, c.width, c.width); ctx.restore();
    const mask = makeCanvas(c.width, c.height), m = mask.getContext('2d')!;
    m.fillStyle = '#fff'; m.filter = 'blur(18px)';
    m.fillRect((65 - left) * scale, (81 - top) * scale, 1070 * scale, 598 * scale);
    ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over';
    return { canvas: c, x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
  }
}
