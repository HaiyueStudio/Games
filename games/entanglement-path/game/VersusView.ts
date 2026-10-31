import { InkArt, INK_FONT } from '../art/InkArt';
import { boardCenter, boardAngle, boardPlaneSize, hexPlaneSize, type HexOrientation } from '../art/hexGeometry';
import { drawRiverTile, drawWetInkHalo } from '../art/RiverPainter';
import { RiverFlow } from '../art/riverFlow';
import { cellPigment, INK } from '../art/inkNoise';
import { terrainKey, type TerrainWorld } from '../art/terrainWfc';
import { cellKey, type VersusBoard, type VersusLevel, type VersusMatch, type Choice, type Player } from './VersusRules';

export interface DrawingLevel extends VersusLevel { hexScreen: number; name: string; orientation?: HexOrientation }
interface Rect { x: number; y: number; w: number; h: number }
export type VersusHit = 'ccw' | 'cw' | 'place' | 'swap' | 'restart' | null;
interface BoardPaint { flow: RiverFlow; count: number; textures: Map<string, HTMLCanvasElement>; reveals: Map<string, number> }

/** Cached map/cell surfaces; one bounded, frame-driven renderer for the shared and split scrolls. */
export class VersusView {
  private world!: TerrainWorld;
  private level!: DrawingLevel;
  private map!: ReturnType<InkArt['connected']['backdrop']>;
  private center = { x: 0, y: 0 };
  private extent = { w: 1, h: 1 };
  private readonly fog = new Map<string, HTMLCanvasElement>();
  private readonly paints = new Map<VersusBoard, BoardPaint>();
  private readonly halo = drawWetInkHalo();
  private readonly arrows: HTMLCanvasElement[];
  private readonly hits = new Map<Exclude<VersusHit, null>, Rect>();
  private frame = -1;
  private dirty = true;
  private boardRegions = new Map<Player, Rect>();
  constructor(readonly canvas: HTMLCanvasElement, readonly art: InkArt) {
    this.arrows = [art.rotationArrow(false), art.rotationArrow(true)];
  }
  configure(world: TerrainWorld, level: DrawingLevel): void {
    this.world = world; this.level = level; this.fog.clear(); this.paints.clear();
    const points = level.cells.map(c => boardCenter(c.q, c.r, level.hexScreen, level.orientation)), size = boardPlaneSize(level.hexScreen, level.orientation);
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    this.center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    this.extent = { w: Math.max(...xs) - Math.min(...xs) + size.width * 1.15,
      h: Math.max(...ys) - Math.min(...ys) + size.height * 1.15 };
    this.map = this.art.connected.backdrop([...world.nodes.values()].map(node => {
      const p = boardCenter(node.q, node.r, level.hexScreen, level.orientation); return { node, x: p.x + 600, y: p.y + 380 };
    }), size.width, size.height, boardAngle(level.orientation));
    for (const c of level.cells) {
      const id = cellKey(c), node = world.nodes.get(id)!;
      if (!level.wallKeys.has(id)) this.fog.set(id, this.art.connected.unexplored(node));
    }
    this.invalidate();
  }
  invalidate(): void { this.dirty = true; }
  hit(x: number, y: number): VersusHit {
    for (const [name, r] of this.hits) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return name;
    return null;
  }
  hitCurrent(x: number, y: number, match: VersusMatch): boolean {
    const region = this.boardRegions.get('human'); if (!region || match.human.ended) return false;
    const scale = Math.min(region.w / this.extent.w, region.h / this.extent.h), p = boardCenter(match.human.current.q, match.human.current.r, this.level.hexScreen, this.level.orientation);
    return Math.hypot(x - region.x - region.w / 2 - (p.x - this.center.x) * scale,
      y - region.y - region.h / 2 - (p.y - this.center.y) * scale) < this.level.hexScreen * scale * 1.4;
  }
  render(match: VersusMatch, selection: Choice, machineChoice: Choice | null, now: number, rect: { width: number; height: number }): boolean {
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const dpr = Math.min(devicePixelRatio || 1, 2, 2048 / w, 2048 / h), pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; this.dirty = true; }
    const frame = Math.floor(now / 60); if (this.frame === frame && !this.dirty) return false;
    this.frame = frame; this.dirty = false; this.hits.clear(); this.boardRegions.clear();
    const ctx = this.canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h); ctx.drawImage(this.art.landscape, 0, 0, w, h);
    const portrait = w / h < .95;
    ctx.drawImage(this.art.titleImage, w * .09, h * (portrait ? .19 : .15), portrait ? 112 : 166, portrait ? 40 : 58);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
    ctx.font = `${portrait ? 17 : 24}px ${INK_FONT}`;
    const status = match.winner ? match.winner === 'draw' ? '山河同分 · 平局' : match.winner === 'human' ? '此局你胜' : '此局机器胜'
      : match.turn === 'human' ? '轮到你落笔' : '机器推演中…';
    ctx.fillText(status, w * (portrait ? .66 : .67), h * (portrait ? .215 : .185));
    ctx.font = `${portrait ? 12 : 15}px ${INK_FONT}`; ctx.globalAlpha = .75;
    ctx.fillText(match.mode === 'shared' ? '共续一条水路 · 落子入死胡同者负' : '同图 · 同起点 · 同牌序 · 两卷结束后比分', w / 2, h * (portrait ? .27 : .245));
    ctx.globalAlpha = 1;
    if (match.mode === 'shared') {
      const region = { x: w * .16, y: h * .30, w: w * .68, h: h * .49 };
      this.boardRegions.set('human', region); this.boardRegions.set('machine', region);
      this.drawBoard(ctx, match.human, region, match.turn === 'human' ? selection : machineChoice, now);
      ctx.font = `${portrait ? 13 : 17}px ${INK_FONT}`;
      this.paperText(ctx, `第 ${match.moves.length + (match.winner ? 0 : 1)} 手 · 已通 ${match.human.length} 段`, w / 2, h * .775);
    } else {
      for (const player of ['human', 'machine'] as const) {
        const human = player === 'human', board = match.board(player);
        const region = portrait
          ? { x: w * .13, y: h * (human ? .325 : .595), w: w * .74, h: h * (human ? .205 : .19) }
          : { x: w * (human ? .075 : .535), y: h * .365, w: w * .39, h: h * .415 };
        this.boardRegions.set(player, region);
        const labelY = region.y - (portrait ? 22 : 38), cx = region.x + region.w / 2;
        ctx.font = `${portrait ? 16 : 23}px ${INK_FONT}`; ctx.fillStyle = human ? '#913e2f' : '#315b5b';
        ctx.fillText(human ? '你 的 山 河' : '机 器 山 河', cx - (portrait ? 39 : 56), labelY);
        this.art.drawNumber(ctx, board.score, cx + (portrait ? 33 : 58), labelY - (portrait ? 13 : 19), portrait ? 27 : 39, INK);
        ctx.fillStyle = INK;
        this.drawBoard(ctx, board, region, match.winner || board.ended ? null : human ? selection : machineChoice, now);
        ctx.font = `${portrait ? 12 : 16}px ${INK_FONT}`;
        this.paperText(ctx, board.ended ? '水路已尽' : `${board.placed.size} 笔 · ${board.length} 段`, cx, region.y + region.h + (portrait ? 10 : 22));
      }
    }
    const y = h * (portrait ? .835 : .845), available = !match.winner && match.turn === 'human' && !match.human.ended;
    const size = portrait ? 45 : 55;
    if (match.winner) {
      this.textButton(ctx, 'restart', '同种重赛', w / 2, y, portrait ? 132 : 170, 44, true);
    } else {
      const board = match.board(match.turn), choice = match.turn === 'human' ? selection : machineChoice ?? { swap: false, rotation: 0 };
      const reserve = choice.swap ? board.next : board.reserve;
      const reserveCanvas = this.tileImage(reserve, 0, board.current);
      ctx.save(); ctx.translate(w * .22, y); ctx.rotate(boardAngle(this.level.orientation)); ctx.drawImage(reserveCanvas, -size / 2, -size / 2, size, size); ctx.restore();
      this.hits.set('swap', { x: w * .22 - size / 2 - 8, y: y - size / 2 - 12, w: size + 16, h: size + 30 });
      ctx.font = `12px ${INK_FONT}`; this.paperText(ctx, '换一笔 / B', w * .22, y + size / 2 + 10);
      for (const [i, x] of [w * .40, w * .57].entries()) {
        ctx.globalAlpha = available ? 1 : .4; ctx.drawImage(this.arrows[i]!, x - size / 2, y - size / 2, size, size);
        this.hits.set(i ? 'cw' : 'ccw', { x: x - size / 2, y: y - size / 2, w: size, h: size });
      }
      ctx.globalAlpha = 1;
      this.textButton(ctx, 'place', '落笔 / A', w * .77, y, portrait ? 83 : 126, 44, available);
    }
    return true;
  }
  private paperText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.save(); ctx.strokeStyle = 'rgba(243,235,214,.9)'; ctx.lineWidth = 3; ctx.strokeText(text, x, y); ctx.fillText(text, x, y); ctx.restore();
  }
  private textButton(ctx: CanvasRenderingContext2D, name: Exclude<VersusHit, null>, label: string,
    x: number, y: number, w: number, h: number, enabled: boolean): void {
    ctx.save(); ctx.globalAlpha = enabled ? 1 : .4;
    ctx.fillStyle = 'rgba(243,235,214,.9)'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = '#944a37'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    ctx.font = `17px ${INK_FONT}`; ctx.fillStyle = INK; ctx.fillText(label, x, y); ctx.restore();
    this.hits.set(name, { x: x - w / 2, y: y - h / 2, w, h });
  }
  private tileImage(tile: VersusBoard['next'], rotation: number, point: { q: number; r: number }, options = {}): HTMLCanvasElement {
    const node = this.world.nodes.get(terrainKey(point.q, point.r))!;
    return drawRiverTile(tile, rotation, { ...options,
      baseImage: this.art.connected.fitted(node, cellPigment(tile.id, tile.variant, 71), tile.pairs, rotation) });
  }
  private drawBoard(ctx: CanvasRenderingContext2D, board: VersusBoard, region: Rect, choice: Choice | null, now: number): void {
    let paint = this.paints.get(board);
    if (!paint) { paint = { flow: new RiverFlow(), count: 0, textures: new Map(), reveals: new Map() }; this.paints.set(board, paint); }
    if (paint.count !== board.placed.size) {
      paint.flow.connect(board.routes, now, paint.count === 0 && board.placed.size > 1);
      for (const [id, tile] of board.placed) if (tile.order > paint.count) paint.reveals.set(id, now);
      paint.count = board.placed.size;
    }
    const scale = Math.min(region.w / this.extent.w, region.h / this.extent.h);
    ctx.save(); ctx.beginPath(); ctx.rect(region.x - 16, region.y - 8, region.w + 32, region.h + 16); ctx.clip();
    ctx.translate(region.x + region.w / 2, region.y + region.h / 2); ctx.scale(scale, scale); ctx.translate(-this.center.x, -this.center.y);
    ctx.drawImage(this.map.canvas, this.map.x - this.map.width / 2 - 600, this.map.y - this.map.height / 2 - 380, this.map.width, this.map.height);
    const moving = paint.flow.movingCells(now);
    for (const point of this.level.cells) {
      const id = cellKey(point); if (this.level.wallKeys.has(id)) continue;
      const p = boardCenter(point.q, point.r, this.level.hexScreen, this.level.orientation), tile = board.placed.get(id);
      let image = this.fog.get(id)!;
      if (tile) {
        const reveal = paint.reveals.get(id), fade = reveal === undefined ? 1 : Math.min(1, (now - reveal) / 760);
        let cached = paint.textures.get(id);
        if (!cached || moving.has(id) || fade < 1) {
          cached = this.tileImage(tile.tile, tile.rotation, point, { wetness: paint.flow.wetness(id, now), time: now });
          if (fade < 1) { const c = cached.getContext('2d')!; c.globalAlpha = 1 - fade; c.drawImage(this.art.connected.fog(this.world.nodes.get(id)!), 0, 0); c.globalAlpha = 1; }
          paint.textures.set(id, cached);
        }
        image = cached;
      } else if (!board.ended && id === cellKey(board.current) && choice) {
        const tile = choice.swap ? board.reserve : board.next;
        const cacheId = `preview:${id}:${tile.id}:${choice.rotation}`;
        let preview = paint.textures.get(cacheId);
        if (!preview) {
          for (const k of paint.textures.keys()) if (k.startsWith('preview:')) paint.textures.delete(k);
          preview = this.tileImage(tile, choice.rotation, point, { activeEntry: board.incoming }); paint.textures.set(cacheId, preview);
        }
        image = preview;
        const pulse = 1 + Math.sin(now * .002) * .035;
        ctx.globalAlpha = .7; this.drawCell(ctx, this.halo, p.x, p.y, 1.5 * pulse); ctx.globalAlpha = 1;
      }
      this.drawCell(ctx, image, p.x, p.y);
    }
    if (board.sourceExit !== null) {
      const p = boardCenter(this.level.start.q, this.level.start.r, this.level.hexScreen, this.level.orientation), node = this.world.nodes.get(cellKey(this.level.start))!;
      const spring = drawRiverTile(null, 0, { sourceExit: board.sourceExit, baseImage: this.art.connected.base(node), time: now });
      this.drawCell(ctx, spring, p.x, p.y);
    }
    ctx.restore();
  }
  private drawCell(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, scale = 1): void {
    const size = hexPlaneSize(this.level.hexScreen);
    ctx.save(); ctx.translate(x, y); ctx.rotate(boardAngle(this.level.orientation));
    ctx.drawImage(image, -size.width * scale / 2, -size.height * scale / 2, size.width * scale, size.height * scale); ctx.restore();
  }
  dispose(): void { this.paints.clear(); this.fog.clear(); this.hits.clear(); this.canvas.remove(); }
}
