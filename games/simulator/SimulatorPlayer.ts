import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, Geometry3D, HaiyueEngine, Mesh3D, OrbitControl, SphericalTransform3D, World, createBox3D, createSphere3D } from '@haiyue/engine';
import { Ray } from '@haiyue/engine/math';
import { Render3DSystem } from '@haiyue/engine/systems';
import { GuiSystem, type GuiLabel } from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { mat4 } from 'wgpu-matrix';
import { Aurora } from '../launcher/Aurora';
import type { DesktopGame } from '../launcher/DesktopGui';
import type { DesktopRect } from '../launcher/layout';
import type { GameProgress, MountedGame } from '../host/types';
import { guardQueuedPointerCapture } from '../shared/input/pointerCapture';
import { DeviceGui, SIMULATOR_TEXT } from './DeviceGui';
import { DeviceScreen } from './DeviceScreen';
import { deviceDimensions, deviceGeometry, screenUv } from './deviceGeometry';
import { deviceViewport, type DeviceMode, type DeviceOrientation } from './layout';
import { quarterOrientation, screenPoint, ScreenOrientation } from './orientation';
import { ScreenSurface } from './ScreenSurface';

export interface SimulatorPlayerOptions {
  mode: DeviceMode; games: DesktopGame[]; instance?: MountedGame; title?: string;
  launch(id: string): void; home(): void; desktop(): void; device(mode: DeviceMode): void; retry(): void; external(): void;
}
export class SimulatorPlayer {
  readonly mode: DeviceMode;
  private readonly gui = new DeviceGui(false);
  private readonly world = new World('Device simulator 3D chassis');
  private readonly lifetime = new AbortController();
  private readonly canvas = document.createElement('canvas');
  private readonly engine: HaiyueEngine;
  private readonly dimensions;
  private readonly camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: .1, far: 100 });
  private readonly orbitTransform = new SphericalTransform3D({ radius: 11, theta: Math.PI, phi: Math.PI * .12, target: [0, 0, 0] });
  private readonly cameraEntity = new Entity('Device camera').addComponent(this.camera).addComponent(this.orbitTransform);
  private readonly ray = new Ray();
  private readonly screenGeometry: Geometry3D;
  private readonly screenTransform: CartesianTransform3D;
  private readonly homeGeometry = createSphere3D({ radius: .16, widthSegments: 32, heightSegments: 12 });
  private readonly homeTransform: CartesianTransform3D;
  private readonly screenMaterial = new BasicMaterial({ cullMode: 'none', sampler: { magFilter: 'linear', minFilter: 'linear' } });
  private readonly rotation = new ScreenOrientation();
  private surface!: ScreenSurface;
  private deviceOrientation: DeviceOrientation = 'portrait';
  private screen!: DeviceScreen;
  private orbit!: OrbitControl;
  private aurora!: Aurora;
  private resize!: ResizeObserver;
  private restoreCapture: () => void = () => {};
  private instance: MountedGame | null = null;
  private disposed = false;
  private last = 0;
  private frames = 0;
  private fitted = false;
  private fitRadius = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly keys = new Set<string>();
  constructor(private readonly options: SimulatorPlayerOptions) {
    this.mode = options.mode; this.dimensions = deviceDimensions(options.mode);
    this.canvas.id = 'device-simulator'; this.canvas.tabIndex = 0;
    this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:3;touch-action:none;outline:none;'; document.body.append(this.canvas);
    this.engine = new HaiyueEngine({ canvas: this.canvas, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 1.5), clearColor: { r: .015, g: .025, b: .06, a: 1 } });
    this.screenGeometry = new Geometry3D(deviceGeometry(this.dimensions.screenWidth, this.dimensions.screenHeight, .16, 0, true));
    this.screenTransform = new CartesianTransform3D({ position: [0, this.dimensions.screenY, 0] });
    this.homeTransform = new CartesianTransform3D({ position: [0, .154, this.dimensions.homeZ], scale: [1, .16, 1] });
  }
  async init(): Promise<this> {
    await this.engine.init(); if (this.disposed) return this;
    this.screen = new DeviceScreen(this.engine, this.options);
    await this.screen.init(); if (this.disposed) return this;
    const size = deviceViewport(this.mode); this.surface = new ScreenSurface(this.engine, size.width, size.height); await this.surface.init(); if (this.disposed) return this;
    this.aurora = new Aurora(this.engine); await this.aurora.init(); if (this.disposed) return this;
    this.world.addEntity(this.cameraEntity); this.world.addEntity(new Entity('Device toolbar').addComponent(this.gui.root));
    this.buildDevice(); this.setupToolbar(); this.setupInput();
    this.orbit = new OrbitControl(this.canvas, this.orbitTransform, { minRadius: 5, maxRadius: 28, minPhi: .06, maxPhi: Math.PI * .48, rotateSpeed: .65, zoomSpeed: .45, enablePan: false });
    this.world.addSystem(this.aurora);
    const render = new Render3DSystem(this.engine, this.cameraEntity, { loadOp: 'load', msaaSamples: 4, toneMapping: 'none' }); this.world.addSystem(render);
    const chars = [...new Set(SIMULATOR_TEXT + '拖拽屏幕操作外转向滚轮缩放相机复位主页返回加载失败重试取消设备键盘鼠标横屏竖屏自动旋转·↗' + Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join(''))].join('');
    this.world.addSystem(new GuiSystem(this.engine, { font: { chars, fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 30, atlasSize: 2048 } }));
    const integration = new RenderIntegration(this.engine, { label: 'Device chassis and live screen' }); this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, system => system === this.aurora ? { pass: 'isolated', loadOp: 'clear', depth: false, sort: 0 } : system === render ? { pass: 'isolated', loadOp: 'load', depth: true, sort: 10 } : { pass: 'isolated', loadOp: 'load', depth: true, sort: 20 });
    this.restoreCapture = guardQueuedPointerCapture(this.canvas);
    this.resize = new ResizeObserver(() => this.layout()); this.resize.observe(this.canvas); this.layout();
    this.engine.on('update', ({ detail }) => this.tick(detail.time));
    window.addEventListener('blur', () => this.releaseInput(), { signal: this.lifetime.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.releaseInput(); this.engine.stop(); } else { this.last = 0; this.engine.run(); } }, { signal: this.lifetime.signal });
    this.engine.run(); this.canvas.focus({ preventScroll: true });
    if (this.options.instance) this.setGame(this.options.instance);
    return this;
  }
  private mesh(name: string, geometry: Geometry3D, material: BasicMaterial, transform = new CartesianTransform3D()): void {
    this.world.addEntity(new Entity(name).addComponent(transform).addComponent(new Mesh3D(geometry, material)));
  }
  private buildDevice(): void {
    const size = this.dimensions;
    this.mesh('Metal device body', new Geometry3D(deviceGeometry(size.width, size.height, size.radius, size.thickness)), new BasicMaterial({ color: [.26, .3, .39, 1] }));
    this.mesh('Polished front bezel', new Geometry3D(deviceGeometry(size.width - .08, size.height - .08, size.radius - .02)), new BasicMaterial({ color: [.06, .075, .11, 1] }), new CartesianTransform3D({ position: [0, .126, 0] }));
    this.screenMaterial.texture = this.surface.texture;
    this.mesh('Live device screen', this.screenGeometry, this.screenMaterial, this.screenTransform);
    this.mesh('Physical Home key', this.homeGeometry, new BasicMaterial({ color: [.36, .42, .54, 1] }), this.homeTransform);
    this.mesh('Home key inset', createSphere3D({ radius: .12, widthSegments: 32, heightSegments: 8 }), new BasicMaterial({ color: [.07, .09, .14, 1] }), new CartesianTransform3D({ position: [0, .181, size.homeZ], scale: [1, .04, 1] }));
    this.mesh('Front camera', createSphere3D({ radius: .05, widthSegments: 20, heightSegments: 8 }), new BasicMaterial({ color: [.15, .22, .38, 1] }), new CartesianTransform3D({ position: [0, .15, size.height / 2 - .22], scale: [1, .16, 1] }));
    this.mesh('Power key', createBox3D({ width: .06, height: .1, depth: .5 }), new BasicMaterial({ color: [.48, .52, .6, 1] }), new CartesianTransform3D({ position: [size.width / 2 + .015, 0, size.height * .25] }));
    for (const vertical of [.08, .18]) this.mesh('Volume key', createBox3D({ width: .06, height: .1, depth: .36 }), new BasicMaterial({ color: [.48, .52, .6, 1] }), new CartesianTransform3D({ position: [-size.width / 2 - .015, 0, size.height * vertical] }));
  }
  private setupToolbar(): void {
    this.gui.label('device-brand', 'HAIYUE / DEVICE OS', 20, '#dbffb0');
    this.gui.label('device-hint', '屏外拖拽相机 · 自动横竖屏 · 滚轮缩放 · Home 返回', 13, '#bad6f1');
    this.gui.button('sim-desktop', '游戏库', this.options.desktop, '#245d93');
    this.gui.button('sim-pad', '平板', () => this.options.device('pad')); this.gui.button('sim-phone', '手机', () => this.options.device('phone'));
    this.gui.button('sim-reset', '相机复位', () => this.resetCamera(), '#245d93'); this.gui.button('sim-external', '↗', this.options.external, '#245d93');
  }
  private layout(): void {
    if (this.disposed || !this.screen) return; this.engine.resizeToDisplaySize();
    const width = this.engine.displayWidth, height = this.engine.displayHeight;
    this.camera.updateAspect(this.engine.width / this.engine.height);
    if (!this.fitted) this.resetCamera();
    else { const radius = this.fittedRadius(); this.orbitTransform.radius *= radius / this.fitRadius; this.fitRadius = radius; }
    this.gui.place('device-brand', { x: 20, y: 17, width: Math.max(90, width - 440), height: 34 });
    (this.gui.nodes.get('device-brand') as GuiLabel).setText(width < 900 ? 'DEVICE OS' : 'HAIYUE / DEVICE OS');
    this.gui.place('device-hint', { x: 20, y: height - 35, width: width - 40, height: 28 });
    const compact = width < 650, button = compact ? 47 : 72, start = Math.max(12, width - (button + 6) * 4 - 46), top = compact ? 58 : 18;
    for (const [index, id] of ['sim-desktop', 'sim-pad', 'sim-phone', 'sim-reset'].entries()) this.gui.place(id, { x: start + index * (button + 6), y: top, width: button, height: 32 });
    this.gui.place('sim-external', { x: width - 42, y: top, width: 30, height: 32 });
  }
  resetCamera(): void {
    this.orbitTransform.theta = Math.PI; this.orbitTransform.phi = Math.PI * .12;
    this.fitRadius = this.fittedRadius(); this.orbitTransform.radius = this.fitRadius; this.fitted = true;
  }
  private fittedRadius(): number {
    const aspect = Math.max(.25, this.engine.width / this.engine.height), size = this.dimensions, heading = this.orbitTransform.theta - Math.PI;
    const cosine = Math.abs(Math.cos(heading)), sine = Math.abs(Math.sin(heading));
    return Math.max(sine * size.width + cosine * size.height, (cosine * size.width + sine * size.height) / aspect) / (2 * Math.tan(Math.PI / 8)) * 1.2;
  }
  private matrix(): Float32Array {
    this.camera.updateAspect(this.engine.width / this.engine.height); this.orbitTransform.updateWorldMatrix();
    return mat4.multiply(this.camera.projectionMatrix, mat4.inverse(this.orbitTransform.worldMatrix)) as Float32Array;
  }
  project(horizontal: number, vertical: number): { x: number; y: number } {
    const size = this.dimensions, point = screenPoint(horizontal, vertical, this.rotation.angle, deviceViewport(this.mode), this.size, true);
    return this.projectPoint((.5 - point.x) * size.screenWidth, size.screenY, (.5 - point.y) * size.screenHeight);
  }
  private projectPoint(horizontal: number, altitude: number, vertical: number): { x: number; y: number } {
    const matrix = this.matrix(), point = [horizontal, altitude, vertical];
    const clipX = matrix[0]! * point[0]! + matrix[4]! * point[1]! + matrix[8]! * point[2]! + matrix[12]!;
    const clipY = matrix[1]! * point[0]! + matrix[5]! * point[1]! + matrix[9]! * point[2]! + matrix[13]!;
    const clipW = matrix[3]! * point[0]! + matrix[7]! * point[1]! + matrix[11]! * point[2]! + matrix[15]!;
    return { x: (clipX / clipW + 1) * this.engine.displayWidth / 2, y: (1 - clipY / clipW) * this.engine.displayHeight / 2 };
  }
  projectGame(horizontal: number, vertical: number): { x: number; y: number } {
    const viewport = this.instance?.viewport ?? { x: 0, y: 0, width: 1, height: 1 };
    return this.project(viewport.x + horizontal * viewport.width, viewport.y + vertical * viewport.height);
  }
  private projectRect(rectangle: DesktopRect): DesktopRect {
    const width = this.screen.target.width, height = this.screen.target.height;
    const points = [this.project(rectangle.x / width, rectangle.y / height), this.project((rectangle.x + rectangle.width) / width, rectangle.y / height), this.project(rectangle.x / width, (rectangle.y + rectangle.height) / height), this.project((rectangle.x + rectangle.width) / width, (rectangle.y + rectangle.height) / height)];
    const horizontal = points.map(point => point.x), vertical = points.map(point => point.y);
    return { x: Math.min(...horizontal), y: Math.min(...vertical), width: Math.max(...horizontal) - Math.min(...horizontal), height: Math.max(...vertical) - Math.min(...vertical) };
  }
  private setRay(event: MouseEvent): void {
    const rectangle = this.canvas.getBoundingClientRect(), matrix = this.matrix(), world = this.orbitTransform.worldMatrix;
    this.ray.setFromCamera((event.clientX - rectangle.x) / rectangle.width * 2 - 1, 1 - (event.clientY - rectangle.y) / rectangle.height * 2, new Float32Array([world[12]!, world[13]!, world[14]!]), mat4.inverse(matrix) as Float32Array);
  }
  private screenHit(event: MouseEvent, captured = false): { x: number; y: number } | null {
    this.setRay(event); this.screenTransform.updateWorldMatrix();
    const size = this.dimensions;
    const hit = this.ray.intersectMesh(this.screenGeometry, this.screenTransform.worldMatrix, { useBVH: false });
    if (hit) { const point = screenUv(hit.point[0]!, hit.point[2]!, size.screenWidth, size.screenHeight); return screenPoint(point.x, point.y, this.rotation.angle, deviceViewport(this.mode), this.size); }
    if (!captured || Math.abs(this.ray.direction[1]!) < .0001) return null;
    const distance = (this.dimensions.screenY - this.ray.origin[1]!) / this.ray.direction[1]!;
    const point = screenUv(this.ray.origin[0]! + this.ray.direction[0]! * distance, this.ray.origin[2]! + this.ray.direction[2]! * distance, size.screenWidth, size.screenHeight);
    return screenPoint(point.x, point.y, this.rotation.angle, deviceViewport(this.mode), this.size);
  }
  private setupInput(): void {
    const settings = { capture: true, signal: this.lifetime.signal };
    this.canvas.addEventListener('pointerdown', event => {
      if (this.gui.snapshot().some(node => node.id.startsWith('sim-') && event.clientX >= node.rect.x && event.clientX < node.rect.x + node.rect.width && event.clientY >= node.rect.y && event.clientY < node.rect.y + node.rect.height)) return;
      if (event.button !== 0 || event.altKey) return;
      this.setRay(event); this.homeTransform.updateWorldMatrix();
      if (this.ray.intersectMesh(this.homeGeometry, this.homeTransform.worldMatrix, { useBVH: false })) { event.preventDefault(); event.stopImmediatePropagation(); queueMicrotask(this.options.home); return; }
      const point = this.screenHit(event); if (!point) return;
      if (this.rotation.rotating) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      this.pointers.set(event.pointerId, point); this.canvas.setPointerCapture(event.pointerId); this.screen.pointer('pointerdown', point.x, point.y, event.pointerId);
      event.preventDefault(); event.stopImmediatePropagation();
    }, settings);
    for (const type of ['pointermove', 'pointerup', 'pointercancel'] as const) this.canvas.addEventListener(type, event => {
      const last = this.pointers.get(event.pointerId); if (!last) return;
      const point = this.screenHit(event, true) ?? last; this.pointers.set(event.pointerId, point); this.screen.pointer(type, point.x, point.y, event.pointerId);
      if (type !== 'pointermove') { this.pointers.delete(event.pointerId); if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); }
      event.preventDefault(); event.stopImmediatePropagation();
    }, settings);
    this.canvas.addEventListener('wheel', event => {
      const point = this.screenHit(event);
      if (!point || !this.instance || event.ctrlKey || event.altKey) return;
      const viewport = this.instance.viewport; this.instance.wheel((point.x - viewport.x) / viewport.width, (point.y - viewport.y) / viewport.height, event.deltaX, event.deltaY);
      event.preventDefault(); event.stopImmediatePropagation();
    }, { ...settings, passive: false });
    for (const type of ['keydown', 'keyup'] as const) window.addEventListener(type, event => {
      if (!this.instance || event.target !== this.canvas || event.code === 'Escape' || event.altKey || event.ctrlKey || event.metaKey) return;
      const down = type === 'keydown'; if (down) this.keys.add(event.code); else this.keys.delete(event.code);
      event.preventDefault(); event.stopImmediatePropagation(); this.instance.key(event.code, down);
    }, settings);
  }
  private tick(time: number): void {
    if (this.disposed) return; const delta = this.last ? Math.min(.1, Math.max(0, (time - this.last) / 1000)) : 0; this.last = time;
    const radius = this.fittedRadius(); this.orbitTransform.radius *= radius / this.fitRadius; this.fitRadius = radius;
    const origin = this.projectPoint(0, this.dimensions.screenY, 0), top = this.projectPoint(0, this.dimensions.screenY, this.dimensions.screenHeight / 2), heading = Math.atan2(top.x - origin.x, origin.y - top.y);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.rotation.update(heading, delta, reduced)) {
      this.releaseInput(); this.deviceOrientation = quarterOrientation(this.rotation.quarter); const size = this.size; this.screen.resize(size.width, size.height);
    }
    this.screen.update(time, delta); this.surface.draw(this.screen.target.colorTexture, this.rotation.angle);
    this.aurora.motion = !reduced; this.aurora.time += delta; this.world.update(time, delta * 1000); this.frames++;
  }
  showHome(): void { this.releaseInput(); this.instance = null; this.screen.showHome(); this.canvas.focus({ preventScroll: true }); }
  showLoading(progress: GameProgress, title: string): void { this.releaseInput(); this.instance = null; this.screen.showLoading(progress, title); }
  setGame(instance: MountedGame): void { this.releaseInput(); this.instance = instance; this.screen.setGame(instance); this.canvas.focus({ preventScroll: true }); }
  get orientation(): DeviceOrientation { return this.deviceOrientation; }
  get size() { return deviceViewport(this.mode, this.deviceOrientation); }
  setCamera(view: { theta: number; phi?: number; radius?: number }): void {
    if (this.disposed) return;
    if (![view.theta, view.phi ?? this.orbitTransform.phi, view.radius ?? this.orbitTransform.radius].every(Number.isFinite)) throw new RangeError('Camera values must be finite.');
    this.orbitTransform.set(view.radius ?? this.orbitTransform.radius, view.theta, Math.max(.06, Math.min(Math.PI * .48, view.phi ?? this.orbitTransform.phi)));
  }
  move(horizontal: number, vertical: number): void { this.screen.home.move(horizontal, vertical); }
  launch(): void { this.screen.home.launch(); }
  private releaseInput(): void {
    for (const [pointer, point] of this.pointers) { this.screen?.pointer('pointercancel', point.x, point.y, pointer); if (this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer); }
    for (const key of this.keys) this.instance?.key(key, false); this.pointers.clear(); this.keys.clear();
  }
  snapshot() {
    const content = this.screen.snapshot(), screen = this.projectRect({ x: 0, y: 0, width: this.screen.target.width, height: this.screen.target.height });
    const nodes = [...this.gui.snapshot(), ...content.nodes.map(node => ({ ...node, rect: this.projectRect(node.rect) }))];
    const size = this.dimensions, home = this.projectPoint(0, .154, size.homeZ), radius = Math.max(8, Math.min(screen.width, screen.height) * .16 / size.screenWidth);
    nodes.push({ id: 'sim-home', type: 'Mesh3D', text: 'Home', rect: { x: home.x - radius, y: home.y - radius, width: radius * 2, height: radius * 2 } });
    return { mode: this.mode, orientation: this.deviceOrientation, frames: this.frames, mesh: true, camera: { theta: this.orbitTransform.theta, phi: this.orbitTransform.phi, radius: this.orbitTransform.radius, rotateSpeed: this.orbit?.rotateSpeed ?? .65 }, rotation: { angle: this.rotation.angle, target: this.rotation.quarter * Math.PI / 2, quarter: this.rotation.quarter, active: this.rotation.rotating }, wallpaper: content.wallpaper, screen, game: this.projectRect(gameRectangleForViewport(content.gameViewport, this.screen.target.width, this.screen.target.height)), corners: [this.project(0, 0), this.project(1, 0), this.project(1, 1), this.project(0, 1)], layers: content.layers, texture: content.texture, loading: content.loading, status: content.status,
      simulatorHome: content.home ? { ...content.home.simulatorHome, screen } : null, nodes };
  }
  async pixels() {
    const result = await this.texturePixels(this.surface.texture), game = this.screen.gameTexture;
    const layers = await Promise.all(this.screen.auxiliaryTextures.map(texture => this.texturePixels(texture)));
    return { ...this.size, colors: result.colors, hash: result.hash, gameColors: game ? (await this.texturePixels(game)).colors : 0, layerColors: layers.map(layer => layer.colors) };
  }
  private async texturePixels(texture: GPUTexture) {
    const stride = Math.ceil(texture.width * 4 / 256) * 256;
    const buffer = this.engine.device.createBuffer({ size: stride * texture.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const encoder = this.engine.device.createCommandEncoder(); encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: stride }, [texture.width, texture.height]); this.engine.device.queue.submit([encoder.finish()]); await buffer.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(buffer.getMappedRange()), colors = new Set<string>(); let hash = 2166136261;
      for (let row = 0; row < texture.height; row += 7) for (let column = 0; column < texture.width; column += 7) { const offset = row * stride + column * 4; colors.add(`${bytes[offset]},${bytes[offset + 1]},${bytes[offset + 2]}`); for (let channel = 0; channel < 3; channel++) hash = Math.imul(hash ^ bytes[offset + channel]!, 16777619); }
      buffer.unmap(); return { colors: colors.size, hash: hash >>> 0 };
    } finally { buffer.destroy(); }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.releaseInput(); this.lifetime.abort(); this.resize?.disconnect(); this.engine.stop(); this.orbit?.dispose(); this.restoreCapture(); this.screen?.destroy(); this.surface?.destroy(); this.gui.destroy(); this.world.destroy(); this.engine.destroy(); this.canvas.remove();
  }
}

function gameRectangleForViewport(viewport: DesktopRect, width: number, height: number): DesktopRect {
  return { x: viewport.x * width, y: viewport.y * height, width: viewport.width * width, height: viewport.height * height };
}
