import type { BabaLevel, Direction, Tile } from './baba-format';
import { slots, wordTypes } from './catalog';
import type { LevelPack } from './pack';
import { gateName, type GateCondition, type GateType } from './gates';
import { levelLimits } from './limits';

export interface Cell { x: number; y: number }
interface DraftTile extends Cell { name: string; dir: Direction }
interface DraftLink extends Cell { target: string; unlocked: boolean }
interface DraftPath extends Cell { open: boolean; condition?: GateCondition }
export interface DraftRoom {
  id: string;
  title: string;
  map: boolean;
  width: number;
  height: number;
  tiles: DraftTile[];
  links: DraftLink[];
  paths: DraftPath[];
  spawn: Cell;
  clearCount?: number;
}
export interface WorldDraft { format: 'dafeiyu-world'; version: 1; rooms: DraftRoom[] }

const catalog = new Map<string, Tile>(slots.map(([, , name, type, layer]) => [name, { name, type, layer }]));
for (const [name, type] of Object.entries(wordTypes)) if (!catalog.has(name)) catalog.set(name, { name, type, layer: 20 });
export const editorTile = (name: string) => catalog.get(name);
const featured = ['baba', 'keke', 'flag', 'wall', 'rock', 'box', 'water', 'lava', 'ice', 'key', 'door', 'skull', 'star'];
const featuredWords = ['baba', 'keke', 'is', 'you', 'flag', 'win', 'rock', 'push', 'wall', 'stop', 'and', 'open', 'shut'];
const names = [...catalog.keys()].filter(name => name !== 'level' && name !== 'cursor' && !name.startsWith('tile_') && /^[a-z0-9_]+$/.test(name));
export const palettes = {
  objects: [...featured.filter(name => names.includes(name)), ...names.filter(name => !name.startsWith('text_') && !featured.includes(name)).sort()],
  text: [...featuredWords.map(name => 'text_' + name),
    ...names.filter(name => name.startsWith('text_') && !featuredWords.includes(name.slice(5))).sort()],
} as const;
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const numberIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const inside = (room: Pick<DraftRoom, 'width' | 'height'>, value: unknown): boolean => record(value) &&
  numberIn(value.x, 1, room.width - 2) && numberIn(value.y, 1, room.height - 2);

export function makeRoom(id: string, title: string, map: boolean): DraftRoom {
  return { id, title, map, width: 13, height: 9, tiles: [], links: [], paths: [], spawn: { x: 2, y: 4 } };
}

export function newDraft(): WorldDraft {
  const world = makeRoom('world', '珊瑚湾新地图', true);
  const room = makeRoom('room-1', '第 1 关', false);
  world.links.push({ ...world.spawn, target: room.id, unlocked: true });
  room.tiles.push({ name: 'baba', x: 3, y: 4, dir: 0 }, { name: 'flag', x: 9, y: 4, dir: 0 });
  for (const [start, words] of [[1, ['baba', 'is', 'you']], [8, ['flag', 'is', 'win']]] as const) {
    words.forEach((word, i) => room.tiles.push({ name: 'text_' + word, x: start + i, y: 1, dir: 0 }));
  }
  return { format: 'dafeiyu-world', version: 1, rooms: [world, room] };
}

export function isWorldDraft(value: unknown): value is WorldDraft {
  if (!record(value) || value.format !== 'dafeiyu-world' || value.version !== 1 || !Array.isArray(value.rooms) ||
    !numberIn(value.rooms.length, 1, 128)) return false;
  const ids = new Set<string>();
  for (const room of value.rooms) {
    if (!record(room) || typeof room.id !== 'string' || !/^(world|room-[1-9][0-9]{0,3})$/.test(room.id) || ids.has(room.id) ||
      typeof room.title !== 'string' || !numberIn(room.title.length, 1, 48) || typeof room.map !== 'boolean' ||
      !numberIn(room.width, 7, 32) || !numberIn(room.height, 6, 24)) return false;
    const extent = { width: room.width, height: room.height };
    if (!inside(extent, room.spawn) || !Array.isArray(room.tiles) || room.tiles.length > levelLimits.editorTiles || !Array.isArray(room.links) ||
      room.links.length > 128 || !Array.isArray(room.paths) || room.paths.length > room.width * room.height ||
      (room.clearCount !== undefined && (!room.map || !numberIn(room.clearCount, 1, 127))) ||
      (!room.map && (room.links.length || room.paths.length))) return false;
    if (room.tiles.some(tile => !inside(extent, tile) || !catalog.has(tile.name) || tile.name === 'cursor' || tile.name === 'level' || !numberIn(tile.dir, 0, 3)) ||
      room.links.some(link => !inside(extent, link) || typeof link.target !== 'string' || typeof link.unlocked !== 'boolean') ||
      room.paths.some(path => !inside(extent, path) || typeof path.open !== 'boolean' ||
        (path.condition !== undefined && (!record(path.condition) || !numberIn(path.condition.gate, 1, 4) ||
          !numberIn(path.condition.requirement, 1, 999))))) return false;
    ids.add(room.id);
  }
  const [root] = value.rooms;
  return root.id === 'world' && root.map && value.rooms.every(room => room.links.every((link: DraftLink) => link.target !== 'world' && link.target !== room.id && ids.has(link.target)));
}

export function levelFromDraft(room: DraftRoom): BabaLevel {
  const { id, title, width, height } = room;
  const edges = new Set<number>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) edges.add(y * width + x);
  }
  return { id, title, subtitle: '', width, height, edges, catalog, unknown: [], specials: [],
    tiles: room.tiles.map(tile => ({ ...catalog.get(tile.name)!, x: tile.x, y: tile.y, dir: tile.dir })),
    links: room.links.map(({ target, x, y, unlocked }, i) => ({
      id: target, entrance: `cell:${x},${y}`, x, y, dir: 0, state: unlocked ? 2 : 1, style: 2, number: String(i + 1),
    })),
    paths: room.paths.map(({ x, y, open, condition }) => ({ x, y, dir: 0, name: 'path', type: -1, layer: 2, style: open ? 1 : 0,
      gate: condition?.gate ?? 0, requirement: condition?.requirement ?? 0 })),
    metadata: { general: { leveltype: room.map ? '1' : '0', selectorx: String(room.spawn.x), selectory: String(room.spawn.y) } } };
}

export function packFromDraft(draft: WorldDraft): LevelPack {
  const levels = draft.rooms.map(levelFromDraft);
  return { title: levels[0]!.title, initial: 0, entries: levels.map((level, i) => ({ id: level.id, title: level.title,
    map: draft.rooms[i]!.map, clearCount: draft.rooms[i]!.clearCount ?? 0, children: level.links.map(link => link.id), read: async () => level })) };
}

export class WorldEditor {
  project: WorldDraft;
  index = 0;
  cursor: Cell = { x: 2, y: 4 };
  brush = 'baba';
  facing: Direction = 0;
  target = 1;
  stacking = false;
  private readonly past: { project: WorldDraft; index: number }[] = [];
  constructor(project: WorldDraft) { this.project = project; }
  get room() { return this.project.rooms[this.index]!; }
  get canUndo() { return this.past.length > 0; }
  get selectedPath(): DraftPath | undefined {
    return this.room.paths.find(path => sameCell(path, this.cursor));
  }
  get selectedElement(): string | undefined {
    const room = this.room;
    const atCursor = (cell: Cell) => sameCell(cell, this.cursor);
    const tile = room.tiles.findLast(atCursor);
    if (tile) return tile.name;
    const link = room.links.find(atCursor);
    if (link) return link.unlocked ? '@link' : '@locked';
    const path = room.paths.find(atCursor);
    if (path) return path.open ? '@path' : '@secret';
    if (room.map && atCursor(room.spawn)) return '@spawn';
    return undefined;
  }
  private checkpoint(): void {
    this.past.push({ project: this.project, index: this.index });
    if (this.past.length > 60) this.past.shift();
    this.project = { ...this.project, rooms: [...this.project.rooms] };
  }
  private editRoom(): DraftRoom {
    this.checkpoint();
    const next = structuredClone(this.room);
    this.project.rooms[this.index] = next;
    return next;
  }
  select(index: number): void {
    this.index = Math.max(0, Math.min(this.project.rooms.length - 1, index));
    this.cursor = { ...this.room.spawn };
    if (!this.room.map && this.brush.startsWith('@') && this.brush !== '@erase' && this.brush !== '@select') this.brush = 'baba';
    if (this.target === this.index) this.selectTarget(1);
  }
  selectTarget(delta: number): void {
    const count = this.project.rooms.length - 1;
    if (count <= 0) return;
    this.target = ((this.target - 1 + delta + count) % count) + 1;
    if (this.target === this.index && count > 1) this.target = (this.target % count) + 1;
  }
  moveCursor(dx: number, dy: number): void {
    this.cursor = { x: Math.max(1, Math.min(this.room.width - 2, this.cursor.x + dx)),
      y: Math.max(1, Math.min(this.room.height - 2, this.cursor.y + dy)) };
  }
  addRoom(map: boolean): boolean {
    if (this.project.rooms.length >= 128) return false;
    this.checkpoint();
    const i = this.project.rooms.length;
    let number = i;
    while (this.project.rooms.some(room => room.id === `room-${number}`)) number++;
    this.project.rooms.push(makeRoom('room-' + number, map ? `子地图 ${i}` : `第 ${i} 关`, map));
    this.target = i;
    if (this.room.map) this.brush = '@locked';
    else this.select(i);
    return true;
  }
  rename(title: string): boolean {
    title = title.trim().slice(0, 48);
    if (!title || title === this.room.title) return false;
    this.editRoom().title = title;
    return true;
  }
  resize(width: number, height: number): boolean {
    const room = this.room;
    if (!numberIn(width, 7, 32) || !numberIn(height, 6, 24)) return false;
    const extent = { width, height };
    if ([room.spawn, ...room.tiles, ...room.links, ...room.paths].some(cell => !inside(extent, cell))) return false;
    const edited = this.editRoom();
    edited.width = width; edited.height = height;
    this.moveCursor(0, 0);
    return true;
  }
  setClearCount(value: number): boolean {
    if (!this.room.map || !numberIn(value, 0, 127) || value === (this.room.clearCount ?? 0)) return false;
    const room = this.editRoom();
    if (value) room.clearCount = value;
    else delete room.clearCount;
    return true;
  }
  setPathGate(gate: 0 | GateType, requirement = 1): boolean {
    const selected = this.selectedPath;
    if (!selected || (gate !== 0 && (!gateName(gate) || !numberIn(requirement, 1, 999))) ||
        (gate === (selected.condition?.gate ?? 0) && (gate === 0 || requirement === selected.condition?.requirement))) return false;
    const index = this.room.paths.indexOf(selected);
    const path = this.editRoom().paths[index]!;
    if (gate) path.condition = { gate, requirement };
    else delete path.condition;
    return true;
  }
  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.project = previous.project;
    this.target = Math.max(1, Math.min(this.target, this.project.rooms.length - 1));
    this.select(previous.index);
    return true;
  }
  paint(at: Cell, brush = this.brush, multiple = this.stacking): boolean {
    const room = this.room;
    if (!inside(room, at)) return false;
    this.cursor = { ...at };
    if (brush === '@select') return false;
    const matches = (cell: Cell) => sameCell(cell, at);
    const tile = room.tiles.findLastIndex(matches), link = room.links.findIndex(matches), path = room.paths.findIndex(matches);
    if (brush === '@erase') {
      if (tile < 0 && link < 0 && path < 0) return false;
      const edited = this.editRoom();
      if (tile >= 0) edited.tiles.splice(tile, 1);
      else if (link >= 0) edited.links.splice(link, 1);
      else edited.paths.splice(path, 1);
    } else if (brush === '@spawn' && room.map) {
      if (matches(room.spawn)) return false;
      this.editRoom().spawn = { ...at };
    } else if ((brush === '@link' || brush === '@locked') && room.map) {
      const target = this.project.rooms[this.target]?.id;
      if (!target || target === room.id || target === 'world') return false;
      const unlocked = brush === '@link';
      if (room.links[link]?.target === target && room.links[link]?.unlocked === unlocked) return false;
      this.editRoom().links.splice(link >= 0 ? link : room.links.length, link >= 0 ? 1 : 0, { ...at, target, unlocked });
    } else if ((brush === '@path' || brush === '@secret') && room.map) {
      const open = brush === '@path';
      if (room.paths[path]?.open === open) return false;
      this.editRoom().paths.splice(path >= 0 ? path : room.paths.length, path >= 0 ? 1 : 0, { ...room.paths[path], ...at, open });
    } else if (catalog.has(brush) && room.tiles.length < levelLimits.editorTiles) {
      if (!multiple && room.tiles.some(item => matches(item) && item.name === brush && item.dir === this.facing)) return false;
      this.editRoom().tiles.push({ ...at, name: brush, dir: this.facing });
    } else return false;
    return true;
  }
}
