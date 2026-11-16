import { World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { gamepadFrame, installGamepad } from '../../gamepad/runtime';
import { GameEngine } from '../../session/GameEngine';
import { gameSession } from '../../session/SessionPause';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { builtinPack, localPacks, type LevelPack } from '../levels/pack';
import { LagoonScene, loadArt } from '../rendering/scene';
import { Campaign } from '../rules/campaign';
import { Puzzle, type Move } from '../rules/game';
import { isProgress, type Progress } from '../rules/progress';
import { copy, LagoonHud, rowsPerPage, type HudAction } from '../ui/hud';

const moves = new Map<string, Move>([
  ['ArrowRight', 0], ['KeyD', 0], ['ArrowUp', 1], ['KeyW', 1],
  ['ArrowLeft', 2], ['KeyA', 2], ['ArrowDown', 3], ['KeyS', 3], ['Space', 'wait'],
]);
const actions = new Map<string, HudAction>([
  ['KeyZ', 'undo'], ['Backspace', 'undo'], ['KeyR', 'restart'], ['KeyL', 'library'],
  ['Escape', 'library'], ['Enter', 'next'], ['KeyI', 'files'], ['KeyF', 'folder'],
]);

class LagoonGame {
  private readonly lifetime = new AbortController();
  private readonly world = new World('大肥鱼');
  private readonly engine: GameEngine;
  private readonly canvas: HTMLCanvasElement;
  private readonly picker: HTMLInputElement;
  private readonly folder: HTMLInputElement;
  private readonly resize: ResizeObserver;
  private readonly packs = [builtinPack(this.lifetime.signal)];
  private readonly saves = new SingleSlotGameSave<Progress>({ gameId: 'dafeiyu', name: '大肥鱼', validateData: isProgress });
  private readonly campaigns = new WeakMap<LevelPack, Campaign>();
  private readonly parents: { index: number; puzzle: Puzzle }[] = [];
  private overworld: Puzzle | undefined;
  private hud: LagoonHud | undefined;
  private scene: LagoonScene | undefined;
  private puzzle: Puzzle | null = null;
  private pack = this.packs[0]!;
  private index = 0;
  private selected = 0;
  private library = false;
  private busy = false;
  private usingPad = false;
  private message = '';
  private pending: Move | undefined;

  constructor(canvas: HTMLCanvasElement, picker: HTMLInputElement, folder: HTMLInputElement) {
    this.canvas = canvas;
    this.picker = picker;
    this.folder = folder;
    this.engine = new GameEngine({ canvas, msaaSamples: 4, clearColor: { r: .015, g: .063, b: .1, a: 1 },
      devicePixelRatio: () => Math.min(devicePixelRatio || 1, 2) });
    this.resize = new ResizeObserver(() => this.fit());
  }
  async init(): Promise<void> {
    const save = await this.saves.load();
    this.lifetime.signal.throwIfAborted();
    const start = this.pack.initial;
    this.index = save?.stage ?? start;
    this.selected = this.index;
    const campaign = new Campaign(this.pack);
    this.campaigns.set(this.pack, campaign);
    save?.completed.forEach(id => campaign.completed.add(id));
    const map = this.pack.entries[start]!.read();
    const [, art, mapLevel, level] = await Promise.all([this.engine.init(), loadArt(), map,
      this.index === start ? map : this.pack.entries[this.index]!.read()]);
    this.lifetime.signal.throwIfAborted();
    this.scene = new LagoonScene(this.engine, art);
    this.world.addSystem(this.scene);
    this.hud = new LagoonHud(this.engine, this.world, action => this.act(action), row => {
      const target = Math.floor(this.selected / rowsPerPage) * rowsPerPage + row;
      if (!this.busy && this.canOpen(target)) void this.open(this.pack, target);
    });
    const integration = new RenderIntegration(this.engine, { label: '大肥鱼 2D + GUI' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, system => system === this.scene ? { pass: 'isolated', loadOp: 'clear', depth: false, sort: 10 } :
      { pass: 'shared', loadOp: 'load', sort: 1000 });
    this.overworld = new Puzzle(mapLevel, this.index === start ? save?.state : undefined, campaign);
    this.puzzle = this.index === start ? this.overworld : new Puzzle(level, save?.state, campaign);
    if (this.puzzle !== this.overworld) this.parents.push(this.builtinParent(level.id));
    this.scene.setPuzzle(this.puzzle);
    this.bind();
    this.fit();
    this.refresh();
    this.engine.on('update', event => {
      if (!gameSession.paused && this.pending !== undefined) {
        const move = this.pending;
        this.pending = undefined;
        this.move(move);
      }
      const nowPad = !!gamepadFrame();
      if (this.usingPad !== nowPad) { this.usingPad = nowPad; this.refresh(); }
      this.scene?.tick(event.detail.delta);
      this.world.update(event.detail.time, event.detail.delta);
    });
    if (new URLSearchParams(location.search).has('verify')) {
      Object.defineProperty(window, '__dafeiyu', { configurable: true, get: () => this.snapshot() });
    }
    document.body.dataset.renderStatus = 'ready';
    this.engine.run();
  }
  private fit(): void {
    if (!this.hud || this.lifetime.signal.aborted) return;
    this.engine.resizeToDisplaySize();
    this.hud.resize(this.engine.displayWidth, this.engine.displayHeight);
  }
  private refresh(): void {
    this.hud?.update({ puzzle: this.puzzle, pack: this.pack, index: this.index, active: this.selected,
      library: this.library, busy: this.busy, gamepad: this.usingPad, message: this.message, canGoBack: this.parents.length > 0,
      builtin: this.pack === this.packs[0],
      selectedLink: this.puzzle?.selectedLink(),
      completed: this.campaigns.get(this.pack)?.completed ?? new Set(),
      locked: this.library ? new Set(this.pack.entries.filter((_, index) => !this.canOpen(index)).map(entry => entry.id)) : new Set() });
  }
  private save(): void {
    const puzzle = this.puzzle;
    const campaign = this.campaigns.get(this.pack);
    if (!puzzle || !campaign) return;
    if (puzzle.state.won) campaign.completed.add(puzzle.level.id);
    if (puzzle.state.bonus) {
      campaign.bonuses.set(puzzle.level.id, Math.max(puzzle.state.bonus, campaign.bonuses.get(puzzle.level.id) ?? 0));
    }
    if (this.pack === this.packs[0]) {
      if (puzzle.state.won) this.overworld?.refreshMap();
      this.saves.save({ stage: this.index, state: puzzle.state, completed: [...campaign.completed] });
    }
  }
  private canOpen(index: number): boolean {
    const entry = this.pack.entries[index];
    return !!entry && (this.pack !== this.packs[0] || index === this.pack.initial ||
      !!this.overworld?.state.units.some(unit => unit.marker && unit.link === entry.id && (unit.state ?? 0) >= 2));
  }
  private builtinParent(id: string): { index: number; puzzle: Puzzle } {
    const map = this.overworld!;
    const node = map.state.units.find(unit => unit.marker && unit.link === id && (unit.state ?? 0) >= 2);
    const cursor = map.state.units.find(unit => unit.name === 'cursor');
    if (node && cursor && (node.x !== cursor.x || node.y !== cursor.y)) {
      const units = map.state.units.map(unit => unit === cursor ? { ...unit, x: node.x, y: node.y } : unit);
      this.overworld = new Puzzle(map.level, { ...map.state, units }, this.campaigns.get(this.packs[0]!));
    }
    return { index: this.packs[0]!.initial, puzzle: this.overworld! };
  }
  private bind(): void {
    const options = { signal: this.lifetime.signal };
    window.addEventListener('keydown', event => {
      if (event.ctrlKey || event.altKey || event.metaKey || gameSession.paused) return;
      const action = actions.get(event.code);
      const move = moves.get(event.code);
      if (!action && move === undefined) return;
      if (event.code === 'Escape' && !this.library) return;
      event.preventDefault();
      if (action) { if (!event.repeat) this.act(action); return; }
      if (move !== undefined) {
        if (move === 'wait' && event.repeat) return;
        if (this.library && move === 'wait') this.act('next');
        else if (!this.library && move === 'wait' && (this.puzzle?.state.won || this.puzzle?.selectedLink())) this.act('next');
        else this.pending = move;
      }
    }, options);
    window.addEventListener('blur', () => { this.pending = undefined; }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pending = undefined; }, options);
    for (const input of [this.picker, this.folder]) input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      if (files.length) void this.import(files);
    }, options);
    this.resize.observe(this.canvas);
  }
  private move(move: Move): void {
    if (this.busy) return;
    if (this.library) {
      if (move === 1 || move === 3) this.select(this.selected + (move === 1 ? -1 : 1));
      else if (move === 0 || move === 2) this.select(this.selected + (move === 2 ? -rowsPerPage : rowsPerPage));
      return;
    }
    if (!this.puzzle || this.puzzle.state.won) return;
    const before = this.puzzle.state;
    this.puzzle.move(move);
    this.scene?.setPuzzle(this.puzzle, before);
    this.message = '';
    this.save();
    this.refresh();
    if (this.puzzle.state.conversion) void this.convertRoom(this.puzzle, this.puzzle.state.conversion);
  }
  private select(index: number): void {
    this.selected = Math.max(0, Math.min(this.pack.entries.length - 1, index));
    this.refresh();
  }
  private act(action: HudAction): void {
    if (this.busy || gameSession.paused) return;
    const puzzle = this.puzzle;
    this.message = '';
    if (action === 'library') {
      this.library = !this.library;
      this.selected = this.index;
      this.pending = undefined;
    } else if (action === 'files' || action === 'folder') {
      (action === 'files' ? this.picker : this.folder).click();
    } else if (this.library) {
      if (action === 'older' || action === 'newer') this.select(this.selected + (action === 'older' ? -rowsPerPage : rowsPerPage));
      if (action === 'pack') {
        const current = this.packs.indexOf(this.pack);
        const pack = this.packs[(current + 1) % this.packs.length]!;
        void this.openStart(pack, true);
      }
      if (action === 'next') {
        if (this.canOpen(this.selected)) void this.open(this.pack, this.selected);
        else this.message = copy.locked;
      }
    } else if (puzzle) {
      if (action === 'undo' || action === 'restart') {
        if (action === 'undo') {
          const previous = puzzle.state;
          puzzle.undo();
          if (puzzle.state !== previous) this.scene?.setPuzzle(puzzle, previous);
        } else { puzzle.reset(); this.scene?.setPuzzle(puzzle); }
        this.save();
      } else if (action === 'next') {
        if (puzzle.state.won && this.parents.length) {
          this.returnToParent();
        } else if (puzzle.selectedLink()) {
          const id = puzzle.selectedLink()!.toLowerCase();
          const target = this.pack.entries.findIndex(entry => entry.id === id);
          if (target === -1) this.message = copy.missingLink;
          else void this.open(this.pack, target, false, { index: this.index, puzzle });
        } else if (this.parents.length) this.returnToParent();
      }
    }
    this.refresh();
  }
  private returnToParent(): void {
    const parent = this.parents.pop();
    if (!parent) return;
    this.pending = undefined;
    parent.puzzle.refreshMap();
    this.puzzle = parent.puzzle;
    this.index = this.selected = parent.index;
    this.scene?.setPuzzle(parent.puzzle);
    this.save();
    this.refresh();
  }
  private async convertRoom(puzzle: Puzzle, targets: string[]): Promise<void> {
    const campaign = this.campaigns.get(this.pack);
    if (!campaign) return;
    const id = puzzle.level.id;
    const parent = this.parents.at(-1);
    if (parent) {
      campaign.replace(parent.puzzle.level.id, id, targets);
      this.returnToParent();
    } else {
      const index = campaign.parentOf(id);
      if (index < 0) { this.message = copy.missingLink; this.refresh(); return; }
      await this.open(this.pack, index, false, undefined, { child: id, targets });
    }
  }
  private openStart(pack: LevelPack, keepLibrary = false): Promise<void> {
    const first = pack.first;
    const intro = first !== undefined && first !== pack.initial &&
      !this.campaigns.get(pack)?.completed.has(pack.entries[first]!.id);
    return this.open(pack, intro ? first : pack.initial, keepLibrary, undefined, undefined, intro);
  }
  private async open(pack: LevelPack, index: number, keepLibrary = false, parent?: { index: number; puzzle: Puzzle },
    conversion?: { child: string; targets: string[] }, intro = false): Promise<void> {
    this.busy = true;
    this.pending = undefined;
    this.refresh();
    try {
      const builtin = pack === this.packs[0];
      const returning = builtin && index === pack.initial ? this.overworld : undefined;
      const [level, start] = await Promise.all([returning?.level ?? pack.entries[index]!.read(), intro ? pack.entries[pack.initial]!.read() : undefined]);
      if (this.lifetime.signal.aborted) return;
      const campaign = this.campaigns.get(pack);
      if (conversion) campaign?.replace(level.id, conversion.child, conversion.targets);
      const puzzle = returning ?? new Puzzle(level, undefined, campaign);
      this.scene?.setPuzzle(puzzle);
      this.index = index;
      this.selected = index;
      this.pack = pack;
      this.puzzle = puzzle;
      this.library = keepLibrary;
      if (parent) this.parents.push(parent);
      else {
        this.parents.length = 0;
        if (builtin && index !== pack.initial) this.parents.push(this.builtinParent(level.id));
        else if (start) this.parents.push({ index: pack.initial, puzzle: new Puzzle(start, undefined, campaign) });
      }
      this.save();
    } catch (error) {
      if (!this.lifetime.signal.aborted) {
        this.message = copy.failed;
        console.warn('大肥鱼关卡读取失败', error);
      }
    } finally {
      this.busy = false;
      if (!this.lifetime.signal.aborted) this.refresh();
    }
  }
  private async import(files: File[]): Promise<void> {
    if (this.busy) return;
    this.library = true;
    this.busy = true;
    this.message = copy.load;
    this.refresh();
    try {
      const packs = await localPacks(files);
      if (this.lifetime.signal.aborted) return;
      const first = packs[0];
      if (!first) { this.message = copy.noPair; return; }
      this.message = '';
      for (const pack of packs) this.campaigns.set(pack, new Campaign(pack));
      await this.openStart(first);
      if (this.pack === first) {
        // Release replaced file handles when the same named pack is imported again.
        for (const pack of packs) {
          const previous = this.packs.findIndex((entry, i) => i > 0 && entry.title === pack.title);
          if (previous === -1) this.packs.push(pack);
          else this.packs[previous] = pack;
        }
      }
    } catch (error) {
      this.message = copy.failed;
      console.warn('大肥鱼关卡包读取失败', error);
    } finally {
      this.busy = false;
      if (!this.lifetime.signal.aborted) this.refresh();
    }
  }
  snapshot() {
    return { current: this.puzzle?.level.id, title: this.puzzle?.level.title, state: this.puzzle?.state,
      rules: this.puzzle?.context.rules.map(rule => rule.label), library: this.library, active: this.selected,
      pack: this.pack.title, gamepad: this.usingPad, bounds: this.scene?.bounds, message: this.message,
      animation: this.scene?.animationSnapshot(),
      openPaths: this.puzzle?.openPaths.map(({ x, y }) => [x, y]), selectedLink: this.puzzle?.selectedLink(),
      hud: this.hud?.root.root.children.map(node => ({ text: 'text' in node ? node.text : '', visible: node.visible, rect: {...node.rect} })) };
  }
  dispose(): void {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.resize.disconnect();
    this.engine.stop();
    this.world.destroy();
    this.engine.destroy();
  }
}

const stopGamepad = installGamepad('dafeiyu');
const game = new LagoonGame(document.getElementById('lagoon') as HTMLCanvasElement, document.getElementById('level-pair') as HTMLInputElement,
  document.getElementById('level-pack') as HTMLInputElement);
window.addEventListener('pagehide', event => {
  if (!event.persisted) { stopGamepad(); game.dispose(); }
});
void game.init().catch(error => {
  game.dispose();
  stopGamepad();
  if (error instanceof DOMException && error.name === 'AbortError') return;
  document.body.dataset.renderStatus = 'failed';
  throw error;
});
