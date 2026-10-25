import { gameTime } from '../../session/SessionPause';
import { GameEngine } from '../../session/GameEngine';
import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, Mesh3D, HaiyueEngine, World, createPlane3D } from '@haiyue/engine';
import { MusicPlayerComponent, Transform3D } from '@haiyue/engine/components';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { requiredItemAt, requiredNumberAt } from '../../shared/collections/arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../../save/SingleSlotGameSave';
import { InkArt, INK_FONT, ScrollReveal } from '../art/InkArt';
import { INK, PAPER, INTRO_DURATION_MS, cellPigment } from '../art/inkNoise';
import { hexPoint, hexCenter, hexPlaneSize, portPoint, pathCurve, HEX_TEXTURE_STRETCH } from '../art/hexGeometry';

type AxialKey = string;
type Phase = 'playing' | 'ended';
type Port = number;
type Pairing = [Port, Port][];
type AudioContextConstructor = new () => AudioContext;

interface SfxClip {
  title: string;
  start: number;
  end?: number;
  length?: number;
}

interface Axial {
  q: number;
  r: number;
}

interface TileDef {
  id: number;
  pairs: Pairing;
  variant: number;
}

interface BoardCell extends Axial {
  entity: Entity;
  transform: CartesianTransform3D;
  material: BasicMaterial;
  mesh: Mesh3D;
  screenX: number;
  screenY: number;
  wall: boolean;
  source: boolean;
  variant: number;
}

interface PlacedTile {
  tile: TileDef;
  rotation: number;
  entry: number;
  exit: number;
  order: number;
}

interface EntanglementSaveData {
  levelIndex: number;
  bestByLevel: number[];
  placed: Array<[AxialKey, PlacedTile]>;
  current: Axial;
  incomingSide: Port;
  pathStart: Axial;
  pathEntry: Port;
  sourceExit: Port | null;
  phase: Phase;
  score: number;
  pathLength: number;
  nextTile: TileDef;
  reserveTile: TileDef;
  rotation: number;
  reserveRotation: number;
  tileSerial: number;
}

function isAxial(value: unknown): value is Axial {
  return isRecord(value) && Number.isSafeInteger(value.q) && Number.isSafeInteger(value.r);
}

function isPort(value: unknown): value is Port {
  return isNonNegativeInteger(value) && value < 12;
}

function isTileDef(value: unknown): value is TileDef {
  return isRecord(value)
    && isNonNegativeInteger(value.id)
    && isNonNegativeInteger(value.variant)
    && Array.isArray(value.pairs)
    && value.pairs.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(isPort));
}

function isPlacedTile(value: unknown): value is PlacedTile {
  return isRecord(value) && isTileDef(value.tile)
    && isNonNegativeInteger(value.rotation) && isPort(value.entry) && isPort(value.exit)
    && isNonNegativeInteger(value.order);
}

function isEntanglementSaveData(value: unknown): value is EntanglementSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.levelIndex)
    && Array.isArray(value.bestByLevel) && value.bestByLevel.every(isNonNegativeInteger)
    && Array.isArray(value.placed) && value.placed.every(item => Array.isArray(item) && item.length === 2
      && typeof item[0] === 'string' && isPlacedTile(item[1]))
    && isAxial(value.current) && isPort(value.incomingSide)
    && isAxial(value.pathStart) && isPort(value.pathEntry)
    && (value.sourceExit === null || isPort(value.sourceExit))
    && (value.phase === 'playing' || value.phase === 'ended')
    && isNonNegativeInteger(value.score) && isNonNegativeInteger(value.pathLength)
    && isTileDef(value.nextTile) && isTileDef(value.reserveTile)
    && isNonNegativeInteger(value.rotation) && isNonNegativeInteger(value.reserveRotation)
    && isNonNegativeInteger(value.tileSerial);
}

interface TraceResult {
  ended: boolean;
  current?: Axial;
  incomingSide?: Port;
}

interface TextPlane {
  material: BasicMaterial;
  transform: Transform3D;
}

interface SwapOverlay {
  entity: Entity;
  texture: GPUTexture;
  transform: CartesianTransform3D;
  fromPosition: [number, number, number];
  toPosition: [number, number, number];
  fromScale: [number, number, number];
  toScale: [number, number, number];
}



interface FloatingScoreLabel {
  entity: Entity;
  transform: CartesianTransform3D;
  material: BasicMaterial;
  startTime: number;
  startPosition: [number, number, number];
}

type RotateButtonKind = 'ccw' | 'cw';

interface RotateButtonState {
  kind: RotateButtonKind;
  entity: Entity;
  transform: CartesianTransform3D;
  material: BasicMaterial;
  direction: -1 | 1;
  hoverAmount: number;
  pressStart: number;
}

interface LevelFile {
  levels: LevelConfig[];
}

interface LevelConfig {
  id?: string;
  name?: string;
  radius?: number;
  cells?: Axial[];
  start?: Axial;
  entry?: Port;
  hexScreen?: number;
  hexWorld?: number;
  boardOffsetX?: number;
  boardOffsetY?: number;
  outerWalls?: boolean;
  walls?: Axial[];
  startWall?: boolean;
  randomStartExit?: boolean;
  tileLibrary?: Pairing[];
}

interface ResolvedLevel {
  id: string;
  name: string;
  cells: Axial[];
  start: Axial;
  entry: Port;
  hexScreen: number;
  hexWorld: number;
  boardOffsetX: number;
  boardOffsetY: number;
  wallKeys: Set<AxialKey>;
  startWall: boolean;
  randomStartExit: boolean;
  tileLibrary: Pairing[];
}

const CANVAS_W = 1200;
const CANVAS_H = 760;
const VIEW_W = 14.2;
const VIEW_H = CANVAS_H / CANVAS_W * VIEW_W;
const DEFAULT_BOARD_RADIUS = 4;
const DEFAULT_HEX_WORLD = 0.92;
const DEFAULT_HEX_SCREEN = 40;
const HEX_HIT_SCALE = 2 / Math.sqrt(3);
const SOURCE_EXIT_INSET = 26;
const DEFAULT_BOARD_OFFSET_X = 0;
const DEFAULT_BOARD_OFFSET_Y = 0;
const SWAP_PANEL_LEFT = 74;
const SWAP_PANEL_BOTTOM = 285;
const SWAP_PANEL_W = 216;
const SWAP_PANEL_H = 190;
const SWAP_PANEL_HEADER_H = 36;
const SWAP_TILE_W = 108;
const SWAP_TILE_H = 124;
const SWAP_TILE_LEFT = SWAP_PANEL_LEFT + (SWAP_PANEL_W - SWAP_TILE_W) / 2;
const SWAP_TILE_BOTTOM = SWAP_PANEL_BOTTOM + (SWAP_PANEL_H - SWAP_PANEL_HEADER_H - SWAP_TILE_H) / 2;
const SWAP_PANEL_Z = 1.0;
const SWAP_TILE_Z = 1.02;
const SWAP_TEXT_Z = 1.03;
const SCORE_PANEL_W = 200;
const SCORE_PANEL_H = 170;

const SCORE_POPUP_DURATION = 3000;
const SCORE_POPUP_FADE_START = 2000;
const SCORE_POPUP_RISE = 0.88;
const ROTATE_BUTTON_W = 32;
const ROTATE_BUTTON_H = 35;
const ROTATE_BUTTON_OFFSET_X = 43.5;
const ROTATE_BUTTON_OFFSET_Y = 46.5;
const ROTATE_BUTTON_Z = 1.06;
const ROTATE_BUTTON_PRESS_DURATION = 150;


const DEFAULT_START_CELL: Axial = { q: 0, r: 0 };
const DEFAULT_START_ENTRY: Port = 4;
// Edge order follows drawHexPath's visual flat-top hexagon:
// 0 right, 1 bottom-right, 2 bottom-left, 3 left, 4 top-left, 5 top-right.
const DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];
const TILE_LIBRARY: Pairing[] = [
  [[0, 7], [1, 10], [2, 5], [3, 8], [4, 11], [6, 9]],
  [[0, 4], [1, 9], [2, 7], [3, 11], [5, 8], [6, 10]],
  [[0, 11], [1, 6], [2, 9], [3, 5], [4, 8], [7, 10]],
  [[0, 8], [1, 3], [2, 10], [4, 7], [5, 11], [6, 9]],
  [[0, 5], [1, 8], [2, 11], [3, 6], [4, 9], [7, 10]],
  [[0, 9], [1, 4], [2, 6], [3, 10], [5, 7], [8, 11]],
  [[0, 6], [1, 11], [2, 8], [3, 5], [4, 10], [7, 9]],
  [[0, 10], [1, 5], [2, 7], [3, 9], [4, 6], [8, 11]],
  [[0, 3], [1, 7], [2, 10], [4, 11], [5, 8], [6, 9]],
  [[0, 1], [2, 7], [3, 10], [4, 9], [5, 11], [6, 8]],
  [[0, 6], [1, 8], [2, 3], [4, 11], [5, 9], [7, 10]],
  [[0, 9], [1, 5], [2, 8], [3, 10], [4, 6], [7, 11]],
  [[0, 4], [1, 7], [2, 10], [3, 6], [5, 11], [8, 9]],
];

const SFX_CLIPS: SfxClip[] = [
  { title: 'swap-tile', start: 1, length: 0.3 },
  { title: 'WindowOpen', start: 2.5, length: 1 },
  { title: 'WindowClose', start: 4.5, length: 1 },
  { title: 'Line10', start: 6.5, end: 7.8 },
  { title: 'Line11', start: 9.0, end: 10.05 },
  { title: 'Line12', start: 11.0, end: 12.05 },
  { title: 'Line13', start: 13.0, end: 14.05 },
  { title: 'Line14', start: 15.0, end: 16.05 },
  { title: 'Line20', start: 17.0, end: 18.25 },
  { title: 'Line21', start: 19.5, end: 20.7 },
  { title: 'Line30', start: 22.0, end: 23.1 },
  { title: 'Line31', start: 24.0, end: 25.35 },
  { title: 'Line40', start: 26.5, end: 28.05 },
  { title: 'Line41', start: 29.0, end: 30.65 },
  { title: 'Line50', start: 31.5, end: 33.15 },
  { title: 'Line51', start: 34.0, end: 35.95 },
  { title: 'Line60', start: 37.0, end: 38.75 },
  { title: 'Line61', start: 40.0, end: 42.3 },
  { title: 'Line70', start: 43.5, end: 46.25 },
  { title: 'Line80', start: 47.5, end: 49.55 },
  { title: 'Line90', start: 50.5, end: 53.3 },
  { title: 'Line100', start: 54.5, end: 57.2 },
  { title: 'Line101', start: 58.5, end: 61.15 },
];

const LINE_SFX_BY_LENGTH: Record<number, string[]> = {
  1: ['Line10', 'Line11', 'Line12', 'Line13', 'Line14'],
  2: ['Line20', 'Line21'],
  3: ['Line30', 'Line31'],
  4: ['Line40', 'Line41'],
  5: ['Line50', 'Line51'],
  6: ['Line60', 'Line61'],
  7: ['Line70'],
  8: ['Line80'],
  9: ['Line90'],
  10: ['Line100', 'Line101'],
};

const DEFAULT_LEVEL: LevelConfig = {
  id: 'classic',
  name: 'Classic Hex',
  radius: DEFAULT_BOARD_RADIUS,
  start: DEFAULT_START_CELL,
  entry: DEFAULT_START_ENTRY,
  hexScreen: DEFAULT_HEX_SCREEN,
  hexWorld: DEFAULT_HEX_WORLD,
  boardOffsetX: 0,
  boardOffsetY: 0,
  outerWalls: true,
  startWall: true,
  randomStartExit: true,
  tileLibrary: TILE_LIBRARY,
};

function key(q: number, r: number): AxialKey {
  return `${q},${r}`;
}

function portSide(port: Port): number {
  return Math.floor(mod12(port) / 2);
}

function oppositePort(port: Port): Port {
  const side = portSide(port);
  const lane = mod12(port) % 2;
  return ((side + 3) % 6) * 2 + (1 - lane);
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function mod6(value: number): number {
  return ((value % 6) + 6) % 6;
}

function easeOutCubic(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - t, 3);
}

function shortestRotationAngle(from: number, to: number): number {
  let delta = mod6(to - from);
  if (delta > 3) delta -= 6;
  return -delta * Math.PI / 3;
}

function triangularScore(length: number): number {
  const value = Math.max(0, Math.floor(length));
  return value * (value + 1) / 2;
}

function rotatePort(port: Port, rotation: number): Port {
  return mod12(port + rotation * 2);
}

function unrotatePort(port: Port, rotation: number): Port {
  return mod12(port - rotation * 2);
}

function axialDistance(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

function axialToScreen(q: number, r: number, hexScreen: number, offsetX: number, offsetY: number): { x: number; y: number } {
  const center = hexCenter(q, r, hexScreen);
  return { x: CANVAS_W / 2 + offsetX + center.x, y: CANVAS_H / 2 + offsetY + center.y };
}

function radiusCells(radius: number): Axial[] {
  const cells: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (axialDistance(q, r) <= radius) cells.push({ q, r });
    }
  }
  return cells;
}

function normalizePairing(source: unknown): Pairing | null {
  if (!Array.isArray(source) || source.length !== 6) return null;
  const pairs: Pairing = [];
  const used = new Set<number>();
  for (const item of source) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const a = Number(item[0]);
    const b = Number(item[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 11 || b < 0 || b > 11 || a === b) return null;
    if (used.has(a) || used.has(b)) return null;
    used.add(a);
    used.add(b);
    pairs.push([a, b]);
  }
  return used.size === 12 ? pairs : null;
}

function resolveLevel(config: LevelConfig, index: number): ResolvedLevel {
  const radius = Number.isFinite(config.radius) ? Math.max(1, Math.floor(config.radius ?? DEFAULT_BOARD_RADIUS)) : DEFAULT_BOARD_RADIUS;
  const usesRadiusCells = !(Array.isArray(config.cells) && config.cells.length > 0);
  const cells = Array.isArray(config.cells) && config.cells.length > 0
    ? config.cells
      .map((cell) => ({ q: Math.trunc(Number(cell.q)), r: Math.trunc(Number(cell.r)) }))
      .filter((cell) => Number.isFinite(cell.q) && Number.isFinite(cell.r))
    : radiusCells(radius);
  const uniqueCells = Array.from(new Map(cells.map((cell) => [key(cell.q, cell.r), cell])).values());
  const start = config.start
    ? { q: Math.trunc(Number(config.start.q)), r: Math.trunc(Number(config.start.r)) }
    : { ...DEFAULT_START_CELL };
  const explicitWallKeys = Array.isArray(config.walls)
    ? new Set(config.walls.map((cell) => key(Math.trunc(Number(cell.q)), Math.trunc(Number(cell.r)))))
    : new Set<AxialKey>();
  const outerWalls = config.outerWalls ?? usesRadiusCells;
  const wallKeys = new Set<AxialKey>(explicitWallKeys);
  if (outerWalls && usesRadiusCells) {
    for (const cell of uniqueCells) {
      if (axialDistance(cell.q, cell.r) === radius) wallKeys.add(key(cell.q, cell.r));
    }
  }
  const startWall = config.startWall ?? false;
  const startExists = uniqueCells.some((cell) => cell.q === start.q && cell.r === start.r);
  const playableCells = uniqueCells.filter((cell) => !wallKeys.has(key(cell.q, cell.r)));
  const resolvedStart = startExists ? start : playableCells[0] ?? uniqueCells[0] ?? { ...DEFAULT_START_CELL };
  if (startWall) wallKeys.add(key(resolvedStart.q, resolvedStart.r));
  else wallKeys.delete(key(resolvedStart.q, resolvedStart.r));
  const tileLibrary = (Array.isArray(config.tileLibrary) ? config.tileLibrary.map(normalizePairing).filter(Boolean) : []) as Pairing[];
  const boardCells = uniqueCells.length > 0 ? uniqueCells : radiusCells(DEFAULT_BOARD_RADIUS);
  const hexScreen = (Number.isFinite(config.hexScreen) ? Math.max(20, Number(config.hexScreen)) : DEFAULT_HEX_SCREEN) * .95;
  const centers = boardCells.map(cell => hexCenter(cell.q, cell.r, hexScreen));
  const centerX = (Math.min(...centers.map(p => p.x)) + Math.max(...centers.map(p => p.x))) / 2;
  const centerY = (Math.min(...centers.map(p => p.y)) + Math.max(...centers.map(p => p.y))) / 2;

  return {
    id: config.id || `level-${index + 1}`,
    name: config.name || `Level ${index + 1}`,
    cells: boardCells,
    start: resolvedStart,
    entry: Number.isInteger(config.entry) ? mod12(config.entry ?? DEFAULT_START_ENTRY) : DEFAULT_START_ENTRY,
    hexScreen,
    hexWorld: Number.isFinite(config.hexWorld) ? Math.max(0.45, Number(config.hexWorld)) : DEFAULT_HEX_WORLD,
    boardOffsetX: Number(config.boardOffsetX ?? 0) + DEFAULT_BOARD_OFFSET_X - centerX,
    boardOffsetY: Number(config.boardOffsetY ?? 0) + DEFAULT_BOARD_OFFSET_Y - centerY,
    wallKeys,
    startWall,
    randomStartExit: config.randomStartExit ?? startWall,
    tileLibrary: tileLibrary.length > 0 ? tileLibrary : TILE_LIBRARY,
  };
}

function tileScale(level: ResolvedLevel): { x: number; y: number } {
  const size = hexPlaneSize(level.hexScreen);
  return { x: size.width / CANVAS_W * VIEW_W, y: size.height / CANVAS_H * VIEW_H };
}

function screenToWorld(x: number, y: number, z = 0): [number, number, number] {
  return [
    (x / CANVAS_W - 0.5) * VIEW_W,
    -(y / CANVAS_H - 0.5) * VIEW_H,
    z,
  ];
}



function makeCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}



function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext ?? null;
}

function findConnectedPort(tile: TileDef, rotation: number, entry: Port): Port | null {
  const localEntry = unrotatePort(entry, rotation);
  for (const [a, b] of tile.pairs) {
    if (a === localEntry) return rotatePort(b, rotation);
    if (b === localEntry) return rotatePort(a, rotation);
  }
  return null;
}

function isActivePair(tile: TileDef, rotation: number, pair: [Port, Port], activeEntry: Port | null | undefined): boolean {
  if (activeEntry == null) return false;
  const a = rotatePort(pair[0], rotation);
  const b = rotatePort(pair[1], rotation);
  return a === activeEntry || b === activeEntry;
}

function hasActivePair(tile: TileDef, rotation: number, pair: [Port, Port], activeEntries: readonly Port[]): boolean {
  return activeEntries.some((entry) => isActivePair(tile, rotation, pair, entry));
}

function activeSegmentKeys(tile: TileDef, rotation: number, activeEntries: readonly Port[]): Set<string> {
  const segments = new Set<string>();
  for (const entry of activeEntries) {
    const exit = findConnectedPort(tile, rotation, entry);
    if (exit == null) continue;
    const a = Math.min(entry, exit);
    const b = Math.max(entry, exit);
    segments.add(`${a}-${b}`);
  }
  return segments;
}

function strokePortPath(ctx: CanvasRenderingContext2D, startPort: Port, endPort: Port): void {
  const curve = pathCurve(startPort, endPort);
  ctx.beginPath(); ctx.moveTo(curve.start.x, curve.start.y);
  ctx.bezierCurveTo(curve.control1.x, curve.control1.y, curve.control2.x, curve.control2.y, curve.end.x, curve.end.y);
  ctx.stroke();
}

function strokeStraightPath(ctx: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }): void {
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawHexPath(
  tile: TileDef | null,
  rotation: number,
  options: {
    fill: string;
    stroke: string;
    path: string;
    glow?: boolean;
    entry?: number | null;
    exit?: number | null;
    activeEntry?: number | null;
    activeEntries?: Port[];
    pulseEntries?: Port[];
    pulse?: number;
    sourceExit?: Port | null;
    label?: string;
    markers?: boolean;
    baseImage?: HTMLCanvasElement | null;
  },
): HTMLCanvasElement {
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  if (options.baseImage) ctx.drawImage(options.baseImage, 0, 0, 256, 256);
  ctx.save(); ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (options.sourceExit != null) {
    const end = portPoint(options.sourceExit);
    const start = portPoint(options.sourceExit, SOURCE_EXIT_INSET);
    ctx.strokeStyle = '#171f1b'; ctx.lineWidth = 10.5; strokeStraightPath(ctx, start, end);
  }
  if (tile) {
    const active = options.activeEntries ?? (options.activeEntry == null ? [] : [options.activeEntry]);
    ctx.save(); ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const point = hexPoint(i, 118);
      if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    }
    ctx.closePath(); ctx.clip();
    for (const [a, b] of tile.pairs) {
      ctx.strokeStyle = 'rgba(255,248,229,.96)'; ctx.lineWidth = 5;
      strokePortPath(ctx, rotatePort(a, rotation), rotatePort(b, rotation));
    }
    ctx.restore();
    for (const [a, b] of tile.pairs) {
      if (!hasActivePair(tile, rotation, [a, b], active)) continue;
      const pulse = hasActivePair(tile, rotation, [a, b], options.pulseEntries ?? []) ? (options.pulse ?? 0) : 0;
      ctx.strokeStyle = 'rgba(24,29,25,.24)'; ctx.lineWidth = 16 + pulse * 2;
      strokePortPath(ctx, rotatePort(a, rotation), rotatePort(b, rotation));
      ctx.strokeStyle = '#171f1b'; ctx.lineWidth = 10.5 + pulse;
      strokePortPath(ctx, rotatePort(a, rotation), rotatePort(b, rotation));
      ctx.strokeStyle = 'rgba(11,18,13,.45)'; ctx.lineWidth = 3;
      strokePortPath(ctx, rotatePort(a, rotation), rotatePort(b, rotation));
    }
  }
  ctx.restore();
  return canvas;
}

function drawTextTexture(
  text: string,
  options: {
    width?: number;
    height?: number;
    fontSize?: number;
    color?: string;
    background?: string;
    align?: CanvasTextAlign;
    weight?: number;
  } = {},
): HTMLCanvasElement {
  const width = options.width ?? 512;
  const height = options.height ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.roundRect(0, 0, width, height, 22);
    ctx.fill();
  }
  ctx.font = `${options.weight ?? 500} ${options.fontSize ?? 42}px ${INK_FONT}`;
  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = options.color ?? '#f8fafc';
  const x = options.align === 'left' ? 24 : width / 2;
  const lines = text.split('\n');
  const lineHeight = (options.fontSize ?? 42) * 1.16;
  const startY = height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + index * lineHeight);
  });
  return canvas;
}



class EntanglementPathGame {
  private readonly saves = new SingleSlotGameSave<EntanglementSaveData>({
    gameId: 'entanglement-path',
    name: '阡陌交通 自动存档',
    validateData: isEntanglementSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private cells = new Map<AxialKey, BoardCell>();
  private levels: ResolvedLevel[] = [resolveLevel(DEFAULT_LEVEL, 0)];
  private levelIndex = 0;
  private level: ResolvedLevel = requiredItemAt(this.levels, 0, 'entanglement levels');
  private placed = new Map<AxialKey, PlacedTile>();
  private current: Axial = { ...this.level.start };
  private incomingSide = this.level.entry;
  private pathStart: Axial = { ...this.level.start };
  private pathEntry = this.level.entry;
  private sourceExit: Port | null = null;
  private phase: Phase = 'playing';
  private score = 0;
  private pathLength = 0;
  private best = 0;
  private bestByLevel: number[] = [];
  private tileSerial = 0;
  private nextTile: TileDef = this.randomTile();
  private reserveTile: TileDef = this.randomTile();
  private rotation = 0;
  private reserveRotation = 0;
  private previewMaterial!: BasicMaterial;
  private previewTransform!: CartesianTransform3D;
  private previewMesh!: Mesh3D;
  private previewEntity: Entity | null = null;
  private reserveTransform!: CartesianTransform3D;
  private reserveMesh!: Mesh3D;
  private reserveEntity: Entity | null = null;
  private swapPanelTransform!: CartesianTransform3D;
  private swapHoverTarget = 0;
  private swapHoverAmount = 0;
  private swapAnimationStart = 0;
  private swapAnimationActive = false;
  private readonly swapAnimationDuration = 260;
  private swapOverlays: SwapOverlay[] = [];
  private scoreText!: TextPlane;
  private restartText!: TextPlane;
  private highlightedKey: AxialKey | null = null;
  private activeEntries = new Map<AxialKey, Port[]>();
  private previewTextureCache = new Map<string, GPUTexture>();
  private reserveTextureCache = new Map<string, GPUTexture>();
  private pathPulse = 0;
  private lastPathPulseBucket = -1;
  private previousBreathingEntries = new Map<AxialKey, Port[]>();
  private sfxContext: AudioContext | null = null;
  private sfxBuffer: AudioBuffer | null = null;
  private turnBuffers: AudioBuffer[] = [];
  private endBuffer: AudioBuffer | null = null;
  private sfxLoading: Promise<void> | null = null;
  private turnLoading: Promise<void> | null = null;
  private endLoading: Promise<void> | null = null;
  private previewRenderedRotation = 0;
  private previewSpinActive = false;
  private previewSpinStart = 0;
  private previewSpinFrom = 0;
  private previewSpinTo = 0;
  private readonly previewSpinDuration = 160;
  private wheelAccumulator = 0;
  private readonly wheelRotateThreshold = 180;
  private scorePopups: FloatingScoreLabel[] = [];
  private rotateButtons: RotateButtonState[] = [];
  private pointerCanvasPoint: { x: number; y: number } | null = null;

  private art!: InkArt;
  private intro!: ScrollReveal;
  private introTexture: GPUTexture | null = null;
  private introEntity: Entity | null = null;
  private introStarted = 0;
  private introElapsed = 0;
  private introLastFrame = -1;
  private introActive = true;
  private camera!: Camera3D;
  private cameraTransform!: CartesianTransform3D;
  private backgroundTransform!: CartesianTransform3D;
  private introTransform: CartesianTransform3D | null = null;
  private music!: MusicPlayerComponent;
  private readonly uiPlanes = new Map<string, { transform: CartesianTransform3D; x: number; y: number; z: number }>();
  private viewWidth = VIEW_W;
  private viewHeight = VIEW_H;
  private cameraX = 0;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new GameEngine({
      canvas,
      clearColor: { r: 0.06, g: 0.10, b: 0.13, a: 1 },
      msaaSamples: 4,
      devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2),
    });
    await this.engine.init();
    this.world = new World('阡陌交通');
    this.setupCamera();
    this.art = await InkArt.load();
    this.buildBackground();
    this.setupMusic();
    void this.loadSfxSound();
    void this.loadTurnSounds();
    void this.loadEndSound();
    this.levels = await this.loadLevels();
    await this.loadOrStart();
    this.buildDecorations();
    this.buildPanel();
    this.bindInput(canvas);
    this.syncAll();
    this.updateViewport();
    this.startIntro();
    this.engine.on('update', ({ detail: { time } }) => {
      this.updateSwapPanelHover();
      this.updateSwapAnimation();
      this.updateScorePopups();
      this.updateCurrentCell();
      this.updateRotateButtons();
      this.updatePreviewRotationAnimation();
      this.updatePathPulse();
      this.updateIntro();
      this.world.update(time, 16);
    });
    window.addEventListener('resize', () => {
      this.engine.resizeToDisplaySize();
      this.updateViewport();
    });
    this.engine.resizeToDisplaySize();
    this.engine.run();
  }

  private async loadLevels(): Promise<ResolvedLevel[]> {
    try {
      const response = await fetch('./levels.json');
      if (!response.ok) throw new Error(`Failed to load levels.json: ${response.status}`);
      const data = await response.json() as LevelFile;
      if (!Array.isArray(data.levels) || data.levels.length === 0) throw new Error('levels.json has no levels.');
      return data.levels.map((level, index) => resolveLevel(level, index));
    } catch (error) {
      console.warn('Using built-in Entanglement level fallback.', error);
      return [resolveLevel(DEFAULT_LEVEL, 0)];
    }
  }



  private async loadSfxSound(): Promise<void> {
    if (this.sfxBuffer) return;
    if (this.sfxLoading) return this.sfxLoading;
    this.sfxLoading = this.loadSfxSoundBuffer();
    return this.sfxLoading;
  }

  private async loadSfxSoundBuffer(): Promise<void> {
    this.sfxBuffer = await this.loadSoundBuffer('./assets/sfx.ogg');
  }

  private async loadTurnSounds(): Promise<void> {
    if (this.turnBuffers.length > 0) return;
    if (this.turnLoading) return this.turnLoading;
    this.turnLoading = Promise.all([
      this.loadSoundBuffer('./assets/Turn0.ogg'),
      this.loadSoundBuffer('./assets/Turn1.ogg'),
      this.loadSoundBuffer('./assets/Turn2.ogg'),
    ]).then((buffers) => {
      this.turnBuffers = buffers.filter((buffer): buffer is AudioBuffer => Boolean(buffer));
    });
    return this.turnLoading;
  }

  private async loadEndSound(): Promise<void> {
    if (this.endBuffer) return;
    if (this.endLoading) return this.endLoading;
    this.endLoading = this.loadSoundBuffer('./assets/end-game.ogg').then((buffer) => {
      this.endBuffer = buffer;
    });
    return this.endLoading;
  }

  private async loadSoundBuffer(url: string): Promise<AudioBuffer | null> {
    const ContextCtor = getAudioContextConstructor();
    if (!ContextCtor) return null;
    this.sfxContext = this.sfxContext ?? new ContextCtor();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load sound: ${url}`);
    return this.sfxContext.decodeAudioData(await response.arrayBuffer());
  }

  private async playSfxClip(title: string, volume = 0.58): Promise<void> {
    await this.loadSfxSound().catch(() => undefined);
    const clip = SFX_CLIPS.find((item) => item.title === title);
    if (!clip) return;
    this.playSoundClip(this.sfxBuffer, clip.start, clip.length ?? Math.max(0, (clip.end ?? clip.start) - clip.start), volume);
  }

  private async playLineSound(addedLength: number): Promise<void> {
    if (addedLength <= 0) return;
    const bucket = Math.min(10, Math.max(1, Math.floor(addedLength)));
    const clips = LINE_SFX_BY_LENGTH[bucket] ?? LINE_SFX_BY_LENGTH[10] ?? [];
    if (clips.length === 0) return;
    const title = requiredItemAt(clips, Math.floor(Math.random() * clips.length), 'entanglement line sounds');
    await this.playSfxClip(title, 0.62);
  }

  private async playTurnSound(): Promise<void> {
    await this.loadTurnSounds().catch(() => undefined);
    if (this.turnBuffers.length === 0) return;
    this.playSoundBuffer(requiredItemAt(this.turnBuffers, Math.floor(Math.random() * this.turnBuffers.length), 'entanglement turn sounds'), 0.46);
  }

  private async playEndSound(): Promise<void> {
    await this.loadEndSound().catch(() => undefined);
    this.playSoundBuffer(this.endBuffer, 0.62);
  }

  private async playSoundBuffer(buffer: AudioBuffer | null, volume: number): Promise<void> {
    if (!this.sfxContext || !buffer) return;
    if (this.sfxContext.state === 'suspended') {
      await this.sfxContext.resume().catch(() => undefined);
    }
    const source = this.sfxContext.createBufferSource();
    const gain = this.sfxContext.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.sfxContext.destination);
    source.start();
  }

  private async playSoundClip(buffer: AudioBuffer | null, start: number, duration: number, volume: number): Promise<void> {
    if (!this.sfxContext || !buffer || duration <= 0) return;
    if (this.sfxContext.state === 'suspended') {
      await this.sfxContext.resume().catch(() => undefined);
    }
    const source = this.sfxContext.createBufferSource();
    const gain = this.sfxContext.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.sfxContext.destination);
    source.start(0, start, duration);
  }

  private setupCamera(): void {
    const camera = new Camera3D({
      type: 'orthographic',
      near: 0.1,
      far: 100,
      left: -VIEW_W / 2,
      right: VIEW_W / 2,
      top: VIEW_H / 2,
      bottom: -VIEW_H / 2,
    });
    const transform = new CartesianTransform3D({ position: [0, 0, 10] });
    this.camera = camera; this.cameraTransform = transform;
    const entity = new Entity('Camera');
    entity.addComponent(camera);
    entity.addComponent(transform);
    this.world.addEntity(entity);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'EntanglementPath.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    // These are display-authored 2D sprites; HDR tone mapping dulls their colors.
    this.world.addSystem(new Render3DSystem(this.engine, entity, { loadOp: 'clear', transparentSort: true, toneMapping: 'none' }));
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private buildBackground(): void {
    const material = new BasicMaterial({ texture: this.art.landscape, blending: 'none', depthWrite: false });
    const entity = new Entity('Ink Landscape Scroll');
    this.backgroundTransform = new CartesianTransform3D({ position: [0, 0, -.55], scale: [VIEW_W, VIEW_H, 1] });
    entity.addComponent(this.backgroundTransform);
    entity.addComponent(new Mesh3D(createPlane3D({ width: 1, height: 1 }), material)); this.world.addEntity(entity);
  }

  private updateViewport(): void {
    const rect = this.engine.canvas!.getBoundingClientRect();
    const aspect = Math.max(1, rect.width) / Math.max(1, rect.height), portrait = aspect < .95;
    this.viewWidth = portrait ? 10.2 : Math.max(VIEW_W, VIEW_H * aspect);
    this.viewHeight = this.viewWidth / aspect;
    this.cameraX = portrait ? screenToWorld(CANVAS_W / 2 + DEFAULT_BOARD_OFFSET_X, CANVAS_H / 2)[0] : 0;
    this.camera.orthoLeft = -this.viewWidth / 2; this.camera.orthoRight = this.viewWidth / 2;
    this.camera.orthoTop = this.viewHeight / 2; this.camera.orthoBottom = -this.viewHeight / 2;
    this.cameraTransform.setPosition(this.cameraX, 0, 10);
    this.backgroundTransform.setPosition(this.cameraX, 0, -.55).setScale(this.viewWidth, this.viewHeight, 1);
    this.introTransform?.setPosition(this.cameraX, 0, 4).setScale(this.viewWidth, this.viewHeight, 1);
    for (const item of this.uiPlanes.values()) item.transform.setPosition(...screenToWorld(item.x, item.y, item.z));
    const place = (name: string, x: number, y: number) => {
      const item = this.uiPlanes.get(name); item?.transform.setPosition(x, y, item.z);
    };
    const panelX = portrait ? this.cameraX - this.viewWidth / 2 + 1.9 : screenToWorld(SWAP_PANEL_LEFT + SWAP_PANEL_W / 2, 0)[0];
    const panelY = portrait ? this.viewHeight / 2 - 5.5 : screenToWorld(0, CANVAS_H - SWAP_PANEL_BOTTOM - SWAP_PANEL_H / 2)[1];
    this.swapPanelTransform.setPosition(panelX, panelY, SWAP_PANEL_Z);
    this.reserveTransform.setPosition(panelX, panelY - .23, SWAP_TILE_Z);
    if (portrait) {
      const top = this.viewHeight / 2;
      place('Ink Title', this.cameraX - 2.5, top - 3.1);
      place('Ink Subtitle', this.cameraX - 2.5, top - 3.85);
      place('Ink Seal', this.cameraX - .70, top - 3.1);
      place('Swap Title', panelX, panelY + .76);
      place('Ink Instructions', panelX, panelY - 1.22);
      place('Restart Prompt', this.cameraX, -this.viewHeight * .25);
    }
    const score = this.uiPlanes.get('Score Panel');
    if (score) {
      const scale = portrait ? 1.2 : 1;
      const width = SCORE_PANEL_W / CANVAS_W * VIEW_W * scale;
      const height = SCORE_PANEL_H / CANVAS_H * VIEW_H * scale;
      score.transform.setScale(width, height, 1);
      place('Score Panel', this.cameraX + this.viewWidth * .432 - width / 2,
        this.viewHeight * .425 - .35 - height / 2);
    }
  }

  private startIntro(): void {
    this.intro = new ScrollReveal(this.art); this.introStarted = gameTime();
    this.introTexture = this.canvasToGpuTexture(this.intro.draw(0));
    const entity = new Entity('Unrolling Ink Scroll');
    this.introTransform = new CartesianTransform3D({ position: [this.cameraX, 0, 4], scale: [this.viewWidth, this.viewHeight, 1] });
    entity.addComponent(this.introTransform);
    entity.addComponent(new Mesh3D(createPlane3D({ width: 1, height: 1 }), new BasicMaterial({ texture: this.introTexture, blending: 'normal', depthWrite: false })));
    this.world.addEntity(entity); this.introEntity = entity;
  }

  private updateIntro(): void {
    if (!this.introActive) return;
    this.introElapsed = gameTime() - this.introStarted;
    if (this.introElapsed >= INTRO_DURATION_MS) {
      this.introActive = false;
      if (this.introEntity) this.world.removeEntity(this.introEntity);
      this.introEntity = null; this.introTransform = null; this.introTexture?.destroy(); this.introTexture = null;
      return;
    }
    const frame = Math.floor(this.introElapsed / 40);
    if (frame === this.introLastFrame) return;
    this.introLastFrame = frame;
    if (this.introTexture) this.uploadCanvas(this.introTexture, this.intro.draw(this.introElapsed));
  }

  private setupMusic(): void {
    const music = new Entity('Music');
    this.music = new MusicPlayerComponent({
      urls: ['./assets/bgm.mp3'],
      volume: 0.5,
      autoplay: true,
      loop: true,
    });
    music.addComponent(this.music);
    this.world.addEntity(music);
  }

  private getBlockTile(row: number, variant: number): HTMLCanvasElement {
    return this.art.tile(row === 1 ? 'wall' : row === 2 ? 'path' : 'pigment', variant);
  }

  private drawBaseCell(cell: Pick<BoardCell, 'wall' | 'variant'> & Partial<Pick<BoardCell, 'source'>>): HTMLCanvasElement {
    const source = Boolean(cell.source);
    const baseImage = source ? this.art.tile('source', cell.variant) : this.getBlockTile(cell.wall ? 1 : 0, cell.variant);
    const texture = drawHexPath(null, 0, {
      fill: cell.wall ? '#2d3340' : '#16252d',
      stroke: cell.wall ? '#5b6470' : '#314852',
      path: '#80ed99',
      sourceExit: source ? this.sourceExit : null,
      baseImage,
      markers: false,
    });
    if (source) this.drawSourcePathLength(texture);
    return texture;
  }

  private drawSourcePathLength(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    this.art.drawNumber(ctx, this.pathLength, 128, 86, 78, PAPER, 'center');
  }

  private buildBoard(): void {
    for (const { q, r } of this.level.cells) {
        const cellKey = key(q, r);
        const source = this.level.startWall && cellKey === key(this.level.start.q, this.level.start.r);
        const wall = this.level.wallKeys.has(cellKey) || source;
        const variant = cellPigment(q, r, this.levelIndex);
        const screen = axialToScreen(q, r, this.level.hexScreen, this.level.boardOffsetX, this.level.boardOffsetY);
        const material = new BasicMaterial({
          texture: this.canvasToGpuTexture(this.drawBaseCell({ wall, source, variant })),
          blending: 'normal',
          depthWrite: false,
        });
        const transform = new CartesianTransform3D({
          position: screenToWorld(screen.x, screen.y, 0),
          scale: [tileScale(this.level).x, tileScale(this.level).y, 1],
        });
        const entity = new Entity(`Cell ${q},${r}`);
        const mesh = new Mesh3D(createPlane3D({ width: 1, height: 1 }), material);
        entity.addComponent(transform);
        entity.addComponent(mesh);
        this.world.addEntity(entity);
        this.cells.set(cellKey, { q, r, entity, transform, material, mesh, screenX: screen.x, screenY: screen.y, wall, source, variant });
    }
  }

  private buildPanel(): void {
    this.scoreText = this.createText('Score Panel', '', 958, 88, SCORE_PANEL_W, SCORE_PANEL_H, 24, INK);

    const previewMat = new BasicMaterial({
      texture: this.getPreviewTexture(),
      blending: 'normal',
      depthWrite: false,
    });
    const previewTransform = new CartesianTransform3D({
      position: screenToWorld(CANVAS_W / 2, CANVAS_H / 2, 0.26),
      scale: [tileScale(this.level).x, tileScale(this.level).y, 1],
    });
    const preview = new Entity('Next Tile');
    const previewMesh = new Mesh3D(createPlane3D({ width: 1, height: 1 }), previewMat);
    preview.addComponent(previewTransform);
    preview.addComponent(previewMesh);
    this.world.addEntity(preview);
    this.previewEntity = preview;
    this.previewMaterial = previewMat;
    this.previewTransform = previewTransform;
    this.previewMesh = previewMesh;

    this.buildRotateButtons();
    this.buildSwapPanel();
    const reserveMat = new BasicMaterial({
      texture: this.getReserveTexture(),
      blending: 'normal',
      depthWrite: false,
    });
    const reserveTransform = new CartesianTransform3D({
      position: screenToWorld(SWAP_TILE_LEFT + SWAP_TILE_W / 2, CANVAS_H - SWAP_TILE_BOTTOM - SWAP_TILE_H / 2, SWAP_TILE_Z),
      scale: [SWAP_TILE_W / CANVAS_W * VIEW_W, SWAP_TILE_H / CANVAS_H * VIEW_H, 1],
    });

    const reserve = new Entity('Reserve Tile');
    const reserveMesh = new Mesh3D(createPlane3D({ width: 1, height: 1 }), reserveMat);
    reserve.addComponent(reserveTransform);
    reserve.addComponent(reserveMesh);
    this.world.addEntity(reserve);
    this.reserveEntity = reserve;
    this.reserveTransform = reserveTransform;
    this.reserveMesh = reserveMesh;
    this.restartText = this.createText(
      'Restart Prompt',
      '路线已结束\n点击画面重新开始\n也可按空格或回车',
      360, 580, 480, 120, 24, PAPER, 'center', 500, undefined, 2,
    );
    const restart = this.art.panel('dark', 480, 120), restartCtx = restart.getContext('2d')!;
    restartCtx.drawImage(drawTextTexture('此局已尽\n点击画面重新落笔\n也可按空格或回车', { width: 480, height: 120, fontSize: 24, color: PAPER }), 0, 0);
    this.uploadCanvas(this.restartText.material.texture as GPUTexture, restart);
    this.restartText.material.color.a = 0;
  }

  private buildRotateButtons(): void {
    this.rotateButtons = [
      this.createRotateButton('ccw', -1, 0, 0.5),
      this.createRotateButton('cw', 1, 0.5, 1),
    ];
  }

  private createRotateButton(kind: RotateButtonKind, direction: -1 | 1, _u0: number, _u1: number): RotateButtonState {
    const material = new BasicMaterial({
      texture: this.canvasToGpuTexture(this.art.rotationArrow(direction === 1)),
      color: [1, 1, 1, 0],
      blending: 'normal',
      depthWrite: false,
    });
    const transform = new CartesianTransform3D({
      position: [0, 0, ROTATE_BUTTON_Z],
      scale: [0, 0, 1],
    });
    const entity = new Entity(`Rotate Button ${kind}`);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createPlane3D({ width: 1, height: 1 }), material));
    this.world.addEntity(entity);
    return {
      kind,
      entity,
      transform,
      material,
      direction,
      hoverAmount: 0,
      pressStart: -Infinity,
    };
  }

  private buildDecorations(): void {
    const title = this.createText('Ink Title', '', 64, 96, 232, 100, 64, INK);
    this.uploadCanvas(title.material.texture as GPUTexture, this.art.title(232, 100));
    this.createText('Ink Subtitle', '一 笔 入 山 河', 76, 198, 204, 28, 16, '#645f4d', 'center', 400);
    this.createText('Ink Instructions', 'X / LB 逆时针\nY / RB 顺时针 · A 落笔', 77, 477, 216, 36, 14, INK, 'center', 400);
    this.createText('Ink Seal', '丹青', 296, 126, 26, 44, 16, PAPER, 'center', 500, '#a23d2d');
  }

  private buildSwapPanel(): void {
    const transform = new CartesianTransform3D({
      position: screenToWorld(SWAP_PANEL_LEFT + SWAP_PANEL_W / 2, CANVAS_H - SWAP_PANEL_BOTTOM - SWAP_PANEL_H / 2, SWAP_PANEL_Z),
      scale: [SWAP_PANEL_W / CANVAS_W * VIEW_W, SWAP_PANEL_H / CANVAS_H * VIEW_H, 1],
    });
    this.swapPanelTransform = transform;
    this.createText('Swap Title', '换 一 笔', SWAP_PANEL_LEFT, CANVAS_H - SWAP_PANEL_BOTTOM - SWAP_PANEL_H + 15, SWAP_PANEL_W, 34, 22, INK, 'center', 500, undefined, SWAP_TEXT_Z);
  }

  private createText(
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    color: string,
    align: CanvasTextAlign = 'center',
    weight = 800,
    background?: string,
    z = 0.3,
  ): TextPlane {
    const material = new BasicMaterial({
      texture: this.canvasToGpuTexture(drawTextTexture(text, {
        width,
        height,
        fontSize,
        color,
        align,
        weight,
        ...(background === undefined ? {} : { background }),
      })),
      blending: 'normal',
      depthWrite: false,
    });
    const transform = new CartesianTransform3D({
      position: screenToWorld(x + width / 2, y + height / 2, z),
      scale: [width / CANVAS_W * VIEW_W, height / CANVAS_H * VIEW_H, 1],
    });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createPlane3D({ width: 1, height: 1 }), material));
    this.world.addEntity(entity);
    this.uiPlanes.set(name, { transform, x: x + width / 2, y: y + height / 2, z });
    return { material, transform };
  }



  private setCellTexture(cell: BoardCell, source: HTMLCanvasElement): void {
    this.uploadCanvas(cell.material.texture as GPUTexture, source);
  }

  private uploadCanvas(texture: GPUTexture, source: HTMLCanvasElement): void {
    this.engine.device.queue.copyExternalImageToTexture({ source }, { texture }, { width: source.width, height: source.height });
  }

  private canvasToGpuTexture(source: HTMLCanvasElement): GPUTexture {
    const texture = this.engine.device.createTexture({
      size: { width: source.width, height: source.height },
      // Canvas pixels are sRGB, like the image textures loaded by BasicMaterial.
      format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.engine.device.queue.copyExternalImageToTexture(
      { source },
      { texture },
      { width: source.width, height: source.height },
    );
    return texture;
  }

  private getPreviewTexture(rotation = this.rotation, pulse = 0): GPUTexture {
    const pulseBucket = Math.round(pulse * 8);
    const cacheKey = `${this.nextTile.id}:${rotation}:${this.incomingSide}:${pulseBucket}`;
    const cached = this.previewTextureCache.get(cacheKey);
    if (cached) return cached;
    const texture = this.canvasToGpuTexture(drawHexPath(this.nextTile, rotation, {
      fill: '#243b4a',
      stroke: '#7dd3fc',
      path: '#d93a2f',
      glow: true,
      entry: this.incomingSide,
      activeEntry: this.incomingSide,
      pulse: pulseBucket / 8,
      markers: false,
      baseImage: this.getBlockTile(2, this.nextTile.variant),
    }));
    this.previewTextureCache.set(cacheKey, texture);
    return texture;
  }

  private getReserveTexture(): GPUTexture {
    const cacheKey = `${this.reserveTile.id}:${this.reserveRotation}`;
    const cached = this.reserveTextureCache.get(cacheKey);
    if (cached) return cached;
    const texture = this.canvasToGpuTexture(drawHexPath(this.reserveTile, this.reserveRotation, {
      fill: '#243b4a',
      stroke: '#7dd3fc',
      path: '#d93a2f',
      markers: false,
      baseImage: this.getBlockTile(2, this.reserveTile.variant),
    }));
    this.reserveTextureCache.set(cacheKey, texture);
    return texture;
  }

  private createPreviewLikeTexture(tile: TileDef, rotation: number): GPUTexture {
    return this.canvasToGpuTexture(drawHexPath(tile, rotation, {
      fill: '#243b4a',
      stroke: '#7dd3fc',
      path: '#d93a2f',
      glow: true,
      entry: this.incomingSide,
      activeEntry: this.incomingSide,
      pulse: this.pathPulse,
      markers: false,
      baseImage: this.getBlockTile(2, tile.variant),
    }));
  }

  private createReserveLikeTexture(tile: TileDef, rotation: number): GPUTexture {
    return this.canvasToGpuTexture(drawHexPath(tile, rotation, {
      fill: '#243b4a',
      stroke: '#7dd3fc',
      path: '#d93a2f',
      markers: false,
      baseImage: this.getBlockTile(2, tile.variant),
    }));
  }

  private createSwapOverlay(
    name: string,
    texture: GPUTexture,
    fromPosition: [number, number, number],
    toPosition: [number, number, number],
    fromScale: [number, number, number],
    toScale: [number, number, number],
  ): SwapOverlay {
    const transform = new CartesianTransform3D({
      position: fromPosition,
      scale: fromScale,
    });
    const material = new BasicMaterial({
      texture,
      blending: 'normal',
      depthWrite: false,
    });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createPlane3D({ width: 1, height: 1 }), material));
    this.world.addEntity(entity);
    return { entity, texture, transform, fromPosition, toPosition, fromScale, toScale };
  }

  private randomTile(): TileDef {
    const library = this.level?.tileLibrary ?? TILE_LIBRARY;
    const pairs = requiredItemAt(library, Math.floor(Math.random() * library.length), 'entanglement tile library');
    return { id: ++this.tileSerial, pairs, variant: Math.floor(Math.random() * 5) };
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('click', (event) => {
      if (this.introActive) return;
      if (this.phase === 'ended') {
        this.reset();
        return;
      }
      const point = this.pointerToCanvas(canvas, event.clientX, event.clientY);
      this.pointerCanvasPoint = point;
      const rotateButton = this.hitRotateButton(point);
      if (rotateButton) {
        this.pressRotateButton(rotateButton);
        return;
      }
      if (this.hitReserveTile(event.clientX, event.clientY)) {
        this.swapReserveTile();
        return;
      }
      const current = this.cells.get(key(this.current.q, this.current.r));
      if (!current || current.wall) return;
      const dx = point.x - current.screenX;
      const dy = point.y - current.screenY;
      if (Math.hypot(dx, dy) < this.level.hexScreen * HEX_HIT_SCALE * 1.18) this.placeCurrentTile();
    });
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.rotate(1);
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.wheelAccumulator += event.deltaY;
      if (Math.abs(this.wheelAccumulator) < this.wheelRotateThreshold) return;
      this.rotate(this.wheelAccumulator > 0 ? 1 : -1);
      this.wheelAccumulator = 0;
    }, { passive: false });
    canvas.addEventListener('pointermove', (event) => {
      this.pointerCanvasPoint = this.pointerToCanvas(canvas, event.clientX, event.clientY);
      this.swapHoverTarget = this.hitReserveTile(event.clientX, event.clientY) ? 1 : 0;
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointerCanvasPoint = null;
      this.swapHoverTarget = 0;
    });
    window.addEventListener('keydown', (event) => {
      if (this.introActive) return;
      if (event.key === 'r' || event.key === 'R' || event.key === 'ArrowRight') this.rotate(1);
      if (event.key === 'ArrowLeft') this.rotate(-1);
      if (event.key === ']' || event.code === 'BracketRight' || event.key === '/' || event.code === 'Slash') this.changeLevel(1);
      if (event.key === '[' || event.code === 'BracketLeft') this.changeLevel(-1);
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (event.repeat) return;
        if (this.phase === 'ended') this.reset();
        else this.placeCurrentTile();
      }
    });
  }

  private pointerToCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (((clientX - rect.left) / rect.width - .5) * this.viewWidth + this.cameraX) / VIEW_W * CANVAS_W + CANVAS_W / 2,
      y: ((clientY - rect.top) / rect.height - .5) * this.viewHeight / VIEW_H * CANVAS_H + CANVAS_H / 2,
    };
  }

  private hitReserveTile(clientX: number, clientY: number): boolean {
    const point = this.pointerToCanvas(this.engine.canvas!, clientX, clientY);
    const world = screenToWorld(point.x, point.y);
    return Math.abs(world[0] - this.swapPanelTransform.position[0]!) <= this.swapPanelTransform.scale[0]! / 2
      && Math.abs(world[1] - this.swapPanelTransform.position[1]!) <= this.swapPanelTransform.scale[1]! / 2;
  }

  private rotateButtonCenter(kind: RotateButtonKind): { x: number; y: number } | null {
    const cell = this.cells.get(key(this.current.q, this.current.r));
    if (!cell) return null;
    return {
      x: cell.screenX + (kind === 'ccw' ? -ROTATE_BUTTON_OFFSET_X : ROTATE_BUTTON_OFFSET_X),
      y: cell.screenY + ROTATE_BUTTON_OFFSET_Y,
    };
  }

  private hitRotateButton(point: { x: number; y: number } | null): RotateButtonState | null {
    if (!point || this.phase !== 'playing') return null;
    for (const button of this.rotateButtons) {
      const center = this.rotateButtonCenter(button.kind);
      if (!center) continue;
      if (
        Math.abs(point.x - center.x) <= ROTATE_BUTTON_W * 0.5
        && Math.abs(point.y - center.y) <= ROTATE_BUTTON_H * 0.5
      ) {
        return button;
      }
    }
    return null;
  }

  private isPointerOverCurrentTile(point: { x: number; y: number } | null): boolean {
    if (!point || this.phase !== 'playing') return false;
    const cell = this.cells.get(key(this.current.q, this.current.r));
    if (!cell || cell.wall) return false;
    return Math.hypot(point.x - cell.screenX, point.y - cell.screenY) < this.level.hexScreen * HEX_HIT_SCALE * 1.18;
  }

  private pressRotateButton(button: RotateButtonState): void {
    button.pressStart = gameTime();
    this.rotate(button.direction);
  }

  private swapReserveTile(): void {
    this.finishSwapAnimation();
    const previewPosition = Array.from(this.previewTransform.position) as [number, number, number];
    const reservePosition = Array.from(this.reserveTransform.position) as [number, number, number];
    const previewScale = Array.from(this.previewTransform.scale) as [number, number, number];
    const reserveScale = Array.from(this.reserveTransform.scale) as [number, number, number];
    const tile = this.nextTile;
    const rotation = this.rotation;
    const reserveTile = this.reserveTile;
    const reserveRotation = this.reserveRotation;
    const previewTexture = this.createPreviewLikeTexture(tile, rotation);
    const reserveTexture = this.createReserveLikeTexture(reserveTile, reserveRotation);
    this.nextTile = this.reserveTile;
    this.rotation = this.reserveRotation;
    this.reserveTile = tile;
    this.reserveRotation = rotation;
    this.previewRenderedRotation = this.rotation;
    this.previewSpinActive = false;
    this.lastPathPulseBucket = -1;
    void this.playSfxClip('swap-tile', 0.58);
    this.syncPreview();
    this.syncReserve();
    this.startSwapAnimation(previewTexture, reserveTexture, previewPosition, reservePosition, previewScale, reserveScale);
    this.saveState();
  }

  private startSwapAnimation(
    previewTexture: GPUTexture,
    reserveTexture: GPUTexture,
    previewPosition: [number, number, number],
    reservePosition: [number, number, number],
    previewScale: [number, number, number],
    reserveScale: [number, number, number],
  ): void {
    this.clearSwapOverlays();
    const previewOverlay = this.createSwapOverlay(
      'Swap Preview To Reserve',
      previewTexture,
      [previewPosition[0], previewPosition[1], 0.72],
      [reservePosition[0], reservePosition[1], 0.72],
      previewScale,
      reserveScale,
    );
    const reserveOverlay = this.createSwapOverlay(
      'Swap Reserve To Preview',
      reserveTexture,
      [reservePosition[0], reservePosition[1], 0.73],
      [previewPosition[0], previewPosition[1], 0.73],
      reserveScale,
      previewScale,
    );
    this.swapOverlays = [previewOverlay, reserveOverlay];
    this.swapAnimationStart = gameTime();
    this.swapAnimationActive = true;
    this.previewTransform.setScale(0, 0, 1);
    this.reserveTransform.setScale(0, 0, 1);
  }

  private rotate(delta: number): void {
    if (this.phase !== 'playing' || this.introActive) return;
    void this.playTurnSound();
    this.finishPreviewRotationAnimation();
    const previousRotation = this.previewRenderedRotation;
    this.rotation = mod6(this.rotation + delta);
    this.lastPathPulseBucket = -1;
    this.previewSpinFrom = 0;
    this.previewSpinTo = shortestRotationAngle(previousRotation, this.rotation);
    this.previewSpinStart = gameTime();
    this.previewSpinActive = true;
    this.saveState();
  }

  private findExitSide(tile: TileDef, rotation: number, entrySide: number): number {
    return findConnectedPort(tile, rotation, entrySide) ?? oppositePort(entrySide);
  }

  private resetPathStart(): void {
    if (!this.level.startWall) {
      this.current = { ...this.level.start };
      this.incomingSide = this.level.entry;
      this.pathStart = { ...this.current };
      this.pathEntry = this.incomingSide;
      this.sourceExit = null;
      return;
    }

    const candidates: Array<{ current: Axial; incoming: Port }> = [];
    for (let port = 0; port < 12; port++) {
      const dir = requiredItemAt(DIRECTIONS, portSide(port), 'hex directions');
      const current = { q: this.level.start.q + dir.q, r: this.level.start.r + dir.r };
      const cell = this.cells.get(key(current.q, current.r));
      if (cell && !cell.wall) candidates.push({ current, incoming: oppositePort(port) });
    }

    const index = this.level.randomStartExit ? Math.floor(Math.random() * candidates.length) : 0;
    const start = candidates[index];
    if (start) {
      this.current = { ...start.current };
      this.incomingSide = start.incoming;
      this.sourceExit = oppositePort(start.incoming);
    } else {
      this.current = { ...this.level.start };
      this.incomingSide = this.level.entry;
      this.sourceExit = null;
    }
    this.pathStart = { ...this.current };
    this.pathEntry = this.incomingSide;
  }

  private redrawSourceCell(): void {
    if (!this.level.startWall) return;
    const cell = this.cells.get(key(this.level.start.q, this.level.start.r));
    if (cell) this.setCellTexture(cell, this.drawBaseCell(cell));
  }

  private rebuildActivePath(): TraceResult {
    let current = { ...this.pathStart };
    let incoming = this.pathEntry;
    const visited = new Set<string>();
    this.activeEntries.clear();

    for (let step = 0; step < this.placed.size * 12 + 1; step++) {
      const currentKey = key(current.q, current.r);
      const cell = this.cells.get(currentKey);
      if (!cell || cell.wall) return { ended: true };

      const occupied = this.placed.get(currentKey);
      if (!occupied) {
        return { ended: false, current, incomingSide: incoming };
      }

      const traceKey = `${currentKey}:${incoming}`;
      this.addActiveEntry(currentKey, incoming);
      if (visited.has(traceKey)) return { ended: true };
      visited.add(traceKey);
      const outgoing = this.findExitSide(occupied.tile, occupied.rotation, incoming);
      const dir = requiredItemAt(DIRECTIONS, portSide(outgoing), 'hex directions');
      current = { q: current.q + dir.q, r: current.r + dir.r };
      incoming = oppositePort(outgoing);
    }

    return { ended: true };
  }

  private placeCurrentTile(): void {
    if (this.phase !== 'playing' || this.introActive) return;
    const cellKey = key(this.current.q, this.current.r);
    if (this.placed.has(cellKey)) return;
    const cell = this.cells.get(cellKey);
    if (!cell || cell.wall) return;

    const previousPathLength = this.pathLength;
    const exit = this.findExitSide(this.nextTile, this.rotation, this.incomingSide);
    const entry = this.incomingSide;
    this.placed.set(cellKey, {
      tile: this.nextTile,
      rotation: this.rotation,
      entry,
      exit,
      order: this.placed.size + 1,
    });
    const trace = this.rebuildActivePath();
    this.redrawPlacedTiles();
    this.pathLength = this.calculatePathLength();
    this.redrawSourceCell();
    const addedLength = Math.max(0, this.pathLength - previousPathLength);
    this.score += triangularScore(addedLength);
    this.spawnScorePopups(addedLength);
    void this.playLineSound(addedLength);
    if (this.score > this.best) {
      this.best = this.score;
      this.bestByLevel[this.levelIndex] = this.best;
    }
    if (trace.ended || !trace.current || trace.incomingSide == null) {
      this.phase = 'ended';
      void this.playEndSound();
      this.syncAll();
      this.saveState();
      return;
    }

    this.current = trace.current;
    this.incomingSide = trace.incomingSide;
    this.nextTile = this.randomTile();
    this.rotation = Math.floor(Math.random() * 6);
    this.previewRenderedRotation = this.rotation;
    this.previewSpinActive = false;
    this.syncAll();
    this.saveState();
  }

  private reset(): void {
    this.clearTileTextureCaches();
    for (const cellKey of this.placed.keys()) {
      const cell = this.cells.get(cellKey);
      if (!cell) continue;
      this.setCellTexture(cell, drawHexPath(null, 0, {
        fill: '#16252d',
        stroke: '#314852',
        path: '#80ed99',
        baseImage: this.getBlockTile(0, cell.variant),
        markers: false,
      }));
    }
    this.placed.clear();
    this.activeEntries.clear();
    this.previousBreathingEntries.clear();
    this.lastPathPulseBucket = -1;
    this.phase = 'playing';
    this.score = 0;
    this.pathLength = 0;
    this.resetPathStart();
    this.redrawSourceCell();
    this.highlightedKey = null;
    this.nextTile = this.randomTile();
    this.reserveTile = this.randomTile();
    this.rotation = 0;
    this.reserveRotation = 0;
    this.swapAnimationActive = false;
    this.wheelAccumulator = 0;
    this.clearSwapOverlays();
    this.clearScorePopups();
    this.previewRenderedRotation = this.rotation;
    this.previewSpinActive = false;
    this.syncAll();
    this.saveState();
  }

  private syncAll(): void {
    this.restartText.material.color.a = this.phase === 'ended' ? 1 : 0;
    this.syncPreview();
    this.syncReserve();
    this.syncScore();
    this.updateCurrentCell();
  }

  private changeLevel(delta: number): void {
    this.loadLevel(this.levelIndex + delta, true);
  }

  private loadLevel(index: number, sync: boolean): void {
    this.clearTileTextureCaches();
    this.clearBoard();
    this.levelIndex = (index + this.levels.length) % this.levels.length;
    this.level = requiredItemAt(this.levels, this.levelIndex, 'entanglement levels');
    this.best = this.bestByLevel[this.levelIndex] ?? 0;
    this.placed.clear();
    this.activeEntries.clear();
    this.previousBreathingEntries.clear();
    this.lastPathPulseBucket = -1;
    this.phase = 'playing';
    this.score = 0;
    this.pathLength = 0;
    this.highlightedKey = null;
    this.nextTile = this.randomTile();
    this.reserveTile = this.randomTile();
    this.rotation = 0;
    this.reserveRotation = 0;
    this.swapAnimationActive = false;
    this.clearSwapOverlays();
    this.clearScorePopups();
    this.previewRenderedRotation = this.rotation;
    this.previewSpinActive = false;
    this.buildBoard();
    this.resetPathStart();
    this.redrawSourceCell();
    this.raisePreviewEntity();
    if (sync) {
      this.syncAll();
      this.saveState();
    }
  }

  private async loadOrStart(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved || saved.levelIndex >= this.levels.length) {
      this.loadLevel(0, false);
      this.saveState();
      return;
    }
    this.bestByLevel = [...saved.bestByLevel];
    this.loadLevel(saved.levelIndex, false);
    this.placed = new Map(saved.placed.filter(([cellKey]) => {
      const cell = this.cells.get(cellKey);
      return !!cell && !cell.wall;
    }).map(([cellKey, placed]) => [cellKey, {
      ...placed,
      tile: { ...placed.tile, pairs: placed.tile.pairs.map(pair => [...pair] as [Port, Port]) },
    }]));
    this.current = { ...saved.current };
    this.incomingSide = saved.incomingSide;
    this.pathStart = { ...saved.pathStart };
    this.pathEntry = saved.pathEntry;
    this.sourceExit = saved.sourceExit;
    this.phase = saved.phase;
    this.score = saved.score;
    this.pathLength = saved.pathLength;
    this.nextTile = { ...saved.nextTile, pairs: saved.nextTile.pairs.map(pair => [...pair] as [Port, Port]) };
    this.reserveTile = { ...saved.reserveTile, pairs: saved.reserveTile.pairs.map(pair => [...pair] as [Port, Port]) };
    this.rotation = saved.rotation % 6;
    this.reserveRotation = saved.reserveRotation % 6;
    this.tileSerial = saved.tileSerial;
    this.previewRenderedRotation = this.rotation;
    this.rebuildActivePath();
    this.redrawPlacedTiles();
    this.redrawSourceCell();
  }

  private saveState(): void {
    this.bestByLevel[this.levelIndex] = this.best;
    this.saves.save({
      levelIndex: this.levelIndex,
      bestByLevel: [...this.bestByLevel],
      placed: [...this.placed.entries()].map(([cellKey, placed]): [AxialKey, PlacedTile] => [cellKey, {
        ...placed,
        tile: { ...placed.tile, pairs: placed.tile.pairs.map(pair => [...pair] as [Port, Port]) },
      }]),
      current: { ...this.current },
      incomingSide: this.incomingSide,
      pathStart: { ...this.pathStart },
      pathEntry: this.pathEntry,
      sourceExit: this.sourceExit,
      phase: this.phase,
      score: this.score,
      pathLength: this.pathLength,
      nextTile: { ...this.nextTile, pairs: this.nextTile.pairs.map(pair => [...pair] as [Port, Port]) },
      reserveTile: { ...this.reserveTile, pairs: this.reserveTile.pairs.map(pair => [...pair] as [Port, Port]) },
      rotation: this.rotation,
      reserveRotation: this.reserveRotation,
      tileSerial: this.tileSerial,
    });
  }

  private raisePreviewEntity(): void {
    if (!this.previewEntity || !this.world.hasEntity(this.previewEntity)) return;
    this.world.removeEntity(this.previewEntity);
    this.world.addEntity(this.previewEntity);
    if (this.reserveEntity && this.world.hasEntity(this.reserveEntity)) {
      this.world.removeEntity(this.reserveEntity);
      this.world.addEntity(this.reserveEntity);
    }
  }

  private clearBoard(): void {
    for (const cell of this.cells.values()) {
      this.world.removeEntity(cell.entity);
      (cell.material.texture as GPUTexture).destroy();
    }
    this.cells.clear();
  }

  private clearTileTextureCaches(): void {
    for (const texture of this.previewTextureCache.values()) texture.destroy();
    for (const texture of this.reserveTextureCache.values()) texture.destroy();
    this.previewTextureCache.clear(); this.reserveTextureCache.clear();
  }

  private addActiveEntry(cellKey: AxialKey, entry: Port): void {
    const entries = this.activeEntries.get(cellKey);
    if (!entries) {
      this.activeEntries.set(cellKey, [entry]);
      return;
    }
    if (!entries.includes(entry)) entries.push(entry);
  }

  private redrawPlacedTiles(breathingEntries = new Map<AxialKey, Port[]>(), pulse = 0): void {
    for (const cellKey of this.placed.keys()) {
      this.redrawPlacedTile(cellKey, breathingEntries, pulse);
    }
  }

  private redrawPlacedTile(cellKey: AxialKey, breathingEntries: Map<AxialKey, Port[]>, pulse: number): void {
    const placed = this.placed.get(cellKey);
    const cell = this.cells.get(cellKey);
    if (!placed || !cell) return;
    const activeEntries = this.mergeEntries(this.activeEntries.get(cellKey), breathingEntries.get(cellKey), [placed.entry]);
    const pulseEntries = breathingEntries.get(cellKey) ?? [];
      this.setCellTexture(cell, drawHexPath(placed.tile, placed.rotation, {
        fill: '#263241',
        stroke: '#f6c85f',
      path: '#d93a2f',
      entry: placed.entry,
      exit: placed.exit,
      activeEntries,
        pulseEntries,
        pulse: breathingEntries.has(cellKey) ? pulse : 0,
        markers: false,
      baseImage: this.getBlockTile(2, cell.variant),
      }));
  }

  private mergeEntries(primary?: readonly Port[], secondary?: readonly Port[], baseEntries: readonly Port[] = []): Port[] {
    // A revisited tile adds active segments; it must not replace the segment
    // that became active when the tile was originally placed.
    const merged = new Set<Port>(baseEntries);
    for (const entry of primary ?? []) merged.add(entry);
    for (const entry of secondary ?? []) merged.add(entry);
    return [...merged];
  }

  private tracePreviewContinuationEntries(): Map<AxialKey, Port[]> {
    const entries = new Map<AxialKey, Port[]>();
    const previewKey = key(this.current.q, this.current.r);
    let current = { ...this.pathStart };
    let incoming = this.pathEntry;
    const visited = new Set<string>();

    for (let step = 0; step < (this.placed.size + 1) * 12 + 1; step++) {
      const currentKey = key(current.q, current.r);
      const cell = this.cells.get(currentKey);
      if (!cell || cell.wall) return entries;

      const placed = this.placed.get(currentKey);
      const occupied = placed ?? (currentKey === previewKey
        ? { tile: this.nextTile, rotation: this.rotation }
        : null);
      if (!occupied) return entries;

      const traceKey = `${currentKey}:${incoming}`;
      if (visited.has(traceKey)) return entries;
      visited.add(traceKey);

      if (placed) this.addEntryTo(entries, currentKey, incoming);

      const outgoing = this.findExitSide(occupied.tile, occupied.rotation, incoming);
      const dir = requiredItemAt(DIRECTIONS, portSide(outgoing), 'hex directions');
      current = { q: current.q + dir.q, r: current.r + dir.r };
      incoming = oppositePort(outgoing);
    }

    return entries;
  }

  private addEntryTo(entries: Map<AxialKey, Port[]>, cellKey: AxialKey, entry: Port): void {
    const list = entries.get(cellKey);
    if (!list) {
      entries.set(cellKey, [entry]);
      return;
    }
    if (!list.includes(entry)) list.push(entry);
  }

  private buildBreathingEntries(): Map<AxialKey, Port[]> {
    return this.phase === 'playing' ? this.tracePreviewContinuationEntries() : new Map<AxialKey, Port[]>();
  }

  private updatePathPulse(): void {
    const pulse = (Math.sin(gameTime() * 0.0045) + 1) / 2;
    const bucket = Math.round(pulse * 8);
    if (bucket === this.lastPathPulseBucket) return;
    this.lastPathPulseBucket = bucket;
    this.pathPulse = bucket / 8;
    this.refreshBreathingContinuation();
    if (this.phase === 'playing') this.applyPreviewMaterial(this.pathPulse);
  }

  private refreshBreathingContinuation(): void {
    const breathingEntries = this.buildBreathingEntries();
    const dirtyKeys = new Set<AxialKey>([
      ...this.previousBreathingEntries.keys(),
      ...breathingEntries.keys(),
    ]);
    for (const cellKey of dirtyKeys) {
      this.redrawPlacedTile(cellKey, breathingEntries, this.pathPulse);
    }
    this.previousBreathingEntries = breathingEntries;
  }

  private calculatePathLength(): number {
    let length = 0;
    for (const [cellKey, placed] of this.placed) {
      const activeEntries = this.mergeEntries(this.activeEntries.get(cellKey), undefined, [placed.entry]);
      length += activeSegmentKeys(placed.tile, placed.rotation, activeEntries).size;
    }
    return length;
  }

  private activePathCellKeysInOrder(): AxialKey[] {
    const result: AxialKey[] = [];
    let current = { ...this.pathStart };
    let incoming = this.pathEntry;
    const visited = new Set<string>();

    for (let step = 0; step < this.placed.size * 12 + 1; step++) {
      const currentKey = key(current.q, current.r);
      const occupied = this.placed.get(currentKey);
      const cell = this.cells.get(currentKey);
      if (!cell || cell.wall || !occupied) return result;

      const traceKey = `${currentKey}:${incoming}`;
      if (visited.has(traceKey)) return result;
      visited.add(traceKey);
      result.push(currentKey);

      const outgoing = this.findExitSide(occupied.tile, occupied.rotation, incoming);
      const dir = requiredItemAt(DIRECTIONS, portSide(outgoing), 'hex directions');
      current = { q: current.q + dir.q, r: current.r + dir.r };
      incoming = oppositePort(outgoing);
    }

    return result;
  }

  private spawnScorePopups(addedLength: number): void {
    if (addedLength <= 0) return;
    const pathKeys = this.activePathCellKeysInOrder();
    const popupKeys = pathKeys.slice(Math.max(0, pathKeys.length - addedLength));
    popupKeys.forEach((cellKey, index) => {
      const cell = this.cells.get(cellKey);
      if (!cell) return;
      this.createScorePopup(index + 1, cell, index);
    });
  }

  private createScorePopup(value: number, cell: BoardCell, index: number): void {
    const texture = document.createElement('canvas'); texture.width = 128; texture.height = 72;
    this.art.drawNumber(texture.getContext('2d')!, '+' + value, 64, 7, 48, INK, 'center');

    const material = new BasicMaterial({
      texture: this.canvasToGpuTexture(texture),
      color: [1, 1, 1, 1],
      blending: 'normal',
      depthWrite: false,
    });
    const jitterX = ((index % 3) - 1) * 0.16;
    const jitterY = Math.floor(index / 3) * 0.1;
    const startPosition = [
      requiredNumberAt(cell.transform.position, 0, 'score popup cell position') + jitterX,
      requiredNumberAt(cell.transform.position, 1, 'score popup cell position') + 0.34 + jitterY,
      1.08,
    ] as [number, number, number];
    const transform = new CartesianTransform3D({
      position: startPosition,
      scale: [0.86, 0.48, 1],
    });
    const entity = new Entity(`Score Popup +${value}`);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createPlane3D({ width: 1, height: 1 }), material));
    this.world.addEntity(entity);
    this.scorePopups.push({
      entity,
      transform,
      material,
      startTime: gameTime(),
      startPosition,
    });
  }

  private updateScorePopups(): void {
    if (this.scorePopups.length === 0) return;
    const now = gameTime();
    for (let index = this.scorePopups.length - 1; index >= 0; index--) {
      const popup = requiredItemAt(this.scorePopups, index, 'score popups');
      const elapsed = now - popup.startTime;
      if (elapsed >= SCORE_POPUP_DURATION) {
        if (this.world.hasEntity(popup.entity)) this.world.removeEntity(popup.entity);
        (popup.material.texture as GPUTexture).destroy();
        this.scorePopups.splice(index, 1);
        continue;
      }
      const progress = elapsed / SCORE_POPUP_DURATION;
      popup.transform.setPosition(
        popup.startPosition[0],
        popup.startPosition[1] + SCORE_POPUP_RISE * progress,
        popup.startPosition[2],
      );
      if (elapsed >= SCORE_POPUP_FADE_START) {
        const fadeProgress = (elapsed - SCORE_POPUP_FADE_START) / (SCORE_POPUP_DURATION - SCORE_POPUP_FADE_START);
        popup.material.color.a = Math.max(0, 1 - fadeProgress);
      }
    }
  }

  private clearScorePopups(): void {
    for (const popup of this.scorePopups) {
      if (this.world.hasEntity(popup.entity)) this.world.removeEntity(popup.entity);
      (popup.material.texture as GPUTexture).destroy();
    }
    this.scorePopups = [];
  }

  private syncPreview(): void {
    if (this.phase !== 'playing') {
      this.previewTransform.setScale(0, 0, 1);
      this.refreshBreathingContinuation();
      return;
    }
    this.previewRenderedRotation = this.rotation;
    this.previewSpinActive = false;
    const cell = this.cells.get(key(this.current.q, this.current.r));
    if (cell) {
      this.previewTransform.setPosition(...screenToWorld(cell.screenX, cell.screenY, 0.28));
      this.previewTransform.setScale(tileScale(this.level).x, tileScale(this.level).y, 1);
    }
    this.applyPreviewMaterial();
    this.refreshBreathingContinuation();
    this.previewTransform.setRotation(0, 0, 0);
  }

  private syncReserve(): void {
    if (!this.reserveTransform || !this.reserveMesh) return;
    if (!this.swapAnimationActive) {
      this.reserveTransform.setScale(SWAP_TILE_W / CANVAS_W * VIEW_W, SWAP_TILE_H / CANVAS_H * VIEW_H, 1);
      this.reserveTransform.setRotation(0, 0, 0);
    }
    (this.reserveMesh.material as BasicMaterial).texture = this.getReserveTexture();
  }

  private updateSwapPanelHover(): void {
    if (!this.reserveMesh) return;
    this.swapHoverAmount += (this.swapHoverTarget - this.swapHoverAmount) * 0.16;
    if (this.swapAnimationActive) return;
    const scale = 1 + this.swapHoverAmount * .05;
    this.reserveTransform.setScale(SWAP_TILE_W / CANVAS_W * VIEW_W * scale, SWAP_TILE_H / CANVAS_H * VIEW_H * scale, 1);
  }

  private updateRotateButtons(): void {
    if (this.rotateButtons.length === 0) return;
    const now = gameTime();
    const pointerOverTile = this.isPointerOverCurrentTile(this.pointerCanvasPoint);
    const hoveredButton = this.hitRotateButton(this.pointerCanvasPoint);
    const visibleTarget = pointerOverTile || Boolean(hoveredButton) ? 1 : 0;

    for (const button of this.rotateButtons) {
      const center = this.rotateButtonCenter(button.kind);
      const isHovered = hoveredButton === button;
      button.hoverAmount += ((isHovered ? 1 : 0) - button.hoverAmount) * 0.2;
      const alpha = button.material.color.a + (visibleTarget - button.material.color.a) * 0.22;
      button.material.color.a = Math.abs(alpha) < 0.01 ? 0 : alpha;

      if (!center || button.material.color.a <= 0.002) {
        button.transform.setScale(0, 0, 1);
        continue;
      }

      const position = screenToWorld(center.x, center.y, ROTATE_BUTTON_Z);
      const showScale = button.material.color.a;
      const hoverScale = 1 + button.hoverAmount * 0.14;
      const pressElapsed = now - button.pressStart;
      const pressProgress = pressElapsed >= 0 && pressElapsed < ROTATE_BUTTON_PRESS_DURATION
        ? pressElapsed / ROTATE_BUTTON_PRESS_DURATION
        : 1;
      const pressScale = pressProgress < 1 ? 1 + Math.sin(pressProgress * Math.PI) * 0.06 : 1;
      const widthScale = ROTATE_BUTTON_W / 90 * showScale * hoverScale * pressScale;
      const heightScale = ROTATE_BUTTON_H / 90 * showScale * hoverScale * pressScale;
      const hoverRotation = -button.direction * (0.055 + Math.sin(now * 0.008) * 0.018) * button.hoverAmount;
      const pressRotation = pressProgress < 1 ? -button.direction * Math.sin(pressProgress * Math.PI) * 0.18 : 0;
      button.transform.setPosition(position[0], position[1], ROTATE_BUTTON_Z);
      button.transform.setScale(widthScale, heightScale, 1);
      button.transform.setRotation(0, 0, hoverRotation + pressRotation);
    }
  }

  private updateSwapAnimation(): void {
    if (!this.swapAnimationActive) return;
    const progress = Math.min(1, (gameTime() - this.swapAnimationStart) / this.swapAnimationDuration);
    const eased = easeOutCubic(progress);
    const arc = Math.sin(progress * Math.PI) * 0.36;
    for (const overlay of this.swapOverlays) {
      const x = overlay.fromPosition[0] + (overlay.toPosition[0] - overlay.fromPosition[0]) * eased;
      const y = overlay.fromPosition[1] + (overlay.toPosition[1] - overlay.fromPosition[1]) * eased + arc;
      const z = overlay.fromPosition[2] + (overlay.toPosition[2] - overlay.fromPosition[2]) * eased;
      const sx = overlay.fromScale[0] + (overlay.toScale[0] - overlay.fromScale[0]) * eased;
      const sy = overlay.fromScale[1] + (overlay.toScale[1] - overlay.fromScale[1]) * eased;
      const sz = overlay.fromScale[2] + (overlay.toScale[2] - overlay.fromScale[2]) * eased;
      overlay.transform.setPosition(x, y, z);
      overlay.transform.setScale(sx, sy, sz);
    }
    if (progress >= 1) {
      this.finishSwapAnimation();
    }
  }

  private finishSwapAnimation(): void {
    if (!this.swapAnimationActive && this.swapOverlays.length === 0) return;
    this.swapAnimationActive = false;
    this.clearSwapOverlays();
    this.syncPreview();
    this.syncReserve();
  }

  private clearSwapOverlays(): void {
    for (const overlay of this.swapOverlays) {
      if (this.world.hasEntity(overlay.entity)) this.world.removeEntity(overlay.entity);
      overlay.texture.destroy();
    }
    this.swapOverlays = [];
  }

  private applyPreviewMaterial(pulse = this.pathPulse): void {
    this.previewMaterial.texture = this.getPreviewTexture(this.previewRenderedRotation, pulse);
  }

  private updatePreviewRotationAnimation(): void {
    if (!this.previewSpinActive) return;
    const progress = (gameTime() - this.previewSpinStart) / this.previewSpinDuration;
    const eased = easeOutCubic(progress);
    this.previewTransform.setRotation(0, 0, this.previewSpinFrom + (this.previewSpinTo - this.previewSpinFrom) * eased);
    if (progress >= 1) this.finishPreviewRotationAnimation();
  }

  private finishPreviewRotationAnimation(): void {
    if (!this.previewSpinActive) return;
    this.previewSpinActive = false;
    this.previewRenderedRotation = this.rotation;
    this.previewTransform.setRotation(0, 0, 0);
    this.applyPreviewMaterial();
    this.refreshBreathingContinuation();
  }

  private syncScore(): void {
    this.uploadCanvas(this.scoreText.material.texture as GPUTexture, this.art.score(this.score, this.pathLength, this.placed.size, this.best));
  }

  private updateCurrentCell(): void {
    if (this.phase !== 'playing') {
      if (this.highlightedKey) {
        const previous = this.cells.get(this.highlightedKey);
        previous?.transform.setScale(tileScale(this.level).x, tileScale(this.level).y, 1);
        this.highlightedKey = null;
      }
      return;
    }
    const nextHighlight = key(this.current.q, this.current.r);
    if (this.highlightedKey !== nextHighlight) {
      if (this.highlightedKey) {
        const previous = this.cells.get(this.highlightedKey);
        if (previous && !this.placed.has(this.highlightedKey)) {
          this.setCellTexture(previous, this.drawBaseCell(previous));
          previous.transform.setScale(tileScale(this.level).x, tileScale(this.level).y, 1);
        }
      }
      const current = this.cells.get(nextHighlight);
      if (current && !current.wall && !this.placed.has(nextHighlight)) {
        this.setCellTexture(current, this.drawBaseCell(current));
      }
      this.highlightedKey = nextHighlight;
    }
    for (const cell of this.cells.values()) {
      if (cell.wall) {
        cell.transform.setScale(tileScale(this.level).x, tileScale(this.level).y, 1);
        continue;
      }
      if (this.placed.has(key(cell.q, cell.r))) continue;
      cell.transform.setScale(tileScale(this.level).x, tileScale(this.level).y, 1);
    }
  }
}

export async function startEntanglementPath(canvas: HTMLCanvasElement): Promise<void> {
  const game = new EntanglementPathGame();
  await game.init(canvas);
  if (new URLSearchParams(window.location.search).has('verify')) {
    (window as Window & { __entanglementPath?: EntanglementPathGame }).__entanglementPath = game;
  }
}
