import { decodeMetadata, parseHeader, readBabaLevel, readLevelLinks, type BabaLevel } from './baba-format';
import { islandOverworld } from './island';

export interface PackLevel {
  id: string;
  title: string;
  children?: readonly string[];
  clearCount?: number;
  parent?: string;
  map?: boolean;
  read(): Promise<BabaLevel>;
}
export interface LevelPack {
  title: string;
  entries: PackLevel[];
  initial: number;
  first?: number;
}
export interface OfficialPack extends LevelPack { id: string }

export type OfficialCatalogue = Omit<OfficialPack, 'entries'> & { entries: Omit<PackLevel, 'read'>[] };

export const INTRO = [
  ['first-dive', '初入珊瑚湾', '把推箱规则读成一句话，再走到旗帜。'],
  ['breakwater', '让墙放行', '移动 STOP 字块，试试墙还会不会挡路。'],
  ['change-course', '换个主角', '重新排列规则，让附近的石头接替大肥鱼。'],
  ['warm-current', '融化冰门', '把暖流推向冰块，清出通往旗帜的路。'],
  ['make-a-goal', '自造终点', '把 WIN 接到另一条规则上，给自己造一个终点。'],
] as const;
export const OVERWORLD = ['coral-bay', '珊瑚湾大世界', '沿着发亮的海路前进，通关后会开启下一段。'] as const;

async function fetchLevel(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response;
}

async function readHostedLevel(root: string, id: string, signal: AbortSignal): Promise<BabaLevel> {
  const [bytes, sidecar] = await Promise.all([
    fetchLevel(root + '.l', signal).then(r => r.arrayBuffer()),
    fetchLevel(root + '.ld', signal).then(r => r.arrayBuffer()).then(decodeMetadata),
  ]);
  return readBabaLevel(bytes, sidecar, id);
}

export async function officialPacks(signal: AbortSignal): Promise<OfficialPack[]> {
  const root = './levels/local-official/';
  try {
    const response = await fetch(root + 'catalog.json', { signal });
    if (!response.ok) return [];
    const catalog = await response.json() as OfficialCatalogue[];
    if (!Array.isArray(catalog)) return [];
    return catalog.map(({ entries, ...world }) => ({ ...world, entries: entries.map(entry => ({ ...entry,
      read: async () => {
        const level = await readHostedLevel(`${root}${encodeURIComponent(world.id)}/${encodeURIComponent(entry.id)}`, entry.id, signal);
        return world.id === 'baba' && entry.id === '106level' ? islandOverworld(level, 'steam') : level;
      },
    })) }));
  } catch {
    signal.throwIfAborted();
    return [];
  }
}

export function builtinPack(signal: AbortSignal): LevelPack {
  return {
    title: '珊瑚湾', initial: INTRO.length,
    entries: [...INTRO, OVERWORLD].map(([id, title]) => ({
      id, title, ...(id === OVERWORLD[0] ? { map: true, children: INTRO.map(([child]) => child), clearCount: INTRO.length } : { parent: OVERWORLD[0] }),
      read: async () => {
        const level = await readHostedLevel('./levels/' + id, id, signal);
        return id === OVERWORLD[0] ? islandOverworld(level, 'coral') : level;
      },
    })),
  };
}

export interface LocalFile {
  name: string;
  webkitRelativePath?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** A native folder or a multi-selection of same-stem .l and .ld files. */
export async function localPacks(files: readonly LocalFile[]): Promise<LevelPack[]> {
  const groups = new Map<string, Map<string, LocalFile>>();
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    const name = parts.pop()!.toLowerCase();
    if (!/\.(?:l|ld)$/.test(name) && name !== 'world_data.txt') continue;
    const folder = parts.join('/');
    if (!groups.has(folder)) groups.set(folder, new Map());
    groups.get(folder)!.set(name, file);
  }
  const result: LevelPack[] = [];
  for (const [folder, files] of groups) {
    const worldFile = files.get('world_data.txt');
    const world = worldFile && parseHeader(decodeMetadata(await worldFile.arrayBuffer()), folder).metadata.general;
    const entries: PackLevel[] = [];
    const pairs = [...files.entries()].filter(([name]) => name.endsWith('.l')).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
    for (const [name, binary] of pairs) {
      const id = name.slice(0, -2);
      const meta = files.get(id + '.ld');
      if (!meta) continue;
      const text = decodeMetadata(await meta.arrayBuffer());
      const { title, metadata } = parseHeader(text, id);
      const general = metadata.general;
      const threshold = Number(general?.unlockcount);
      entries.push({ id, title, children: readLevelLinks(metadata).map(link => link.id),
        clearCount: general?.notcompleteable !== '1' && Number.isSafeInteger(threshold) && threshold > 0 ? threshold : 0,
        ...(general?.customparent ? { parent: general.customparent.toLowerCase() } : {}), map: general?.leveltype === '1',
        read: async () => readBabaLevel(await binary.arrayBuffer(), text, id) });
    }
    const first = entries.findIndex(entry => entry.id === world?.firstlevel?.toLowerCase());
    const start = entries.findIndex(entry => entry.id === world?.start?.toLowerCase());
    if (entries.length) result.push({
      title: world?.name || folder.split('/').at(-1) || entries[0]!.title,
      initial: start >= 0 ? start : Math.max(0, first),
      ...(first >= 0 ? { first } : {}),
      entries,
    });
  }
  return result;
}
