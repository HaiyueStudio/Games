import { System, type World } from '@haiyue/engine';
import { beginRenderCommandPass, type IEngine, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import type { IndexedSpriteRenderer, IndexedSpriteDrawCommand, IndexedSpritePlaneDescriptor } from '@haiyue/extensions/experimental/indexed-sprite';
import type { GuiRect } from '@haiyue/engine/gui';
import packedArt from 'virtual:game-image-atlas';
import { isMap, type Puzzle, type GameState } from '../rules/game';
import { directions } from '../rules/properties';
import { isText, spelling, type Unit } from '../rules/syntax';
import { characterLabel } from '../ui/names';
import { editorLayout, playGrid } from './layout';
import { mapRoutes } from './map-routes';
import { LagoonSpriteBatches } from './scene-batches';
import type { Direction } from '../levels/baba-format';
import { editorTile, type Cell } from '../levels/editor';

const icons = ['flag', 'rock', 'wall', 'water', 'lava', 'key', 'door', 'shell', 'algae', 'crab', 'jelly', 'star', 'love', 'ice', 'skull', 'coral'];
const aliases: Record<string, string> = { brick: 'wall', cliff: 'wall', grass: 'algae', foliage: 'algae', hedge: 'algae',
  reed: 'algae', kelp: 'algae', tree: 'algae', flower: 'coral', fungi: 'coral', bog: 'water', fire: 'lava', crystal: 'ice', gem: 'ice',
  rubble: 'rock', pillar: 'rock', gate: 'door', lock: 'door', husk: 'shell', husks: 'shell', level: 'flag' };
const alias = (name: string) => Object.hasOwn(aliases, name) ? aliases[name] : undefined;
type Tint = readonly [number, number, number, number];
const tint = (rgb: number, a = 1): Tint => [(rgb >> 16) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, a];
const walkRows = ['down', 'left', 'right', 'up'] as const;
const walkSheets = [['whale', 'whale-walk/atlas.png'], ['luna', 'luna-walk/atlas.png']] as const;
const walkArt = new Map([['baba', 'whale'], ['cursor', 'whale'], ['keke', 'luna']]);
const walkFrames = 4;
const spritePixels = 160;
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

async function artImages(names: readonly string[]) {
  const atlas = packedArt && image(packedArt.url);
  return Promise.all(names.map(async name => {
    const frame = packedArt?.frames[name];
    if (frame && atlas) return { bitmap: await atlas, ...frame };
    const bitmap = await image('./assets/' + name);
    return { bitmap, x: 0, y: 0, width: bitmap.naturalWidth, height: bitmap.naturalHeight };
  }));
}

type ArtImage = Awaited<ReturnType<typeof artImages>>[number];

function drawArt(ctx: CanvasRenderingContext2D, art: ArtImage): void {
  ctx.drawImage(art.bitmap, art.x, art.y, art.width, art.height, 0, 0, ctx.canvas.width, ctx.canvas.height);
}
function fitIcon(id: string, source: CanvasRenderingContext2D, target: CanvasRenderingContext2D): IndexedSpritePlaneDescriptor {
  const { width, height } = source.canvas;
  const { data } = source.getImageData(0, 0, width, height);
  let left = width, top = height, right = 0, bottom = 0;
  // Ignore faint alpha fringing when measuring the art inside the atlas cell.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3]! < 32) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  const size = target.canvas.width;
  target.clearRect(0, 0, size, size);
  if (right > left && bottom > top) {
    const w = right - left, h = bottom - top;
    const scale = size / Math.max(w, h);
    // Wall courses span the full cell so adjacent solid blocks meet.
    const drawWidth = id === 'wall' ? size : w * scale;
    const drawHeight = id === 'wall' ? size : h * scale;
    target.drawImage(source.canvas, left, top, w, h, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
  }
  return plane(id, target);
}
type LabelTile = Pick<Unit, 'name' | 'type'>;

function labelPlane(unit: LabelTile, lit: boolean, ruleBoxes: HTMLCanvasElement): IndexedSpritePlaneDescriptor {
  const ctx = canvas(spritePixels, spritePixels);
  ctx.scale(spritePixels / 100, spritePixels / 100);
  if (unit.type >= 0) {
    const column = unit.type === 0 ? 0 : unit.type === 2 ? 2 : 1;
    const width = ruleBoxes.width / 3, height = ruleBoxes.height / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ruleBoxes, width * column, lit ? 0 : height, width, height, 0, 0, 100, 100);
    ctx.fillStyle = lit ? ['#092e40', '#2c174a', '#482511'][column]! : '#fff7eb';
  } else {
    // Labels for imported objects without an illustration use a neutral plate.
    ctx.beginPath(); ctx.roundRect(0, 0, 100, 100, 11);
    ctx.fillStyle = '#08182e'; ctx.fill();
    ctx.beginPath(); ctx.roundRect(1.5, 1.5, 97, 92, 10);
    ctx.fillStyle = '#233955'; ctx.fill();
    ctx.strokeStyle = '#6994b7'; ctx.lineWidth = lit ? 3 : 2; ctx.stroke();
    ctx.fillStyle = '#6994b7'; ctx.fillRect(44, 79, 12, 3);
    ctx.fillStyle = '#e4f5ff';
  }
  const text = characterLabel(unit.name) ?? spelling(unit.name).toUpperCase();
  ctx.font = '900 28px Arial, sans-serif';
  const maxWidth = unit.type >= 0 ? 78 : 86;
  const size = Math.max(12, Math.min(28, 28 * maxWidth / Math.max(1, ctx.measureText(text).width)));
  ctx.font = `900 ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 50, 45, maxWidth);
  return plane(tileId(unit, lit), ctx);
}
function tileId(unit: LabelTile, lit: boolean): string {
  return 'word/' + unit.type + '/' + unit.name + '/' + Number(lit);
}

function islandArt(): IndexedSpritePlaneDescriptor[] {
  const tiles = Array.from({ length: 16 }, (_, sides) => {
    const ctx = canvas(64, 64);
    const north = sides & 1, east = sides & 2, south = sides & 4, west = sides & 8;
    const corners = (radius: number) => [north && west, north && east, south && east, south && west]
      .map(round => round ? radius : 0);
    ctx.beginPath(); ctx.roundRect(0, 0, 64, 64, corners(25));
    ctx.fillStyle = '#f4d297'; ctx.fill();
    ctx.clip();
    const left = west ? 13 : -2, top = north ? 13 : -2, right = east ? 13 : -2, bottom = south ? 13 : -2;
    ctx.beginPath(); ctx.roundRect(left, top, 64 - left - right, 64 - top - bottom, corners(16));
    ctx.fillStyle = '#67ac80'; ctx.fill();
    if (sides) {
      ctx.strokeStyle = '#91bb82'; ctx.lineWidth = 3; ctx.stroke();
    }
    return plane(`island/land/${sides}`, ctx);
  });
  const shallows = canvas(80, 80);
  const tide = shallows.createRadialGradient(40, 40, 8, 40, 40, 39);
  tide.addColorStop(0, '#76e6ce9c'); tide.addColorStop(.58, '#58cfbd59'); tide.addColorStop(1, '#41c2b700');
  shallows.fillStyle = tide; shallows.fillRect(0, 0, 80, 80);
  const swell = canvas(64, 32);
  swell.beginPath(); swell.moveTo(6, 15); swell.quadraticCurveTo(14, 8, 24, 15);
  swell.quadraticCurveTo(32, 21, 42, 14); swell.quadraticCurveTo(50, 8, 58, 13);
  swell.strokeStyle = '#fff'; swell.lineWidth = 3; swell.lineCap = 'round'; swell.stroke();
  return [...tiles, plane('island/shallows', shallows), plane('island/swell', swell)];
}

function paintIsland(puzzle: Puzzle, grid: { x: number; y: number; cell: number },
  add: (id: string, rect: GuiRect, color?: Tint) => void): void {
  const { width, height } = puzzle.level;
  const sea = new Set(puzzle.state.units.filter(unit => unit.name === 'water' && !puzzle.context.has(unit, 'hide'))
    .map(unit => unit.y * width + unit.x));
  const land = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !sea.has(y * width + x);
  const { x, y, cell } = grid;
  const ground: { x: number; y: number; sides: number; seed: number }[] = [];
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const px = x + col * cell, py = y + row * cell;
    const seed = ((row * 374761393) ^ (col * 668265263)) >>> 0;
    if (land(col, row)) {
      const sides = Number(!land(col, row - 1)) + 2 * Number(!land(col + 1, row)) +
        4 * Number(!land(col, row + 1)) + 8 * Number(!land(col - 1, row));
      ground.push({ x: px, y: py, sides, seed });
      if (sides) add('island/shallows', { x: px - .7 * cell, y: py - .7 * cell, width: 2.4 * cell, height: 2.4 * cell });
    } else if (seed % 7 === 0) {
      add('island/swell', { x: px + cell * .12, y: py + cell * ((seed % 5) * .09 + .23), width: cell * .72, height: cell * .36 },
        tint(0xa4eddf, .34));
    }
  }
  for (const plot of ground) {
    add(`island/land/${plot.sides}`, { x: plot.x, y: plot.y, width: cell, height: cell },
      tint(plot.seed % 5 === 0 ? 0xf3f7e9 : 0xffffff));
    if (!plot.sides && plot.seed % 6 === 0) add('island/swell',
      { x: plot.x + .18 * cell, y: plot.y + .51 * cell, width: cell * .28, height: cell * .14 }, tint(0xe2efb8, .49));
  }
}

async function loadBackdrop(home: boolean): Promise<IndexedSpritePlaneDescriptor> {
  const file = home ? 'home-lagoon.png' : 'lagoon.png';
  const bitmap = await image('./assets/' + (packedArt?.backgrounds[file] ?? file));
  const { naturalWidth, naturalHeight } = bitmap;
  const scale = Math.min(1, 2560 / naturalWidth, 1440 / naturalHeight);
  const backdrop = canvas(Math.max(1, Math.round(naturalWidth * scale)), Math.max(1, Math.round(naturalHeight * scale)));
  backdrop.imageSmoothingQuality = 'high';
  backdrop.drawImage(bitmap, 0, 0, backdrop.canvas.width, backdrop.canvas.height);
  if (home) {
    backdrop.fillStyle = 'rgba(1, 24, 44, .14)';
    backdrop.fillRect(0, 0, backdrop.canvas.width, backdrop.canvas.height);
  }
  return plane(home ? 'home' : 'lagoon', backdrop);
}

async function loadArt() {
  const [atlas, box, ruleBoxes, ...walkers] = await artImages(['tiles.png', 'box.png', 'rule-boxes.png', ...walkSheets.map(([, file]) => file)]);
  const shape = canvas(2, 2);
  shape.fillStyle = '#fff'; shape.fillRect(0, 0, 2, 2);
  const routeDisc = canvas(40, 40);
  routeDisc.beginPath(); routeDisc.arc(20, 20, 19, 0, Math.PI * 2);
  routeDisc.fillStyle = '#fff'; routeDisc.fill();
  const lock = canvas(48, 48);
  lock.beginPath(); lock.moveTo(15, 23); lock.lineTo(15, 15);
  lock.arc(24, 15, 9, Math.PI, Math.PI * 2); lock.lineTo(33, 23);
  lock.strokeStyle = '#fff'; lock.lineWidth = 5; lock.stroke();
  lock.beginPath(); lock.roundRect(8, 21, 32, 22, 5);
  lock.fillStyle = '#fff'; lock.fill(); lock.clearRect(22, 28, 4, 8);
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
  const result = [plane('white', shape), plane('halo', halo),
    plane('ring', ring), plane('spark', spark), plane('route-disc', routeDisc), plane('route-lock', lock), ...islandArt()];
  const hero = canvas(spritePixels, spritePixels);
  for (const [index, [name]] of walkSheets.entries()) {
    const sheet = walkers[index]!;
    const frameWidth = sheet.width / walkFrames, frameHeight = sheet.height / walkRows.length;
    for (const [row, facing] of walkRows.entries()) for (let frame = 0; frame < walkFrames; frame++) {
      hero.clearRect(0, 0, spritePixels, spritePixels);
      hero.drawImage(sheet.bitmap, sheet.x + frame * frameWidth, sheet.y + row * frameHeight, frameWidth, frameHeight,
        0, 0, spritePixels, spritePixels);
      result.push(plane(`${name}/${facing}/${frame}`, hero));
    }
  }
  const w = atlas!.width / 4, h = atlas!.height / 4;
  const tile = canvas(Math.round(w), Math.round(h));
  const { width: tileWidth, height: tileHeight } = tile.canvas;
  const fitted = canvas(spritePixels, spritePixels);
  fitted.imageSmoothingQuality = 'high';
  for (const [i, id] of icons.entries()) {
    tile.clearRect(0, 0, tileWidth, tileHeight);
    tile.drawImage(atlas!.bitmap, atlas!.x + i % 4 * w, atlas!.y + Math.floor(i / 4) * h, w, h, 0, 0, tileWidth, tileHeight);
    result.push(fitIcon(id, tile, fitted));
  }
  const crate = canvas(box!.width, box!.height);
  drawArt(crate, box!);
  result.push(fitIcon('box', crate, fitted));
  const ruleSheet = canvas(ruleBoxes!.width, ruleBoxes!.height);
  drawArt(ruleSheet, ruleBoxes!);
  return { planes: result, ruleBoxes: ruleSheet.canvas };
}

export class LagoonScene extends System {
  readonly recoveryLabel = 'Dafeiyu 2D puzzle';
  readonly recoverySource = { kind: 'render-system', system: 'LagoonScene' };
  private readonly batches: LagoonSpriteBatches;
  private readonly modeLoads = new Map<boolean, Promise<void>>();
  private readonly labelPages: { renderer: IndexedSpriteRenderer; ids: string[]; bytes: number }[] = [];
  private bundle: GPURenderBundle | undefined;
  private ruleBoxes: HTMLCanvasElement | undefined;
  private readonly planes = new Map<string, IndexedSpritePlaneDescriptor>();
  private readonly previews = new Map<string, HTMLCanvasElement>();
  private readonly engine: IEngine;
  private readonly unregister: (() => void) | undefined;
  private puzzle: Puzzle | null = null;
  private home = true;
  private editorCursor: Cell | undefined;
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

  constructor(engine: IEngine) {
    super(() => false);
    this.engine = engine;
    this.batches = new LagoonSpriteBatches(engine, this.recoveryLabel);
    this.unregister = engine.registerDeviceRecoveryParticipant?.(this);
  }
  prepare(home: boolean): Promise<void> {
    const pending = this.modeLoads.get(home);
    if (pending) return pending;
    const load = Promise.all([loadBackdrop(home), home ? undefined : loadArt()]).then(([backdrop, art]) => {
      if (this.disposed) return;
      this.addPlanes([backdrop, ...(art?.planes ?? [])]);
      if (art) this.ruleBoxes = art.ruleBoxes;
    }).catch(error => { this.modeLoads.delete(home); throw error; });
    this.modeLoads.set(home, load);
    return load;
  }
  private addPlanes(planes: IndexedSpritePlaneDescriptor[]): IndexedSpriteRenderer {
    const renderer = this.batches.add(planes);
    for (const plane of planes) this.planes.set(plane.id, plane);
    this.dirty = true;
    return renderer;
  }
  setHome(home: boolean): void {
    this.home = home;
    this.dirty = true;
    if (home && !this.modeLoads.has(true)) void this.prepare(true).catch(error => {
      if (!this.disposed) console.warn('大肥鱼首页背景读取失败', error);
    });
  }
  setEditorCursor(cursor?: Cell): void { this.editorCursor = cursor; this.dirty = true; }

  editorPreview(name: string, facing: Direction): HTMLCanvasElement {
    const walker = walkArt.get(name === '@spawn' ? 'cursor' : name);
    const key = walker ? `${name}/${facing}` : name;
    const cached = this.previews.get(key);
    if (cached) return cached;
    const ctx = canvas(spritePixels, spritePixels);
    ctx.scale(spritePixels / 96, spritePixels / 96);
    if (name === '@path' || name === '@secret') {
      ctx.strokeStyle = name === '@path' ? '#8debdc' : '#a8c9de';
      ctx.lineWidth = name === '@path' ? 11 : 7;
      ctx.lineCap = 'round';
      if (name === '@secret') ctx.setLineDash([11, 10]);
      ctx.beginPath(); ctx.moveTo(14, 48); ctx.lineTo(82, 48); ctx.stroke();
    } else {
      const draw = (source: IndexedSpritePlaneDescriptor, x: number, y: number, size: number) => {
        const copy = canvas(source.width, source.height);
        const pixels = copy.createImageData(source.width, source.height);
        pixels.data.set(source.pixels);
        copy.putImageData(pixels, 0, 0);
        ctx.drawImage(copy.canvas, x, y, size, size);
      };
      const id = walker ? `${walker}/${directions[facing]}/1` : name === '@link' || name === '@locked' ? 'flag' : alias(name) ?? name;
      const source = this.planes.get(id) ?? labelPlane(editorTile(name) ?? { name, type: -1 }, true, this.ruleBoxes!);
      draw(source, 0, 0, 96);
      if (name === '@locked') {
        ctx.fillStyle = '#183850';
        ctx.beginPath(); ctx.arc(72, 72, 20, 0, Math.PI * 2); ctx.fill();
        draw(this.planes.get('route-lock')!, 57, 57, 30);
      }
    }
    this.previews.set(key, ctx.canvas);
    return ctx.canvas;
  }

  setPuzzle(puzzle: Puzzle, previous?: GameState): void {
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
    const labels = new Map<string, IndexedSpritePlaneDescriptor>();
    const missing: IndexedSpritePlaneDescriptor[] = [];
    for (const unit of puzzle.state.units) {
      if (!isText(unit) && (this.planes.has(unit.name) || alias(unit.name) || walkArt.has(unit.name) || ['tile', 'path'].includes(unit.name))) continue;
      for (const lit of isText(unit) ? [false, true] : [false]) {
        const id = tileId(unit, lit);
        if (labels.has(id)) continue;
        const existing = this.planes.get(id);
        const label = existing ?? labelPlane(unit, lit, this.ruleBoxes!);
        labels.set(id, label);
        if (!existing) missing.push(label);
      }
    }
    if (missing.length) this.addLabels(labels, missing);
    this.dirty = true;
  }
  private addLabels(active: Map<string, IndexedSpritePlaneDescriptor>, missing: IndexedSpritePlaneDescriptor[]): void {
    const bytes = this.labelPages.reduce((sum, page) => sum + page.bytes, 0) + missing.reduce((sum, plane) => sum + plane.pixels.byteLength, 0);
    const compact = this.labelPages.length >= 8 || bytes > 16 * 1024 * 1024;
    const planes = compact ? [...active.values()] : missing;
    const renderer = this.addPlanes(planes);
    if (compact) {
      for (const page of this.labelPages) {
        this.batches.remove(page.renderer);
        for (const id of page.ids) if (!active.has(id)) this.planes.delete(id);
      }
      this.labelPages.length = 0;
      this.bundle = undefined;
    }
    this.labelPages.push({ renderer, ids: planes.map(plane => plane.id), bytes: renderer.stats().gpuBytes });
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
      lunas: this.cached.filter(draw => draw.spriteId.startsWith('luna/')).map(draw => draw.spriteId),
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
    const background = this.home ? 'home' : 'lagoon';
    const art = this.planes.get(background);
    if (!art) { this.bounds.cell = 0; return commands; }
    const cover = Math.max(width / art.width, height / art.height);
    const bgWidth = art.width * cover, bgHeight = art.height * cover;
    const anchor = this.home ? .75 : .5;
    add(background, { x: (width - bgWidth) * anchor, y: (height - bgHeight) / 2, width: bgWidth, height: bgHeight });
    if (this.home) {
      this.bounds.cell = 0;
      return commands;
    }
    rect(0, 0, width, height, tint(0x041426, this.editorCursor ? .37 : .48));
    const puzzle = this.puzzle;
    if (!puzzle) return commands;
    const { width: cols, height: rows, edges, island } = puzzle.level;
    const overworld = isMap(puzzle.level);
    let { x: originX, y: originY, cell } = playGrid(width, height, cols, rows);
    if (this.editorCursor) {
      const { board } = editorLayout(width, height, puzzle.level);
      rect(board.x, board.y + 4, board.width, board.height, tint(0x021021, .64));
      rect(board.x, board.y, board.width, board.height, tint(0x3a8598, .85));
      rect(board.x + 1, board.y + 1, board.width - 2, board.height - 2, tint(0x0c263a));
      const pad = Math.min(17, board.width * .025, board.height * .05);
      cell = Math.max(.1, Math.min(72, (board.width - pad * 2) / cols, (board.height - pad * 2) / rows));
      originX = board.x + (board.width - cols * cell) / 2;
      originY = board.y + (board.height - rows * cell) / 2;
    }
    Object.assign(this.bounds, { x: originX, y: originY, cell });
    if (island) paintIsland(puzzle, { x: originX, y: originY, cell }, add);
    else {
      rect(originX - 1, originY - 1, cols * cell + 2, rows * cell + 2, tint(0x345e72));
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const x = originX + col * cell, y = originY + row * cell;
        const edge = edges.has(row * cols + col);
        const color = edge ? ((row + col) % 2 ? 0x173f53 : 0x1b4658) : ((row + col) % 2 ? 0x123047 : 0x15364e);
        rect(x, y, cell - Math.min(.6, cell / 8), cell - Math.min(.6, cell / 8), tint(color));
        if (edge && cell > 10) rect(x + cell * .45, y + cell * .43, cell * .1, cell * .1, tint(0x428093, .45));
      }
    }
    const dot = (x: number, y: number, s: number, color: Tint) => rect(originX + (x + .5 - s / 2) * cell,
      originY + (y + .5 - s / 2) * cell, cell * s, cell * s, color);
    const centered = (id: string, x: number, y: number, size: number, color?: Tint) =>
      add(id, { x: x - size / 2, y: y - size / 2, width: size, height: size }, color);
    if (overworld) {
      const routes = mapRoutes(puzzle);
      const center = ({ x, y }: Cell) => [originX + (x + .5) * cell, originY + (y + .5) * cell] as const;
      const line = (from: Cell, to: Cell, size: number, color: Tint, start = 0, end = 1) => {
        const [x, y] = center(from), [tx, ty] = center(to);
        const dx = tx - x, dy = ty - y, stroke = cell * size;
        if (from.y === to.y) rect(x + dx * start, y - stroke / 2, dx * (end - start), stroke, color);
        else rect(x - stroke / 2, y + dy * start, stroke, dy * (end - start), color);
      };
      const dashed = island ? tint(0xd2e4ef, .9) : tint(0xa8c9de, .65);
      for (const { from, to, open } of routes.segments) if (!open) {
        line(from, to, .1, dashed, .12, .38);
        line(from, to, .1, dashed, .62, .88);
      }
      const openSegments = routes.segments.filter(segment => segment.open);
      const openPaths = routes.paths.filter(path => path.open);
      for (const [size, color] of [[.36, tint(0x082a3a)], [.27, tint(0x387f88)], [.13, tint(0x8debdc)]] as const) {
        for (const { from, to } of openSegments) line(from, to, size, color);
        for (const path of openPaths) {
          const [x, y] = center(path);
          centered('route-disc', x, y, cell * size, color);
        }
      }
      for (const path of routes.paths) {
        const [x, y] = center(path);
        if (!path.open && !path.gate) centered('route-disc', x, y, cell * .13, dashed);
        if (path.gate) {
          centered('route-disc', x, y, cell * .73, tint(0x081e30));
          centered('ring', x, y, cell * .74, tint(0xc49b68));
          centered('route-lock', x, y, cell * .5, tint(0xffd79a));
        }
      }
    } else for (const path of puzzle.openPaths) {
      if (path.x >= 0 && path.x < cols && path.y >= 0 && path.y < rows) dot(path.x, path.y, .15, tint(0x52a9b3));
    }
    const stack = new Map<number, number>();
    const t = 1 - (1 - this.elapsed / stepTime) ** 3;
    for (const unit of [...puzzle.state.units].sort((a, b) => a.layer - b.layer || a.y - b.y || a.id - b.id)) {
      if (island && unit.name === 'water' || puzzle.context.has(unit, 'hide') || unit.name === 'level' && unit.state === 0) continue;
      const old = this.from.get(unit.id);
      const ox = old ? old.x + (unit.x - old.x) * t : unit.x;
      const oy = old ? old.y + (unit.y - old.y) * t : unit.y;
      const stackId = unit.y * cols + unit.x;
      const count = stack.get(stackId) ?? 0;
      const x = originX + ox * cell, y = originY + oy * cell;
      if (unit.name === 'path' || unit.name === 'tile') { rect(x, y, cell, cell, tint(0x447287, .45)); continue; }
      if (puzzle.context.has(unit, 'you') || puzzle.context.has(unit, 'you2') || puzzle.context.has(unit, 'select')) {
        add('halo', { x: x - cell * .13, y: y - cell * .13, width: cell * 1.26, height: cell * 1.26 });
      }
      const walker = walkArt.get(unit.name);
      if (walker) {
        const walking = this.elapsed < stepTime && old && (old.x !== unit.x || old.y !== unit.y);
        const frame = walking ? Math.floor(this.walkClock / (stepTime / walkFrames)) : 1;
        const sprite = `${walker}/${directions[unit.dir]}/${frame}`;
        add(sprite, { x, y, width: cell, height: cell });
        continue;
      }
      if (overworld && unit.marker && unit.name === 'level') {
        const state = unit.state ?? 0;
        const color = tint(state >= 3 ? 0x8ef2bf : state === 2 ? 0xffdf92 : 0x6391aa);
        centered('halo', x + cell / 2, y + cell / 2, cell, color);
        centered('ring', x + cell / 2, y + cell / 2, cell * .92, color);
        add('flag', { x, y, width: cell, height: cell }, state < 2 ? tint(0x71859a, .65) : undefined);
        continue;
      }
      const art = !isText(unit) && (this.planes.has(unit.name) ? unit.name : alias(unit.name));
      const lit = isText(unit) && puzzle.context.active.has(unit.id);
      // Keep the offset stack cue inside the same cell as the bottom word.
      const inset = isText(unit) ? Math.min(.13, count * .08) * cell : 0;
      add(art || tileId(unit, lit), { x: x + inset, y, width: cell - inset, height: cell - inset },
        unit.name === 'level' && unit.state === 1 ? tint(0x8c9da7) : undefined);
      if (isText(unit)) stack.set(stackId, count + 1);
    }
    if (this.editorCursor) {
      const x = originX + this.editorCursor.x * cell, y = originY + this.editorCursor.y * cell;
      const stroke = Math.max(1, cell * .04), color = tint(0xacefe3, .95);
      rect(x, y, cell, stroke, color); rect(x, y + cell - stroke, cell, stroke, color);
      rect(x, y, stroke, cell, color); rect(x + cell - stroke, y, stroke, cell, color);
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
    if (!width || !height || this.disposed) return this;
    if (this.dirty || this.width !== width || this.height !== height) {
      this.cached = this.compose(width, height);
      this.bundle = this.cached.length ? this.batches.prepare(this.cached, width, height) : undefined;
      this.width = width; this.height = height; this.dirty = false;
    }
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);
    if (this.bundle) passEncoder.executeBundles([this.bundle]);
    if (ownsPass) passEncoder.end();
    return this;
  }
  suspendForDeviceLoss(): void { }
  recoverGpuResource(device: GPUDevice, signal: AbortSignal): void {
    signal.throwIfAborted();
    this.batches.recover(device);
    this.bundle = undefined;
    this.dirty = true;
  }
  override destroy(): this {
    if (this.disposed) return this;
    this.disposed = true;
    this.unregister?.();
    this.bundle = undefined;
    this.ruleBoxes = undefined;
    this.batches.dispose();
    this.planes.clear();
    this.previews.clear();
    this.modeLoads.clear();
    this.labelPages.length = 0;
    return super.destroy();
  }
}
