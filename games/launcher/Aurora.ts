import type { HaiyueEngine } from '@haiyue/engine';
import { System, type World } from '@haiyue/engine/ecs';
import { beginRenderCommandPass, type RenderCommandContext } from '@haiyue/engine/extension-authoring';

const shader = /* wgsl */`
struct View { size:vec2f, time:f32, motion:f32 }
@group(0) @binding(0) var<uniform> u:View;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);
}
fn hash(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
@fragment fn fs(@builtin(position) frag:vec4f)->@location(0) vec4f {
 let uv=frag.xy/u.size;let t=u.time*.55*u.motion;
 var c=mix(vec3f(.012,.035,.09),vec3f(.025,.075,.12),uv.y);
 for(var i=0;i<4;i++) {
  let n=f32(i);let wave=.31+sin(uv.x*4.2+t+n*.9)*.19+sin(uv.x*9.0-t*.8+n)*.075;
  let distance=uv.y-wave-n*.065;
  let ribbon=exp(-pow(distance*8.0,2.0));let edge=exp(-pow(distance*62.0,2.0));
  let fold=.5+.5*sin(uv.x*10.0+uv.y*3.0+n*2.0+t*1.4);
  let tint=mix(vec3f(.025,.48,.5),vec3f(.4,.12,.66),fold);
  c+=tint*(ribbon*(.28+.2*fold)+edge*.3);
 }
 let horizon=max(.01,uv.y-.62);let grid=vec2f((uv.x-.5)/horizon,1.0/horizon+t*1.3);
 let lines=exp(-abs(sin(grid.x*3.0))*65.0)+exp(-abs(sin(grid.y*2.0))*45.0);
 c+=vec3f(.06,.4,.44)*lines*smoothstep(.65,.96,uv.y)*.5;
 let drift=uv*u.size/78.0+vec2f(t*.18,-t*.24);let cell=floor(drift);let star=pow(hash(cell),12.0);
 let point=exp(-dot(fract(drift)-.5,fract(drift)-.5)*900.0);
 c+=vec3f(.5,.85,1.0)*point*star*(.7+.3*sin(t*2.0+cell.x));
 c+=vec3f(.007)*hash(frag.xy);c*=1.0-.35*length(uv-.5);
 return vec4f(c,1);
}`;
export class Aurora extends System {
  time = 0;
  motion = true;
  private uniform!: GPUBuffer;
  private pipeline!: GPURenderPipeline;
  private group!: GPUBindGroup;
  constructor(private readonly engine: HaiyueEngine) { super(() => false);this.name='Game OS aurora'; }
  async init(): Promise<void> {
    const device=this.engine.device,module=device.createShaderModule({label:'Game OS aurora WGSL',code:shader});
    const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
    this.pipeline=device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:this.engine.format}]},multisample:{count:this.engine.msaaSamples}});
    this.uniform=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.group=device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
  }
  record(_world: World,context: RenderCommandContext): this {
    this.engine.device.queue.writeBuffer(this.uniform,0,new Float32Array([this.engine.canvas!.width,this.engine.canvas!.height,this.time,this.motion?1:0]));
    const {passEncoder,ownsPass}=beginRenderCommandPass(context);passEncoder.setPipeline(this.pipeline);passEncoder.setBindGroup(0,this.group);passEncoder.draw(3);if(ownsPass)passEncoder.end();return this;
  }
  override destroy(): this { this.uniform?.destroy();return super.destroy(); }
}
