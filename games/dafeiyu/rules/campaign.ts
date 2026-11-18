import type { BabaLevel, LevelPath } from '../levels/baba-format';
import type { LevelPack } from '../levels/pack';
import { gateName, type GateType } from '../levels/gates';
import { vectors } from './properties';

export interface CampaignProgress {
  completed: string[];
  bonuses: [string, number][];
  conversions: [string, string, string[], string?][];
}
export interface EntranceConversion {
  child: string;
  targets: readonly string[];
  entrance?: string | undefined;
}

export interface FlowerProgress {
  petals: number;
  totalPetals: number;
  required: number;
  flowers: number;
}

export interface GateProgress {
  path: LevelPath;
  collected: number;
}

export class Campaign {
  readonly completed = new Set<string>();
  readonly bonuses = new Map<string, number>();
  private readonly conversions = new Map<string, Map<string, EntranceConversion>>();
  private readonly pack: LevelPack;
  private readonly maps: ReadonlySet<string>;
  private readonly indices: ReadonlyMap<string, number>;
  private readonly parents = new Map<string, number[]>();
  private readonly primaryParents = new Map<string, number>();
  private readonly topology = new WeakMap<BabaLevel, {
    paths: Map<string, LevelPath[]>; links: Map<string, number[]>;
  }>();
  constructor(pack: LevelPack, saved?: CampaignProgress) {
    this.pack = pack;
    this.maps = new Set(pack.entries.filter(entry => entry.map).map(entry => entry.id));
    this.indices = new Map(pack.entries.map(({ id }, index) => [id, index]));
    for (const [index, entry] of pack.entries.entries()) {
      if (!entry.map) continue;
      for (const child of new Set(entry.children)) {
        const parents = this.parents.get(child);
        if (parents) parents.push(index);
        else this.parents.set(child, [index]);
      }
    }
    // A direct room opened without a history gets the shortest route from the entry map.
    const queue = [pack.initial];
    const seen = new Set(queue);
    for (const index of queue) {
      const entry = pack.entries[index];
      if (!entry?.map) continue;
      for (const id of entry.children ?? []) {
        const child = this.indices.get(id);
        if (child === undefined || seen.has(child)) continue;
        seen.add(child);
        this.primaryParents.set(id, index);
        queue.push(child);
      }
    }
    saved?.completed.forEach(id => this.completed.add(id));
    saved?.bonuses.forEach(([id, count]) => this.bonuses.set(id, count));
    saved?.conversions.forEach(([parent, child, targets, entrance]) => this.replace(parent, child, targets, entrance));
  }

  progress(): CampaignProgress {
    return { completed: [...this.completed], bonuses: [...this.bonuses],
      conversions: [...this.conversions].flatMap(([parent, children]) =>
        [...children.values()].map(({ child, targets, entrance }): CampaignProgress['conversions'][number] =>
          entrance === undefined ? [parent, child, [...targets]] : [parent, child, [...targets], entrance])) };
  }

  replace(parent: string, child: string, targets: readonly string[], entrance?: string): void {
    let changes = this.conversions.get(parent);
    if (!changes) { changes = new Map(); this.conversions.set(parent, changes); }
    changes.set(entrance === undefined ? `room:${child}` : `entrance:${entrance}`, { child, targets, entrance });
  }

  replacements(parent: string): ReadonlyMap<string, EntranceConversion> | undefined { return this.conversions.get(parent); }

  parentOf(id: string): number {
    const index = this.indices.get(id);
    const parents = this.parents.get(id);
    const parent = index === undefined ? undefined : this.pack.entries[index]!.parent;
    const declared = parent === undefined ? undefined : this.indices.get(parent);
    if (declared !== undefined && parents?.includes(declared)) return declared;
    return this.primaryParents.get(id) ?? parents?.[0] ?? -1;
  }

  private petals(ids: Iterable<string>): number {
    return new Set([...ids].filter(id => this.completed.has(id) && !this.maps.has(id))).size;
  }

  access(level: BabaLevel) {
    const clearedMaps = new Set(this.pack.entries.filter(entry => entry.map && entry.clearCount &&
      this.petals(entry.children ?? []) >= entry.clearCount).map(entry => entry.id));
    const states = level.links.map(link => this.completed.has(link.id) || clearedMaps.has(link.id) ? Math.max(3, link.state) : link.state);
    const revealed = new Set(level.paths.filter(path => path.style > 0));
    const petals = this.petals(level.links.map(link => link.id));
    const index = this.indices.get(level.id);
    const required = index === undefined ? 0 : this.pack.entries[index]!.clearCount ?? 0;
    const flowers = clearedMaps.size;
    const bonus = [...this.bonuses.values()].reduce((total, count) => total + count, 0);
    // Native gate types: all petals, completed area flowers, bonuses, local petals.
    const totalPetals = [...this.completed].filter(id => !this.maps.has(id)).length;
    const scores: Record<GateType, number> = { 1: totalPetals, 2: flowers, 3: bonus, 4: petals };
    const count = (gate: number) => gateName(gate) ? scores[gate as GateType] : undefined;
    const canOpen = (path: LevelPath) => !path.gate || (count(path.gate) ?? -Infinity) >= path.requirement;
    const at = this.connections(level);
    const queue = level.links.filter((_, index) => states[index]! >= 3).map(({ x, y }) => ({ x, y }));
    for (const path of revealed) if (path.gate && canOpen(path)) queue.push(path);
    const visited = new Set<LevelPath>();
    for (const source of queue) for (const [dx, dy] of vectors) {
      const cell = cellKey(source.x + dx, source.y + dy);
      for (const path of at.paths.get(cell) ?? []) {
        if (visited.has(path)) continue;
        visited.add(path);
        revealed.add(path);
        if (canOpen(path)) queue.push(path);
      }
      for (const index of at.links.get(cell) ?? []) if (states[index]! < 2) states[index] = 2;
    }
    const revealedPaths = level.paths.filter(path => revealed.has(path));
    const gates: GateProgress[] = revealedPaths.filter(path => path.gate && !canOpen(path))
      .map(path => ({ path, collected: count(path.gate) ?? 0 }));
    return { states, revealedPaths, paths: revealedPaths.filter(canOpen), flower: { petals, totalPetals, required, flowers }, gates };
  }

  private connections(level: BabaLevel) {
    const existing = this.topology.get(level);
    if (existing) return existing;
    const paths = new Map<string, LevelPath[]>();
    const links = new Map<string, number[]>();
    const add = <T>(index: Map<string, T[]>, x: number, y: number, value: T) => {
      const key = cellKey(x, y);
      const list = index.get(key);
      if (list) list.push(value);
      else index.set(key, [value]);
    };
    for (const path of level.paths) add(paths, path.x, path.y, path);
    level.links.forEach(({ x, y }, index) => add(links, x, y, index));
    const topology = { paths, links };
    this.topology.set(level, topology);
    return topology;
  }
}

const cellKey = (x: number, y: number) => `${x},${y}`;
