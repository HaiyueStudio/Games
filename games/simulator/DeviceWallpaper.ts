import type { RttEngine } from '@haiyue/engine/rtt';
import { System, type World } from '@haiyue/engine/ecs';
import { beginRenderCommandPass, type RenderCommandContext } from '@haiyue/engine/extension-authoring';

const shader = `
struct Wallpaper { size:vec2f, time:f32, motion:f32 }
@group(0) @binding(0) var<uniform> wallpaper:Wallpaper;
@vertex fn vs(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
 let vertices=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(vertices[index],0,1);
}
@fragment fn fs(@builtin(position) fragment:vec4f)->@location(0) vec4f {
 let uv=fragment.xy/wallpaper.size;let time=wallpaper.time*wallpaper.motion*.32;
 let point=(uv-.5)*vec2f(wallpaper.size.x/wallpaper.size.y,1);
 let warp=point+vec2f(sin(point.y*4.5+time),cos(point.x*4.0-time*.8))*.13;
 var color=vec3f(.012,.023,.075);
 for(var index=0;index<4;index++){
  let phase=f32(index)*1.57;let center=vec2f(sin(time+phase)*.36,cos(time*.73+phase)*.4);
  let distance=length(warp-center);let cloud=exp(-distance*distance*9.0);
  let rim=pow(.5+.5*cos(distance*19.0-time*2.8+phase),10.0)*cloud;
  let tint=mix(vec3f(.025,.42,.48),vec3f(.48,.055,.31),.5+.5*sin(phase+time*.65));
  color+=tint*(cloud*.53+rim*.25);
 }
 let caustic=pow(.5+.5*sin(warp.x*10.0+sin(warp.y*8.0-time)+time),18.0);
 color+=vec3f(.18,.31,.5)*caustic*.12;
 color*=1.0-.32*length(uv-.5);return vec4f(color,1);
}`;
export class DeviceWallpaper extends System {
  time = 0;
  motion = true;
  private uniform!: GPUBuffer;
  private pipeline!: GPURenderPipeline;
  private group!: GPUBindGroup;
  constructor(private readonly engine: RttEngine) { super(() => false); this.name = 'Device liquid prism wallpaper'; }
  async init(): Promise<void> {
    const device = this.engine.device, module = device.createShaderModule({ label: this.name, code: shader });
    const errors = (await module.getCompilationInfo()).messages.filter(message => message.type === 'error'); if (errors.length) throw new Error(errors.map(message => message.message).join('\n'));
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.engine.format }] } });
    this.uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
  }
  record(_world: World, context: RenderCommandContext): this {
    this.engine.device.queue.writeBuffer(this.uniform, 0, new Float32Array([this.engine.width, this.engine.height, this.time, this.motion ? 1 : 0]));
    const { passEncoder, ownsPass } = beginRenderCommandPass(context); passEncoder.setPipeline(this.pipeline); passEncoder.setBindGroup(0, this.group); passEncoder.draw(3); if (ownsPass) passEncoder.end(); return this;
  }
  override destroy(): this { this.uniform?.destroy(); return super.destroy(); }
}
