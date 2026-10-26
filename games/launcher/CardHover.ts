import type { HaiyueEngine } from '@haiyue/engine';
import { System, type World } from '@haiyue/engine/ecs';
import type { RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { CustomPass } from '@haiyue/engine/postprocess';
import { PipelineWarmupPlan } from '@haiyue/engine/experimental/renderer';
import { cardHoverPose } from './cardHoverMotion';
import type { DesktopRect } from './layout';

export interface HoverCard { id: string; rect: DesktopRect; amount: number }

const MAX_CARDS = 8;
const shader = `
struct Card { bounds:vec4f, pose:vec4f }
struct Hover { size:vec2f, count:u32, fadeWidth:f32, shelf:vec4f, cards:array<Card,8>, overlays:array<vec4f,4> }
@group(1) @binding(0) var<uniform> hover:Hover;
@group(1) @binding(1) var wallpaper:texture_2d<f32>;
@fragment fn fs_main(input:VertexOutput)->@location(0) vec4f {
 let point=input.uv*hover.size;
 if(any(point<hover.shelf.xy)||any(point>=hover.shelf.xy+hover.shelf.zw)) {
  return textureSampleLevel(srcTex,srcSampler,input.uv,0);
 }
 var sample=point;
 var fade=1.0;
 var overlay=false;
 for(var index=0u;index<4u;index++) {
  let bounds=hover.overlays[index];
  if(all(bounds.zw>vec2f(0))&&all(point>=bounds.xy)&&all(point<bounds.xy+bounds.zw)) { overlay=true; }
 }
 if(!overlay&&all(point>=hover.shelf.xy)&&all(point<hover.shelf.xy+hover.shelf.zw)) {
  fade=smoothstep(0.0,hover.fadeWidth,point.x-hover.shelf.x)*smoothstep(0.0,hover.fadeWidth,hover.shelf.x+hover.shelf.z-point.x);
  for(var index=0u;index<hover.count;index++) {
   let card=hover.cards[index];let local=sample-card.bounds.xy;
   let outside=max(abs(local)-card.bounds.zw,vec2f(0));
   let weight=1.0-smoothstep(0.0,12.0,max(outside.x,outside.y));
   let shifted=local-vec2f(0,card.pose.w);
   let original=vec2f(card.pose.y*shifted.x+card.pose.z*shifted.y,-card.pose.z*shifted.x+card.pose.y*shifted.y)/card.pose.x+card.bounds.xy;
   sample=mix(sample,original,weight);
  }
  sample=clamp(sample,hover.shelf.xy+vec2f(.5),hover.shelf.xy+hover.shelf.zw-vec2f(.5));
 }
 let foreground=textureSampleLevel(srcTex,srcSampler,sample/hover.size,0);
 if(fade>=1.0) { return foreground; }
 return mix(textureSampleLevel(wallpaper,srcSampler,input.uv,0),foreground,fade);
}`;

export class CardHover extends System {
  private device!: GPUDevice;
  private uniform!: GPUBuffer;
  private pass!: CustomPass;
  private source: GPUTexture | null = null;
  private wallpaper: GPUTexture | null = null;
  private wallpaperView: GPUTextureView | null = null;
  private readonly values = new Float32Array(8 + MAX_CARDS * 8 + 16);
  constructor(private readonly engine: HaiyueEngine, private readonly cards: () => HoverCard[], private readonly shelf: () => DesktopRect,
    private readonly background: () => GPUTexture | null, private readonly enabled: () => boolean, private readonly overlays: () => DesktopRect[] = () => []) {
    super(() => false); this.name = 'Game OS card hover';
  }
  async init(): Promise<void> {
    const device = this.engine.device; this.device = device;
    this.uniform = device.createBuffer({ label: 'Game OS card hover uniforms', size: this.values.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pass = new CustomPass({ label: 'Game OS card hover', fragmentCode: shader,
      extraBindings: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }],
      extraEntries: () => [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: this.wallpaperView! }] });
    this.pass.prepare(device, this.engine.format);
    const warmup = new PipelineWarmupPlan('Game OS card hover'); this.pass.contributePipelineWarmup(warmup, device); await warmup.run();
  }
  record(_world: World, context: RenderCommandContext): this {
    const cards = this.cards().sort((first, second) => second.amount - first.amount).slice(0, MAX_CARDS);
    const wallpaper = this.background();
    if (!this.enabled() || !wallpaper) return this;
    if (this.wallpaper !== wallpaper) { this.wallpaper = wallpaper; this.wallpaperView = wallpaper.createView(); }
    const target = this.engine.context!.getCurrentTexture(), device = this.device;
    if (!this.source || this.source.width !== target.width || this.source.height !== target.height) {
      if (this.source) this.retire(this.source);
      this.source = device.createTexture({ label: 'Game OS card hover source', size: [target.width, target.height], format: this.engine.format, usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING });
    }
    const shelf = this.shelf();
    this.values.set([this.engine.displayWidth, this.engine.displayHeight, 0, this.engine.displayWidth < 600 ? 32 : 52, shelf.x, shelf.y, shelf.width, shelf.height]);
    new Uint32Array(this.values.buffer)[2] = cards.length;
    cards.forEach((card, index) => {
      const pose = cardHoverPose(card.amount), rectangle = card.rect;
      this.values.set([rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2, rectangle.width / 2, rectangle.height / 2,
        pose.scale, Math.cos(pose.rotation), Math.sin(pose.rotation), pose.lift], 8 + index * 8);
    });
    this.values.fill(0, 8 + MAX_CARDS * 8);
    this.overlays().slice(0, 4).forEach((rect, index) => this.values.set([rect.x, rect.y, rect.width, rect.height], 8 + MAX_CARDS * 8 + index * 4));
    device.queue.writeBuffer(this.uniform, 0, this.values);
    context.encoder.copyTextureToTexture({ texture: target }, { texture: this.source }, [target.width, target.height]);
    this.pass.apply(context.encoder, this.source, target.createView(), device);
    return this;
  }
  private retire(texture: GPUTexture | GPUBuffer): void {
    void this.device.queue.onSubmittedWorkDone().then(() => texture.destroy(), () => texture.destroy());
  }
  override destroy(): this {
    if (this.source) { this.retire(this.source); this.source = null; }
    if (this.uniform) this.retire(this.uniform);
    this.pass?.destroy(); return super.destroy();
  }
}
