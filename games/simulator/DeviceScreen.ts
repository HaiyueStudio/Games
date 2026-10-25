import { Entity, World, type HaiyueEngine } from '@haiyue/engine';
import { RttEngine } from '@haiyue/engine/rtt';
import { GuiElement, GuiImage, GuiLabel, GuiSystem } from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import type { GameProgress, MountedGame } from '../host/types';
import type { DesktopGame } from '../launcher/DesktopGui';
import { DeviceGui, SIMULATOR_TEXT } from './DeviceGui';
import { SimulatorHome } from './SimulatorHome';
import { DeviceWallpaper } from './DeviceWallpaper';
import { gameRectangle, phoneHomeRectangle, volumeRectangle, type DeviceMode } from './layout';
import type { DeviceVolume } from './DeviceVolume';
import type { LauncherCue } from '../launcher/audio/soundscape';

class ScreenTarget extends RttEngine {
  private readonly input: HTMLCanvasElement;
  constructor(engine: HaiyueEngine, width: number, height: number) {
    super(engine, width, height, { r: .025, g: .04, b: .09, a: 1 }, 'Device screen GUI and game composite', null, engine.format === 'bgra8unorm' ? 'bgra8unorm-srgb' : 'rgba8unorm-srgb');
    this.input = document.createElement('canvas'); this.input.width = width; this.input.height = height;
    this.input.getBoundingClientRect = () => new DOMRect(0, 0, this.width, this.height);
    const captures = new Set<number>();
    this.input.setPointerCapture = pointer => { captures.add(pointer); };
    this.input.releasePointerCapture = pointer => { captures.delete(pointer); };
    this.input.hasPointerCapture = pointer => captures.has(pointer);
  }
  override get canvas() { return this.input; }
  override resize(width: number, height: number): void { super.resize(width, height); this.input.width = width; this.input.height = height; }
}

export interface DeviceScreenOptions {
  mode: DeviceMode; games: DesktopGame[]; volume: DeviceVolume; launch(id: string): void; home(): void; retry(): void;
  sound?(cue: LauncherCue, key?: string): void;
}
export class DeviceScreen {
  readonly target: ScreenTarget;
  readonly home: SimulatorHome;
  private readonly world = new World('Device screen content');
  private readonly content = new DeviceGui(false);
  private readonly loading = new DeviceGui(false);
  private readonly navigation = new DeviceGui(false);
  private readonly volume = new DeviceGui(false);
  private readonly gameRoot = new GuiElement({ width: '100%', height: '100%', pointerFilter: 'ignore', style: { backgroundColor: 'transparent' } });
  private readonly layers = new Map<HTMLCanvasElement, { image: GuiImage; texture: GPUTexture }>();
  private readonly wallpaper: DeviceWallpaper;
  private instance: MountedGame | null = null;
  private progress: GameProgress | null = null;
  private title = '';
  private time = 0;
  private trackY = 0;
  private status: 'home' | 'loading' | 'playing' | 'error' = 'home';
  constructor(private readonly engine: HaiyueEngine, private readonly options: DeviceScreenOptions) {
    const width = options.mode === 'phone' ? 390 : 820, height = options.mode === 'phone' ? 760 : 1080;
    this.target = new ScreenTarget(engine, width, height);
    this.wallpaper = new DeviceWallpaper(this.target); this.world.addSystem(this.wallpaper);
    this.home = new SimulatorHome({ mode: options.mode, games: options.games, embedded: true, launch: options.launch, desktop: options.home, device: () => {}, external: () => {}, ...(options.sound ? { sound: options.sound } : {}) });
    this.home.resize(width, height); this.content.root.root.add(this.home.root.root); this.content.root.root.add(this.gameRoot);
    this.loading.panel('load-background', 'rgba(9,17,39,.72)'); this.loading.label('load-title', '', 30, '#f1f7ff');
    this.loading.label('load-stage', '', 18, '#bacdeb'); this.loading.label('load-resources', '', 15, '#99b2d8');
    this.loading.panel('load-track', '#23395b', 5); this.loading.panel('load-bar', '#b2f191', 5);
    this.loading.button('load-cancel', '返回主页', options.home); this.loading.button('load-retry', '重新加载', options.retry, 'primary');
    this.content.root.root.add(this.loading.root.root);
    if (options.mode === 'phone') {
      this.navigation.root.root.pointerFilter = 'ignore';
      this.navigation.panel('sim-home-shadow', 'rgba(0,0,0,.55)', 5);
      this.navigation.panel('sim-home-bar', '#f1f6ff', 3);
      this.content.root.root.add(this.navigation.root.root);
    }
    this.volume.root.root.pointerFilter = 'ignore';
    this.volume.panel('volume-background', 'rgba(8,18,38,.94)', 20).setStyle({ borderColor: '#7190be' });
    this.volume.label('volume-label', '音量 100%', 18, '#f1f7ff');
    this.volume.panel('volume-track', '#334761', 4); this.volume.panel('volume-fill', '#b2f191', 4);
    this.content.root.root.add(this.volume.root.root);
    this.world.addEntity(new Entity('Device screen root').addComponent(this.content.root));
    const chars = [...new Set(SIMULATOR_TEXT + options.games.map(game => game.title).join('') + '音量已静音加载游戏资源初始化图形返回主页重新加载失败准备就绪代码按需载入检查网络连接超时错误取消请重试合成游戏画面素材代码与资源按需载入' + Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join(''))].join('');
    this.world.addSystem(new GuiSystem(this.target, { font: { chars, fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 28, atlasSize: 2048 } }));
    const integration = new RenderIntegration(this.target, { label: 'Device screen RTT' }); this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, system => system === this.wallpaper ? { pass: 'isolated', loadOp: 'clear', depth: false, sort: 0 } : { pass: 'isolated', loadOp: 'load', depth: true, sort: 10 });
    this.layout(); this.showHome();
  }
  async init(): Promise<void> { await this.wallpaper.init(); }
  resize(width: number, height: number): void {
    if (this.target.width === width && this.target.height === height) return;
    this.target.resize(width, height); this.home.resize(width, height); this.layout(); this.instance?.resize(width, height);
  }
  private layout(): void {
    const { width, height } = this.target, compact = height < 500, left = width * .1, center = height * (compact ? .15 : .35);
    this.trackY = center + (compact ? 142 : 207);
    this.loading.place('load-background', { x: 0, y: 0, width, height });
    this.loading.place('load-title', { x: left, y: center, width: width * .8, height: compact ? 42 : 58 });
    this.loading.place('load-stage', { x: left, y: center + (compact ? 50 : 75), width: width * .8, height: compact ? 44 : 74 });
    this.loading.place('load-resources', { x: left, y: center + (compact ? 100 : 159), width: width * .8, height: 32 });
    this.loading.place('load-track', { x: left, y: this.trackY, width: width * .8, height: 8 });
    this.loading.place('load-cancel', { x: left, y: center + (compact ? 174 : 250), width: width * .36, height: 46 });
    this.loading.place('load-retry', { x: width * .54, y: center + (compact ? 174 : 250), width: width * .36, height: 46 });
    if (this.options.mode === 'phone') {
      const bar = phoneHomeRectangle(width, height);
      this.navigation.place('sim-home-shadow', { x: bar.x - 2, y: bar.y - 2, width: bar.width + 4, height: bar.height + 4 });
      this.navigation.place('sim-home-bar', bar);
    }
    const panel = volumeRectangle(width, height);
    this.volume.place('volume-background', panel);
    this.volume.place('volume-label', { x: panel.x + 20, y: panel.y + 8, width: panel.width - 40, height: 28 });
    this.volume.place('volume-track', { x: panel.x + 20, y: panel.y + panel.height - 21, width: panel.width - 40, height: 7 });
  }
  showHome(): void { this.releaseGame(); this.progress = null; this.status = 'home'; this.home.root.root.setVisible(true); this.loading.root.root.setVisible(false); this.gameRoot.setVisible(false); }
  showLoading(progress: GameProgress, title: string): void {
    if (this.instance) this.releaseGame(); this.progress = progress; this.title = title; this.status = progress.phase === 'error' ? 'error' : 'loading';
    this.home.root.root.setVisible(false); this.gameRoot.setVisible(false); this.loading.root.root.setVisible(true);
    (this.loading.nodes.get('load-title') as GuiLabel).setText(title);
    (this.loading.nodes.get('load-stage') as GuiLabel).setText(progress.message);
    (this.loading.nodes.get('load-resources') as GuiLabel).setText(progress.total ? `资源 ${progress.completed} / ${progress.total} · ${Math.round(progress.loaded / 1024)} KB` : '代码与资源按需载入');
    this.loading.nodes.get('load-retry')!.setVisible(progress.phase === 'error');
  }
  setGame(instance: MountedGame): void {
    instance.resize(this.target.width, this.target.height);
    this.releaseGame(); this.instance = instance; this.progress = null; this.status = 'playing';
    for (const [index, canvas] of [...instance.layers, instance.canvas!].entries()) {
      if (!canvas) continue; canvas.getContext('2d');
      const texture = this.engine.device.createTexture({ label: `Device game layer ${index}`, size: [canvas.width, canvas.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT });
      const image = this.content.image('sim-game-layer-' + index, this.gameRoot); image.setSource(texture); this.layers.set(canvas, { image, texture });
    }
    this.home.root.root.setVisible(false); this.loading.root.root.setVisible(false); this.gameRoot.setVisible(true);
  }
  private releaseGame(): void {
    for (const layer of this.layers.values()) { layer.texture.destroy(); this.gameRoot.remove(layer.image); this.content.nodes.delete(layer.image.id); }
    this.layers.clear(); this.instance = null;
  }
  update(time: number, delta: number): void {
    this.time += delta;
    this.loading.updateButtons(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    const volume = this.options.volume.snapshot(), panel = volumeRectangle(this.target.width, this.target.height);
    this.volume.root.root.setVisible(volume.visible); this.volume.root.root.setStyle({ opacity: volume.opacity });
    (this.volume.nodes.get('volume-label') as GuiLabel).setText(`${volume.muted ? '已静音' : '音量'} ${volume.percent}%`);
    this.volume.nodes.get('volume-fill')!.setVisible(!volume.muted);
    this.volume.place('volume-fill', { x: panel.x + 20, y: panel.y + panel.height - 21, width: (panel.width - 40) * volume.level, height: 7 });
    this.wallpaper.time = this.time; this.wallpaper.motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.status === 'home') this.home.update(delta);
    if (this.progress) {
      const width = this.target.width * .8, fraction = this.progress.total ? Math.max(.04, this.progress.completed / this.progress.total) : .26;
      this.loading.place('load-bar', { x: this.target.width * .1 + (this.progress.total || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : (width * .74) * (.5 + .5 * Math.sin(this.time * 2))), y: this.trackY, width: width * fraction, height: 8 });
    }
    if (this.instance && !this.instance.disposed) {
      this.instance.presentFrame();
      const rectangle = gameRectangle({ x: 0, y: 0, width: this.target.width, height: this.target.height }, this.instance.viewport);
      for (const [canvas, layer] of this.layers) {
        if (canvas.width < 1 || canvas.height < 1) continue;
        if (layer.texture.width !== canvas.width || layer.texture.height !== canvas.height) {
          layer.texture.destroy(); layer.texture = this.engine.device.createTexture({ size: [canvas.width, canvas.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT }); layer.image.setSource(layer.texture);
        }
        this.engine.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: layer.texture, premultipliedAlpha: true }, [canvas.width, canvas.height]);
        this.content.place(layer.image, rectangle);
      }
    }
    this.world.update(time, delta * 1000);
  }
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', horizontal: number, vertical: number, pointerId: number): void {
    if (this.instance) {
      const viewport = this.instance.viewport;
      this.instance.pointer(type, (horizontal - viewport.x) / viewport.width, (vertical - viewport.y) / viewport.height, pointerId + 7100); return;
    }
    this.target.canvas.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', isPrimary: true, clientX: horizontal * this.target.width, clientY: vertical * this.target.height, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, bubbles: true, cancelable: true }));
  }
  hover(point: { x: number; y: number } | null, pointerId = 1): void {
    if (this.instance) return;
    this.target.canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId, pointerType: 'mouse', isPrimary: true, clientX: point ? point.x * this.target.width : -1, clientY: point ? point.y * this.target.height : -1, buttons: 0, bubbles: true }));
  }
  get gameTexture(): GPUTexture | null { return this.instance?.canvas ? this.layers.get(this.instance.canvas)?.texture ?? null : null; }
  get auxiliaryTextures(): GPUTexture[] { return [...this.layers].filter(([canvas]) => canvas !== this.instance?.canvas).map(([, layer]) => layer.texture); }
  snapshot() { return { status: this.status, loading: this.progress, title: this.title, layers: Math.max(0, this.layers.size - 1), texture: { width: this.target.width, height: this.target.height }, volume: { ...this.options.volume.snapshot(), rect: volumeRectangle(this.target.width, this.target.height) }, wallpaper: { kind: 'liquid-prism', time: this.wallpaper.time, motion: this.wallpaper.motion }, home: this.status === 'home' ? this.home.snapshot() : null, nodes: [...(this.status === 'home' ? this.home.snapshot().nodes : this.status === 'playing' ? [] : this.loading.snapshot()), ...(this.options.volume.snapshot().visible ? this.volume.snapshot() : [])], gameViewport: this.instance?.viewport ?? { x: 0, y: 0, width: 1, height: 1 } }; }
  destroy(): void { this.releaseGame(); this.home.destroy(); this.home.root.destroy(); this.loading.destroy(); this.loading.root.destroy(); this.navigation.destroy(); this.navigation.root.destroy(); this.volume.destroy(); this.volume.root.destroy(); this.content.destroy(); this.world.destroy(); this.target.destroy(); }
}
