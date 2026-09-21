import { assignRoomThemes, fallbackRoomTheme, type RoomTheme } from './themes';
import { clone, solid, validState, type Box, type Room, type State } from './model';

export interface WorldMapDefinition {
  schemaVersion: 1;
  rulesRevision: number;
  rootRoom: string;
  spawn: Pick<State['player'], 'pos' | 'facing'>;
  greeting: string;
  rooms: (Room & { boxes: Omit<Box, 'room'>[] })[];
}
let authored: State | undefined;
let roomThemes = new Map<string, RoomTheme>();
export const mapRoomTheme = (room: Room): RoomTheme => room.theme ?? roomThemes.get(room.id) ?? fallbackRoomTheme(room.id);
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9-]*$/i.test(value) &&
  !['constructor', 'prototype', '__proto__'].includes(value);

/** Compile finite room references; never recursively expand an inside reference. */
export function parseWorldMap(value: unknown): State {
  if (!value || typeof value !== 'object') throw new Error('地图必须是 JSON 对象。');
  const map = value as WorldMapDefinition;
  if (map.schemaVersion !== 1 || map.rootRoom !== 'world' ||
    !Number.isSafeInteger(map.rulesRevision) || map.rulesRevision < 7 ||
    !map.spawn || !Array.isArray(map.rooms) || !map.rooms.length || map.rooms.length > 4096 ||
    typeof map.greeting !== 'string') throw new Error('地图版本、根房间或出生点格式不正确。');
  const rooms: State['rooms'] = Object.create(null);
  const boxes: Box[] = [];
  for (const entry of map.rooms) {
    if (!entry || !id(entry.id) || Object.hasOwn(rooms, entry.id) || !Array.isArray(entry.boxes))
      throw new Error('地图房间 ID 必须唯一，每个房间需要 boxes 数组。');
    const { boxes: contents, ...room } = clone(entry);
    rooms[room.id] = room;
    for (const box of contents) {
      if (!box || !id(box.id) || (box.inside !== null && !id(box.inside)))
        throw new Error('箱子 ID 或 inside 房间引用不正确。');
      boxes.push({ ...box, room: room.id });
    }
  }
  const state: State = {
    version: 1, rulesRevision: map.rulesRevision, rooms, boxes,
    player: { room: map.rootRoom, pos: clone(map.spawn.pos), facing: clone(map.spawn.facing), route: [] },
    moves: 0, completed: [], paradox: 'none', message: map.greeting,
  };
  if (!validState(state)) throw new Error('地图含无效坐标、装饰类型、嵌套引用或出生点。');
  for (const room of Object.values(rooms)) {
    for (const button of room.buttons ?? [])
      for (const gate of room.gates ?? [])
        if (Math.max(...button.pos.map((v, i) => Math.abs(v - gate.pos[i]!))) < 2)
          throw new Error(`${room.id} 的按钮与栅栏必须至少间隔一格。`);
    if (room.spawn && !room.entryRoom && solid(state, room.id, room.spawn)) throw new Error(`${room.id} 的出生点被挡住。`);
    for (const pos of [...room.goals, ...(room.home ? [room.home] : [])])
      if (room.walls.some((w) => w.every((v, i) => v === pos[i])))
        throw new Error(`${room.id} 的目标不能放在墙内。`);
  }
  for (const box of boxes)
    for (let x = 0; x < box.size; x++)
      for (let y = 0; y < box.size; y++)
        for (let z = 0; z < box.size; z++)
          if (solid(state, box.room, [box.pos[0] + x, box.pos[1] + y, box.pos[2] + z], box.id))
            throw new Error(`箱子 ${box.id} 与墙、装饰或其他箱子重叠。`);
  // Every definition must be reachable from the root, including shared/cyclic graphs.
  const visited = new Set<string>();
  const pending = [map.rootRoom];
  while (pending.length) {
    const room = pending.pop()!;
    if (visited.has(room)) continue;
    visited.add(room);
    for (const box of boxes) if (box.room === room && box.inside) pending.push(box.inside);
  }
  if (visited.size !== map.rooms.length) throw new Error('地图包含未被任何入口引用的房间。');
  return state;
}
export function installWorldMap(value: unknown): void {
  authored = parseWorldMap(value);
  roomThemes = assignRoomThemes(authored.rooms, authored.boxes);
}
export function createWorldState(): State {
  if (!authored) throw new Error('请先加载 levels/index.json。');
  return clone(authored);
}

/** Resolve authoring files before compiling the finite room graph. Room inside references
 * may be cyclic; file includes must be finite and stay inside the levels directory. */
export async function loadWorldMap(entry: URL, readJson: (url: URL) => Promise<unknown>): Promise<WorldMapDefinition> {
  const root = new URL('.', entry), cache = new Map<string, Promise<unknown>>();
  const read = (url: URL) => {
    let result = cache.get(url.href);
    if (!result) {
      if (cache.size >= 1024) throw new Error('地图引用文件过多。');
      result = readJson(url); cache.set(url.href, result);
    }
    return result;
  };
  const expand = async (value: unknown, source: URL, stack: string[]): Promise<WorldMapDefinition['rooms']> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`地图文件格式错误：${source.pathname}`);
    const node = value as Record<string, unknown>;
    if ('$ref' in node) {
      if (typeof node.$ref !== 'string' || !node.$ref || Object.keys(node).length !== 1) throw new Error('地图引用必须只有 $ref 路径。');
      const url = new URL(node.$ref, source);
      if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || !url.pathname.endsWith('.json') || url.search || url.hash)
        throw new Error('地图引用必须是 levels 目录中的 JSON 文件。');
      if (stack.includes(url.href) || stack.length >= 32) throw new Error(`循环或过深的地图文件引用：${url.pathname}`);
      return expand(await read(url), url, [...stack, url.href]);
    }
    if ('id' in node) return [node as unknown as WorldMapDefinition['rooms'][number]];
    const collections = ['worlds', 'rooms', 'levels'].filter((key) => key in node);
    if (!collections.length) throw new Error(`地图文件缺少 worlds、rooms 或 levels：${source.pathname}`);
    const children = collections.flatMap((key) => {
      if (!Array.isArray(node[key])) throw new Error(`地图 ${key} 必须为数组。`);
      return node[key] as unknown[];
    });
    const rooms = (await Promise.all(children.map((child) => expand(child, source, stack)))).flat();
    if (node.worldId !== undefined && !rooms.some((room) => room.id === node.worldId && room.level === 0))
      throw new Error(`worldId 未指向大场景：${String(node.worldId)}`);
    return rooms;
  };
  const header = await read(entry);
  const rooms = await expand(header, entry, [entry.href]);
  const map = { ...(header as WorldMapDefinition), rooms };
  parseWorldMap(map);
  return map;
}
