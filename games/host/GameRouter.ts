import type { GameHostOptions, GameModule, GameProgress, MountedGame } from './types';

export interface GameRoute { game: string | null; device: 'pad' | 'phone' | null }
export function readGameRoute(href: string): GameRoute {
  const query = new URL(href).searchParams, device = query.get('device');
  return { game: query.get('game'), device: device === 'pad' || device === 'phone' ? device : null };
}
export function routeUrl(href: string, route: GameRoute): string {
  const url = new URL(href); for (const [key, value] of [['game', route.game], ['device', route.device]]) if (value) url.searchParams.set(key!, value); else url.searchParams.delete(key!); return url.href;
}
export function gameModuleUrl(id: string, gamesRoot: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Invalid game module id.');
  return new URL(`${id}/${id === 'mugen' || id === 'gravity-maze' ? 'dist/' : ''}bundle.js`, gamesRoot).href;
}
export class GameRouter {
  instance: MountedGame | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private readonly modules = new Map<string, Promise<GameModule>>();
  private readonly retries = new Map<string, number>();
  private readonly importer: (url: string) => Promise<GameModule>;
  constructor(importer: (url: string) => Promise<GameModule> = url => import(url)) { this.importer = importer; }
  async mount(id: string, url: string, options: GameHostOptions): Promise<MountedGame | null> {
    this.clear(); const generation = this.generation, controller = new AbortController(); this.controller = controller;
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    options.onProgress?.({ phase: 'code', completed: 0, total: 0, loaded: 0, bytes: 0, message: '按需加载游戏代码' });
    try {
      let pending = this.modules.get(url);
      if (!pending) {
        const retry = this.retries.get(url) ?? 0, [path = '', hash] = url.split('#');
        pending = this.importer(retry ? `${path}${path.includes('?') ? '&' : '?'}haiyueRetry=${retry}${hash ? '#' + hash : ''}` : url);
        this.modules.set(url, pending);
        void pending.catch(() => { this.modules.delete(url); this.retries.set(url, retry + 1); });
      }
      signal.throwIfAborted(); const module = await pending; if (generation !== this.generation) return null; signal.throwIfAborted();
      if (typeof module.mountGame !== 'function') throw new Error(`${id} does not export mountGame(). Rebuild the game module.`);
      const instance = await module.mountGame({ ...options, signal });
      if (generation !== this.generation || signal.aborted) { instance.dispose(); return null; }
      this.instance = instance; return instance;
    } catch (error) { if (signal.aborted || generation !== this.generation) return null; throw error; }
  }
  clear(): void { this.generation++; this.controller?.abort(); this.controller = null; this.instance?.dispose(); this.instance = null; }
  dispose(): void { this.clear(); this.modules.clear(); this.retries.clear(); }
}
export type { GameProgress };
