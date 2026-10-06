import type { HaiyueEngine } from '@haiyue/engine';
import { System, type World } from '@haiyue/engine/ecs';
import { beginRenderCommandPass, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { InkTrail, TRAIL_LIFE, TRAIL_LIMIT } from './inkTrail';

const shader = /* wgsl */`
struct Item { rect:vec4f, fx:vec4f };
struct View { size:vec2f, time:f32, padding:f32 };
struct Vertex { @builtin(position) pos:vec4f, @location(0) uv:vec2f, @location(1) @interpolate(flat) index:u32 };
@group(0) @binding(0) var<uniform> view:View;
@group(0) @binding(1) var<storage,read> items:array<Item>;
@group(0) @binding(2) var brush:texture_2d<f32>;
@group(0) @binding(3) var linearSampler:sampler;
fn hash(p:vec2f)->f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn noise(p:vec2f)->f32 {
 let i=floor(p); let f=fract(p); let u=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2f(1,0)),u.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1,1)),u.x),u.y);
}
fn fbm(p:vec2f)->f32 { return noise(p)*.55+noise(p*2.03+7.4)*.28+noise(p*4.07+13.2)*.12+noise(p*8.1)*.05; }
@vertex fn vs(@builtin(vertex_index) v:u32,@builtin(instance_index) instance:u32)->Vertex {
 let corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let uv=corners[v]; let item=items[instance]; let local=(uv-.5)*item.rect.zw;
 let c=cos(item.fx.x);let s=sin(item.fx.x);
 let p=item.rect.xy+vec2f(local.x*c-local.y*s,local.x*s+local.y*c);
 var out:Vertex;out.pos=vec4f(p/view.size*vec2f(2,-2)+vec2f(-1,1),0,1);out.uv=uv;out.index=instance;return out;
}
@fragment fn fs(v:Vertex)->@location(0) vec4f {
 let item=items[v.index]; let uv=v.uv; let age=item.fx.y;let kind=item.fx.z;
 let grain=fbm(uv*vec2f(31,17)+item.rect.xy*.09);
 var alpha=0.0;
 if(kind>1.5){
  // Alpha dilation in several directions simulates capillary spreading through water.
  // The centre stays legible; only the diluted contour drifts with continuous noise.
  let flow=vec2f(fbm(uv*9.0+view.time*.07),fbm(uv*11.0-view.time*.05))-.5;
  let wet=.5+.5*sin(view.time*.55+grain*5.0);
  let radius=(.008+wet*.015)*(0.45+grain);
  let warped=uv+flow*.013;
  let core=textureSampleLevel(brush,linearSampler,warped,0).a;
  var bloom=0.0;
  for(var i=0;i<12;i++){
   let a=f32(i)*.5235988;let offset=vec2f(cos(a),sin(a))*radius*vec2f(.55,1.6);
   bloom+=textureSampleLevel(brush,linearSampler,warped+offset,0).a/12.0;
  }
  alpha=clamp(core*.95+bloom*.28*(.5+grain),0.0,1.0);
 }else{
  let p=(uv-.5)*item.rect.zw;
  let radius=select(8.0+age*9.0,11.0,kind>.5);
  let halfLine=max(0.0,item.rect.z*.5-radius-7.0);
  let distance=length(vec2f(max(0.0,abs(p.x)-halfLine),p.y));
  let edge=distance-radius+(grain-.5)*(3.0+age*8.0);
  let core=1.0-smoothstep(-1.8,2.0+age*4.0,edge);
  let halo=(1.0-smoothstep(0.0,8.0+age*9.0,edge))*.14;
  let fade=pow(max(0.0,1.0-age/1.45),1.8);
  alpha=select((core*.16+halo*.55)*fade,core+halo,kind>.5);
 }
 let ink=vec3f(.032,.042,.036);
 return vec4f(ink*alpha,alpha);
}`;

/** One shared-device GPU layer: ink wake/ball plus brush-texture UI on a transparent surface. */
export class InkEffects extends System {
  private readonly trail = new InkTrail();
  private time = 0; private ball = { x: 235, y: -321 }; private passes = 0;
  private texture!: GPUTexture;
  private mainPipeline!: GPURenderPipeline; private uiPipeline!: GPURenderPipeline;
  private mainUniform!: GPUBuffer; private uiUniform!: GPUBuffer;
  private mainItems!: GPUBuffer; private uiItems!: GPUBuffer;
  private mainGroup!: GPUBindGroup; private uiGroup!: GPUBindGroup;
  private context!: GPUCanvasContext;
  private panels: HTMLElement[] = [];
  private readonly data = new Float32Array((TRAIL_LIMIT + 33) * 8);
  private readonly rails: number[][] = [];
  private readonly uiData = new Float32Array(32 * 8);
  private uiCount = 0;
  private width = 0; private height = 0;
  constructor(private readonly engine: HaiyueEngine, private readonly canvas: HTMLCanvasElement) {
    super(() => false); this.priority = 20; this.name = 'Ink diffusion shader';
  }
  async init(): Promise<void> {
    const device = this.engine.device;
    const response = await fetch('./assets/brush.png');
    if (!response.ok) throw new Error(`Brush asset HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    this.texture = device.createTexture({ label: 'Ink brush alpha', size: [bitmap.width, bitmap.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: this.texture }, [bitmap.width, bitmap.height]); bitmap.close();
    const module = device.createShaderModule({ label: 'Ink capillary diffusion WGSL', code: shader });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(message => message.type === 'error');
    if (errors.length) throw new Error(errors.map(message => message.message).join('\n'));
    const pipeline = (samples: number) => device.createRenderPipeline({ label: 'Ink diffusion', layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.engine.format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] }, primitive: { topology: 'triangle-list' }, multisample: { count: samples } });
    this.mainPipeline = pipeline(this.engine.msaaSamples); this.uiPipeline = pipeline(1);
    this.mainUniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uiUniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.mainItems = device.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.uiItems = device.createBuffer({ size: this.uiData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const group = (pipeline: GPURenderPipeline, uniform: GPUBuffer, items: GPUBuffer) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: items } }, { binding: 2, resource: this.texture.createView() }, { binding: 3, resource: sampler }] });
    this.mainGroup = group(this.mainPipeline, this.mainUniform, this.mainItems); this.uiGroup = group(this.uiPipeline, this.uiUniform, this.uiItems);
    this.context = this.canvas.getContext('webgpu')!;
    this.context.configure({ device, format: this.engine.format, alphaMode: 'premultiplied' });
    this.panels = [...document.querySelectorAll<HTMLElement>('.ink-panel')];
    document.body.classList.add('shader-ready');
  }
  addRail(x: number, y: number, length: number, width: number, angle: number): void {
    if (this.rails.length >= 32) throw new Error('Ink rail capacity exceeded');
    this.rails.push([x + 300, 450 - y, length * 1.12 + 8, width * 2.7, angle, 0, 3, 0]);
  }
  sample(time: number, x: number, y: number, playing: boolean): void { this.trail.sample(time, x, y, playing); }
  sync(time: number, x: number, y: number): void { this.time = time; this.ball = { x, y }; }
  reset(): void { this.trail.reset(); }
  record(_world: World, context: RenderCommandContext): this {
    const device = this.engine.device;
    let count = 0;
    for (const rail of this.rails) this.data.set(rail, count++ * 8);
    for (const mark of this.trail.marks) {
      const age = this.time - mark.born;
      this.data.set([mark.x + 300, 450 - mark.y, mark.length + 32 + age * 30, 34 + age * 32, mark.angle, age, 0, 0], count++ * 8);
    }
    this.data.set([this.ball.x + 300, 450 - this.ball.y, 38, 38, 0, 0, 1, 0], count++ * 8);
    device.queue.writeBuffer(this.mainUniform, 0, new Float32Array([600, 900, this.time, 0]));
    device.queue.writeBuffer(this.mainItems, 0, this.data);
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);
    passEncoder.setPipeline(this.mainPipeline); passEncoder.setBindGroup(0, this.mainGroup); passEncoder.draw(6, count);
    if (ownsPass) passEncoder.end();
    // End the shared pass before encoding an independent UI surface pass.
    // The engine supplies an isolated pass for this system (see registration).
    const width = Math.max(1, Math.round(innerWidth * Math.min(devicePixelRatio, 2)));
    const height = Math.max(1, Math.round(innerHeight * Math.min(devicePixelRatio, 2)));
    if (width !== this.width || height !== this.height) { this.width = width; this.height = height; this.canvas.width = width; this.canvas.height = height; }
    this.uiCount = 0;
    for (const panel of this.panels) {
      if (panel.hidden || !panel.getClientRects().length || this.uiCount >= 32) continue;
      const rect = panel.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) continue;
      this.uiData.set([rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width * 1.17, rect.height * 2.5, 0, 0, 2, 0], this.uiCount++ * 8);
    }
    device.queue.writeBuffer(this.uiUniform, 0, new Float32Array([innerWidth, innerHeight, this.time, 0]));
    device.queue.writeBuffer(this.uiItems, 0, this.uiData);
    const ui = context.encoder.beginRenderPass({ label: 'Ink brush UI', colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
    ui.setPipeline(this.uiPipeline); ui.setBindGroup(0, this.uiGroup); ui.draw(6, this.uiCount); ui.end(); this.passes++;
    return this;
  }
  /** Offscreen fixture verifies actual alpha evolution, not just shader submission. */
  async verifyDiffusion(): Promise<{ changed: number; transparent: number; opaque: number }> {
    const device = this.engine.device;
    const target = device.createTexture({ size: [256, 128], format: this.engine.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const items = device.createBuffer({ size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const readback = device.createBuffer({ size: 256 * 128 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const group = device.createBindGroup({ layout: this.uiPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: items } }, { binding: 2, resource: this.texture.createView() }, { binding: 3, resource: device.createSampler({ minFilter: 'linear', magFilter: 'linear' }) }] });
    device.queue.writeBuffer(items, 0, new Float32Array([128, 64, 240, 170, 0, 0, 2, 0]));
    const capture = async (time: number) => {
      device.queue.writeBuffer(uniform, 0, new Float32Array([256, 128, time, 0]));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(this.uiPipeline); pass.setBindGroup(0, group); pass.draw(6); pass.end();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 1024 }, [256, 128]);
      device.queue.submit([encoder.finish()]); await readback.mapAsync(GPUMapMode.READ);
      const pixels = new Uint8Array(readback.getMappedRange()).slice(); readback.unmap(); return pixels;
    };
    try {
      const first = await capture(0), second = await capture(6);
      let changed = 0, transparent = 0, opaque = 0;
      for (let i = 3; i < first.length; i += 4) {
        if (Math.abs(first[i]! - second[i]!) > 3) changed++;
        if (first[i]! < 8) transparent++;
        if (first[i]! > 240 && second[i]! > 240) opaque++;
      }
      return { changed, transparent, opaque };
    } finally { target.destroy(); uniform.destroy(); items.destroy(); readback.destroy(); }
  }
  snapshot() { return { shader: 'fbm-capillary-diffusion', passes: this.passes, trailCount: this.trail.marks.length, trailLimit: TRAIL_LIMIT, trailLife: TRAIL_LIFE, uiPanels: this.uiCount }; }
  override destroy(): this {
    this.context?.unconfigure(); this.texture?.destroy(); this.mainUniform?.destroy(); this.uiUniform?.destroy(); this.mainItems?.destroy(); this.uiItems?.destroy(); this.trail.reset();
    document.body.classList.remove('shader-ready'); return super.destroy();
  }
}
