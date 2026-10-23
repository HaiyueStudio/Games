import { World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GameEngine } from '../../session/GameEngine';
import { gameSession } from '../../session/SessionPause';
import { guardQueuedPointerCapture } from '../../shared/input/pointerCapture';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { isBestScore, type BestScore } from '../save/best';
import { advance, createRound, endStroke, resizeRound, slice, type Point } from '../rules/model';
import { FruitScene, loadAtlas } from '../rendering/FruitScene';
import { FruitHud, type Action } from '../ui/FruitHud';
import { BladeInput } from '../input/BladeInput';

export class FruitGame {
  private readonly engine: GameEngine;
  private readonly effects = new World('Fruit effects and HUD');
  private readonly observer: ResizeObserver;
  private readonly lifetime = new AbortController();
  private readonly restoreCapture: () => void;
  private readonly save = new SingleSlotGameSave<BestScore>({ gameId: 'fruit-ninja', name: '水果忍者最高分', validateData: isBestScore });
  private round = createRound(1);
  private hud!: FruitHud;
  private scene!: FruitScene;
  private input!: BladeInput;
  private best = 0;
  private disposed = false;
  private lastTime: number | null = null;
  private unregisterSession: (() => void) | null = null;
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.restoreCapture = guardQueuedPointerCapture(canvas);
    this.engine = new GameEngine({ canvas, msaaSamples: 4, clearColor: { r: .04, g: .12, b: .1, a: 1 }, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 2) });
    this.observer = new ResizeObserver(() => this.resize());
  }
  async init(): Promise<void> {
    const [, fruit, extraFruit, items, saved] = await Promise.all([this.engine.init(), loadAtlas('./assets/fruits.png'), loadAtlas('./assets/fruits-extra.png'), loadAtlas('./assets/items.png'), this.save.load()]);
    if (this.disposed) return;
    this.best = saved?.best ?? 0;
    this.scene = new FruitScene(this.engine, this.effects, fruit, extraFruit, items);
    this.hud = new FruitHud(this.engine, this.effects, action => this.action(action));
    const integration = new RenderIntegration(this.engine, { label: 'Fruit.effects.GUI' });
    this.effects.addRuntimeIntegration(integration); integration.registerAll(this.effects, () => ({ pass: 'shared' }));
    this.input = new BladeInput(this.canvas, point => this.canSlice(point), (a, b) => this.cut(a, b), action => this.action(action), () => endStroke(this.round));
    this.unregisterSession = gameSession.register({ pause: () => this.input.clear(), resume: () => this.input.clear() });
    this.observer.observe(this.canvas); this.resize();
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.round.phase === 'playing') this.action('pause'); }, { signal: this.lifetime.signal });
    this.engine.on('update', e => {
      const dt = this.lastTime === null ? 0 : Math.max(0, (e.detail.time - this.lastTime) / 1000); this.lastTime = e.detail.time;
      advance(this.round, dt); this.recordBest();
      const visualDelta = this.round.phase === 'paused' ? 0 : Math.min(dt, .05);
      this.scene.sync(this.round, this.hud.view, visualDelta); this.hud.refresh(this.round, this.best, visualDelta);
      this.scene.world.update(e.detail.time, visualDelta * 1000); this.effects.update(e.detail.time, visualDelta * 1000);
    });
    this.engine.run(); document.body.dataset.renderStatus = 'ready';
    if (new URLSearchParams(location.search).has('verify') || new URLSearchParams(location.search).has('gamepadVerify')) {
      Object.defineProperty(window, '__fruitNinja', { configurable: true, get: () => ({ ready: true, phase: this.round.phase, score: this.round.score, best: this.best, bombs: this.round.bombs, remaining: this.round.remaining, reason: this.round.reason,
        combo: { ...this.round.combo }, view: { ...this.hud.view }, effects: this.scene.snapshot(), items: this.round.items.map(item => ({ ...item, screen: { x: this.hud.view.x + item.x * this.hud.view.scale, y: this.hud.view.y + item.y * this.hud.view.scale } })) }) });
    }
  }
  private resize(): void {
    if (!this.hud || this.disposed) return;
    this.input?.clear(); this.engine.resizeToDisplaySize(); this.hud.resize(this.engine.displayWidth, this.engine.displayHeight);
    resizeRound(this.round, this.hud.view.height / this.hud.view.scale); this.scene.clear();
  }
  private action(action: Action): void {
    if (gameSession.paused) return;
    this.input?.clear(); this.lastTime = null;
    if (this.round.phase === 'paused') { this.round.phase = 'playing'; return; }
    if (action === 'pause' || this.round.phase === 'playing') { if (this.round.phase === 'playing') this.round.phase = 'paused'; return; }
    this.round = createRound(Number(new URLSearchParams(location.search).get('seed') ?? Date.now()), this.hud.view.height / this.hud.view.scale);
    this.round.phase = 'playing'; this.scene.clear(); this.hud.clearNotice();
  }
  private canSlice(point: Point): boolean {
    if (gameSession.paused || this.round.phase !== 'playing') return false;
    const view = this.hud.view; return point.x >= view.x && point.x <= view.x + view.width && point.y >= view.y && point.y <= view.y + view.height;
  }
  private cut(a: Point, b: Point): void {
    const view = this.hud.view, local = (p: Point) => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });
    this.scene.trail(a, b);
    const hits = slice(this.round, local(a), local(b));
    for (const item of hits) {
      this.scene.cut(item, view);
      if (item.kind === 'clock') this.hud.notify('+10 秒');
      if (item.kind === 'bomb') this.hud.notify(`炸弹 ${this.round.bombs} / 3`);
    }
    if (hits.some(item => item.kind === 'fruit') && !hits.some(item => item.kind === 'bomb') && this.round.combo.count > 1) {
      this.hud.notify(`${this.round.combo.count} 连切 · 额外 +${this.round.combo.bonus}`);
    }
    this.recordBest();
  }
  private recordBest(): void {
    if (this.round.phase === 'over' && this.round.score > this.best) { this.best = this.round.score; this.save.save({ best: this.best }); }
  }
  destroy(): void {
    if (this.disposed) return; this.disposed = true; this.lifetime.abort(); this.observer.disconnect(); this.unregisterSession?.(); this.input?.destroy();
    this.scene?.destroy(); this.effects.destroy(); this.engine.destroy(); this.restoreCapture();
  }
}
