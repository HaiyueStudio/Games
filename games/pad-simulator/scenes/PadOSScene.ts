export interface ScreenPointerEvent {
  x: number;
  y: number;
  time: number;
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

import { EmbeddedScenePlayer } from './EmbeddedScenePlayer';
import { CalendarPuzzlePadGame } from './CalendarPuzzlePadGame';
import { GltfViewerScene } from './GltfViewerScene';
import { PerpetualCalendarPadApp } from './PerpetualCalendarPadApp';
import { SpineViewerScene } from './SpineViewerScene';
import { SudokuPadGame } from './SudokuPadGame';
import { requiredItemAt, requiredNumberAt } from '../../arrayAccess';

function cardColumnAt<T>(columns: T[][], index: number): T[] {
  return requiredItemAt(columns, index, 'PadOS card columns');
}

interface IconSpec {
  id: string;
  label: string;
  kind: 'game' | 'app';
  colors: [string, string];
  iconUrl?: string;
  sceneUrl?: string;
}

interface RuntimeIcon extends IconSpec {
  page: number;
  slot: number;
}

interface BuiltinPadGame {
  readonly canvas: HTMLCanvasElement;
  update(time: number, delta: number): void;
  pointerDown(event: ScreenPointerEvent): void;
  pointerMove(event: ScreenPointerEvent): void;
  pointerUp(event: ScreenPointerEvent): void;
  stop?(): void;
}

interface PlayerViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

type SceneMode = 'home' | 'camera' | 'game' | 'builtin-game' | 'spine' | 'gltf' | 'settings';
type SettingsControl = 'brightness' | null;
type ScreenOrientation = 'portrait' | 'landscape';

interface IconHitRect {
  icon: RuntimeIcon;
  x: number;
  y: number;
  size: number;
}

const ICONS: IconSpec[] = [
  { id: 'sokoban-3d', label: 'Sokoban', kind: 'game', colors: ['#f59e0b', '#7c2d12'], iconUrl: './assets/icons/sokoban.svg' },
  { id: 'spider-solitaire', label: 'Spider', kind: 'game', colors: ['#047857', '#0f172a'], iconUrl: './assets/icons/spider-solitaire.svg' },
  { id: 'sudoku', label: 'Sudoku', kind: 'game', colors: ['#f3efe7', '#31506f'], iconUrl: './assets/icons/sudoku.svg' },
  { id: 'calendar-puzzle', label: 'Calendar', kind: 'game', colors: ['#eef6f1', '#c9904f'], iconUrl: './assets/icons/calendar-puzzle.svg' },
  { id: 'tetris', label: 'Tetris', kind: 'game', colors: ['#33c9ff', '#2454ff'], iconUrl: './assets/icons/tetris.svg', sceneUrl: './scenes/tetris-starter.scene.json' },
  { id: 'billiards', label: 'Billiards', kind: 'game', colors: ['#0f8a4b', '#022d1b'], iconUrl: './assets/icons/billiards.svg', sceneUrl: './scenes/billiards-3d-import.scene.json' },
  { id: 'ball-maze', label: 'Maze', kind: 'game', colors: ['#38bdf8', '#1e3a8a'], iconUrl: './assets/icons/ball-maze.svg', sceneUrl: './scenes/ball-maze-3d-import.scene.json' },
  { id: '2048', label: '2048', kind: 'game', colors: ['#f59e0b', '#ef4444'], iconUrl: './assets/icons/2048.svg', sceneUrl: './scenes/2048-starter.scene.json' },
  { id: 'snake', label: 'Snake', kind: 'game', colors: ['#16a34a', '#052e16'], iconUrl: './assets/icons/snake.svg', sceneUrl: './scenes/snake-starter.scene.json' },
  { id: 'minesweeper', label: 'Mines', kind: 'game', colors: ['#64748b', '#111827'], iconUrl: './assets/icons/minesweeper.svg', sceneUrl: './scenes/minesweeper-starter.scene.json' },
  { id: 'cylinder-tetris', label: 'Cylinder', kind: 'game', colors: ['#14b8a6', '#4338ca'], iconUrl: './assets/icons/cylinder-tetris.svg', sceneUrl: './scenes/tetris-cylinder-3d.scene.json' },
  { id: 'hex-mines', label: 'Hex Mines', kind: 'game', colors: ['#84cc16', '#166534'], iconUrl: './assets/icons/hex-mines.svg', sceneUrl: './scenes/hex-minesweeper-starter.scene.json' },
  { id: 'perpetual-calendar', label: '万年历', kind: 'app', colors: ['#2563eb', '#172033'], iconUrl: './assets/icons/perpetual-calendar.svg' },
  { id: 'camera', label: 'Camera', kind: 'app', colors: ['#e5e7eb', '#94a3b8'], iconUrl: './assets/icons/camera.svg' },
  { id: 'spine-viewer', label: 'Spine', kind: 'app', colors: ['#f97316', '#7c2d12'], iconUrl: './assets/icons/spine.svg' },
  { id: 'gltf-viewer', label: 'glTF', kind: 'app', colors: ['#22d3ee', '#1d4ed8'], iconUrl: './assets/icons/gltf-viewer.svg' },
  { id: 'settings', label: 'Settings', kind: 'app', colors: ['#64748b', '#1f2937'], iconUrl: './assets/icons/settings.svg' },
  { id: 'clock', label: 'Clock', kind: 'app', colors: ['#f8fafc', '#cbd5e1'] },
];

const SCREEN_W = 1024;
const SCREEN_H = 1458;
const GRID_COLS = 4;
const GRID_ROWS = 5;
const LANDSCAPE_GRID_COLS = 5;
const LANDSCAPE_GRID_ROWS = 4;
const PAGE_COUNT = 2;
const SWIPE_DISTANCE = 90;
const TAP_DISTANCE = 24;
const ICON_START_X = 122;
const ICON_START_Y = 166;
const ICON_CELL_W = 208;
const ICON_CELL_H = 212;
const ICON_SIZE = 122;
const SHUTTER_X = SCREEN_W / 2;
const SHUTTER_Y = SCREEN_H - 118;
const SHUTTER_R = 48;
const LONG_PRESS_MS = 520;
const LONG_PRESS_MOVE = 18;
const SETTINGS_WALLPAPER_BUTTON = { x: 112, y: 236, width: 800, height: 86 };
const SETTINGS_BRIGHTNESS_TRACK = { x: 176, y: 510, width: 672, height: 44 };
const SETTINGS_FPS_CHECKBOX = { x: 112, y: 690, size: 54 };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

class SokobanPadGame implements BuiltinPadGame {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private levels = [
    { name: 'Warehouse Gate', map: ['########', '#  .   #', '#  $   #', '#  #   #', '#  @   #', '########'] },
    { name: 'Twin Crates', map: ['#########', '#   #   #', '# . $ . #', '#   $   #', '#   @   #', '#########'] },
    { name: 'Corner Work', map: ['##########', '#   .    #', '# # ## # #', '# $    $ #', '#   @    #', '#   .    #', '##########'] },
    { name: 'Loading Dock', map: ['###########', '#    #    #', '# .$   $. #', '#  ## ##  #', '#    @    #', '# .     . #', '###########'] },
  ];
  private level = 0;
  private walls = new Set<string>();
  private targets = new Set<string>();
  private boxes: Array<{ x: number; y: number }> = [];
  private player = { x: 0, y: 0 };
  private width = 0;
  private height = 0;
  private moves = 0;
  private down: ScreenPointerEvent | null = null;

  constructor() {
    this.canvas.width = 780;
    this.canvas.height = 1110;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;
    this.loadLevel(0);
  }

  update(): void { this.render(); }
  pointerDown(event: ScreenPointerEvent): void { this.down = event; }
  pointerMove(): void {}
  pointerUp(event: ScreenPointerEvent): void {
    if (!this.down) return;
    const dx = event.x - this.down.x;
    const dy = event.y - this.down.y;
    this.down = null;
    if (Math.hypot(dx, dy) < 14) {
      if (event.y < 88 && event.x > this.canvas.width - 180) this.loadLevel(this.level + 1);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? 1 : -1, 0);
    else this.tryMove(0, dy > 0 ? 1 : -1);
  }

  private loadLevel(index: number): void {
    this.level = (index + this.levels.length) % this.levels.length;
    this.walls.clear();
    this.targets.clear();
    this.boxes = [];
    this.moves = 0;
    const level = requiredItemAt(this.levels, this.level, 'PadOS Sokoban levels');
    const map = level.map;
    this.height = map.length;
    this.width = Math.max(...map.map(row => row.length));
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = (map[y] ?? '').charAt(x) || ' ';
        if (cell === '#') this.walls.add(`${x},${y}`);
        if (cell === '.' || cell === '*' || cell === '+') this.targets.add(`${x},${y}`);
        if (cell === '$' || cell === '*') this.boxes.push({ x, y });
        if (cell === '@' || cell === '+') this.player = { x, y };
      }
    }
  }

  private tryMove(dx: number, dy: number): void {
    const next = { x: this.player.x + dx, y: this.player.y + dy };
    if (this.walls.has(`${next.x},${next.y}`)) return;
    const box = this.boxes.find(item => item.x === next.x && item.y === next.y);
    if (box) {
      const boxNext = { x: box.x + dx, y: box.y + dy };
      if (this.walls.has(`${boxNext.x},${boxNext.y}`) || this.boxes.some(item => item.x === boxNext.x && item.y === boxNext.y)) return;
      box.x = boxNext.x;
      box.y = boxNext.y;
    }
    this.player = next;
    this.moves++;
    if (this.boxes.every(box => this.targets.has(`${box.x},${box.y}`))) setTimeout(() => this.loadLevel(this.level + 1), 280);
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bg = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    bg.addColorStop(0, '#101827');
    bg.addColorStop(1, '#172033');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 38px Arial, sans-serif';
    ctx.fillText('Sokoban', 42, 56);
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(`${requiredItemAt(this.levels, this.level, 'PadOS Sokoban levels').name} · ${this.moves} moves`, 42, 90);
    ctx.fillText('Next', this.canvas.width - 118, 58);

    const tile = Math.min((this.canvas.width - 90) / this.width, (this.canvas.height - 190) / this.height);
    const ox = (this.canvas.width - tile * this.width) / 2;
    const oy = 150 + (this.canvas.height - 190 - tile * this.height) / 2;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const key = `${x},${y}`;
        ctx.fillStyle = this.walls.has(key) ? '#334155' : '#263447';
        roundRect(ctx, ox + x * tile + 2, oy + y * tile + 2, tile - 4, tile - 4, 8);
        ctx.fill();
        if (this.targets.has(key)) {
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(ox + (x + 0.5) * tile, oy + (y + 0.5) * tile, tile * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const box of this.boxes) {
      ctx.fillStyle = this.targets.has(`${box.x},${box.y}`) ? '#22c55e' : '#d97706';
      roundRect(ctx, ox + box.x * tile + tile * 0.16, oy + box.y * tile + tile * 0.16, tile * 0.68, tile * 0.68, 10);
      ctx.fill();
    }
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(ox + (this.player.x + 0.5) * tile, oy + (this.player.y + 0.5) * tile, tile * 0.31, 0, Math.PI * 2);
    ctx.fill();
  }
}

class SpiderSolitairePadGame implements BuiltinPadGame {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private columns: Array<Array<{ id: number; rank: number; faceUp: boolean }>> = [];
  private stock: Array<{ id: number; rank: number; faceUp: boolean }> = [];
  private nextId = 1;
  private drag: { column: number; index: number; x: number; y: number; offsetX: number; offsetY: number } | null = null;
  private flights: Array<{
    card: { id: number; rank: number; faceUp: boolean } | null;
    from: { x: number; y: number };
    to: { x: number; y: number };
    start: number;
    duration: number;
    hideId?: number;
    flip?: boolean;
    layer?: number;
  }> = [];
  private hiddenIds = new Set<number>();
  private pendingCollectRuns = false;
  private runs = 0;
  private moves = 0;

  constructor() {
    this.canvas.width = 1458;
    this.canvas.height = 1024;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;
    this.newGame();
  }

  update(time: number): void {
    const before = this.flights.length;
    this.flights = this.flights.filter(flight => time < flight.start + flight.duration);
    if (before !== this.flights.length) this.hiddenIds = new Set(this.flights.map(flight => flight.hideId).filter((id): id is number => id != null));
    if (before > 0 && this.flights.length === 0 && this.pendingCollectRuns) {
      this.pendingCollectRuns = false;
      this.collectRuns();
    }
    this.render(time);
  }
  pointerDown(event: ScreenPointerEvent): void {
    if (this.flights.length > 0) return;
    if (event.y < 94 && event.x > this.canvas.width - 150) { this.deal(); return; }
    const hit = this.hitCard(event.x, event.y);
    if (!hit || !this.isMovable(hit.column, hit.index)) return;
    const pos = this.cardPosition(hit.column, hit.index);
    this.drag = { ...hit, x: event.x, y: event.y, offsetX: pos.x - event.x, offsetY: pos.y - event.y };
  }
  pointerMove(event: ScreenPointerEvent): void {
    if (this.drag) {
      this.drag.x = event.x;
      this.drag.y = event.y;
    }
  }
  pointerUp(event: ScreenPointerEvent): void {
    if (this.flights.length > 0) return;
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    const target = this.columnAt(event.x);
    if (target == null || target === drag.column) return;
    const source = cardColumnAt(this.columns, drag.column);
    const stack = source.slice(drag.index);
    const dest = cardColumnAt(this.columns, target);
    const top = dest[dest.length - 1];
    const first = stack[0];
    if (dest.length === 0 || (top && first && top.faceUp && top.rank === first.rank + 1)) {
      source.splice(drag.index);
      dest.push(...stack);
      this.flipTop(drag.column);
      this.moves++;
      this.collectRuns();
    }
  }

  private newGame(): void {
    this.columns = Array.from({ length: 10 }, () => []);
    this.stock = [];
    this.runs = 0;
    this.moves = 0;
    this.flights = [];
    this.pendingCollectRuns = false;
    this.hiddenIds.clear();
    this.nextId = 1;
    for (let d = 0; d < 8; d++) for (let r = 1; r <= 13; r++) this.stock.push({ id: this.nextId++, rank: r, faceUp: false });
    this.stock.sort(() => Math.random() - 0.5);
    const deal = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5];
    for (let c = 0; c < 10; c++) {
      const dealCount = requiredNumberAt(deal, c, 'PadOS Spider initial deal');
      for (let i = 0; i < dealCount; i++) {
        const card = this.stock.pop();
        if (!card) continue;
        card.faceUp = i === dealCount - 1;
        cardColumnAt(this.columns, c).push(card);
      }
    }
  }

  private deal(): void {
    if (this.stock.length < 10 || this.columns.some(col => col.length === 0)) return;
    const now = performance.now();
    const stockFrom = this.stockPosition(Math.max(0, Math.floor(this.stock.length / 10) - 1));
    for (let c = 0; c < 10; c++) {
      const card = this.stock.pop();
      if (!card) continue;
      card.faceUp = true;
      const destination = cardColumnAt(this.columns, c);
      const targetIndex = destination.length;
      destination.push(card);
      this.flights.push({
        card,
        from: { x: stockFrom.x + c * 1.2, y: stockFrom.y },
        to: this.cardPosition(c, targetIndex),
        start: now + c * 42,
        duration: 860,
        hideId: card.id,
        flip: true,
        layer: c,
      });
    }
    this.hiddenIds = new Set(this.flights.map(flight => flight.hideId).filter((id): id is number => id != null));
    this.pendingCollectRuns = true;
    this.moves++;
  }

  private isMovable(column: number, index: number): boolean {
    const col = cardColumnAt(this.columns, column);
    for (let i = index; i < col.length; i++) {
      const card = requiredItemAt(col, i, 'PadOS Spider cards');
      if (!card.faceUp) return false;
      if (i > index && requiredItemAt(col, i - 1, 'PadOS Spider cards').rank !== card.rank + 1) return false;
    }
    return true;
  }

  private collectRuns(): void {
    for (let column = 0; column < this.columns.length; column++) {
      const col = cardColumnAt(this.columns, column);
      if (col.length < 13) continue;
      const run = col.slice(-13);
      if (run.every((card, i) => card.faceUp && card.rank === 13 - i)) {
        const startIndex = col.length - 13;
        const now = performance.now();
        run.forEach((card, i) => {
          this.flights.push({
            card,
            from: this.cardPosition(column, startIndex + i),
            to: this.runPosition(this.runs, i),
            start: now + i * 16,
            duration: 680,
            layer: i,
          });
        });
        col.splice(col.length - 13, 13);
        this.runs++;
      }
    }
  }
  private flipTop(column: number): void {
    const col = cardColumnAt(this.columns, column);
    const top = col[col.length - 1];
    if (top) top.faceUp = true;
  }
  private columnAt(x: number): number | null {
    const w = 118;
    const gap = 22;
    const start = 50;
    const c = Math.floor((x - start) / (w + gap));
    return c >= 0 && c < 10 ? c : null;
  }
  private cardPosition(column: number, index: number): { x: number; y: number } {
    return { x: 50 + column * 140, y: 168 + index * 34 };
  }
  private stockPosition(index: number): { x: number; y: number } {
    return { x: 42 + index * 8, y: 112 + index * 3 };
  }
  private runPosition(run: number, offset: number): { x: number; y: number } {
    return { x: 870 + run * 58 + offset * 1.3, y: 112 + offset * 0.8 };
  }
  private hitCard(x: number, y: number): { column: number; index: number } | null {
    for (let c = 9; c >= 0; c--) {
      const col = cardColumnAt(this.columns, c);
      for (let i = col.length - 1; i >= 0; i--) {
        const pos = this.cardPosition(c, i);
        if (x >= pos.x && x <= pos.x + 118 && y >= pos.y && y <= pos.y + 156) return { column: c, index: i };
      }
    }
    return null;
  }
  private render(time = performance.now()): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0f6b48';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 40px Arial, sans-serif';
    ctx.fillText('Spider Solitaire', 42, 58);
    ctx.font = '700 24px Arial, sans-serif';
    ctx.fillText(`Moves ${this.moves}   Runs ${this.runs}/8   Stock ${this.stock.length}`, 42, 96);
    ctx.fillText('Deal', this.canvas.width - 118, 58);
    for (let i = 0; i < Math.floor(this.stock.length / 10); i++) this.drawCard(42 + i * 8, 112 + i * 3, null);
    for (let i = 0; i < this.runs; i++) for (let j = 0; j < 4; j++) this.drawCard(this.runPosition(i, j).x, this.runPosition(i, j).y, { rank: 13 - j * 3, faceUp: true });
    for (let c = 0; c < 10; c++) {
      const column = cardColumnAt(this.columns, c);
      for (let i = 0; i < column.length; i++) {
        const card = requiredItemAt(column, i, 'PadOS Spider cards');
        if (this.hiddenIds.has(card.id)) continue;
        if (this.drag && this.drag.column === c && i >= this.drag.index) continue;
        const pos = this.cardPosition(c, i);
        this.drawCard(pos.x, pos.y, card);
      }
    }
    if (this.drag) {
      const stack = cardColumnAt(this.columns, this.drag.column).slice(this.drag.index);
      stack.forEach((card, i) => this.drawCard(this.drag!.x + this.drag!.offsetX, this.drag!.y + this.drag!.offsetY + i * 34, card));
    }
    this.drawFlights(time);
  }
  private drawFlights(time: number): void {
    for (const flight of this.flights) {
      const raw = clamp((time - flight.start) / flight.duration, 0, 1);
      const t = easeOut(raw);
      const layer = flight.layer ?? 0;
      const air = Math.sin(Math.PI * raw);
      const x = flight.from.x + (flight.to.x - flight.from.x) * t + air * (layer % 2 === 0 ? 5 : -5);
      const y = flight.from.y + (flight.to.y - flight.from.y) * t - air * (88 + layer * 2);
      const card = flight.flip && raw < 0.5 ? null : flight.card;
      this.drawCard(x, y, card);
    }
  }
  private drawCard(x: number, y: number, card: { rank: number; faceUp: boolean } | null): void {
    const ctx = this.ctx;
    roundRect(ctx, x, y, 118, 156, 12);
    ctx.fillStyle = card?.faceUp ? '#fffaf0' : '#1d4ed8';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.stroke();
    if (!card?.faceUp) return;
    const label = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][card.rank - 1] ?? '?';
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 28px Arial, sans-serif';
    ctx.fillText(label, x + 12, y + 32);
    ctx.font = '700 42px Arial, sans-serif';
    ctx.fillText('♠', x + 42, y + 94);
  }
}

export class PadOSScene {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private clockCanvas: HTMLCanvasElement;
  private clockCtx: CanvasRenderingContext2D;
  private bg: HTMLImageElement | null = null;
  private iconImages = new Map<string, HTMLImageElement>();
  private icons: RuntimeIcon[];
  private page = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragX = 0;
  private dragY = 0;
  private dragging = false;
  private animFrom = 0;
  private animTo = 0;
  private animStart = 0;
  private animDuration = 260;
  private mode: SceneMode = 'home';
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private cameraState: 'idle' | 'requesting' | 'ready' | 'denied' = 'idle';
  private cameraError = '';
  private cameraRequestId = 0;
  private cameraPressing = false;
  private flashUntil = 0;
  private capturedCanvas: HTMLCanvasElement;
  private capturedCtx: CanvasRenderingContext2D;
  private hasCapture = false;
  private player: EmbeddedScenePlayer | null = null;
  private builtinGame: BuiltinPadGame | null = null;
  private playerViewport: PlayerViewport | null = null;
  private playerLoading = false;
  private playerError = '';
  private deviceOrientation: ScreenOrientation = 'portrait';
  private orientationAngle = 0;
  private orientationFromAngle = 0;
  private orientationTargetAngle = 0;
  private orientationAnimStart = 0;
  private orientationAnimDuration = 320;
  private playerOrientation: ScreenOrientation = 'portrait';
  private spineViewer: SpineViewerScene | null = null;
  private spineLoading = false;
  private spineError = '';
  private gltfViewer: GltfViewerScene | null = null;
  private gltfLoading = false;
  private gltfError = '';
  private gamePointerStart: ScreenPointerEvent | null = null;
  private gameLongPressTimer: number | null = null;
  private gameLongPressFired = false;
  private fileInput: HTMLInputElement;
  private brightness = 0.5;
  private showFps = false;
  private activeSettingsControl: SettingsControl = null;
  private fps = 0;
  private fpsLastTime = 0;
  private fpsFrameCount = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;

    this.clockCanvas = document.createElement('canvas');
    this.clockCanvas.width = 160;
    this.clockCanvas.height = 160;
    const clockCtx = this.clockCanvas.getContext('2d');
    if (!clockCtx) throw new Error('2D canvas is not supported');
    this.clockCtx = clockCtx;

    this.capturedCanvas = document.createElement('canvas');
    this.capturedCanvas.width = 240;
    this.capturedCanvas.height = 320;
    const capturedCtx = this.capturedCanvas.getContext('2d');
    if (!capturedCtx) throw new Error('2D canvas is not supported');
    this.capturedCtx = capturedCtx;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    Object.assign(this.fileInput.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      opacity: '0',
      pointerEvents: 'none',
    });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        this.bg = image;
      };
      image.onerror = () => URL.revokeObjectURL(url);
      image.src = url;
      this.fileInput.value = '';
    });
    document.body.append(this.fileInput);

    let gameSlot = 0;
    let appSlot = 0;
    this.icons = ICONS.map(icon => ({
      ...icon,
      page: icon.kind === 'game' ? 0 : 1,
      slot: icon.kind === 'game' ? gameSlot++ : appSlot++,
    }));
  }

  async load(): Promise<void> {
    const [bg] = await Promise.all([
      loadImage('./assets/bg.webp'),
      this.loadIconImages(),
    ]);
    this.bg = bg;
  }

  private async loadIconImages(): Promise<void> {
    const specs = ICONS.filter(icon => icon.iconUrl);
    const results = await Promise.allSettled(specs.map(async icon => {
      const image = await loadImage(icon.iconUrl!);
      this.iconImages.set(icon.id, image);
    }));
    for (const result of results) {
      if (result.status === 'rejected') console.warn(result.reason);
    }
  }

  pointerDown(event: ScreenPointerEvent): void {
    if (this.mode === 'spine') {
      this.spineViewer?.dispatchPointer('pointerdown', event.x, event.y, this.pointerOptions(event));
      return;
    }
    if (this.mode === 'gltf') {
      this.gltfViewer?.dispatchPointer('pointerdown', event.x, event.y, this.pointerOptions(event));
      return;
    }
    if (this.mode === 'game') {
      const point = this.playerPoint(event);
      this.player?.dispatchPointer('pointerdown', point.x, point.y, this.pointerOptions(event));
      this.startGameLongPress(event);
      return;
    }
    if (this.mode === 'builtin-game') {
      this.builtinGame?.pointerDown(this.builtinGamePoint(event));
      return;
    }
    if (this.mode === 'camera') {
      this.cameraPressing = this.isShutterHit(event.x, event.y);
      return;
    }
    if (this.mode === 'settings') {
      this.handleSettingsPointerDown(event);
      return;
    }
    const homeEvent = this.mapPointerEvent(event, this.deviceOrientation);
    this.dragging = true;
    this.dragStartX = homeEvent.x;
    this.dragStartY = homeEvent.y;
    this.dragX = homeEvent.x;
    this.dragY = homeEvent.y;
    this.animFrom = this.page;
    this.animTo = this.page;
  }

  pointerMove(event: ScreenPointerEvent): void {
    if (this.mode === 'spine') {
      this.spineViewer?.dispatchPointer('pointermove', event.x, event.y, this.pointerOptions(event));
      return;
    }
    if (this.mode === 'gltf') {
      this.gltfViewer?.dispatchPointer('pointermove', event.x, event.y, this.pointerOptions(event));
      return;
    }
    if (this.mode === 'game') {
      const point = this.playerPoint(event);
      this.player?.dispatchPointer('pointermove', point.x, point.y, this.pointerOptions(event));
      if (this.gamePointerStart && Math.hypot(event.x - this.gamePointerStart.x, event.y - this.gamePointerStart.y) > LONG_PRESS_MOVE) {
        this.cancelGameLongPress();
      }
      return;
    }
    if (this.mode === 'builtin-game') {
      this.builtinGame?.pointerMove(this.builtinGamePoint(event));
      return;
    }
    if (this.mode === 'settings') {
      this.handleSettingsPointerMove(event);
      return;
    }
    if (!this.dragging) return;
    const homeEvent = this.mapPointerEvent(event, this.deviceOrientation);
    this.dragX = homeEvent.x;
    this.dragY = homeEvent.y;
  }

  pointerUp(event: ScreenPointerEvent): void {
    if (this.mode === 'spine') {
      this.spineViewer?.dispatchPointer('pointerup', event.x, event.y, this.pointerOptions(event));
      return;
    }
    if (this.mode === 'gltf') {
      this.gltfViewer?.dispatchPointer('pointerup', event.x, event.y, this.pointerOptions(event));
      return;
    }
    if (this.mode === 'game') {
      const fired = this.gameLongPressFired;
      this.cancelGameLongPress();
      if (!fired) {
        const point = this.playerPoint(event);
        this.player?.dispatchPointer('pointerup', point.x, point.y, this.pointerOptions(event));
      }
      return;
    }
    if (this.mode === 'builtin-game') {
      this.builtinGame?.pointerUp(this.builtinGamePoint(event));
      return;
    }
    if (this.mode === 'camera') {
      if (this.cameraPressing && this.isShutterHit(event.x, event.y)) this.capturePhoto(event.time);
      this.cameraPressing = false;
      return;
    }
    if (this.mode === 'settings') {
      this.activeSettingsControl = null;
      return;
    }
    if (!this.dragging) return;
    const homeEvent = this.mapPointerEvent(event, this.deviceOrientation);
    this.dragging = false;
    const dx = homeEvent.x - this.dragStartX;
    const dy = homeEvent.y - this.dragStartY;
    if (Math.hypot(dx, dy) <= TAP_DISTANCE) {
      const icon = this.hitIcon(homeEvent.x, homeEvent.y, this.currentPageOffset(event.time), this.deviceOrientation);
      if (icon?.id === 'perpetual-calendar') {
        this.openBuiltinGame(new PerpetualCalendarPadApp(), 'portrait');
        return;
      }
      if (icon?.id === 'camera') {
        void this.openCamera();
        return;
      }
      if (icon?.id === 'spine-viewer') {
        void this.openSpineViewer();
        return;
      }
      if (icon?.id === 'gltf-viewer') {
        void this.openGltfViewer();
        return;
      }
      if (icon?.id === 'settings') {
        this.openSettings();
        return;
      }
      if (icon?.id === 'sokoban-3d') {
        this.openBuiltinGame(new SokobanPadGame(), 'portrait');
        return;
      }
      if (icon?.id === 'spider-solitaire') {
        this.openBuiltinGame(new SpiderSolitairePadGame(), 'landscape');
        return;
      }
      if (icon?.id === 'sudoku') {
        this.openBuiltinGame(new SudokuPadGame(), 'landscape');
        return;
      }
      if (icon?.id === 'calendar-puzzle') {
        this.openBuiltinGame(new CalendarPuzzlePadGame(), 'landscape');
        return;
      }
      if (icon?.sceneUrl) {
        void this.openGame(icon.sceneUrl);
        return;
      }
    }
    const target = dx < -SWIPE_DISTANCE ? this.page + 1 : dx > SWIPE_DISTANCE ? this.page - 1 : this.page;
    this.startPageAnimation(clamp(target, 0, PAGE_COUNT - 1), event.time);
  }

  wheel(event: ScreenPointerEvent & { deltaY: number }): void {
    if (this.mode === 'spine') {
      this.spineViewer?.dispatchWheel(event.x, event.y, event.deltaY, this.pointerOptions(event));
    } else if (this.mode === 'gltf') {
      this.gltfViewer?.dispatchWheel(event.x, event.y, event.deltaY, this.pointerOptions(event));
    }
  }

  update(time: number, delta = 0): void {
    this.updateFps(time, delta);
    this.renderClock(time);
    if (this.mode === 'camera') this.renderCamera(time);
    else if (this.mode === 'game') this.renderGame();
    else if (this.mode === 'builtin-game') this.renderBuiltinGame(time, delta);
    else if (this.mode === 'spine') this.renderSpine(time);
    else if (this.mode === 'gltf') this.renderGltf(time, delta);
    else if (this.mode === 'settings') this.renderSettings();
    else this.render(time);
    this.applyBrightnessOverlay();
    this.drawFpsOverlay();
  }

  setDeviceOrientation(orientation: ScreenOrientation, angle = orientation === 'landscape' ? Math.PI / 2 : 0): void {
    if (this.deviceOrientation === orientation && this.orientationTargetAngle === angle) return;
    this.orientationFromAngle = this.orientationAngle;
    this.orientationTargetAngle = angle;
    this.orientationAnimStart = performance.now();
    this.deviceOrientation = orientation;
    if (this.mode === 'home') {
      this.dragging = false;
      this.animFrom = this.page;
      this.animTo = this.page;
      this.animStart = performance.now();
    }
  }

  returnHome(): void {
    this.cameraRequestId++;
    this.cancelGameLongPress();
    this.player?.stop();
    this.player = null;
    this.builtinGame?.stop?.();
    this.builtinGame = null;
    this.spineViewer?.stop();
    this.spineViewer = null;
    this.gltfViewer?.stop();
    this.gltfViewer = null;
    this.spineLoading = false;
    this.spineError = '';
    this.gltfLoading = false;
    this.gltfError = '';
    this.playerViewport = null;
    this.playerLoading = false;
    this.playerError = '';
    this.activeSettingsControl = null;
    this.mode = 'home';
    this.cameraState = 'idle';
    this.cameraPressing = false;
    this.cameraError = '';
    if (this.video) this.video.pause();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }

  isCameraActive(): boolean {
    return this.mode === 'camera';
  }

  private openSettings(): void {
    this.returnHome();
    this.mode = 'settings';
  }

  private startPageAnimation(target: number, time: number): void {
    this.animFrom = this.currentPageOffset(time);
    this.animTo = target;
    this.animStart = time;
    this.page = target;
  }

  private currentPageOffset(time: number): number {
    if (this.dragging) {
      return this.page - (this.dragX - this.dragStartX) / this.logicalWidth(this.deviceOrientation);
    }
    const t = clamp((time - this.animStart) / this.animDuration, 0, 1);
    return this.animFrom + (this.animTo - this.animFrom) * easeOut(t);
  }

  private render(time: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    const angle = this.currentOrientationAngle(time);
    this.withOrientationContext(ctx, this.deviceOrientation, angle, () => {
      const width = this.logicalWidth(this.deviceOrientation);
      const height = this.logicalHeight(this.deviceOrientation);
      this.drawBackground(ctx, width, height);
      this.drawStatusBar(ctx, width);
      this.drawPages(ctx, this.currentPageOffset(time), this.deviceOrientation);
      this.drawPageDots(ctx, this.currentPageOffset(time), this.deviceOrientation);
    });
  }

  private drawBackground(ctx: CanvasRenderingContext2D, width = SCREEN_W, height = SCREEN_H): void {
    if (this.bg) {
      const scale = Math.max(width / this.bg.width, height / this.bg.height);
      const w = this.bg.width * scale;
      const h = this.bg.height * scale;
      ctx.drawImage(this.bg, (width - w) / 2, (height - h) / 2, w, h);
    } else {
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, '#1d4ed8');
      g.addColorStop(0.45, '#6d28d9');
      g.addColorStop(1, '#111827');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = 'rgba(4, 8, 18, 0.18)';
    ctx.fillRect(0, 0, width, height);
  }

  private drawStatusBar(ctx: CanvasRenderingContext2D, width = SCREEN_W): void {
    const date = new Date();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 34px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(time, 58, 36);
    ctx.font = '700 24px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('100%', width - 58, 42);
    ctx.restore();
  }

  private drawPages(ctx: CanvasRenderingContext2D, pageOffset: number, orientation: ScreenOrientation): void {
    for (let page = 0; page < PAGE_COUNT; page++) {
      const pageX = (page - pageOffset) * this.logicalWidth(orientation);
      this.drawPage(ctx, page, pageX, orientation);
    }
  }

  private drawPage(ctx: CanvasRenderingContext2D, page: number, pageX: number, orientation: ScreenOrientation): void {
    const layout = this.iconLayout(orientation);
    const startX = pageX + layout.startX;
    const startY = layout.startY;
    for (const icon of this.icons) {
      if (icon.page !== page) continue;
      const col = icon.slot % layout.cols;
      const row = Math.floor(icon.slot / layout.cols) % layout.rows;
      const x = startX + col * layout.cellW;
      const y = startY + row * layout.cellH;
      this.drawIcon(ctx, icon, x, y, layout.iconSize);
    }
  }

  private drawIcon(ctx: CanvasRenderingContext2D, icon: RuntimeIcon, x: number, y: number, size: number): void {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    if (icon.id === 'clock') {
      roundRect(ctx, x, y, size, size, 28);
      ctx.clip();
      ctx.drawImage(this.clockCanvas, x, y, size, size);
    } else if (icon.iconUrl && this.iconImages.has(icon.id)) {
      const image = this.iconImages.get(icon.id)!;
      roundRect(ctx, x, y, size, size, 28);
      ctx.clip();
      ctx.drawImage(image, x, y, size, size);
    } else {
      const g = ctx.createLinearGradient(x, y, x + size, y + size);
      g.addColorStop(0, icon.colors[0]);
      g.addColorStop(1, icon.colors[1]);
      ctx.fillStyle = g;
      roundRect(ctx, x, y, size, size, 28);
      ctx.fill();
      this.drawIconSymbol(ctx, icon, x, y, size);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = '600 28px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.36)';
    ctx.shadowBlur = 8;
    ctx.fillText(icon.label, x + size / 2, y + size + 18);
    ctx.restore();
  }

  private drawIconSymbol(ctx: CanvasRenderingContext2D, icon: RuntimeIcon, x: number, y: number, size: number): void {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (icon.id === 'tetris') {
      const s = 24;
      const cells: Array<[number, number, string]> = [[-1, 0, '#fde047'], [0, 0, '#22d3ee'], [1, 0, '#a78bfa'], [0, -1, '#fb7185']];
      for (const [cx, cy, color] of cells) {
        ctx.fillStyle = color;
        roundRect(ctx, cx * s - s / 2, cy * s - s / 2, s - 3, s - 3, 5);
        ctx.fill();
      }
    } else if (icon.id === 'billiards') {
      ctx.beginPath();
      ctx.arc(-20, 4, 22, 0, Math.PI * 2);
      ctx.arc(24, -8, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.beginPath();
      ctx.moveTo(-44, 34);
      ctx.lineTo(48, -36);
      ctx.stroke();
    } else if (icon.id === '2048') {
      ctx.font = '800 42px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2048', 0, 2);
    } else if (icon.id === 'snake') {
      const cells: Array<[number, number]> = [[-1, 1], [0, 1], [1, 1], [1, 0], [0, 0], [0, -1]];
      const s = 18;
      ctx.fillStyle = '#bbf7d0';
      for (const [cx, cy] of cells) {
        roundRect(ctx, cx * s - s / 2, cy * s - s / 2, s - 3, s - 3, 5);
        ctx.fill();
      }
      ctx.fillStyle = '#ecfccb';
      roundRect(ctx, -s / 2, -s * 1.5, s - 3, s - 3, 5);
      ctx.fill();
      ctx.fillStyle = '#052e16';
      ctx.beginPath();
      ctx.arc(-4, -23, 2.4, 0, Math.PI * 2);
      ctx.arc(4, -23, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(-34, 24, 11, 0, Math.PI * 2);
      ctx.fill();
    } else if (icon.id === 'minesweeper') {
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
        ctx.lineTo(Math.cos(a) * 43, Math.sin(a) * 43);
        ctx.stroke();
      }
    } else if (icon.id === 'camera') {
      roundRect(ctx, -38, -24, 76, 52, 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 2, 16, 0, Math.PI * 2);
      ctx.stroke();
      roundRect(ctx, -22, -38, 44, 18, 8);
      ctx.fill();
    } else if (icon.id === 'cylinder-tetris') {
      ctx.beginPath();
      ctx.ellipse(0, -28, 38, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-38, -28);
      ctx.lineTo(-38, 30);
      ctx.ellipse(0, 30, 38, 14, 0, Math.PI, 0, true);
      ctx.lineTo(38, -28);
      ctx.stroke();
      ctx.fillRect(-12, -4, 24, 24);
    } else if (icon.id === 'hex-mines') {
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 28;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + k * Math.PI / 3;
          const px = dx + Math.cos(a) * 18;
          const py = Math.sin(a) * 18;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    } else if (icon.id === 'spine-viewer') {
      ctx.beginPath();
      ctx.moveTo(-34, 28);
      ctx.bezierCurveTo(-18, -38, 18, -38, 34, 28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -18, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(-22, 18);
      ctx.moveTo(0, -4);
      ctx.lineTo(22, 18);
      ctx.stroke();
    } else if (icon.id === 'settings') {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
        ctx.lineTo(Math.cos(a) * 47, Math.sin(a) * 47);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPageDots(ctx: CanvasRenderingContext2D, pageOffset: number, orientation: ScreenOrientation): void {
    const y = this.logicalHeight(orientation) - (orientation === 'landscape' ? 58 : 92);
    const cx = this.logicalWidth(orientation) / 2;
    for (let i = 0; i < PAGE_COUNT; i++) {
      const active = 1 - clamp(Math.abs(pageOffset - i), 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.34 + active * 0.48})`;
      ctx.beginPath();
      ctx.arc(cx + (i - 0.5) * 34, y, 7 + active * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderClock(time: number): void {
    const ctx = this.clockCtx;
    const w = this.clockCanvas.width;
    const h = this.clockCanvas.height;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5 - w / 2) / (w / 2);
        const ny = (y + 0.5 - h / 2) / (h / 2);
        const dist = Math.hypot(nx, ny);
        const edge = clamp((1 - dist) / 0.055, 0, 1);
        const shade = 246 - dist * 34;
        const index = (y * w + x) * 4;
        d[index] = shade;
        d[index + 1] = shade;
        d[index + 2] = shade + 3;
        d[index + 3] = edge * 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#111827';
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2;
      ctx.lineWidth = i % 3 === 0 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 57, Math.sin(a) * 57);
      ctx.lineTo(Math.cos(a) * 66, Math.sin(a) * 66);
      ctx.stroke();
    }
    this.drawClockHand(ctx, hours * Math.PI / 6 - Math.PI / 2, 34, 7, '#111827');
    this.drawClockHand(ctx, minutes * Math.PI / 30 - Math.PI / 2, 50, 5, '#111827');
    this.drawClockHand(ctx, seconds * Math.PI / 30 - Math.PI / 2, 58, 2.5, '#ef4444');
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    void time;
  }

  private drawClockHand(ctx: CanvasRenderingContext2D, angle: number, length: number, width: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
    ctx.stroke();
  }

  private hitIcon(x: number, y: number, pageOffset: number, orientation: ScreenOrientation): RuntimeIcon | null {
    for (const rect of this.iconRects(pageOffset, orientation)) {
      if (x >= rect.x && x <= rect.x + rect.size && y >= rect.y && y <= rect.y + rect.size) return rect.icon;
    }
    return null;
  }

  private iconRects(pageOffset: number, orientation: ScreenOrientation): IconHitRect[] {
    const layout = this.iconLayout(orientation);
    return this.icons.map(icon => {
      const pageX = (icon.page - pageOffset) * this.logicalWidth(orientation);
      const col = icon.slot % layout.cols;
      const row = Math.floor(icon.slot / layout.cols) % layout.rows;
      return {
        icon,
        x: pageX + layout.startX + col * layout.cellW,
        y: layout.startY + row * layout.cellH,
        size: layout.iconSize,
      };
    });
  }

  private async openCamera(): Promise<void> {
    this.player?.stop();
    this.player = null;
    const requestId = ++this.cameraRequestId;
    this.mode = 'camera';
    this.cameraState = 'requesting';
    this.cameraError = '';
    if (!this.video) {
      this.video = document.createElement('video');
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.autoplay = true;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (requestId !== this.cameraRequestId || this.mode !== 'camera') {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      this.stream = stream;
      this.video.srcObject = this.stream;
      await this.video.play();
      if (requestId !== this.cameraRequestId || this.mode !== 'camera') {
        this.returnHome();
        return;
      }
      this.cameraState = 'ready';
    } catch (error) {
      if (requestId !== this.cameraRequestId || this.mode !== 'camera') return;
      this.cameraState = 'denied';
      this.cameraError = error instanceof Error ? error.message : 'Camera permission denied';
    }
  }

  private async openGame(sceneUrl: string): Promise<void> {
    this.returnHome();
    this.mode = 'game';
    this.playerOrientation = this.orientationForScene(sceneUrl);
    this.playerLoading = true;
    this.playerError = '';
    const size = this.playerSizeForScene(sceneUrl);
    this.player = new EmbeddedScenePlayer(size.width, size.height, {
      useSceneDesignSize: !this.isWide3DScene(sceneUrl),
    });
    this.playerViewport = this.createPlayerViewport(size.width, size.height);
    try {
      await this.player.load(sceneUrl);
      if (this.player) {
        this.playerViewport = this.createPlayerViewport(this.player.canvas.width, this.player.canvas.height);
      }
    } catch (error) {
      this.playerError = error instanceof Error ? error.message : 'Failed to load game';
      this.player?.stop();
      this.player = null;
    } finally {
      this.playerLoading = false;
    }
  }

  private openBuiltinGame(game: BuiltinPadGame, orientation: ScreenOrientation): void {
    this.returnHome();
    this.mode = 'builtin-game';
    this.playerOrientation = orientation;
    this.builtinGame = game;
    this.playerViewport = this.createPlayerViewport(game.canvas.width, game.canvas.height, orientation);
  }

  private async openSpineViewer(): Promise<void> {
    this.returnHome();
    this.mode = 'spine';
    this.spineLoading = true;
    this.spineError = '';
    const viewer = new SpineViewerScene();
    try {
      await viewer.init();
      if (this.mode !== 'spine') {
        viewer.stop();
        return;
      }
      this.spineViewer = viewer;
    } catch (error) {
      this.spineError = error instanceof Error ? error.message : 'Failed to open Spine Viewer';
      viewer.stop();
    } finally {
      this.spineLoading = false;
    }
  }

  private async openGltfViewer(): Promise<void> {
    this.returnHome();
    this.mode = 'gltf';
    this.gltfLoading = true;
    this.gltfError = '';
    const viewer = new GltfViewerScene();
    try {
      await viewer.init();
      if (this.mode !== 'gltf') {
        viewer.stop();
        return;
      }
      this.gltfViewer = viewer;
    } catch (error) {
      this.gltfError = error instanceof Error ? error.message : 'Failed to open glTF Viewer';
      viewer.stop();
    } finally {
      this.gltfLoading = false;
    }
  }

  private pointerOptions(event: ScreenPointerEvent): { button?: number; buttons?: number; ctrlKey?: boolean; metaKey?: boolean } {
    return {
      ...(event.button === undefined ? {} : { button: event.button }),
      ...(event.buttons === undefined ? {} : { buttons: event.buttons }),
      ...(event.ctrlKey === undefined ? {} : { ctrlKey: event.ctrlKey }),
      ...(event.metaKey === undefined ? {} : { metaKey: event.metaKey }),
    };
  }

  private playerPoint(event: ScreenPointerEvent): { x: number; y: number } {
    const point = this.mapPointToOrientation(event.x, event.y, this.playerOrientation);
    if (!this.playerViewport) return point;
    return {
      x: (point.x - this.playerViewport.x) / this.playerViewport.scale,
      y: (point.y - this.playerViewport.y) / this.playerViewport.scale,
    };
  }

  private builtinGamePoint(event: ScreenPointerEvent): ScreenPointerEvent {
    const point = this.mapPointerEvent(event, this.playerOrientation);
    if (!this.builtinGame) return point;
    const viewport = this.playerViewport
      ?? this.createPlayerViewport(this.builtinGame.canvas.width, this.builtinGame.canvas.height, this.playerOrientation);
    return {
      ...point,
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale,
    };
  }

  private startGameLongPress(event: ScreenPointerEvent): void {
    this.cancelGameLongPress();
    if ((event.button ?? 0) !== 0) return;
    this.gamePointerStart = { ...event };
    this.gameLongPressFired = false;
    this.gameLongPressTimer = window.setTimeout(() => {
      const start = this.gamePointerStart;
      if (!start || this.mode !== 'game') return;
      const point = this.playerPoint(start);
      this.gameLongPressFired = true;
      this.player?.dispatchPointer('pointerup', point.x, point.y, {
        button: 0,
        buttons: 0,
        ctrlKey: true,
      });
      this.gamePointerStart = null;
      this.gameLongPressTimer = null;
    }, LONG_PRESS_MS);
  }

  private cancelGameLongPress(): void {
    if (this.gameLongPressTimer !== null) {
      window.clearTimeout(this.gameLongPressTimer);
      this.gameLongPressTimer = null;
    }
    this.gamePointerStart = null;
  }

  private renderGame(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    this.withOrientationContext(ctx, this.playerOrientation, this.orientationAngleFor(this.playerOrientation), () => {
      const width = this.logicalWidth(this.playerOrientation);
      const height = this.logicalHeight(this.playerOrientation);
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, width, height);
      if (this.player) {
        const viewport = this.playerViewport ?? this.createPlayerViewport(this.player.canvas.width, this.player.canvas.height, this.playerOrientation);
        ctx.drawImage(this.player.canvas, viewport.x, viewport.y, viewport.width, viewport.height);
        return;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 42px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.playerLoading ? 'Loading Game' : 'Game Unavailable', width / 2, height / 2 - 20);
      if (this.playerError) {
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.font = '500 24px Arial, Helvetica, sans-serif';
        ctx.fillText(this.playerError, width / 2, height / 2 + 42);
      }
    });
  }

  private renderBuiltinGame(time: number, delta: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    this.withOrientationContext(ctx, this.playerOrientation, this.orientationAngleFor(this.playerOrientation), () => {
      const width = this.logicalWidth(this.playerOrientation);
      const height = this.logicalHeight(this.playerOrientation);
      ctx.fillStyle = '#050608';
      ctx.fillRect(0, 0, width, height);
      if (!this.builtinGame) return;
      this.builtinGame.update(time, delta);
      const viewport = this.playerViewport ?? this.createPlayerViewport(this.builtinGame.canvas.width, this.builtinGame.canvas.height, this.playerOrientation);
      ctx.drawImage(this.builtinGame.canvas, viewport.x, viewport.y, viewport.width, viewport.height);
    });
  }

  private renderSpine(time: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (this.spineLoading) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 42px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading Spine Viewer', SCREEN_W / 2, SCREEN_H / 2 - 20);
      return;
    }
    if (this.spineViewer) {
      this.spineViewer.update(time);
      ctx.drawImage(this.spineViewer.canvas, 0, 0, SCREEN_W, SCREEN_H);
      return;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 42px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.spineLoading ? 'Loading Spine Viewer' : 'Spine Viewer Unavailable', SCREEN_W / 2, SCREEN_H / 2 - 20);
    if (this.spineError) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = '500 24px Arial, Helvetica, sans-serif';
      ctx.fillText(this.spineError, SCREEN_W / 2, SCREEN_H / 2 + 42);
    }
  }

  private renderGltf(time: number, delta: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (this.gltfLoading) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 42px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading glTF Viewer', SCREEN_W / 2, SCREEN_H / 2 - 20);
      return;
    }
    if (this.gltfViewer) {
      this.gltfViewer.update(time, delta);
      ctx.drawImage(this.gltfViewer.canvas, 0, 0, SCREEN_W, SCREEN_H);
      return;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 42px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.gltfLoading ? 'Loading glTF Viewer' : 'glTF Viewer Unavailable', SCREEN_W / 2, SCREEN_H / 2 - 20);
    if (this.gltfError) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = '500 24px Arial, Helvetica, sans-serif';
      ctx.fillText(this.gltfError, SCREEN_W / 2, SCREEN_H / 2 + 42);
    }
  }

  private playerSizeForScene(sceneUrl: string): { width: number; height: number } {
    if (this.isWide3DScene(sceneUrl)) return { width: this.logicalWidth('landscape'), height: this.logicalHeight('landscape') };
    if (sceneUrl.includes('hex-minesweeper')) return { width: 680, height: 970 };
    if (sceneUrl.includes('tetris-starter') || sceneUrl.includes('2048') || sceneUrl.includes('minesweeper-starter')) return { width: 780, height: 1110 };
    return { width: SCREEN_W, height: SCREEN_H };
  }

  private orientationForScene(sceneUrl: string): ScreenOrientation {
    return this.isWide3DScene(sceneUrl) ? 'landscape' : 'portrait';
  }

  private isWide3DScene(sceneUrl: string): boolean {
    return sceneUrl.includes('billiards-3d-import') || sceneUrl.includes('ball-maze-3d-import');
  }

  private createPlayerViewport(width: number, height: number, orientation = this.playerOrientation): PlayerViewport {
    const boundsW = this.logicalWidth(orientation);
    const boundsH = this.logicalHeight(orientation);
    const scale = Math.min(boundsW / width, boundsH / height);
    const viewportWidth = width * scale;
    const viewportHeight = height * scale;
    return {
      x: (boundsW - viewportWidth) / 2,
      y: (boundsH - viewportHeight) / 2,
      width: viewportWidth,
      height: viewportHeight,
      scale,
    };
  }

  private handleSettingsPointerDown(event: ScreenPointerEvent): void {
    const x = event.x;
    const y = event.y;
    if (this.hitRect(x, y, SETTINGS_WALLPAPER_BUTTON)) {
      this.fileInput.click();
      return;
    }
    if (this.hitRect(x, y, SETTINGS_BRIGHTNESS_TRACK)) {
      this.activeSettingsControl = 'brightness';
      this.setBrightnessFromX(x);
      return;
    }
    if (x >= SETTINGS_FPS_CHECKBOX.x && x <= SETTINGS_FPS_CHECKBOX.x + SETTINGS_FPS_CHECKBOX.size &&
      y >= SETTINGS_FPS_CHECKBOX.y && y <= SETTINGS_FPS_CHECKBOX.y + SETTINGS_FPS_CHECKBOX.size) {
      this.showFps = !this.showFps;
    }
  }

  private handleSettingsPointerMove(event: ScreenPointerEvent): void {
    if (this.activeSettingsControl === 'brightness') this.setBrightnessFromX(event.x);
  }

  private setBrightnessFromX(x: number): void {
    this.brightness = clamp((x - SETTINGS_BRIGHTNESS_TRACK.x) / SETTINGS_BRIGHTNESS_TRACK.width, 0, 1);
  }

  private hitRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private renderSettings(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    this.drawBackground(ctx);
    ctx.fillStyle = 'rgba(7, 12, 24, 0.62)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = '800 48px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Settings', 82, 72);

    this.drawSettingsPanel(ctx, 72, 170, SCREEN_W - 144, 720);
    this.drawWallpaperSetting(ctx);
    this.drawBrightnessSetting(ctx);
    this.drawFpsSetting(ctx);
    ctx.restore();
  }

  private drawSettingsPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    roundRect(ctx, x, y, width, height, 34);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawWallpaperSetting(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 30px Arial, Helvetica, sans-serif';
    ctx.fillText('Wallpaper', 112, 216);
    roundRect(ctx, SETTINGS_WALLPAPER_BUTTON.x, SETTINGS_WALLPAPER_BUTTON.y, SETTINGS_WALLPAPER_BUTTON.width, SETTINGS_WALLPAPER_BUTTON.height, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 30px Arial, Helvetica, sans-serif';
    ctx.fillText('Choose Local Image', SETTINGS_WALLPAPER_BUTTON.x + 28, SETTINGS_WALLPAPER_BUTTON.y + 24);
  }

  private drawBrightnessSetting(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 30px Arial, Helvetica, sans-serif';
    ctx.fillText(`Brightness ${Math.round(this.brightness * 100)}%`, 112, 444);
    const track = SETTINGS_BRIGHTNESS_TRACK;
    roundRect(ctx, track.x, track.y + 14, track.width, 16, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    roundRect(ctx, track.x, track.y + 14, track.width * this.brightness, 16, 8);
    ctx.fillStyle = 'rgba(96,165,250,0.96)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(track.x + track.width * this.brightness, track.y + 22, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
  }

  private drawFpsSetting(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 30px Arial, Helvetica, sans-serif';
    ctx.fillText('Show FPS Overlay', 190, 694);
    roundRect(ctx, SETTINGS_FPS_CHECKBOX.x, SETTINGS_FPS_CHECKBOX.y, SETTINGS_FPS_CHECKBOX.size, SETTINGS_FPS_CHECKBOX.size, 12);
    ctx.fillStyle = this.showFps ? 'rgba(96,165,250,0.96)' : 'rgba(255,255,255,0.13)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.stroke();
    if (this.showFps) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(SETTINGS_FPS_CHECKBOX.x + 14, SETTINGS_FPS_CHECKBOX.y + 28);
      ctx.lineTo(SETTINGS_FPS_CHECKBOX.x + 24, SETTINGS_FPS_CHECKBOX.y + 39);
      ctx.lineTo(SETTINGS_FPS_CHECKBOX.x + 42, SETTINGS_FPS_CHECKBOX.y + 17);
      ctx.stroke();
    }
  }

  private updateFps(time: number, delta: number): void {
    this.fpsFrameCount++;
    if (this.fpsLastTime === 0) {
      this.fpsLastTime = time;
      this.fps = delta > 0 ? 1000 / delta : 0;
      return;
    }
    const elapsed = time - this.fpsLastTime;
    if (elapsed >= 350) {
      this.fps = this.fpsFrameCount * 1000 / elapsed;
      this.fpsFrameCount = 0;
      this.fpsLastTime = time;
    }
  }

  private applyBrightnessOverlay(): void {
    const ctx = this.ctx;
    if (this.brightness < 0.5) {
      const alpha = (0.5 - this.brightness) / 0.5 * 0.58;
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    } else if (this.brightness > 0.5) {
      const alpha = (this.brightness - 0.5) / 0.5 * 0.22;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }

  private drawFpsOverlay(): void {
    if (!this.showFps) return;
    const ctx = this.ctx;
    const text = `${Math.round(this.fps)} FPS`;
    ctx.save();
    ctx.font = '700 24px Arial, Helvetica, sans-serif';
    const width = Math.ceil(ctx.measureText(text).width) + 30;
    const x = SCREEN_W - width - 24;
    const y = 24;
    roundRect(ctx, x, y, width, 44, 14);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.fill();
    ctx.fillStyle = 'rgba(125, 211, 252, 0.96)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + 23);
    ctx.restore();
  }

  private logicalWidth(orientation: ScreenOrientation): number {
    return orientation === 'landscape' ? SCREEN_H : SCREEN_W;
  }

  private logicalHeight(orientation: ScreenOrientation): number {
    return orientation === 'landscape' ? SCREEN_W : SCREEN_H;
  }

  private currentOrientationAngle(time: number): number {
    const t = clamp((time - this.orientationAnimStart) / this.orientationAnimDuration, 0, 1);
    this.orientationAngle = this.orientationFromAngle + (this.orientationTargetAngle - this.orientationFromAngle) * easeOut(t);
    return this.orientationAngle;
  }

  private orientationAngleFor(orientation: ScreenOrientation): number {
    return orientation === 'landscape' ? Math.PI / 2 : 0;
  }

  private withOrientationContext(ctx: CanvasRenderingContext2D, orientation: ScreenOrientation, angle: number, draw: () => void): void {
    ctx.save();
    const width = this.logicalWidth(orientation);
    const height = this.logicalHeight(orientation);
    ctx.translate(SCREEN_W / 2, SCREEN_H / 2);
    ctx.rotate(angle);
    ctx.translate(-width / 2, -height / 2);
    draw();
    ctx.restore();
  }

  private mapPointerEvent(event: ScreenPointerEvent, orientation: ScreenOrientation): ScreenPointerEvent {
    const point = this.mapPointToOrientation(event.x, event.y, orientation);
    return { ...event, ...point };
  }

  private mapPointToOrientation(x: number, y: number, orientation: ScreenOrientation): { x: number; y: number } {
    const angle = orientation === this.deviceOrientation ? this.orientationTargetAngle : this.orientationAngleFor(orientation);
    if (angle === 0) return { x, y };
    const width = this.logicalWidth(orientation);
    const height = this.logicalHeight(orientation);
    const dx = x - SCREEN_W / 2;
    const dy = y - SCREEN_H / 2;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return {
      x: cos * dx - sin * dy + width / 2,
      y: sin * dx + cos * dy + height / 2,
    };
  }

  private iconLayout(orientation: ScreenOrientation): {
    cols: number;
    rows: number;
    startX: number;
    startY: number;
    cellW: number;
    cellH: number;
    iconSize: number;
  } {
    if (orientation === 'landscape') {
      const iconSize = 116;
      const cellW = 238;
      const cellH = 188;
      const cols = LANDSCAPE_GRID_COLS;
      const rows = LANDSCAPE_GRID_ROWS;
      return {
        cols,
        rows,
        startX: (this.logicalWidth(orientation) - ((cols - 1) * cellW + iconSize)) / 2,
        startY: 132,
        cellW,
        cellH,
        iconSize,
      };
    }
    return {
      cols: GRID_COLS,
      rows: GRID_ROWS,
      startX: ICON_START_X,
      startY: ICON_START_Y,
      cellW: ICON_CELL_W,
      cellH: ICON_CELL_H,
      iconSize: ICON_SIZE,
    };
  }

  private renderCamera(time: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (this.cameraState === 'ready' && this.video && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
      this.drawCoverImage(ctx, this.video, 0, 0, SCREEN_W, SCREEN_H);
    } else {
      const g = ctx.createLinearGradient(0, 0, SCREEN_W, SCREEN_H);
      g.addColorStop(0, '#111827');
      g.addColorStop(1, '#030712');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 42px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.cameraState === 'requesting' ? 'Opening Camera' : 'Camera Unavailable', SCREEN_W / 2, SCREEN_H / 2 - 24);
      ctx.font = '500 24px Arial, Helvetica, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText(this.cameraError || 'Allow browser camera access to preview video.', SCREEN_W / 2, SCREEN_H / 2 + 32);
    }

    this.drawCameraChrome(ctx);
    if (time < this.flashUntil) {
      const alpha = (this.flashUntil - time) / 180;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }

  private drawCameraChrome(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, SCREEN_H - 242, SCREEN_W, 242);
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.fillRect(0, 0, SCREEN_W, 102);

    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 3;
    ctx.strokeRect(88, 196, SCREEN_W - 176, SCREEN_H - 480);

    if (this.hasCapture) {
      roundRect(ctx, 74, SCREEN_H - 178, 120, 120, 24);
      ctx.save();
      ctx.clip();
      ctx.drawImage(this.capturedCanvas, 74, SCREEN_H - 178, 120, 120);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.46)';
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      roundRect(ctx, 74, SCREEN_H - 178, 120, 120, 24);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(SHUTTER_X, SHUTTER_Y, SHUTTER_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.cameraPressing ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.86)';
    ctx.lineWidth = this.cameraPressing ? 13 : 9;
    ctx.beginPath();
    ctx.arc(SHUTTER_X, SHUTTER_Y, SHUTTER_R + 17, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '700 24px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PHOTO', SCREEN_W / 2, SCREEN_H - 220);
    ctx.restore();
  }

  private capturePhoto(time: number): void {
    const ctx = this.capturedCtx;
    ctx.clearRect(0, 0, this.capturedCanvas.width, this.capturedCanvas.height);
    if (this.cameraState === 'ready' && this.video && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
      this.drawCoverImage(ctx, this.video, 0, 0, this.capturedCanvas.width, this.capturedCanvas.height);
    } else {
      const g = ctx.createLinearGradient(0, 0, this.capturedCanvas.width, this.capturedCanvas.height);
      g.addColorStop(0, '#1f2937');
      g.addColorStop(1, '#020617');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.capturedCanvas.width, this.capturedCanvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '700 24px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Photo', this.capturedCanvas.width / 2, this.capturedCanvas.height / 2);
    }
    this.hasCapture = true;
    this.flashUntil = time + 180;
  }

  private isShutterHit(x: number, y: number): boolean {
    return Math.hypot(x - SHUTTER_X, y - SHUTTER_Y) <= SHUTTER_R + 36;
  }

  private drawCoverImage(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLCanvasElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
}
