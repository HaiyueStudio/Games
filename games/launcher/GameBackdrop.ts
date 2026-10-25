import type { HaiyueEngine } from '@haiyue/engine';
import { System, type World } from '@haiyue/engine/ecs';
import { GuiDirtyFlags, type GuiImage } from '@haiyue/engine/gui';
import type { RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { PipelineWarmupPlan } from '@haiyue/engine/experimental/renderer';
import { CustomPass, GaussianBlurPass } from '@haiyue/engine/postprocess';
import { backdropDownsampleShader, backdropGlassShader, backdropImageShader, backdropTransitionShader } from './backdropShaders';
import type { DesktopRect } from './layout';

const FADE_SECONDS = .85;
type Picture = { url: string; image: HTMLImageElement; texture?: GPUTexture };

/** Wallpaper artwork rendered through Engine CustomPass, beneath the native GUI. */
export class GameBackdrop extends System {
  private current: Picture | null = null;
  private incoming: Picture | null = null;
  private desired: { url: string; image: HTMLImageElement | null } | null = null;
  private elapsed = 0;
  private width = 1;
  private height = 1;
  private engine: HaiyueEngine | null = null;
  private uniform: GPUBuffer | null = null;
  private output: GPUTexture | null = null;
  private outputView: GPUTextureView | null = null;
  private toView: GPUTextureView | null = null;
  private transitionPass: CustomPass | null = null;
  private imagePass: CustomPass | null = null;
  private downsamplePass: CustomPass | null = null;
  private glassPass: CustomPass | null = null;
  private blurPass: GaussianBlurPass | null = null;
  private glassUniform: GPUBuffer | null = null;
  private shadeTexture: GPUTexture | null = null;
  private small: GPUTexture | null = null;
  private smallView: GPUTextureView | null = null;
  private blurred: GPUTexture | null = null;
  private blurredView: GPUTextureView | null = null;
  private glass: GPUTexture | null = null;
  private glassView: GPUTextureView | null = null;
  private header = 78;
  private bottomStart = 450;
  private blurBuilds = 0;
  private repaint = false;
  private disposed = false;
  private readonly values = new Float32Array(12);
  private readonly textures = new Set<GPUTexture>();
  private draws = 0;
  private uploads = 0;
  constructor(private readonly base: GuiImage, private readonly overlay: GuiImage, private readonly shade: HTMLCanvasElement) {
    super(() => false); this.name = 'Game OS wallpaper transition';
    base.setVisible(false); overlay.setVisible(false);
  }
  async initialize(engine: HaiyueEngine): Promise<void> {
    if (this.disposed) return;
    this.engine = engine; const device = engine.device;
    this.uniform = device.createBuffer({ label: 'Game OS wallpaper transition parameters', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.glassUniform = device.createBuffer({ label: 'Game OS wallpaper glass regions', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.shadeTexture = this.texture('Game OS wallpaper readability shade', this.shade.width, this.shade.height, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING);
    device.queue.copyExternalImageToTexture({ source: this.shade }, { texture: this.shadeTexture }, [this.shade.width, this.shade.height]);
    this.transitionPass = new CustomPass({ label: 'Game OS wallpaper horizontal zoom', fragmentCode: backdropTransitionShader,
      extraBindings: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }],
      extraEntries: () => [{ binding: 0, resource: { buffer: this.uniform! } },
        { binding: 1, resource: this.toView! }] });
    this.imagePass = new CustomPass({ label: 'Game OS wallpaper image crop', fragmentCode: backdropImageShader,
      extraBindings: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }], extraEntries: [{ binding: 0, resource: { buffer: this.uniform } }] });
    this.downsamplePass = new CustomPass({ label: 'Game OS wallpaper glass downsample', fragmentCode: backdropDownsampleShader });
    this.blurPass = new GaussianBlurPass({ radius: 6, sigma: 3.2 }); this.blurPass.prepare(device, 'rgba8unorm', 1, 1);
    const shadeView = this.shadeTexture.createView();
    this.glassPass = new CustomPass({ label: 'Game OS wallpaper frosted glass', fragmentCode: backdropGlassShader,
      extraBindings: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }],
      extraEntries: () => [{ binding: 0, resource: { buffer: this.glassUniform! } }, { binding: 1, resource: this.blurredView! }, { binding: 2, resource: shadeView }] });
    const warmup = new PipelineWarmupPlan('Game OS wallpaper transition');
    for (const pass of [this.transitionPass, this.imagePass, this.downsamplePass, this.glassPass]) { pass.prepare(device, 'rgba8unorm'); pass.contributePipelineWarmup(warmup, device); }
    this.blurPass.contributePipelineWarmup(warmup, device);
    try { await warmup.run(); } catch (error) { this.destroy(); throw error; }
  }
  request(url: string, image: HTMLImageElement | null): void {
    this.desired = { url, image: image?.complete && image.naturalWidth ? image : null };
  }
  ready(url: string, image: HTMLImageElement): void {
    if (this.desired?.url === url) this.desired.image = image;
  }
  private start(motion: boolean): void {
    const desired = this.desired;
    if (this.incoming || !desired?.image || desired.url === this.current?.url) return;
    const picture: Picture = { url: desired.url, image: desired.image };
    if (!this.current || !motion) {
      if (this.current?.texture) this.retire(this.current.texture);
      this.current = picture; this.base.setVisible(true); this.base.markDirty(GuiDirtyFlags.Visual); this.repaint = true;
      return;
    }
    this.current.texture ??= this.upload(this.current.image);
    picture.texture = this.upload(picture.image); this.toView = picture.texture.createView();
    this.incoming = picture; this.elapsed = 0;
    this.repaint = true;
  }
  advance(delta: number, motion: boolean): void {
    if (this.disposed) return;
    // Coalesce pointer events before starting a replacement; retain the latest requested image.
    this.start(motion);
    if (!this.incoming) return;
    this.elapsed = motion ? Math.min(FADE_SECONDS, this.elapsed + Math.max(0, delta)) : FADE_SECONDS;
    if (this.elapsed < FADE_SECONDS) {
      this.repaint = true; this.base.markDirty(GuiDirtyFlags.Visual); return;
    }
    const previous = this.current;
    this.current = this.incoming; this.incoming = null; this.repaint = true;
    this.base.markDirty(GuiDirtyFlags.Visual);
    this.overlay.setVisible(false); this.overlay.setSource(null); this.toView = null;
    if (previous?.texture) this.retire(previous.texture);
  }
  record(_world: World, context: RenderCommandContext): this {
    if (!this.repaint || !this.current || this.disposed || !this.base.parent?.visible) return this;
    const device = this.engine!.device;
    this.current.texture ??= this.upload(this.current.image); this.ensureOutput();
    this.values.set([...this.cover(this.current.image), ...this.cover((this.incoming ?? this.current).image), 0, 0, 0, this.elapsed / FADE_SECONDS]);
    device.queue.writeBuffer(this.uniform!, 0, this.values);
    if (this.incoming) { this.transitionPass!.apply(context.encoder, this.current.texture, this.outputView!, device); this.draws++; }
    else this.imagePass!.apply(context.encoder, this.current.texture, this.outputView!, device);
    this.downsamplePass!.apply(context.encoder, this.output!, this.smallView!, device);
    this.blurPass!.apply(context.encoder, this.small!, this.blurredView!, device);
    device.queue.writeBuffer(this.glassUniform!, 0, new Float32Array([this.width, this.height, this.header, this.bottomStart]));
    this.glassPass!.apply(context.encoder, this.output!, this.glassView!, device);
    this.blurBuilds++; this.repaint = false; return this;
  }
  resize(width: number, height: number, header: number, shelf: DesktopRect): void {
    const bottomStart = Math.max(header + 16, shelf.y - 72);
    const changed = this.width !== width || this.height !== height || this.header !== header || this.bottomStart !== bottomStart;
    this.width = width; this.height = height; this.header = header; this.bottomStart = bottomStart;
    if (this.current && changed) { this.repaint = true; this.base.markDirty(GuiDirtyFlags.Visual); }
  }
  private cover(image: HTMLImageElement): [number, number, number, number] {
    const aspect = this.width / this.height, ratio = image.naturalWidth / image.naturalHeight;
    const width = Math.min(1, aspect / ratio), height = Math.min(1, ratio / aspect);
    return [(1 - width) / 2, (1 - height) / 2, width, height];
  }
  get compositedTexture(): GPUTexture | null { return this.glass; }
  get retainedUrls(): string[] { return [...new Set([this.current?.url, this.incoming?.url, this.desired?.url].filter((url): url is string => !!url))]; }
  get requestedUrl(): string { return this.desired?.url ?? ''; }
  private ensureOutput(): void {
    const canvas = this.engine!.canvas!, scale = Math.min(1, 1920 / Math.max(canvas.width, canvas.height));
    const width = Math.max(1, Math.round(canvas.width * scale)), height = Math.max(1, Math.round(canvas.height * scale));
    if (!this.output || this.output.width !== width || this.output.height !== height) {
      const previous = this.output;
      this.output = this.texture('Game OS wallpaper transition output', width, height, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.outputView = this.output.createView();
      if (previous) this.retire(previous);
      for (const texture of [this.small, this.blurred, this.glass]) if (texture) this.retire(texture);
      const smallWidth = Math.max(1, Math.ceil(width / 4)), smallHeight = Math.max(1, Math.ceil(height / 4));
      this.small = this.texture('Game OS wallpaper glass small', smallWidth, smallHeight, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.smallView = this.small.createView();
      this.blurred = this.texture('Game OS wallpaper glass blurred', smallWidth, smallHeight, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.blurredView = this.blurred.createView();
      this.glass = this.texture('Game OS wallpaper glass composite', width, height, GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.glassView = this.glass.createView(); this.blurPass!.resize(this.engine!.device, 'rgba8unorm', smallWidth, smallHeight);
    }
    this.base.setSource(this.glass); this.base.setUv([0, 0, 1, 1]);
  }
  private texture(label: string, width: number, height: number, usage: GPUTextureUsageFlags): GPUTexture {
    const texture = this.engine!.device.createTexture({ label, size: [width, height], format: 'rgba8unorm', usage });
    this.textures.add(texture); return texture;
  }
  private upload(image: HTMLImageElement): GPUTexture {
    const texture = this.texture('Game OS wallpaper image', image.naturalWidth, image.naturalHeight, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT);
    this.engine!.device.queue.copyExternalImageToTexture({ source: image }, { texture }, [image.naturalWidth, image.naturalHeight]);
    this.uploads++; return texture;
  }
  private retire(texture: GPUTexture): void {
    const release = () => { texture.destroy(); this.textures.delete(texture); };
    void this.engine!.device.queue.onSubmittedWorkDone().then(release, release);
  }
  snapshot() {
    return { kind: 'game-image', effect: 'horizontal-zoom', current: this.current?.url ?? '', requested: this.desired?.url ?? '',
      incoming: this.incoming?.url ?? '', progress: this.incoming ? this.elapsed / FADE_SECONDS : 1,
      transitioning: !!this.incoming, waiting: !!this.desired && !this.desired.image, uv: this.current ? this.cover(this.current.image) : [0, 0, 1, 1],
      glass: { header: this.header, bottomStart: this.bottomStart, blur: 'gaussian', resolution: this.small ? [this.small.width, this.small.height] : null },
      gpu: { draws: this.draws, uploads: this.uploads, liveTextures: this.textures.size,
        blurBuilds: this.blurBuilds, output: this.output ? [this.output.width, this.output.height] : null } };
  }
  override destroy(): this {
    if (this.disposed) return this;
    this.disposed = true; this.overlay.setVisible(false); this.overlay.setSource(null); this.base.setSource(null);
    for (const texture of this.textures) this.retire(texture);
    for (const buffer of [this.uniform, this.glassUniform]) if (buffer) void this.engine!.device.queue.onSubmittedWorkDone().then(() => buffer.destroy(), () => buffer.destroy());
    this.transitionPass?.destroy(); this.imagePass?.destroy(); this.downsamplePass?.destroy(); this.glassPass?.destroy(); this.blurPass?.destroy(); return super.destroy();
  }
}
