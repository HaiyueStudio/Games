import { IndexedSpriteRenderer, type IndexedSpriteDrawCommand, type IndexedSpriteRendererStats } from '@haiyue/extensions/experimental/indexed-sprite';
import type { MugenAirSnapshot } from '../import/air/MugenAirRuntime';
import type { MugenCharacterModel, MugenRenderAssetModel, MugenViewerPalette, MugenViewerSprite } from './MugenCharacterModel';

export type MugenViewerBackground = 'checker' | 'dark' | 'light';

export interface MugenViewerDebugSettings {
  readonly origin: boolean;
  readonly axis: boolean;
  readonly spriteBounds: boolean;
  readonly clsn1: boolean;
  readonly clsn2: boolean;
}

export interface MugenViewerFrameSettings {
  readonly background: MugenViewerBackground;
  readonly backgroundColor?: readonly [number, number, number, number];
  readonly paletteId: string | null;
  readonly originX: number;
  readonly originY: number;
  readonly debug: MugenViewerDebugSettings;
}

export interface MugenViewerViewport {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

export interface MugenViewerActorFrame {
  readonly snapshot: MugenAirSnapshot;
  readonly paletteId: string | null;
  readonly transparency?: Readonly<{ mode: 'default' | 'none' | 'add' | 'addalpha' | 'add1' | 'sub'; alpha: readonly [number, number] }> | null;
  readonly colorMatrix?: readonly [number, number, number, number, number, number, number, number, number, number, number, number] | null;
}

export class MugenWebGpuView {
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  readonly stage: HTMLElement;
  #adapter: GPUAdapter | null = null;
  #device: GPUDevice | null = null;
  #context: GPUCanvasContext | null = null;
  #format: GPUTextureFormat = 'bgra8unorm';
  #renderer: IndexedSpriteRenderer | null = null;
  #model: MugenCharacterModel | null = null;
  #spriteById = new Map<string, MugenViewerSprite>();
  #paletteById = new Map<string, MugenViewerPalette>();
  #installGeneration = 0;
  #deviceGeneration = 0;
  #disposed = false;
  #onError: (error: unknown) => void;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, stage: HTMLElement, onError: (error: unknown) => void) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.stage = stage;
    this.#onError = onError;
  }

  get model(): MugenCharacterModel | null { return this.#model; }
  get deviceGeneration(): number { return this.#deviceGeneration; }
  get adapterDescription(): string {
    const info = this.#adapter?.info;
    if (!info) return 'WebGPU adapter details unavailable';
    return [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' · ') || 'WebGPU adapter';
  }

  async init(): Promise<void> {
    if (!navigator.gpu) throw new Error('当前浏览器没有启用 WebGPU。请使用最新版 Chrome 或 Edge。');
    this.#adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!this.#adapter) throw new Error('未找到可用的 WebGPU 适配器。');
    this.#device = await this.#adapter.requestDevice();
    this.#format = navigator.gpu.getPreferredCanvasFormat();
    const context = this.canvas.getContext('webgpu');
    if (!context) throw new Error('无法创建 WebGPU Canvas context。');
    this.#context = context;
    this.#configureContext();
    this.#watchDevice(this.#device, ++this.#deviceGeneration);
  }

  async install(model: MugenCharacterModel, signal?: AbortSignal): Promise<IndexedSpriteRendererStats> {
    return this.installModels([model], signal);
  }

  async installModels(models: readonly MugenRenderAssetModel[], signal?: AbortSignal): Promise<IndexedSpriteRendererStats> {
    this.#assertAlive();
    if (!this.#device) throw new Error('MUGEN WebGPU view is not initialized.');
    if (models.length < 1 || models.length > 4) throw new RangeError('MUGEN WebGPU view requires from one to four character models.');
    const generation = ++this.#installGeneration;
    const next = new IndexedSpriteRenderer(this.#device, models.flatMap(model => model.rendererSprites), models.flatMap(model => model.rendererPalettes), {
      targetFormat: this.#format,
      sampleCount: 1,
      label: `MugenViewer.${generation}`,
    });
    try {
      signal?.throwIfAborted();
      while (!next.ready) {
        next.upload(Math.min(4 * 1024 * 1024, next.limits.maxUploadBytesPerFrame));
        if (!next.ready) await nextAnimationFrame();
        signal?.throwIfAborted();
        if (generation !== this.#installGeneration || this.#disposed) throw new DOMException('Superseded MUGEN renderer install.', 'AbortError');
      }
      const previous = this.#renderer;
      this.#renderer = next;
      this.#model = 'metadata' in models[0]! ? models[0] as MugenCharacterModel : null;
      this.#spriteById = new Map(models.flatMap(model => [...model.spriteById.entries()]));
      this.#paletteById = new Map(models.flatMap(model => [...model.paletteById.entries()]));
      previous?.dispose();
      return next.stats();
    } catch (error) {
      next.dispose();
      throw error;
    }
  }

  resize(): MugenViewerViewport {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.stage.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.stage.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
      this.overlay.width = width; this.overlay.height = height;
    }
    return Object.freeze({ width, height, devicePixelRatio: ratio });
  }

  render(snapshot: MugenAirSnapshot, settings: MugenViewerFrameSettings): IndexedSpriteRendererStats | null {
    return this.renderActors([Object.freeze({ snapshot, paletteId: settings.paletteId })], settings);
  }

  renderActors(actors: readonly MugenViewerActorFrame[], settings: MugenViewerFrameSettings): IndexedSpriteRendererStats | null {
    if (this.#disposed || !this.#device || !this.#context || !this.#renderer || this.#spriteById.size === 0 || !this.#renderer.ready) return null;
    const viewport = this.resize();
    const actorCommands = actors.map(actor => Object.freeze({ actor, command: this.#drawCommand(actor.snapshot, actor.paletteId, actor.transparency, actor.colorMatrix) }));
    const commands = actorCommands.flatMap(value => value.command === null ? [] : [value.command]);
    const encoder = this.#device.createCommandEncoder({ label: 'MugenViewer.frame' });
    const pass = encoder.beginRenderPass({
      label: 'MugenViewer.pass',
      colorAttachments: [{
        view: this.#context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: settings.backgroundColor ?? backgroundColor(settings.background),
      }],
    });
    const stats = this.#renderer.render(pass, commands, viewport.width, viewport.height);
    pass.end();
    this.#device.queue.submit([encoder.finish()]);
    this.#drawOverlay(actorCommands, settings, viewport.devicePixelRatio);
    this.stage.dataset.background = settings.background;
    return stats;
  }

  clearOverlay(): void { this.overlay.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height); }

  async forceDeviceLossForTesting(): Promise<number> {
    this.#assertAlive();
    if (!this.#device) throw new Error('MUGEN WebGPU view is not initialized.');
    const generation = this.#deviceGeneration;
    this.#device.destroy();
    while (!this.#disposed && this.#deviceGeneration === generation) await nextAnimationFrame();
    this.#assertAlive();
    return this.#deviceGeneration;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#installGeneration++;
    this.#renderer?.dispose();
    this.#renderer = null;
    this.#model = null;
    this.#spriteById.clear(); this.#paletteById.clear();
    this.#context?.unconfigure();
    this.#context = null;
    this.#device?.destroy();
    this.#device = null;
    this.#adapter = null;
    this.clearOverlay();
  }

  #drawCommand(snapshot: MugenAirSnapshot, selectedPaletteId: string | null, transparency?: MugenViewerActorFrame['transparency'], colorMatrix?: MugenViewerActorFrame['colorMatrix']): IndexedSpriteDrawCommand | null {
    if (snapshot.render.spriteId === null) return null;
    const sprite = this.#spriteById.get(snapshot.render.spriteId);
    if (!sprite) return null;
    const paletteId = sprite.format === 'indexed8' ? this.#paletteFor(sprite, selectedPaletteId) : undefined;
    if (sprite.format === 'indexed8' && paletteId === undefined) return null;
    const sourceAlpha = transparency === null || transparency === undefined || transparency.mode === 'default' ? snapshot.render.blend.sourceAlpha : transparency.alpha[0];
    const blend = transparency === null || transparency === undefined || transparency.mode === 'default' ? renderBlend(snapshot.render.blend.mode, snapshot.render.blend.destinationAlpha) : transparency.mode === 'none' ? 'opaque' : transparency.mode === 'add' || transparency.mode === 'addalpha' || transparency.mode === 'add1' ? 'additive' : 'alpha';
    return Object.freeze({
      spriteId: sprite.renderSpriteId,
      ...(paletteId === undefined ? {} : { paletteId }),
      x: snapshot.render.positionX,
      y: snapshot.render.positionY,
      axisX: sprite.axisX,
      axisY: sprite.axisY,
      scaleX: snapshot.render.scaleX,
      scaleY: snapshot.render.scaleY,
      rotationRadians: snapshot.render.rotationRadians,
      opacity: Math.max(0, Math.min(1, sourceAlpha / 256)),
      flipX: snapshot.render.flipX,
      flipY: snapshot.render.flipY,
      sampling: 'nearest',
      blend,
      ...(colorMatrix === null || colorMatrix === undefined ? {} : { colorMatrix }),
    });
  }

  #paletteFor(sprite: MugenViewerSprite, selectedPaletteId: string | null): string | undefined {
    const selected = selectedPaletteId === null ? undefined : this.#paletteById.get(selectedPaletteId);
    const fallback = sprite.defaultPaletteId === null ? undefined : this.#paletteById.get(sprite.defaultPaletteId);
    return (selected ?? fallback)?.renderPaletteId;
  }

  #drawOverlay(actors: readonly Readonly<{ actor: MugenViewerActorFrame; command: IndexedSpriteDrawCommand | null }>[], settings: MugenViewerFrameSettings, ratio: number): void {
    const context = this.overlay.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, this.overlay.width, this.overlay.height);
    context.lineWidth = Math.max(1, ratio);
    if (settings.debug.origin) drawCross(context, settings.originX, settings.originY, 10 * ratio, '#ffe16b');
    for (const { actor, command } of actors) {
      const snapshot = actor.snapshot;
      if (settings.debug.clsn1) for (const box of snapshot.clsn1) drawBox(context, box, '#ff496f', 'rgba(255,73,111,.13)');
      if (settings.debug.clsn2) for (const box of snapshot.clsn2) drawBox(context, box, '#48a7ff', 'rgba(72,167,255,.11)');
      if (settings.debug.spriteBounds && command && snapshot.render.spriteId) {
        const sprite = this.#spriteById.get(snapshot.render.spriteId);
        if (sprite) drawSpriteBounds(context, sprite, command);
      }
      if (settings.debug.axis) drawCross(context, snapshot.render.positionX, snapshot.render.positionY, 7 * ratio, '#78ffd2');
    }
  }

  #configureContext(): void {
    this.#context?.configure({ device: this.#device!, format: this.#format, alphaMode: 'premultiplied' });
  }

  #watchDevice(device: GPUDevice, generation: number): void {
    void device.lost.then(async info => {
      if (this.#disposed || generation !== this.#deviceGeneration) return;
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error(`WebGPU device lost (${info.reason}): no replacement adapter.`);
        const replacement = await adapter.requestDevice();
        if (this.#disposed || generation !== this.#deviceGeneration) { replacement.destroy(); return; }
        this.#adapter = adapter; this.#device = replacement;
        this.#configureContext();
        this.#renderer?.recover(replacement);
        while (this.#renderer && !this.#renderer.ready) { this.#renderer.upload(Math.min(4 * 1024 * 1024, this.#renderer.limits.maxUploadBytesPerFrame)); await nextAnimationFrame(); }
        this.#watchDevice(replacement, ++this.#deviceGeneration);
      } catch (error) { this.#onError(error); }
    });
  }

  #assertAlive(): void { if (this.#disposed) throw new Error('MUGEN WebGPU view is disposed.'); }
}

function renderBlend(mode: MugenAirSnapshot['render']['blend']['mode'], destinationAlpha: number): 'alpha' | 'additive' | 'opaque' {
  if (mode === 'opaque') return 'alpha';
  if (mode === 'add' && destinationAlpha > 0) return 'additive';
  return 'alpha';
}

function backgroundColor(value: MugenViewerBackground): GPUColor {
  if (value === 'dark') return { r: 0.025, g: 0.032, b: 0.05, a: 1 };
  if (value === 'light') return { r: 0.68, g: 0.7, b: 0.74, a: 1 };
  return { r: 0, g: 0, b: 0, a: 0 };
}

function drawBox(context: CanvasRenderingContext2D, box: MugenAirSnapshot['clsn1'][number], stroke: string, fill: string): void {
  context.fillStyle = fill; context.strokeStyle = stroke;
  context.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  context.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
}

function drawCross(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  context.strokeStyle = color; context.beginPath();
  context.moveTo(x - radius, y); context.lineTo(x + radius, y);
  context.moveTo(x, y - radius); context.lineTo(x, y + radius);
  context.stroke();
}

function drawSpriteBounds(context: CanvasRenderingContext2D, sprite: MugenViewerSprite, command: IndexedSpriteDrawCommand): void {
  const corners = [[0, 0], [sprite.width, 0], [sprite.width, sprite.height], [0, sprite.height]] as const;
  const cosine = Math.cos(command.rotationRadians ?? 0); const sine = Math.sin(command.rotationRadians ?? 0);
  const points = corners.map(([rawX, rawY]) => {
    let x = rawX - sprite.axisX; let y = rawY - sprite.axisY;
    if (command.flipX) x = -x; if (command.flipY) y = -y;
    x *= command.scaleX ?? 1; y *= command.scaleY ?? 1;
    return [command.x + cosine * x - sine * y, command.y + sine * x + cosine * y] as const;
  });
  context.strokeStyle = '#d790ff'; context.beginPath(); context.moveTo(points[0]![0], points[0]![1]);
  for (let index = 1; index < points.length; index++) context.lineTo(points[index]![0], points[index]![1]);
  context.closePath(); context.stroke();
}

function nextAnimationFrame(): Promise<void> { return new Promise(resolve => requestAnimationFrame(() => resolve())); }
