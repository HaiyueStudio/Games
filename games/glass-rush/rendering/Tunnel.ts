import type { HaiyueEngine } from '@haiyue/engine';
import { System, type World } from '@haiyue/engine/ecs';
import { beginRenderCommandPass, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { GATE_SHAPES, type Gate, type Round } from '../rules/model';
import { createBallFragments, createGateFragments, fragmentsShader, type FragmentMesh } from './Fragments';

const shader = /* wgsl */`
struct Params { size:vec2f, time:f32, distance:f32, angle:f32, hits:f32, flash:f32, broken:f32 }
@group(0) @binding(0) var<uniform> u:Params;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);
}
fn bend(z:f32)->vec2f { let d=u.distance;return vec2f(sin((d+z)*.018)-sin(d*.018),cos((d+z)*.023)-cos(d*.023))*.45*z/(z+12.0); }
fn line(x:f32,width:f32)->f32 { return exp(-abs(x)/max(width,.0001)); }
struct Surface { @location(0) color:vec4f, @builtin(frag_depth) depth:f32 }
@fragment fn fs(@builtin(position) pixel:vec4f)->Surface {
 let p=(pixel.xy/u.size*2.0-1.0)*vec2f(u.size.x/u.size.y,1);
 // Find the first wall intersection. A fixed-point solve folds distant bends over each other.
 var near=0.0;var far=180.0;
 for(var i=1;i<=30;i++) {
  let step=f32(i)/30.0;let sample=180.0*step*step;
  if(length(p-bend(sample))*(sample+4.0)>5.5){far=sample;break;}
  near=sample;
 }
 for(var i=0;i<6;i++) {
  let mid=(near+far)*.5;
  if(length(p-bend(mid))*(mid+4.0)>5.5){far=mid;}else{near=mid;}
 }
 let z=(near+far)*.5;
 let q=p-bend(z);let a=atan2(q.y,q.x)+u.angle;let world=z+u.distance;
 let twist=a+sin(world*.025)*.16;let sector=twist*12.0/6.2831853;
 let lane=abs(fract(sector+.5)-.5);let rib=abs(fract(world/7.5+.5)-.5);
 // Clamp the atan2 seam's derivative and fade unresolved details before the vanishing point.
 let aa=clamp(fwidth(sector),.001,.045);let az=clamp(fwidth(world/7.5),.001,.08);
 let detail=1.0-smoothstep(65.0,155.0,z);
 let tint=mix(vec3f(.03,.8,1),vec3f(.65,.12,1),.5+.5*sin(twist*2.0+world*.032));
 let panel=.5+.5*cos(floor(sector+.5)*1.73+floor(world/7.5)*.71);
 var color=mix(vec3f(.007,.013,.036),vec3f(.025,.03,.075),panel);
 color+=tint*(line(lane,.012+aa)*.68+line(lane,.09)*.13)*detail;
 color+=tint*line(rib,.014+az)*(.24+.2*pow(.5+.5*cos(twist*6.0),4.0))*detail;
 // Diagonal traces, travelling packets and helical ribbons add depth and motion.
 let diagonal=abs(fract(sector*2.0+world*.065)-.5);
 color+=tint*line(diagonal,.012+aa)*.10*detail;
 let packet=pow(max(0.0,sin(world*.42-u.time*5.0+floor(sector+.5)*1.9)),18.0);
 color+=mix(tint,vec3f(.55,1,1),.5)*line(lane,.025+aa)*packet*1.8*detail;
 let helix=abs(sin(twist*3.0-world*.032));
 color+=mix(vec3f(.12,.35,1),vec3f(1,.08,.55),.5+.5*sin(world*.018))*line(helix,.035)*.3*detail;
 color*=.35+exp(-z*.018)*.85;
 let core=exp(-length(p-bend(155.0))*16.0);
 color+=vec3f(.08,.25,.65)*core+vec3f(.45,.12,.7)*pow(core,3.0);
 let cell=vec2f(sector*8.0,world*.22);let id=floor(cell);
 let random=fract(sin(dot(id,vec2f(127.1,311.7)))*43758.5453);
 let dust=exp(-length((fract(cell)-.5)*vec2f(8,2))*13.0)*step(.92,random);
 color+=vec3f(.4,.85,1)*dust*2.0*detail;
 let impact=u.flash/.6;let shock=abs(length(p-vec2f(0,.65))-(.6-u.flash)*1.8-.08);
 color+=vec3f(1,.3,.4)*line(shock,.012)*impact*.8+impact*vec3f(.14,.015,.025);
 color*=1.0-.22*smoothstep(.3,1.6,length(p));
 var out:Surface;out.color=vec4f(1.0-exp(-max(color,vec3f(0))*1.3),1);
 // Match the geometry's camera projection: an opaque wall owns the nearest depth.
 out.depth=1.0-.15/(z+4.0);return out;
}`;

const MAX_ITEMS = 41; // 32 live gates, eight bounded impacts, one ball.
export class Tunnel extends System {
  private uniform!: GPUBuffer;
  private items!: GPUBuffer;
  private pipeline!: GPURenderPipeline;
  private fragments!: GPURenderPipeline;
  private group!: GPUBindGroup;
  private fragmentGroup!: GPUBindGroup;
  private ball!: FragmentMesh;
  private meshes = new Map<Gate, FragmentMesh>();
  private params = new Float32Array(8);
  private itemData = new Float32Array(MAX_ITEMS * 8);
  private round!: Round;
  constructor(private engine: HaiyueEngine) { super(() => false); this.name = 'Glass Rush crystal tunnel'; this.priority = 0; }
  async init(): Promise<void> {
    const device = this.engine.device, modules = [shader, fragmentsShader].map(code => device.createShaderModule({ code }));
    for (const module of modules) {
      const info = await module.getCompilationInfo(), errors = info.messages.filter(m => m.type === 'error');
      if (errors.length) throw new Error(errors.map(m => m.message).join('\n'));
    }
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module: modules[0]!, entryPoint: 'vs' }, fragment: { module: modules[0]!, entryPoint: 'fs', targets: [{ format: this.engine.format }] }, depthStencil: { format: this.engine.getDepthFormat(false), depthWriteEnabled: true, depthCompare: 'always' }, multisample: { count: this.engine.msaaSamples } });
    this.fragments = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: modules[1]!, entryPoint: 'vs', buffers: [{ arrayStride: 48, attributes: [0, 1, 2, 3].map(i => ({ shaderLocation: i, offset: i * 12, format: 'float32x3' as GPUVertexFormat })) }] },
      fragment: { module: modules[1]!, entryPoint: 'fs', targets: [{ format: this.engine.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] },
      primitive: { cullMode: 'none' }, depthStencil: { format: this.engine.getDepthFormat(false), depthWriteEnabled: false, depthCompare: 'less-equal' }, multisample: { count: this.engine.msaaSamples },
    });
    this.uniform = device.createBuffer({ label: 'Glass Rush uniforms', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.items = device.createBuffer({ label: 'Glass Rush bounded effects', size: this.itemData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
    this.fragmentGroup = device.createBindGroup({ layout: this.fragments.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer: this.items } }] });
    this.ball = createBallFragments(device);
  }
  sync(round: Round): void { this.round = round; }
  get stats(): { meshes: number; ballTriangles: number; impactCount: number } { return { meshes: this.meshes.size, ballTriangles: this.ball?.triangles ?? 0, impactCount: this.round?.impacts.length ?? 0 }; }
  record(_world: World, context: RenderCommandContext): this {
    const r = this.round; if (!r) return this;
    const live = r.gates.filter(g => !g.shattered && g.z > 0).slice(0, 32).sort((a, b) => b.z - a.z);
    const retained = new Set([...live, ...r.impacts.map(impact => impact.gate)]);
    for (const [gate, mesh] of this.meshes) if (!retained.has(gate)) { mesh.buffer.destroy(); this.meshes.delete(gate); }
    const draws: FragmentMesh[] = [];
    const add = (gate: Gate, z: number, angle: number, age: number, impact: number): void => {
      let mesh = this.meshes.get(gate);
      if (!mesh) { mesh = createGateFragments(this.engine.device, gate); this.meshes.set(gate, mesh); }
      this.itemData.set([z, angle, age, 0, impact, GATE_SHAPES.indexOf(gate.shape), gate.width, age < 0 ? gate.spin : 0], draws.length * 8);
      draws.push(mesh);
    };
    for (const gate of live) add(gate, gate.z, gate.angle, -1, 0);
    for (const impact of r.impacts.slice(-8)) add(impact.gate, 3, impact.angle, impact.age, impact.playerAngle - impact.angle);
    if (r.phase !== 'over' || r.broken < 3) {
      this.itemData.set([0, 0, r.phase === 'over' ? r.broken : -1, 1, 0, 0, 0, 0], draws.length * 8); draws.push(this.ball);
    }
    this.params.set([this.engine.canvas!.width, this.engine.canvas!.height, r.time, r.distance, r.angle, r.hits, r.flash, r.broken]);
    this.engine.device.queue.writeBuffer(this.uniform, 0, this.params); this.engine.device.queue.writeBuffer(this.items, 0, this.itemData);
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);
    passEncoder.setPipeline(this.pipeline); passEncoder.setBindGroup(0, this.group); passEncoder.draw(3);
    passEncoder.setPipeline(this.fragments); passEncoder.setBindGroup(0, this.fragmentGroup);
    draws.forEach((mesh, i) => { passEncoder.setVertexBuffer(0, mesh.buffer); passEncoder.draw(mesh.vertices, 1, 0, i); });
    if (ownsPass) passEncoder.end(); return this;
  }
  override destroy(): this {
    this.uniform?.destroy(); this.items?.destroy(); this.ball?.buffer.destroy();
    for (const mesh of this.meshes.values()) mesh.buffer.destroy(); this.meshes.clear(); return super.destroy();
  }
}
