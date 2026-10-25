import { readGameRoute, routeUrl, type GameRoute } from './GameRouter';

export class GameNavigation {
  private readonly lifetime = new AbortController();
  private readonly changed: (route: GameRoute) => void;
  constructor(changed: (route: GameRoute) => void) {
    this.changed = changed;
    for (const type of ['popstate', 'hashchange']) window.addEventListener(type, () => this.sync(), { signal: this.lifetime.signal });
  }
  get route(): GameRoute { return readGameRoute(location.href); }
  navigate(route: GameRoute, replace = false): void {
    history[replace ? 'replaceState' : 'pushState']({}, '', routeUrl(location.href, route)); this.sync();
  }
  sync(): void { this.changed(this.route); }
  dispose(): void { this.lifetime.abort(); }
}
