import type { BabaLevel, LevelPath } from '../levels/baba-format';
import type { LevelPack } from '../levels/pack';
import { vectors } from './properties';

export interface CampaignProgress {
  completed: string[];
  bonuses: [string, number][];
  conversions: [string, string, string[]][];
}

export class Campaign {
  readonly completed = new Set<string>();
  readonly bonuses = new Map<string, number>();
  private readonly conversions = new Map<string, Map<string, readonly string[]>>();
  private readonly pack: LevelPack;
  constructor(pack: LevelPack, saved?: CampaignProgress) {
    this.pack = pack;
    saved?.completed.forEach(id => this.completed.add(id));
    saved?.bonuses.forEach(([id, count]) => this.bonuses.set(id, count));
    saved?.conversions.forEach(([parent, child, targets]) => this.replace(parent, child, targets));
  }

  progress(): CampaignProgress {
    return { completed: [...this.completed], bonuses: [...this.bonuses],
      conversions: [...this.conversions].flatMap(([parent, children]) =>
        [...children].map(([child, targets]): [string, string, string[]] => [parent, child, [...targets]])) };
  }

  replace(parent: string, child: string, targets: readonly string[]): void {
    let changes = this.conversions.get(parent);
    if (!changes) { changes = new Map(); this.conversions.set(parent, changes); }
    changes.set(child, targets);
  }

  replacements(parent: string): ReadonlyMap<string, readonly string[]> | undefined { return this.conversions.get(parent); }

  parentOf(id: string): number {
    const entries = this.pack.entries;
    const parent = entries.find(entry => entry.id === id)?.parent;
    const declared = entries.findIndex(entry => entry.id === parent && entry.children?.includes(id));
    if (declared >= 0) return declared;
    return entries.findIndex(entry => entry.map && entry.children?.includes(id));
  }

  access(level: BabaLevel) {
    const states = level.links.map(link => this.completed.has(link.id) ? Math.max(3, link.state) : link.state);
    const revealed = new Set(level.paths.filter(path => path.style > 0));
    const localWins = level.links.reduce((ids, link) => {
      if (this.completed.has(link.id)) ids.add(link.id);
      return ids;
    }, new Set<string>()).size;
    const clears = this.pack.entries.filter(entry => entry.map && !!entry.clearCount &&
      new Set(entry.children?.filter(id => this.completed.has(id))).size >= entry.clearCount).length;
    const bonus = [...this.bonuses.values()].reduce((total, count) => total + count, 0);
    const scores = [0, this.completed.size, clears, bonus, localWins];
    const canOpen = (path: LevelPath) => !path.gate || (scores[path.gate] ?? -Infinity) >= path.requirement;
    const adjacent = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      vectors.some(([dx, dy]) => a.x + dx === b.x && a.y + dy === b.y);
    const queue = level.links.filter((_, index) => states[index]! >= 3).map(({ x, y }) => ({ x, y }));
    const visited = new Set<LevelPath>();
    for (const source of queue) {
      for (const path of level.paths) {
        if (!adjacent(source, path) || visited.has(path)) continue;
        visited.add(path);
        revealed.add(path);
        if (canOpen(path)) queue.push(path);
      }
      level.links.forEach((link, index) => {
        if (adjacent(source, link) && states[index]! < 2) states[index] = 2;
      });
    }
    const revealedPaths = level.paths.filter(path => revealed.has(path));
    return { states, revealedPaths, paths: revealedPaths.filter(canOpen) };
  }
}
