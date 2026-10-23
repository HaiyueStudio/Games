import type { HaiyueEngine } from '@haiyue/engine';
import { System, type World } from '@haiyue/engine/ecs';
import { beginRenderCommandPass, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import type { Round } from '../rules/model';

// Analytic perspective slices share the exact obstacle angles and depth used by the rules.
const shader = /* wgsl */`
struct Params { size:vec2f, time:f32, distance:f32, angle:f32, hits:f32, flash:f32, broken:f32, count:f32, pad:vec3f }
@group(0) @binding(0) var<uniform> u:Params;
@group(0) @binding(1) var<storage,read> gates:array<vec4f>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);
}
fn bend(z:f32)->vec2f {
 let d=u.distance;
 return vec2f(sin((d+z)*.018)-sin(d*.018),cos((d+z)*.023)-cos(d*.023))*.9;
}
fn project(z:f32)->vec2f { return bend(z)*.5*z/(z+12.0); }
fn ad(a:f32,b:f32)->f32 { return abs(atan2(sin(a-b),cos(a-b))); }
@fragment fn fs(@builtin(position) pixel:vec4f)->@location(0) vec4f {
 let p=(pixel.xy/u.size*2.0-1.0)*vec2f(u.size.x/u.size.y,1);
 var color=vec3f(.004,.008,.028);
 // Far-to-near facets form a continuously bending, luminous tube.
 for(var i=72;i>=0;i--) {
  let z=(f32(i)+fract(-u.distance/2.2))*2.2+.15;
  let q=p-project(z);let radius=5.5/(z+4.0);let a=atan2(q.y,q.x)+u.angle+1.5707963;
  let polygon=length(q)*cos((fract(a/6.2831853*12.0+.5)-.5)*6.2831853/12.0);
  let edge=abs(polygon-radius);let line=exp(-edge*edge/(.000006+radius*radius*.0005));
  let hue=.5+.5*sin((z+u.distance)*.035+u.time*.12);
  let tint=mix(vec3f(.05,.85,1),vec3f(.65,.12,1),hue);
  color+=tint*line*(.14+.4*radius);
  let seam=pow(.5+.5*cos(a*12.0),90.0);
  color+=tint*seam*.012*smoothstep(radius*.8,radius,length(q));
 }
 for(var i=i32(u.count)-1;i>=0;i--) {
  let g=gates[i];if(g.x<0.0){continue;}
  let q=p-project(g.x);let radius=5.5/(g.x+4.0);let a=atan2(q.y,q.x)+u.angle-1.5707963;
  let thickness=max(.007,radius*.085);let ring=1.0-smoothstep(thickness,thickness+.003,abs(length(q)-radius*.82727));
  let mask=1.0-smoothstep(g.z,g.z+.015,ad(a,g.y));
  let body=ring*mask;let rim=exp(-pow((abs(length(q)-radius*.82727)-thickness)*180.0,2.0))*mask;
  color=mix(color,vec3f(1,.12,.25)+rim*vec3f(1,.55,.3),body*.96);
 }
 // Glass sphere: Fresnel rim, refracted tunnel, specular caustic and damage cracks.
 let ball=vec2f(0,.65);let local=(p-ball)/.11;let r=length(local);
 if(u.hits<3.5 && r<1.0) {
  let normal=vec3f(local,sqrt(max(0.0,1.0-r*r)));let fres=pow(1.0-normal.z,2.0);
  let shine=pow(max(0.0,dot(normal,normalize(vec3f(-.5,-.7,1)))),70.0);
  color=color*.55+vec3f(.13,.6,.72)*.18+fres*vec3f(.4,.9,1)*1.7+shine*2.0;
  var crack=0.0;
  for(var j=0;j<3;j++){if(f32(j)>=u.hits){break;}let a=f32(j)*2.4+.4;let line=abs(local.x*cos(a)+local.y*sin(a)+sin(local.y*23.0)*.04);crack+=exp(-line*230.0);}
  color+=crack*vec3f(.8,.95,1);
 }
 if(u.hits>3.5) {
  for(var j=0;j<30;j++) {
   let n=f32(j);let a=n*2.39996;let t=u.broken;
   let centre=ball+vec2f(cos(a),sin(a))*(.025+t*(.16+fract(n*.37)*.5))+vec2f(0,t*t*.25);
   let q=(p-centre);let shard=max(abs(q.x+q.y*.5),abs(q.y)*1.8);
   color+=vec3f(.35,.8,1)* (1.0-smoothstep(.004,.012,shard))*max(0.0,1.0-t/3.0);
  }
 }
 color+=u.flash*vec3f(.28,.025,.02);color*=1.0-.22*length(p);
 return vec4f(1.0-exp(-max(color,vec3f(0))),1);
}`;
export class Tunnel extends System {
  private uniform!: GPUBuffer; private obstacles!: GPUBuffer; private pipeline!: GPURenderPipeline; private group!: GPUBindGroup;
  private round!: Round;
  constructor(private engine: HaiyueEngine) { super(() => false); this.name = 'Glass Rush WGSL tunnel'; this.priority = 0; }
  async init(): Promise<void> {
    const device = this.engine.device, module = device.createShaderModule({ code: shader });
    const info = await module.getCompilationInfo(); const errors = info.messages.filter(m => m.type === 'error');
    if (errors.length) throw new Error(errors.map(m => m.message).join('\n'));
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.engine.format }] }, multisample: { count: this.engine.msaaSamples } });
    this.uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.obstacles = device.createBuffer({ size: 32 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer: this.obstacles } }] });
  }
  sync(round: Round): void { this.round = round; }
  record(_world: World, context: RenderCommandContext): this {
    const r = this.round; if (!r) return this;
    const data = new Float32Array(128); r.gates.slice(0, 32).forEach((g, i) => data.set([g.z, g.angle, g.width, 0], i * 4));
    this.engine.device.queue.writeBuffer(this.uniform, 0, new Float32Array([this.engine.canvas!.width, this.engine.canvas!.height, r.time, r.distance, r.angle, r.hits, r.flash, r.broken, Math.min(32,r.gates.length),0,0,0,0,0,0,0]));
    this.engine.device.queue.writeBuffer(this.obstacles, 0, data);
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);passEncoder.setPipeline(this.pipeline);passEncoder.setBindGroup(0,this.group);passEncoder.draw(3);if(ownsPass)passEncoder.end();return this;
  }
  override destroy(): this { this.uniform?.destroy();this.obstacles?.destroy();return super.destroy(); }
}
