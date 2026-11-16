import { System, type World } from '@haiyue/engine';
import { beginRenderCommandPass, type IEngine, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { IndexedSpriteRenderer, type IndexedSpriteDrawCommand, type IndexedSpritePlaneDescriptor } from '@haiyue/extensions/experimental/indexed-sprite';
import type { GuiRect } from '@haiyue/engine/gui';
import { OVERWORLD } from '../levels/pack';
import type { Puzzle, GameState } from '../rules/game';
import { directions } from '../rules/properties';
import { isText, spelling, type Unit } from '../rules/syntax';
import { gameLayout } from './layout';

const icons = ['flag', 'rock', 'wall', 'water', 'lava', 'key', 'door', 'shell', 'algae', 'crab', 'jelly', 'star', 'love', 'ice', 'skull', 'coral'];
const aliases: Record<string, string> = { brick: 'wall', cliff: 'wall', grass: 'algae', foliage: 'algae', hedge: 'algae',
  reed: 'algae', kelp: 'algae', tree: 'algae', flower: 'coral', fungi: 'coral', bog: 'water', fire: 'lava', crystal: 'ice', gem: 'ice',
  rubble: 'rock', pillar: 'rock', gate: 'door', lock: 'door', husk: 'shell', husks: 'shell', level: 'flag' };
const alias = (name: string) => Object.hasOwn(aliases, name) ? aliases[name] : undefined;
type Tint = readonly [number, number, number, number];
const tint = (rgb: number, a = 1): Tint => [(rgb >> 16) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, a];
const whaleRows = ['down', 'left', 'right', 'up'] as const;
const walkFrames = 4;
const stepTime = 160;
const winTime = 1050;

function canvas(width: number, height: number): CanvasRenderingContext2D {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw Error('Canvas 2D is unavailable');
  return ctx;
}
function plane(id: string, ctx: CanvasRenderingContext2D): IndexedSpritePlaneDescriptor {
  const {width, height} = ctx.canvas;
  return { id, width, height, format: 'rgba8', pixels: new Uint8Array(ctx.getImageData(0, 0, width, height).data) };
}
function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load ' + url));
    img.src = url;
  });
}
function labelPlane(unit: Unit, lit: boolean): IndexedSpritePlaneDescriptor {
  const ctx = canvas(100, 100);
  const [base, rim, ink] = unit.type < 0 ? ['#233955', '#6994b7', '#e4f5ff'] :
    unit.type === 0 ? (lit ? ['#9de4ec', '#e1fcff', '#123a50'] : ['#245166', '#528798', '#c4e9ed']) :
    unit.type === 2 ? (lit ? ['#ffd98c', '#fff0b9', '#57361b'] : ['#614c47', '#a28268', '#ffdfb0']) :
    (lit ? ['#ccbefc', '#efdefe', '#382b62'] : ['#44446a', '#8175a4', '#e0d4f9']);
  ctx.beginPath(); ctx.roundRect(3, 7, 94, 89, 13);
  ctx.fillStyle = '#08182e'; ctx.fill();
  ctx.beginPath(); ctx.roundRect(3, 2, 94, 84, 13);
  ctx.fillStyle = base!; ctx.fill();
  ctx.strokeStyle = rim!; ctx.lineWidth = lit ? 3 : 2; ctx.stroke();
  ctx.fillStyle = rim!;
  ctx.fillRect(44, 72, 12, 3);
  const text = spelling(unit.name).toUpperCase();
  ctx.font = '900 28px Arial, sans-serif';
  const size = Math.max(12, Math.min(28, 28 * 83 / Math.max(1, ctx.measureText(text).width)));
  ctx.font = `900 ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink!;
  ctx.fillText(text, 50, 42, 86);
  return plane(tileId(unit, lit), ctx);
}
function tileId(unit: Unit, lit: boolean): string {
  return 'word/' + unit.type + '/' + unit.name + '/' + Number(lit);
}

export async function loadArt(): Promise<IndexedSpritePlaneDescriptor[]> {
  const [whale, atlas, lagoon] = await Promise.all(['whale-walk/atlas.png', 'tiles.png', 'lagoon.png'].map(file => image('./assets/' + file)));
  const backdrop = canvas(1160, Math.round(1160 * lagoon!.height / lagoon!.width));
  backdrop.drawImage(lagoon!, 0, 0, backdrop.canvas.width, backdrop.canvas.height);
  const shape = canvas(2, 2);
  shape.fillStyle = '#fff'; shape.fillRect(0, 0, 2, 2);
  const halo = canvas(96, 96);
  const aura = halo.createRadialGradient(48, 48, 10, 48, 48, 47);
  aura.addColorStop(0, '#63edeb9a'); aura.addColorStop(.72, '#4adadb58'); aura.addColorStop(1, '#4adadb00');
  halo.fillStyle = aura; halo.fillRect(0, 0, 96, 96);
  const ring = canvas(96, 96);
  ring.beginPath(); ring.arc(48, 48, 43, 0, Math.PI * 2);
  ring.strokeStyle = '#fff'; ring.lineWidth = 4; ring.stroke();
  const spark = canvas(40, 40);
  spark.beginPath(); spark.moveTo(20, 0); spark.quadraticCurveTo(23, 17, 40, 20);
  spark.quadraticCurveTo(23, 23, 20, 40); spark.quadraticCurveTo(17, 23, 0, 20);
  spark.quadraticCurveTo(17, 17, 20, 0); spark.fillStyle = '#fff'; spark.fill();
  const result = [plane('lagoon', backdrop), plane('white', shape), plane('halo', halo), plane('ring', ring), plane('spark', spark)];
  const hero = canvas(160, 160);
  const frameWidth = whale!.width / walkFrames, frameHeight = whale!.height / whaleRows.length;
  for (const [row, facing] of whaleRows.entries()) for (let frame = 0; frame < walkFrames; frame++) {
    hero.clearRect(0, 0, 160, 160);
    hero.drawImage(whale!, frame * frameWidth, row * frameHeight, frameWidth, frameHeight, 0, 0, 160, 160);
    result.push(plane(`whale/${facing}/${frame}`, hero));
  }
  for (const [i, id] of icons.entries()) {
    const ctx = canvas(128, 128);
    const w = atlas!.width / 4, h = atlas!.height / 4;
    ctx.drawImage(atlas!, i % 4 * w, Math.floor(i / 4) * h, w, h, 0, 0, 128, 128);
    result.push(plane(id, ctx));
  }
  return result;
}

export class LagoonScene extends System {
  readonly recoveryLabel = 'Dafeiyu 2D puzzle';
  readonly recoverySource = { kind: 'render-system', system: 'LagoonScene' };
  private renderer: IndexedSpriteRenderer | undefined;
  private readonly art: IndexedSpritePlaneDescriptor[];
  private readonly planes = new Map<string, IndexedSpritePlaneDescriptor>();
  private readonly engine: IEngine;
  private readonly unregister: (() => void) | undefined;
  private puzzle: Puzzle | null = null;
  private from = new Map<number, Unit>();
  private elapsed = stepTime;
  private walkClock = 0;
  private win: { elapsed: number; points: { x: number; y: number }[] } | undefined;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private cached: IndexedSpriteDrawCommand[] = [];
  private dirty = true;
  private width = 0;
  private height = 0;
  private disposed = false;
  readonly bounds = { x: 0, y: 0, cell: 0 };

  constructor(engine: IEngine, art: IndexedSpritePlaneDescriptor[]) {
    super(() => false);
    this.engine = engine;
    this.art = art;
    for (const item of art) this.planes.set(item.id, item);
    this.unregister = engine.registerDeviceRecoveryParticipant?.(this);
    this.refreshAtlas();
  }
  private refreshAtlas(): void {
    const renderer = new IndexedSpriteRenderer(this.engine.device, [...this.planes.values()], [], {
      targetFormat: this.engine.format, sampleCount: this.engine.msaaSamples, label: this.recoveryLabel,
    });
    renderer.uploadAll();
    this.renderer?.dispose();
    this.renderer = renderer;
  }
  setPuzzle(puzzle: Puzzle, previous?: GameState): void {
    const newLevel = this.puzzle !== puzzle;
    if (newLevel) {
      this.planes.clear();
      for (const art of this.art) this.planes.set(art.id, art);
    }
    this.puzzle = puzzle;
    this.from = new Map(previous?.units.map(unit => [unit.id, unit]));
    if (!previous || this.elapsed === stepTime) this.walkClock = 0;
    this.elapsed = previous && !this.reducedMotion.matches ? 0 : stepTime;
    this.win = undefined;
    if (previous && !previous.won && puzzle.state.won && !this.reducedMotion.matches) {
      const controlled = puzzle.state.units.filter(unit => puzzle.context.has(unit, 'you') || puzzle.context.has(unit, 'you2'));
      const winners = controlled.filter(unit => puzzle.context.at(unit.x, unit.y).some(goal =>
        puzzle.context.has(goal, 'win') && puzzle.context.has(goal, 'float') === puzzle.context.has(unit, 'float')));
      const points = [...new Map(winners.map(unit => [unit.y * puzzle.level.width + unit.x, unit])).values()].slice(0, 3);
      this.win = { elapsed: 0, points: points.length ? points : [controlled[0] ?? { x: (puzzle.level.width - 1) / 2, y: (puzzle.level.height - 1) / 2 }] };
    }
    let added = false;
    for (const unit of puzzle.state.units) {
      if (!isText(unit) && (this.planes.has(unit.name) || alias(unit.name) || ['baba', 'cursor', 'tile', 'path'].includes(unit.name))) continue;
      for (const lit of isText(unit) ? [false, true] : [false]) {
        const id = tileId(unit, lit);
        if (this.planes.has(id)) continue;
        this.planes.set(id, labelPlane(unit, lit));
        added = true;
      }
    }
    if (added || newLevel) this.refreshAtlas();
    this.dirty = true;
  }
  tick(delta: number): void {
    if (this.elapsed < stepTime) {
      this.elapsed = Math.min(stepTime, this.elapsed + delta);
      this.walkClock = (this.walkClock + delta) % stepTime;
      this.dirty = true;
    }
    if (this.win) {
      this.win.elapsed += delta;
      if (this.win.elapsed >= winTime) this.win = undefined;
      this.dirty = true;
    }
  }
  animationSnapshot() {
    return { whales: this.cached.filter(draw => draw.spriteId.startsWith('whale/')).map(draw => draw.spriteId),
      celebrating: !!this.win, sparkles: this.cached.filter(draw => draw.spriteId === 'spark').length };
  }

  private compose(width: number, height: number): IndexedSpriteDrawCommand[] {
    const commands: IndexedSpriteDrawCommand[] = [];
    const add = (spriteId: string, r: GuiRect, color?: Tint) => {
      const source = this.planes.get(spriteId);
      if (!source) return;
      commands.push({ spriteId, x: r.x + r.width / 2, y: r.y + r.height / 2, axisX: source.width / 2, axisY: source.height / 2,
        scaleX: r.width / source.width, scaleY: r.height / source.height,
        sampling: 'linear', blend: 'alpha', priority: commands.length, ...(color ? { tint: color } : {}) });
    };
    const rect = (x: number, y: number, w: number, h: number, color: Tint) => add('white', { x, y, width: w, height: h }, color);
    const art = this.planes.get('lagoon')!;
    const cover = Math.max(width / art.width, height / art.height);
    const bgWidth = art.width * cover, bgHeight = art.height * cover;
    add('lagoon', { x: (width - bgWidth) / 2, y: (height - bgHeight) / 2, width: bgWidth, height: bgHeight });
    rect(0, 0, width, height, tint(0x041426, .37));
    const puzzle = this.puzzle;
    if (!puzzle) return commands;
    const { width: cols, height: rows, edges } = puzzle.level;
    const overworld = puzzle.level.id === OVERWORLD[0];
    const { board } = gameLayout(width, height, puzzle.level);
    rect(board.x, board.y + 4, board.width, board.height, tint(0x021021, .64));
    rect(board.x, board.y, board.width, board.height, tint(0x3a8598, .85));
    rect(board.x + 1, board.y + 1, board.width - 2, board.height - 2, tint(0x0c263a));
    const pad = Math.min(17, board.width * .025, board.height * .05);
    const cell = Math.max(.1, Math.min(72, (board.width - pad * 2) / cols, (board.height - pad * 2) / rows));
    const originX = board.x + (board.width - cols * cell) / 2;
    const originY = board.y + (board.height - rows * cell) / 2;
    Object.assign(this.bounds, { x: originX, y: originY, cell });
    rect(originX - 1, originY - 1, cols * cell + 2, rows * cell + 2, tint(0x345e72));
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = originX + col * cell, y = originY + row * cell;
      const edge = edges.has(row * cols + col);
      const color = edge ? ((row + col) % 2 ? 0x173f53 : 0x1b4658) : ((row + col) % 2 ? 0x123047 : 0x15364e);
      rect(x, y, cell - Math.min(.6, cell / 8), cell - Math.min(.6, cell / 8), tint(color));
      if (edge && cell > 10) rect(x + cell * .45, y + cell * .43, cell * .1, cell * .1, tint(0x428093, .45));
    }
    const dot = (x: number, y: number, s: number, color: Tint) => rect(originX + (x + .5 - s / 2) * cell,
      originY + (y + .5 - s / 2) * cell, cell * s, cell * s, color);
    const centered = (id: string, x: number, y: number, size: number, color?: Tint) =>
      add(id, { x: x - size / 2, y: y - size / 2, width: size, height: size }, color);
    if (overworld) for (const path of puzzle.level.paths) dot(path.x, path.y, .13, tint(0x79adc8, .27));
    for (const path of puzzle.openPaths) if (path.x >= 0 && path.x < cols && path.y >= 0 && path.y < rows) {
      dot(path.x, path.y, overworld ? .21 : .15, tint(overworld ? 0x89ece0 : 0x52a9b3));
    }
    const stack = new Map<number, number>();
    const t = 1 - (1 - this.elapsed / stepTime) ** 3;
    for (const unit of [...puzzle.state.units].sort((a, b) => a.layer - b.layer || a.y - b.y || a.id - b.id)) {
      if (puzzle.context.has(unit, 'hide') || unit.name === 'level' && unit.state === 0) continue;
      const old = this.from.get(unit.id);
      const ox = old ? old.x + (unit.x - old.x) * t : unit.x;
      const oy = old ? old.y + (unit.y - old.y) * t : unit.y;
      const stackId = unit.y * cols + unit.x;
      const count = stack.get(stackId) ?? 0;
      const shift = count && isText(unit) ? Math.min(.13, count * .08) : 0;
      const x = originX + (ox + shift) * cell, y = originY + (oy - shift) * cell;
      if (unit.name === 'path' || unit.name === 'tile') { dot(ox, oy, .62, tint(0x447287, .45)); continue; }
      if (puzzle.context.has(unit, 'you') || puzzle.context.has(unit, 'you2') || puzzle.context.has(unit, 'select')) {
        add('halo', { x: x - cell * .13, y: y - cell * .13, width: cell * 1.26, height: cell * 1.26 });
      }
      if (unit.name === 'baba' || unit.name === 'cursor') {
        const walking = this.elapsed < stepTime && old && (old.x !== unit.x || old.y !== unit.y);
        const frame = walking ? Math.floor(this.walkClock / (stepTime / walkFrames)) : 1;
        const sprite = `whale/${directions[unit.dir]}/${frame}`;
        centered(sprite, x + cell / 2, y + cell / 2, cell * (unit.name === 'cursor' ? .86 : 1.08));
        continue;
      }
      if (overworld && unit.marker && unit.name === 'level') {
        const state = unit.state ?? 0;
        const color = tint(state >= 3 ? 0x8ef2bf : state === 2 ? 0xffdf92 : 0x6391aa);
        centered('halo', x + cell / 2, y + cell / 2, cell, color);
        centered('ring', x + cell / 2, y + cell / 2, cell * .75, color);
        centered('flag', x + cell / 2, y + cell / 2, cell * .83, state < 2 ? tint(0x71859a, .65) : undefined);
        continue;
      }
      const art = !isText(unit) && (this.planes.has(unit.name) ? unit.name : alias(unit.name));
      const m = unit.name === 'level' ? .04 : .09;
      const lit = isText(unit) && puzzle.context.active.has(unit.id);
      add(art || tileId(unit, lit), { x: x + cell * m, y: y + cell * m, width: cell * (1 - m * 2), height: cell * (1 - m * 2) },
        unit.name === 'level' && unit.state === 1 ? tint(0x8c9da7) : undefined);
      if (isText(unit)) stack.set(stackId, count + 1);
    }
    if (this.win && this.win.elapsed >= 90) {
      const progress = (this.win.elapsed - 90) / (winTime - 90);
      const spread = 1 - (1 - progress) ** 2;
      const opacity = Math.min(1, progress * 9) * (1 - progress) ** .85;
      for (const point of this.win.points) {
        const x = originX + (point.x + .5) * cell, y = originY + (point.y + .5) * cell;
        centered('halo', x, y, cell * (1.2 + 3.2 * spread), tint(0x8cffed, .78 * opacity));
        centered('ring', x, y, cell * (.65 + 3.2 * spread), tint(0x9ef9e6, opacity));
        centered('ring', x, y, cell * (.35 + 2.1 * spread), tint(0xffdd9c, .75 * opacity));
        for (let i = 0; i < 14; i++) {
          const angle = i * Math.PI * 2 / 14;
          const radius = cell * (.25 + (1.1 + i % 3 * .28) * spread);
          const color = [0xffdb83, 0xc5fcff, 0xffb8dd][i % 3]!;
          centered('spark', x + Math.cos(angle) * radius, y + Math.sin(angle) * radius - cell * .27 * progress,
            cell * (.18 + i % 4 * .045) * (1 - .6 * progress), tint(color, opacity));
        }
      }
    }
    return commands;
  }
  record(_world: World, context: RenderCommandContext): this {
    const width = context.view?.displayWidth ?? this.engine.displayWidth;
    const height = context.view?.displayHeight ?? this.engine.displayHeight;
    if (!width || !height || !this.renderer || this.disposed) return this;
    if (this.dirty || this.width !== width || this.height !== height) {
      this.cached = this.compose(width, height);
      this.width = width; this.height = height; this.dirty = false;
    }
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);
    this.renderer.render(passEncoder, this.cached, width, height);
    if (ownsPass) passEncoder.end();
    return this;
  }
  suspendForDeviceLoss(): void { }
  recoverGpuResource(device: GPUDevice, signal: AbortSignal): void {
    signal.throwIfAborted();
    this.renderer?.recover(device);
    this.renderer?.uploadAll();
  }
  override destroy(): this {
    if (this.disposed) return this;
    this.disposed = true;
    this.unregister?.();
    this.renderer?.dispose();
    return super.destroy();
  }
}
