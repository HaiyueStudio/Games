import { slots, wordTypes } from './catalog';
import { assertUnitCapacity, levelLimits } from './limits';

export type Direction = 0 | 1 | 2 | 3;
export type Metadata = Record<string, Record<string, string>>;
export interface Tile {
  name: string;
  type: number;
  layer: number;
}
export interface PlacedTile extends Tile {
  x: number;
  y: number;
  dir: Direction;
}
export interface LevelLink {
  id: string;
  entrance?: string;
  x: number;
  y: number;
  dir: Direction;
  style: number;
  state: number;
  number: string;
}
export const entranceId = (link: LevelLink, index: number): string => link.entrance ?? `index:${index}`;
export interface LevelSpecial {
  x: number;
  y: number;
  z: number;
  data: string;
}
export interface LevelPath extends PlacedTile {
  style: number;
  gate: number;
  requirement: number;
}
export interface BabaLevel {
  id: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  tiles: PlacedTile[];
  edges: Set<number>;
  links: LevelLink[];
  paths: LevelPath[];
  specials: LevelSpecial[];
  island?: readonly PlacedTile[];
  metadata: Metadata;
  unknown: number[];
  catalog: ReadonlyMap<string, Tile>;
}

const fail = () => new Error('Invalid Baba Is You .l file');
const MAX_BYTES = levelLimits.bytes;

class Reader {
  readonly view: DataView;
  readonly bytes: Uint8Array<ArrayBuffer>;
  pos = 0;
  end: number;
  constructor(bytes: Uint8Array<ArrayBuffer>) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.end = bytes.length;
  }
  has(tag: string): boolean {
    return this.pos + tag.length <= this.end &&
      [...tag].every((letter, i) => this.bytes[this.pos + i] === letter.charCodeAt(0));
  }
  tag(tag: string): void {
    if (!this.has(tag)) throw fail();
    this.pos += tag.length;
  }
  take(size: number): number {
    const from = this.pos;
    this.pos += size;
    if (this.pos > this.end) throw fail();
    return from;
  }
  u8(): number { return this.view.getUint8(this.take(1)); }
  u16(): number { return this.view.getUint16(this.take(2), true); }
  u32(): number { return this.view.getUint32(this.take(4), true); }
  slice(size: number): Uint8Array<ArrayBuffer> { return this.bytes.subarray(this.take(size), this.pos); }
}

async function inflate(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await stream.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) throw fail();
      chunks.push(part.value);
    }
  } catch {
    await stream.cancel().catch(() => {});
    throw fail();
  } finally {
    stream.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function decodeMetadata(bytes: ArrayBuffer): string {
  const marker = new Uint8Array(bytes);
  if (marker[0] === 255 && marker[1] === 254) return new TextDecoder('utf-16le').decode(bytes);
  if (marker[0] === 254 && marker[1] === 255) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

export function parseMetadata(text: string): Metadata {
  const result: Metadata = Object.create(null);
  let section: Record<string, string> | undefined;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) {
      const name = line.slice(1, -1).toLowerCase();
      section = result[name] ??= Object.create(null);
      continue;
    }
    const equal = line.indexOf('=');
    if (section && equal > 0 && !/^(?:--|;|#)/.test(line)) {
      section[line.slice(0, equal).trim().toLowerCase()] = line.slice(equal + 1).trim();
    }
  }
  return result;
}

const bySlot = new Map(slots.map(([id, code, name, type, layer]) => [id, { code, name, type, layer }]));
const wordType = (name: string) => wordTypes[name] ?? (name.startsWith('text_') ? 0 : name.startsWith('letter_') ? 5 : -1);

function integer(value: string | undefined, fallback: number): number {
  const n = Number(value || NaN);
  return Number.isSafeInteger(n) ? n : fallback;
}

function tileCode(value: string | undefined): number | undefined {
  const pair = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(value ?? '');
  if (!pair || Number(pair[1]) > 255 || Number(pair[2]) > 255) return undefined;
  return Number(pair[1]) + 256 * Number(pair[2]);
}

function buildCatalog(metadata: Metadata) {
  const changes = metadata.tiles ?? {};
  const palette = metadata.currobjlist ?? {};
  const customBySlot = new Map<string, { name: string; code: number | undefined }>();
  for (const key of Object.keys(palette)) {
    const index = /^(\d+)object$/.exec(key)?.[1];
    if (index === undefined) continue;
    const id = palette[key];
    const name = palette[index + 'name'];
    if (id && name) customBySlot.set(id, { name, code: tileCode(palette[index + 'tile']) });
  }
  const byCode = new Map<number, Tile>();
  const byName = new Map<string, Tile>();
  const resolved = new Map<string, Tile>();
  for (const id of new Set([...bySlot.keys(), ...customBySlot.keys()])) {
    const base = bySlot.get(id);
    const custom = customBySlot.get(id);
    const name = changes[id + '_name'] || custom?.name || base?.name;
    if (!name) continue;
    const unit = changes[id + '_unittype'];
    const inferred = name === base?.name ? base.type : wordType(name);
    const type = (unit ? unit === 'text' : inferred >= 0) ? integer(changes[id + '_type'], Math.max(0, inferred)) : -1;
    const entry = { name, type, layer: integer(changes[id + '_layer'], base?.layer ?? (type < 0 ? 15 : 20)) };
    const code = tileCode(changes[id + '_tile']) ?? custom?.code ?? base?.code;
    if (code !== undefined) byCode.set(code, entry);
    byName.set(name, entry);
    resolved.set(id, entry);
  }
  return { byCode, byName, resolved };
}

function indexed(section: Record<string, string>, declared: string | undefined): string[] {
  const count = integer(declared, -1);
  return [...new Set(Object.keys(section).flatMap(key => /^(\d+)[a-z]/.exec(key)?.[1] ?? []))]
    .filter(index => count < 0 || Number(index) < count)
    .sort((a, b) => Number(a) - Number(b));
}

const dir = (value: number): Direction => value >= 0 && value <= 3 ? value as Direction : 0;
export function readLevelLinks(metadata: Metadata): LevelLink[] {
  const levels = metadata.levels ?? {};
  let count = 0;
  return indexed(levels, metadata.general?.levels).flatMap(index => {
    const value = (key: string) => levels[index + key];
    const child = value('file');
    if (child) assertUnitCapacity(++count);
    return child ? [{ id: child.toLowerCase(), entrance: `native:${index}`, x: integer(value('x'), -1), y: integer(value('y'), -1),
      dir: dir(integer(value('dir'), 0)), style: integer(value('style'), 0),
      state: integer(value('state'), 0), number: value('number') ?? '' }] : [];
  });
}

export function parseHeader(text: string, id: string) {
  const metadata = parseMetadata(text);
  return { title: metadata.general?.name || id, subtitle: metadata.general?.subtitle ?? '', metadata };
}

/** Decode the original ACHTUNG! 0x0105 room container and its sidecar. */
export async function readBabaLevel(source: ArrayBuffer, sidecar: string, id: string): Promise<BabaLevel> {
  if (source.byteLength > MAX_BYTES) throw fail();
  let bytes = new Uint8Array(source);
  if (bytes[0] === 0x78) bytes = await inflate(bytes, MAX_BYTES);
  const r = new Reader(bytes);
  r.tag('ACHTUNG!');
  const version = r.u16();
  if (version !== 0x0105) throw new Error(`Unsupported Baba Is You room version ${version.toString(16)}`);
  while (!r.has('LAYR')) {
    r.take(4);
    r.take(r.u32());
  }
  r.tag('LAYR');
  const size = r.u32();
  if (size > r.end - r.pos) throw fail();
  r.end = r.pos + size;
  const count = r.u16();
  if (count === 0 || count > levelLimits.layers) throw fail();
  const header = parseHeader(sidecar, id);
  const { byCode, byName, resolved } = buildCatalog(header.metadata);
  const tiles: PlacedTile[] = [];
  const edges = new Set<number>();
  const unknown = new Set<number>();
  let width = 0;
  let height = 0;
  for (let layer = 0; layer < count; layer++) {
    const w = r.u32();
    const h = r.u32();
    if (!layer) { width = w; height = h; }
    if (w < 1 || h < 1 || w > levelLimits.side || h > levelLimits.side) throw fail();
    r.take(33);
    r.tag('MAIN');
    const grid = await inflate(r.slice(r.u32()), w * h * 2);
    if (grid.length !== w * h * 2) throw fail();
    const units = new DataView(grid.buffer);
    // Count this layer before allocating its placed tile objects. Compression
    // size and layer dimensions alone do not bound the live object count.
    let occupied = tiles.length;
    for (let i = 0; i < w * h; i++) {
      const code = units.getUint16(i * 2, true);
      if (code !== 0 && code !== 0xffff) assertUnitCapacity(++occupied);
    }
    let facing: Uint8Array | undefined;
    if (r.has('DATA')) {
      r.tag('DATA');
      const planes = r.u32();
      if (planes > levelLimits.layers) throw fail();
      for (let p = 0; p < planes; p++) {
        const kind = r.u8();
        const plane = r.slice(r.u32());
        if (kind === 0) {
          facing = await inflate(plane, w * h);
          if (facing.length !== w * h) throw fail();
        }
      }
    }
    for (let i = 0; i < w * h; i++) {
      const code = units.getUint16(i * 2, true);
      const x = i % w;
      const y = Math.floor(i / w);
      if (code === 0xffff) continue;
      if (code === 0) {
        if (!layer) edges.add(y * width + x);
        continue;
      }
      let tile = byCode.get(code);
      if (!tile) {
        unknown.add(code);
        tile = { name: 'tile_' + code.toString(16), type: -1, layer: 10 };
      }
      tiles.push({ ...tile, x, y, dir: dir(facing?.[i] ?? 0) });
    }
  }
  if (r.pos !== r.end) throw fail();
  const links = readLevelLinks(header.metadata);
  const map = header.metadata.general?.leveltype === '1';
  const markerCount = map ? links.filter(link => link.x >= 0 && link.y >= 0 && link.x < width && link.y < height).length : 0;
  const selectorX = Number(header.metadata.general?.selectorx ?? -1), selectorY = Number(header.metadata.general?.selectory ?? -1);
  const selector = map && selectorX >= 0 && selectorY >= 0 && selectorX < width && selectorY < height && !tiles.some(tile => tile.name === 'cursor');
  assertUnitCapacity(tiles.length + markerCount + Number(selector));
  const path = header.metadata.paths ?? {};
  const paths = indexed(path, header.metadata.general?.paths).map(i => ({
    ...(resolved.get(path[i + 'object'] ?? '') ?? { name: 'path', type: -1, layer: 2 }),
    x: integer(path[i + 'x'], -1), y: integer(path[i + 'y'], -1), dir: dir(integer(path[i + 'dir'], 0)),
    style: integer(path[i + 'style'], 0), gate: integer(path[i + 'gate'], 0), requirement: integer(path[i + 'requirement'], 0),
  }));
  const entries = header.metadata.specials ?? {};
  const specials = indexed(entries, header.metadata.general?.specials).map(i => ({
    x: integer(entries[i + 'x'], -1), y: integer(entries[i + 'y'], -1), z: integer(entries[i + 'z'], 0),
    data: entries[i + 'data'] ?? '',
  }));
  return { id, ...header, width, height, tiles, edges, links, paths, specials, unknown: [...unknown], catalog: byName };
}
