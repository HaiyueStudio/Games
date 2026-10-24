import { Entity, HaiyueEngine, World } from '@haiyue/engine';
import { GuiInput, GuiRoot, GuiSystem } from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { LauncherActivity } from './activity';
import { Aurora } from './Aurora';
import { CardHover } from './CardHover';
import { DesktopGui, DESKTOP_TEXT, type DesktopActions, type DesktopState } from './DesktopGui';
import type { ConnectionNotice } from '../gamepad/connections';
import type { GameProgress } from '../host/types';

export interface LauncherPanel {
  root: GuiRoot;
  resize(width: number, height: number): void;
  update(delta: number): void;
  move(horizontal: number, vertical: number): void;
  launch(): void;
  snapshot(): Record<string, unknown>;
  destroy(): void;
}

export class GameOS {
  private readonly engine: HaiyueEngine;
  private readonly world = new World('Game OS desktop');
  private readonly abort = new AbortController();
  private readonly activity: LauncherActivity;
  private readonly desktop: DesktopGui;
  private readonly resize: ResizeObserver;
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private gui: GuiSystem | null = null;
  private aurora: Aurora | null = null;
  private state: DesktopState | null = null;
  private frames = 0;
  private pendingFocus: string | null = null;
  private last: number | null = null;
  private disposed = false;
  private panel: LauncherPanel | null = null;
  private panelEntity: Entity | null = null;
  private loading = false;
  private deviceSnapshot: (() => Record<string, unknown>) | null = null;
  constructor(private readonly canvas: HTMLCanvasElement, actions: DesktopActions) {
    this.engine = new HaiyueEngine({ canvas, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 1.5) });
    this.desktop = new DesktopGui(actions);
    this.activity = new LauncherActivity({ start: () => { this.engine.resizeToDisplaySize(); this.desktop.resize(this.engine.displayWidth, this.engine.displayHeight); this.panel?.resize(this.engine.displayWidth, this.engine.displayHeight); this.last = null; this.engine.run(); }, stop: () => { this.engine.stop(); this.last = null; } });
    this.resize = new ResizeObserver(() => { if (!this.activity.running) return; this.engine.resizeToDisplaySize(); this.desktop.resize(this.engine.displayWidth, this.engine.displayHeight); this.panel?.resize(this.engine.displayWidth, this.engine.displayHeight); });
    const options = { signal: this.abort.signal };
    document.addEventListener('visibilitychange', () => this.activity.update({ hidden: document.hidden }), options);
    window.addEventListener('pagehide', event => { if (event.persisted) this.activity.update({ suspended: true }); else this.destroy(); }, options);
    window.addEventListener('pageshow', () => this.activity.update({ suspended: false, hidden: document.hidden }), options);
    this.focusChanged = () => { const id = this.gui?.focus.focused?.id; if (id?.startsWith('game-') && (id.slice(5) !== this.state?.selected?.id || !this.state?.selectionActive)) actions.select(id.slice(5)); };
  }
  private readonly focusChanged: () => void;
  async init(catalogText = ''): Promise<void> {
    await this.engine.init(); if (this.disposed) return;
    this.aurora = new Aurora(this.engine); await this.aurora.init(); if (this.disposed) { this.aurora.destroy(); return; }
    const ascii = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('');
    const chars = [...new Set(DESKTOP_TEXT + catalogText + '↑↓←→ /：·，。！设备模拟器正在初始化图形与资源代码按需载入不会下载整个游戏库准备就绪加载失败返回游戏库重新加载检查网络连接超时重试屏幕手机平板左右滑动切换点击启动图标独立打开退出全屏横竖屏鼠标模拟触摸图标桌面主页上一页下一页' + ascii)].join('');
    this.gui = new GuiSystem(this.engine, { textInputHost: 'browser', font: { chars, fontSize: 36, fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', atlasSize: 2048 } });
    this.gui.focus.subscribe(this.focusChanged);
    this.world.addEntity(new Entity('Native desktop controls').addComponent(this.desktop.root));
    this.world.addSystem(this.aurora); this.world.addSystem(this.gui);
    const hover = new CardHover(this.engine, () => this.desktop.hoverCards(), () => this.desktop.shelf.rect); await hover.init();
    if (this.disposed) { hover.destroy(); return; } this.world.addSystem(hover);
    const integration = new RenderIntegration(this.engine, { label: 'Game OS wallpaper + native GUI' }); this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, system => system === hover ? { passType: 'compute', sort: 20 } : system === this.aurora ? { pass: 'isolated', loadOp: 'clear', depth: false, sort: 0 } : { pass: 'isolated', loadOp: 'load', depth: true, sort: 10 });
    this.engine.on('update', event => {
      if (this.disposed || !this.activity.running) return;
      const now = event.detail.time, delta = this.last === null ? 0 : Math.min(.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
      this.aurora!.motion = !this.motion.matches; this.aurora!.time += delta; this.desktop.updateClock();
      this.world.update(now, delta * 1000); this.frames++;
      this.desktop.animate(delta, !this.motion.matches);
      this.panel?.update(delta);
      if (this.pendingFocus) this.focusCard(this.pendingFocus);
      document.body.dataset.osReady = 'true';
    });
    this.resize.observe(this.canvas); this.activity.update({ ready: true, hidden: document.hidden });
    if (new URLSearchParams(location.search).has('verify') || new URLSearchParams(location.search).has('gamepadVerify')) Object.defineProperty(window, '__gameOS', { configurable: true, get: () => this.snapshot() });
  }
  setState(state: DesktopState, resetScroll = false): void { this.state = state; this.desktop.setState(state, resetScroll); }
  setLoading(progress: GameProgress | null, title = ''): void {
    this.loading = !!progress; this.desktop.showLoading(progress, title); this.desktop.root.root.setVisible(this.loading || !this.panel); this.panel?.root.root.setVisible(!this.loading);
  }
  setPanel(panel: LauncherPanel | null): void {
    if (this.panelEntity) { this.world.removeEntity(this.panelEntity); this.panel?.destroy(); }
    this.panel = panel; this.panelEntity = panel ? new Entity('Launcher device simulator').addComponent(panel.root) : null;
    if (this.panelEntity) this.world.addEntity(this.panelEntity);
    this.desktop.root.root.setVisible(this.loading || !panel); panel?.root.root.setVisible(!this.loading);
    panel?.resize(this.engine.displayWidth, this.engine.displayHeight); this.pendingFocus = null; this.gui?.focus.blur();
  }
  movePanel(horizontal: number, vertical: number): void { this.panel?.move(horizontal, vertical); }
  setDeviceView(snapshot: (() => Record<string, unknown>) | null): void { this.deviceSnapshot = snapshot; }
  launchPanel(): void { this.panel?.launch(); }
  setPlaying(playing: boolean): void {
    if (this.gui) this.gui.disabled = playing;
    this.canvas.hidden = playing; this.activity.update({ playing }); document.body.dataset.osPaused = String(playing);
    if (!playing) this.canvas.focus({ preventScroll: true });
  }
  setNotices(notices: readonly ConnectionNotice[], connected: boolean): void { this.desktop.updateNotices(notices, connected); }
  get editing(): boolean { return this.gui?.focus.focused instanceof GuiInput; }
  get focused(): string | undefined { return this.gui?.focus.focused?.id; }
  get columns(): number { return this.desktop.snapshot().columns; }
  focusSearch(): void { this.gui?.focus.focus(this.desktop.search); }
  blurSearch(): void { this.gui?.focus.blur(); this.canvas.focus({ preventScroll: true }); }
  focusCard(id: string): void {
    const card = this.desktop.card(id); if (!card) return;
    this.pendingFocus = id; this.desktop.reveal(id); this.gui?.focus.focus(card);
    if (this.gui?.focus.focused === card) this.pendingFocus = null;
  }
  snapshot() { return { ready: this.activity.ready, running: this.activity.running, playing: this.activity.playing, hidden: this.activity.hidden, frames: this.frames, time: this.aurora?.time ?? 0,
    motion: this.aurora?.motion ?? false, selected: this.state?.selected?.id ?? '', view: this.state?.view ?? 'all', category: this.state?.category ?? 'all', search: this.state?.search ?? '', favorites: this.state?.favorites ?? 0,
    games: this.state?.games.map(game => game.id) ?? [], selectionActive: this.state?.selectionActive ?? false, focused: this.focused ?? '', editing: this.editing, loading: this.loading, ...this.desktop.snapshot(), ...(this.panel?.snapshot() ?? {}), ...(this.deviceSnapshot?.() ?? {}) }; }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.activity.destroy(); this.abort.abort(); this.resize.disconnect(); this.panel?.destroy(); this.desktop.destroy(); this.world.destroy(); this.engine.destroy(); delete document.body.dataset.osReady; }
}
