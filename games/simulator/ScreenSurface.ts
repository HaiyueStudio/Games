import type { HaiyueEngine } from '@haiyue/engine';
import { screenFit } from './orientation';

const shader = `
struct Surface { physical:vec2f, logical:vec2f, angle:f32, scale:f32, padding:vec2f }
@group(0) @binding(0) var<uniform> surface:Surface;
@group(0) @binding(1) var content:texture_2d<f32>;
@group(0) @binding(2) var filtering:sampler;
@vertex fn vs(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
 let vertices=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(vertices[index],0,1);
}
@fragment fn fs(@builtin(position) fragment:vec4f)->@location(0) vec4f {
 let point=fragment.xy-surface.physical*.5;let cosine=cos(surface.angle);let sine=sin(surface.angle);
 let uv=vec2f(cosine*point.x-sine*point.y,sine*point.x+cosine*point.y)*surface.scale/surface.logical+.5;
 let color=textureSample(content,filtering,clamp(uv,vec2f(0),vec2f(1)));
 return select(vec4f(.006,.012,.028,1),color,all(uv>=vec2f(0))&&all(uv<=vec2f(1)));
}`;
export class ScreenSurface {
  readonly texture: GPUTexture;
  private readonly uniform: GPUBuffer;
  private pipeline!: GPURenderPipeline;
  private group: GPUBindGroup | null = null;
  private source: GPUTexture | null = null;
  constructor(private readonly engine: HaiyueEngine, readonly width: number, readonly height: number) {
    this.texture = engine.device.createTexture({ label: 'Rotating physical device screen', size: [width, height], format: 'bgra8unorm-srgb', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    this.uniform = engine.device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }
  async init(): Promise<void> {
    const module = this.engine.device.createShaderModule({ label: 'Device screen rotation', code: shader });
    const errors = (await module.getCompilationInfo()).messages.filter(message => message.type === 'error'); if (errors.length) throw new Error(errors.map(message => message.message).join('\n'));
    this.pipeline = this.engine.device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.texture.format }] } });
  }
  draw(source: GPUTexture, angle: number): void {
    const device = this.engine.device;
    if (this.source !== source) {
      this.source = source;
      this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: source.createView() }, { binding: 2, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) }] });
    }
    const scale = screenFit(angle, this, source);
    device.queue.writeBuffer(this.uniform, 0, new Float32Array([this.width, this.height, source.width, source.height, angle, scale, 0, 0]));
    const encoder = device.createCommandEncoder({ label: 'Animated device screen' });
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.texture.createView(), loadOp: 'clear', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group!); pass.draw(3); pass.end(); device.queue.submit([encoder.finish()]);
  }
  destroy(): void { this.texture.destroy(); this.uniform.destroy(); this.group = null; this.source = null; }
}
