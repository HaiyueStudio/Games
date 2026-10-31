import { InkArt, INK_FONT } from '../art/InkArt';
import { boardCenter, boardAngle, boardPlaneSize, hexPlaneSize, type HexOrientation } from '../art/hexGeometry';
import { drawWetInkHalo } from '../art/RiverPainter';
import { BoardPainter } from '../art/BoardPainter';
import { RiverFlow } from '../art/riverFlow';
import { INK, PAPER } from '../art/inkNoise';
import type { TerrainWorld } from '../art/terrainWfc';
import { cellKey, type VersusBoard, type VersusLevel, type VersusMatch, type Choice, type Player } from './VersusRules';
import { hitRect, hitCurrentTile, rotationButtonCenter, arrowFeedback, shortestRotationAngle, turnProgress,
  swapFrame, TURN_DURATION, SWAP_DURATION, type Point } from './BoardInteraction';

export interface DrawingLevel extends VersusLevel { id: string; hexScreen: number; name: string; orientation?: HexOrientation }
interface Rect { x: number; y: number; w: number; h: number }
export type VersusHit = 'ccw' | 'cw' | 'swap' | 'restart' | null;
interface BoardPaint { flow: RiverFlow; count: number; textures: Map<string, HTMLCanvasElement>; reveals: Map<string, number>; cursor: number }

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
  private readonly painter: BoardPainter;
  private readonly previews = new Map<string, HTMLCanvasElement>();
  private pointer: Point | null = null;
  private readonly buttons = [{ alpha: 0, hover: 0, pressed: -Infinity }, { alpha: 0, hover: 0, pressed: -Infinity }];
  private turn: { from: number; to: number; start: number; player: Player } | null = null;
  private flight: { a: HTMLCanvasElement; b: HTMLCanvasElement; start: number } | null = null;
  private reserve = { x: 0, y: 0, w: 1, h: 1 };
  private active: { x: number; y: number; w: number; h: number; radius: number } | null = null;
  private reserveHover = 0;
  private readonly hits = new Map<Exclude<VersusHit, null>, Rect>();
  private frame = -1;
  private dirty = true;
  private boardRegions = new Map<Player, Rect>();
  constructor(readonly canvas: HTMLCanvasElement, readonly art: InkArt) {
    this.arrows = [art.rotationArrow(false), art.rotationArrow(true)];
    this.painter = new BoardPainter(art);
  }
  configure(world: TerrainWorld, level: DrawingLevel): void {
    this.world = world; this.level = level; this.fog.clear(); this.paints.clear(); this.previews.clear(); this.pointer = null; this.cancelMotion();
    const points = level.cells.map(c => boardCenter(c.q, c.r, level.hexScreen, level.orientation)), size = boardPlaneSize(level.hexScreen, level.orientation);
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    this.center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    this.extent = { w: Math.max(...xs) - Math.min(...xs) + size.width * 1.05,
      h: Math.max(...ys) - Math.min(...ys) + size.height * 1.05 };
    this.map = this.art.connected.backdrop([...world.nodes.values()].map(node => {
      const p = boardCenter(node.q, node.r, level.hexScreen, level.orientation); return { node, x: p.x + 600, y: p.y + 380 };
    }), size.width, size.height, boardAngle(level.orientation));
    // Fade the surrounding sea before the layout clip, keeping enlarged maps free of rectangular edges.
    const mask = document.createElement('canvas'); mask.width = this.map.canvas.width; mask.height = this.map.canvas.height;
    const m = mask.getContext('2d')!, density = mask.width / this.map.width;
    m.fillStyle = '#fff'; m.filter = 'blur(15px)';
    m.fillRect((600 + this.center.x - this.extent.w / 2 - 12 - this.map.x + this.map.width / 2) * density,
      (380 + this.center.y - this.extent.h / 2 - 12 - this.map.y + this.map.height / 2) * density,
      (this.extent.w + 24) * density, (this.extent.h + 24) * density);
    const mapCtx = this.map.canvas.getContext('2d')!; mapCtx.globalCompositeOperation = 'destination-in'; mapCtx.drawImage(mask, 0, 0); mapCtx.globalCompositeOperation = 'source-over';
    for (const c of level.cells) {
      const id = cellKey(c), node = world.nodes.get(id)!;
      if (!level.wallKeys.has(id)) this.fog.set(id, this.art.connected.unexplored(node));
    }
    this.invalidate();
  }
  invalidate(): void { this.dirty = true; }
  move(point: Point | null): void { this.pointer = point; this.invalidate(); }
  rotate(from: number, to: number, now: number, player: Player = 'human'): void {
    this.flight = null; this.turn = { from, to, start: now, player }; this.invalidate();
  }
  swap(board: VersusBoard, choice: Choice, reserveRotation: number, now: number): void {
    const selected = choice.swap ? board.reserve : board.next, other = choice.swap ? board.next : board.reserve;
    this.turn = null;
    this.flight = { a: this.tileImage(selected, choice.rotation, board.current, board.incoming),
      b: this.tileImage(other, reserveRotation, board.current), start: now }; this.invalidate();
  }
  cancelMotion(): void { this.turn = null; this.flight = null; this.invalidate(); }
  press(kind: 'ccw' | 'cw', now: number): void { this.buttons[kind === 'ccw' ? 0 : 1]!.pressed = now; }
  hit(x: number, y: number): VersusHit {
    for (const [name, r] of this.hits) if (hitRect({ x, y }, r)) return name;
    return null;
  }
  hitCurrent(x: number, y: number, match: VersusMatch): boolean {
    const region = this.boardRegions.get('human'); if (!region || match.human.ended) return false;
    const scale = Math.min(region.w / this.extent.w, region.h / this.extent.h), p = boardCenter(match.human.current.q, match.human.current.r, this.level.hexScreen, this.level.orientation);
    return hitCurrentTile({ x, y }, { x: region.x + region.w / 2 + (p.x - this.center.x) * scale,
      y: region.y + region.h / 2 + (p.y - this.center.y) * scale }, this.level.hexScreen * scale);
  }
  render(match: VersusMatch, selection: Choice, machineChoice: Choice | null, reserveRotation: number, now: number, rect: { width: number; height: number }): boolean {
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const dpr = Math.min(devicePixelRatio || 1, 2, 2048 / w, 2048 / h), pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; this.dirty = true; }
    const frame = Math.floor(now / (this.turn || this.flight || this.pointer ? 16 : 40)); if (this.frame === frame && !this.dirty) return false;
    if (this.turn && now - this.turn.start >= TURN_DURATION) this.turn = null;
    if (this.flight && now - this.flight.start >= SWAP_DURATION) this.flight = null;
    this.frame = frame; this.dirty = false; this.hits.clear(); this.boardRegions.clear();
    const ctx = this.canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h); ctx.drawImage(this.art.landscape, 0, 0, w, h);
    const portrait = w / h < .95;
    if (match.mode === 'shared') ctx.drawImage(this.art.titleImage, w * .055, h * (portrait ? .185 : .15), portrait ? 115 : 188, portrait ? 41 : 66);
    else if (!portrait) ctx.drawImage(this.art.titleImage, w * .055, h * .14, 100, 35);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
    ctx.font = `${portrait ? 17 : 24}px ${INK_FONT}`;
    const status = match.winner ? match.winner === 'draw' ? '山河同分 · 平局' : match.winner === 'human' ? '此局你胜' : '此局机器胜'
      : match.turn === 'human' ? '轮到你落笔' : '机器推演中…';
    ctx.font = `${portrait ? 14 : 18}px ${INK_FONT}`;
    ctx.fillText(status, w * (match.mode === 'shared' ? portrait ? .75 : .85 : portrait ? .74 : .50), h * (portrait ? .185 : match.mode === 'shared' ? .20 : .155));
    if (match.mode === 'shared') {
      const region = portrait ? { x: w * .045, y: h * .31, w: w * .91, h: h * .50 }
        : { x: w * .23, y: h * .115, w: w * .54, h: h * .79 };
      this.boardRegions.set('human', region); this.boardRegions.set('machine', region);
      this.drawBoard(ctx, match.human, region, match.turn === 'human' ? selection : machineChoice, now, match.turn);
      ctx.font = `${portrait ? 13 : 17}px ${INK_FONT}`;
      this.paperText(ctx, `第 ${match.moves.length + (match.winner ? 0 : 1)} 手 · 已通 ${match.human.length} 段`, w * (portrait ? .75 : .85), h * (portrait ? .225 : .26));
    } else {
      for (const player of ['human', 'machine'] as const) {
        const human = player === 'human', board = match.board(player);
        const region = portrait
          ? { x: w * .045, y: h * (human ? .235 : .585), w: w * .91, h: h * (human ? .30 : .28) }
          : { x: w * (human ? .025 : .51), y: h * .20, w: w * .465, h: h * .68 };
        this.boardRegions.set(player, region);
        const labelY = region.y - (portrait ? 22 : 28), cx = region.x + region.w / 2;
        ctx.font = `${portrait ? 16 : 23}px ${INK_FONT}`; ctx.fillStyle = human ? '#913e2f' : '#315b5b';
        ctx.fillText(human ? '你 的 山 河' : '机 器 山 河', portrait && human ? w * .40 : cx - (portrait ? 39 : 56), labelY);
        this.art.drawNumber(ctx, board.score, portrait && human ? w * .57 : cx + (portrait ? 33 : 58), labelY - (portrait ? 13 : 19), portrait ? 27 : 39, INK);
        ctx.fillStyle = INK;
        this.drawBoard(ctx, board, region, match.winner || board.ended ? null : human ? selection : machineChoice, now, player);
        ctx.font = `${portrait ? 12 : 16}px ${INK_FONT}`;
        this.paperText(ctx, board.ended ? '水路已尽' : `${board.placed.size} 笔 · ${board.length} 段`, cx, region.y + region.h - (portrait ? 5 : 10));
      }
    }
    const region = this.boardRegions.get('human')!;
    const scale = Math.min(region.w / this.extent.w, region.h / this.extent.h);
    const p = boardCenter(match.human.current.q, match.human.current.r, this.level.hexScreen, this.level.orientation), size = hexPlaneSize(this.level.hexScreen);
    this.active = match.human.ended ? null : { x: region.x + region.w / 2 + (p.x - this.center.x) * scale,
      y: region.y + region.h / 2 + (p.y - this.center.y) * scale, w: size.width * scale, h: size.height * scale, radius: this.level.hexScreen * scale };
    this.reserve = match.mode === 'shared'
      ? portrait ? { x: w * .18, y: h * .295, w: 57, h: 65 } : { x: w * .15, y: h * .53, w: 108, h: 124 }
      : portrait ? { x: w * .10, y: h * .195, w: 44, h: 51 } : { x: w * .50, y: h * .76, w: 78, h: 90 };
    const available = !match.winner && match.turn === 'human' && !match.human.ended;
    if (match.winner) {
      const width = portrait ? 252 : match.mode === 'shared' ? 350 : 240, height = 90, x = w / 2 - width / 2, y = h * .79;
      ctx.drawImage(this.art.panel('dark', width, height), x, y, width, height);
      ctx.fillStyle = PAPER; ctx.font = `18px ${INK_FONT}`; ctx.fillText(status, w / 2, y + 23);
      ctx.font = `14px ${INK_FONT}`; ctx.fillText('点击画面、空格或 A 同种重赛', w / 2, y + 58);
      this.hits.set('restart', { x, y, w: width, h: height });
    } else {
      const board = match.mode === 'shared' ? match.board(match.turn) : match.human;
      const choice = match.mode === 'shared' && match.turn === 'machine' ? machineChoice ?? { swap: false, rotation: 0 } : selection;
      const other = choice.swap ? board.next : board.reserve;
      const image = this.tileImage(other, reserveRotation, board.current);
      const r = this.reserve, hit = { x: r.x - r.w / 2 - 9, y: r.y - r.h / 2 - 8, w: r.w + 18, h: r.h + 16 };
      this.reserveHover += (Number(available && hitRect(this.pointer, hit)) - this.reserveHover) * .16;
      if (!this.flight) this.drawPose(ctx, image, r, 1 + this.reserveHover * .05);
      ctx.font = `${portrait ? 12 : 20}px ${INK_FONT}`;
      this.paperText(ctx, '换 一 笔', r.x, portrait && match.mode === 'race' ? r.y + r.h / 2 + 11 : r.y - r.h / 2 - (portrait ? 10 : 21));
      if (!(portrait && match.mode === 'race')) {
        ctx.font = `${portrait ? 10 : 13}px ${INK_FONT}`;
        this.paperText(ctx, portrait ? 'X/LB · Y/RB 旋转' : 'X / LB 逆时针 · Y / RB 顺时针', r.x, r.y + r.h / 2 + 18);
        this.paperText(ctx, portrait ? 'B 换牌 · A 落笔' : 'B 换牌 · A / 点击棋子落笔', r.x, r.y + r.h / 2 + 35);
      }
      this.hits.set('swap', hit);
      if (available && this.active) this.drawControls(ctx, now, portrait);
      if (this.flight && this.active) this.drawFlight(ctx, now);
    }
    return true;
  }
  private paperText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.save(); ctx.strokeStyle = 'rgba(243,235,214,.9)'; ctx.lineWidth = 3; ctx.strokeText(text, x, y); ctx.fillText(text, x, y); ctx.restore();
  }
  private tileImage(tile: VersusBoard['next'], rotation: number, point: { q: number; r: number }, entry: number | null = null): HTMLCanvasElement {
    const id = `${cellKey(point)}:${tile.id}:${rotation}:${entry}`;
    let image = this.previews.get(id);
    if (!image) {
      image = this.painter.preview(tile, rotation, entry, this.world.nodes.get(cellKey(point))!);
      if (this.previews.size >= 64) this.previews.delete(this.previews.keys().next().value!);
      this.previews.set(id, image);
    }
    return image;
  }
  private drawControls(ctx: CanvasRenderingContext2D, now: number, portrait: boolean): void {
    const active = this.active!, scale = Math.max(.85, Math.min(1.2, active.radius / 38));
    const centers = [rotationButtonCenter(active, -1, scale), rotationButtonCenter(active, 1, scale)];
    const hovered = centers.map(p => hitRect(this.pointer, { x: p.x - 19, y: p.y - 20, w: 38, h: 40 }));
    const visible = portrait || !!document.body.dataset.gamepadActive || hitCurrentTile(this.pointer, active, active.radius) || hovered.some(Boolean);
    for (let i = 0; i < 2; i++) {
      const button = this.buttons[i]!, center = centers[i]!, feedback = arrowFeedback(button.alpha, button.hover, visible, hovered[i]!, i ? 1 : -1, now, button.pressed);
      button.alpha = feedback.alpha; button.hover = feedback.hover;
      this.hits.set(i ? 'cw' : 'ccw', { x: center.x - 19 * scale, y: center.y - 20 * scale, w: 38 * scale, h: 40 * scale });
      ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(-feedback.angle); ctx.globalAlpha = feedback.alpha;
      const width = 38 * feedback.scale * scale; ctx.drawImage(this.arrows[i]!, -width / 2, -width / 2, width, width); ctx.restore();
    }
  }
  private drawPose(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, pose: { x: number; y: number; w: number; h: number }, scale = 1): void {
    ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(boardAngle(this.level.orientation));
    ctx.drawImage(image, -pose.w * scale / 2, -pose.h * scale / 2, pose.w * scale, pose.h * scale); ctx.restore();
  }
  private drawFlight(ctx: CanvasRenderingContext2D, now: number): void {
    const f = this.flight!, { eased, arc } = swapFrame(now - f.start);
    for (const [image, from, to] of [[f.a, this.active!, this.reserve], [f.b, this.reserve, this.active!]] as const) {
      const lerp = (a: number, b: number) => a + (b - a) * eased;
      this.drawPose(ctx, image, { x: lerp(from.x, to.x), y: lerp(from.y, to.y) - arc * 30.4, w: lerp(from.w, to.w), h: lerp(from.h, to.h) });
    }
  }
  private drawBoard(ctx: CanvasRenderingContext2D, board: VersusBoard, region: Rect, choice: Choice | null, now: number, player: Player): void {
    let paint = this.paints.get(board);
    if (!paint) { paint = { flow: new RiverFlow(), count: 0, textures: new Map(), reveals: new Map(), cursor: 0 }; this.paints.set(board, paint); }
    if (paint.count !== board.placed.size) {
      paint.flow.connect(board.routes, now, paint.count === 0 && board.placed.size > 1);
      for (const [id, tile] of board.placed) if (tile.order > paint.count) paint.reveals.set(id, now);
      paint.count = board.placed.size;
    }
    const scale = Math.min(region.w / this.extent.w, region.h / this.extent.h);
    ctx.save(); ctx.beginPath(); ctx.rect(region.x - 64, region.y - 64, region.w + 128, region.h + 128); ctx.clip();
    ctx.translate(region.x + region.w / 2, region.y + region.h / 2); ctx.scale(scale, scale); ctx.translate(-this.center.x, -this.center.y);
    ctx.drawImage(this.map.canvas, this.map.x - this.map.width / 2 - 600, this.map.y - this.map.height / 2 - 380, this.map.width, this.map.height);
    const moving = paint.flow.movingCells(now);
    const placedIds = [...board.placed.keys()];
    const shimmer = new Set(placedIds.length ? [placedIds[paint.cursor++ % placedIds.length]!, placedIds[paint.cursor++ % placedIds.length]!] : []);
    for (const point of this.level.cells) {
      const id = cellKey(point); if (this.level.wallKeys.has(id)) continue;
      const p = boardCenter(point.q, point.r, this.level.hexScreen, this.level.orientation), tile = board.placed.get(id);
      let image = this.fog.get(id)!;
      if (tile) {
        const reveal = paint.reveals.get(id), fade = reveal === undefined ? 1 : Math.min(1, (now - reveal) / 760);
        let cached = paint.textures.get(id);
        if (!cached || moving.has(id) || fade < 1 || shimmer.has(id)) {
          cached = this.painter.placed(this.world.nodes.get(id)!, tile.tile, tile.rotation, paint.flow.wetness(id, now), now, (1 - fade) ** 1.8, cached);
          paint.textures.set(id, cached);
        }
        image = cached;
      } else if (!board.ended && id === cellKey(board.current) && choice) {
        const tile = choice.swap ? board.reserve : board.next;
        image = this.painter.terrain(this.world.nodes.get(id)!, tile, choice.rotation);
        const pulse = 1 + Math.sin(now * .002) * .035;
        ctx.globalAlpha = .7; this.drawCell(ctx, this.halo, p.x, p.y, 1.5 * pulse); ctx.globalAlpha = 1;
        this.drawCell(ctx, image, p.x, p.y);
        if (!(player === 'human' && this.flight)) {
          const turn = this.turn?.player === player ? this.turn : null, rotation = turn?.from ?? choice.rotation;
          const cacheId = `guide:${tile.id}:${rotation}:${board.incoming}`;
          let guide = this.previews.get(cacheId);
          if (!guide) {
            guide = this.painter.preview(tile, rotation, board.incoming);
            if (this.previews.size >= 64) this.previews.delete(this.previews.keys().next().value!);
            this.previews.set(cacheId, guide);
          }
          const angle = turn ? -shortestRotationAngle(turn.from, turn.to) * turnProgress(now - turn.start) : 0;
          this.drawCell(ctx, guide, p.x, p.y, 1, angle);
        }
        continue;
      }
      this.drawCell(ctx, image, p.x, p.y);
    }
    if (board.sourceExit !== null) {
      const p = boardCenter(this.level.start.q, this.level.start.r, this.level.hexScreen, this.level.orientation), node = this.world.nodes.get(cellKey(this.level.start))!;
      const spring = this.painter.source(node, board.sourceExit, now);
      this.drawCell(ctx, spring, p.x, p.y);
    }
    ctx.restore();
  }
  private drawCell(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, scale = 1, turn = 0): void {
    const size = hexPlaneSize(this.level.hexScreen);
    ctx.save(); ctx.translate(x, y); ctx.rotate(boardAngle(this.level.orientation) + turn);
    ctx.drawImage(image, -size.width * scale / 2, -size.height * scale / 2, size.width * scale, size.height * scale); ctx.restore();
  }
  dispose(): void { this.paints.clear(); this.previews.clear(); this.fog.clear(); this.hits.clear(); this.canvas.remove(); }
}
