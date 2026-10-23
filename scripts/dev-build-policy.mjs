const sourceExtensions = /\.(?:[cm]?[jt]sx?|json|wgsl)$/i;
const normalize = path => path.replaceAll('\\', '/');

export function selectDevGames(entries, args, filter = '') {
  const once = args.includes('--once');
  const requested = args.filter(arg => arg !== '--once').flatMap(arg => arg.split(','))
    .map(arg => arg.trim().replace(/^game:/, '')).filter(Boolean);
  if (!requested.length) requested.push(...filter.split(',').map(value => value.trim()).filter(Boolean));
  const available = new Set(entries.map(entry => entry.id));
  for (const id of requested) if (!available.has(id)) throw new Error(`Unknown game "${id}". Use a manifest game id, optionally prefixed with game:.`);
  return { once, games: entries.filter(entry => !requested.length || requested.includes(entry.id)).map(entry => entry.id) };
}

export function isDevSource(path) {
  const name = normalize(path);
  return sourceExtensions.test(name)
    && !/(?:^|\/)(?:\.git|artifacts|games\/test)(?:\/|$)/.test(name)
    && !/^games\/[^/]+\/dist(?:\/|$)/.test(name)
    && !/^(?:games\/[^/]+\/bundle(?:\.js|\.meta\.json)|site\/gamepad\.js)$/.test(name)
    && !/\.d\.[cm]?ts$/.test(name);
}

/** Dependencies are Rollup's resolved modules, not TypeScript's whole-program watch list. */
export function affectedDevTargets(path, games, dependencies, allGames = games) {
  const name = normalize(path);
  if (!isDevSource(name)) return [];
  const targets = ['lobby', ...games];
  if (/^(?:config\/|rollup[^/]*\.|tsconfig[^/]*\.|package(?:-lock)?\.json|scripts\/|node_modules\/@haiyue\/)/.test(name)) return targets;
  const affected = targets.filter(id => dependencies.get(id)?.has(name)
    || (name.startsWith('games/') && !dependencies.has(id)));
  const owner = /^games\/([^/]+)\//.exec(name)?.[1];
  if (games.includes(owner)) affected.push(owner);
  // Shared files can acquire new importers during a failed build. Rebuild conservatively
  // until their graph is known; source changes within unselected games stay isolated.
  if (!affected.length && name.startsWith('games/') && (!owner || !allGames.includes(owner))) return targets;
  return [...new Set(affected)];
}

export class SerialBuildQueue {
  pending = new Set();
  running = null;
  stopped = false;
  failures = new Map();
  constructor(build, onError = () => {}) { this.build = build; this.onError = onError; }
  enqueue(ids) {
    if (this.stopped) return;
    for (const id of ids) this.pending.add(id);
    if (!this.pending.size) return;
    this.running ??= Promise.resolve().then(() => this.drain()).finally(() => {
      this.running = null;
      if (this.pending.size) this.enqueue([]);
    });
  }
  async drain() {
    while (!this.stopped && this.pending.size) {
      const id = this.pending.values().next().value;
      this.pending.delete(id);
      try { await this.build(id); this.failures.delete(id); }
      catch (error) { this.failures.set(id, error); this.onError(id, error); }
    }
  }
  async idle() { while (this.running) await this.running; }
  async stop() { this.stopped = true; this.pending.clear(); await this.idle(); }
}
