import type { HaiyueEngine } from '@haiyue/engine';
import { InkSources, MAX_SPLATS, fluidQuality } from './fluidModel';

// Stable-fluid stages are adapted to WebGPU from Volcomix/ink-drop (MIT).
// See THIRD_PARTY_NOTICES.md for attribution and the exact reference revision.
const compute = /* wgsl */`
struct Params { size:vec2u, dt:f32, time:f32, count:u32, padding:vec3u };
struct Splat { point:vec4f, flow:vec4f };
@group(0) @binding(0) var<uniform> u:Params;
@group(0) @binding(1) var<storage,read> src:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> aux:array<vec2f>;
@group(0) @binding(4) var<storage,read> pressure:array<f32>;
@group(0) @binding(5) var<storage,read_write> nextPressure:array<f32>;
@group(0) @binding(6) var<storage,read> splats:array<Splat>;
fn idx(p:vec2i)->u32 { let q=clamp(p,vec2i(0),vec2i(u.size)-1);return u32(q.y)*u.size.x+u32(q.x); }
fn at(p:vec2i)->vec4f {return src[idx(p)];}
fn sampleField(p:vec2f)->vec4f {
 let q=clamp(p,vec2f(0),vec2f(u.size)-1.0);let a=vec2i(floor(q));let f=fract(q);
 return mix(mix(at(a),at(a+vec2i(1,0)),f.x),mix(at(a+vec2i(0,1)),at(a+vec2i(1,1)),f.x),f.y);
}
@compute @workgroup_size(8,8) fn advect(@builtin(global_invocation_id) gid:vec3u) {
 if(any(gid.xy>=u.size)){return;}let p=vec2i(gid.xy);let k=idx(p);let xy=vec2f(gid.xy);
 var value=sampleField(xy-src[k].xy*u.dt);
 value=vec4f(value.xy*exp(-u.dt*.8),value.z*exp(-u.dt*.8),0);
 let table=xy/vec2f(u.size)*vec2f(600,900);
 for(var i=0u;i<u.count;i++){
  let s=splats[i];let d=table-s.point.xy;let r=s.point.z;
  let weight=exp(-dot(d,d)/(r*r));
  let tangent=vec2f(-d.y,d.x)/max(r,1.0)*s.flow.z;
  value=vec4f(value.xy+(s.flow.xy+tangent)*vec2f(u.size)/vec2f(600,900)*weight,value.z+s.point.w*weight,0);
 }
 dst[k]=vec4f(clamp(value.xy,vec2f(-160),vec2f(160)),min(value.z,4.0),0);
}
@compute @workgroup_size(8,8) fn analyze(@builtin(global_invocation_id) gid:vec3u) {
 if(any(gid.xy>=u.size)){return;}let p=vec2i(gid.xy);
 let l=at(p-vec2i(1,0));let r=at(p+vec2i(1,0));let t=at(p-vec2i(0,1));let b=at(p+vec2i(0,1));
 aux[idx(p)]=vec2f(.5*(r.x-l.x+b.y-t.y),.5*(r.y-l.y-b.x+t.x));
}
@compute @workgroup_size(8,8) fn confine(@builtin(global_invocation_id) gid:vec3u) {
 if(any(gid.xy>=u.size)){return;}let p=vec2i(gid.xy);let k=idx(p);
 let gradient=.5*vec2f(abs(aux[idx(p+vec2i(1,0))].y)-abs(aux[idx(p-vec2i(1,0))].y),abs(aux[idx(p+vec2i(0,1))].y)-abs(aux[idx(p-vec2i(0,1))].y));
 let n=gradient/max(length(gradient),.0001);
 let force=vec2f(n.y,-n.x)*aux[k].y*16.0;
 dst[k]=vec4f(clamp(src[k].xy+force*u.dt,vec2f(-160),vec2f(160)),src[k].zw);
}
@compute @workgroup_size(8,8) fn jacobi(@builtin(global_invocation_id) gid:vec3u) {
 if(any(gid.xy>=u.size)){return;}let p=vec2i(gid.xy);let k=idx(p);
 nextPressure[k]=(pressure[idx(p-vec2i(1,0))]+pressure[idx(p+vec2i(1,0))]+pressure[idx(p-vec2i(0,1))]+pressure[idx(p+vec2i(0,1))]-aux[k].x)*.25;
}
@compute @workgroup_size(8,8) fn project(@builtin(global_invocation_id) gid:vec3u) {
 if(any(gid.xy>=u.size)){return;}let p=vec2i(gid.xy);let k=idx(p);
 let gradient=.5*vec2f(pressure[idx(p+vec2i(1,0))]-pressure[idx(p-vec2i(1,0))],pressure[idx(p+vec2i(0,1))]-pressure[idx(p-vec2i(0,1))]);
 var v=src[k].xy-gradient;
 if(p.x<1||p.x>=i32(u.size.x)-1){v.x=0;}
 if(p.y<1||p.y>=i32(u.size.y)-1){v.y=0;}
 dst[k]=vec4f(v,src[k].z,0);
}`;
const render = /* wgsl */`
struct View { size:vec2u, padding:vec2f };
@group(0) @binding(0) var<uniform> u:View;
@group(0) @binding(1) var<storage,read> field:array<vec4f>;
struct V { @builtin(position) position:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32)->V {let p=vec2f(f32((i<<1u)&2u),f32(i&2u));var v:V;v.position=vec4f(p*vec2f(2,-2)+vec2f(-1,1),0,1);v.uv=p;return v;}
fn density(p:vec2i)->f32 {let q=clamp(p,vec2i(0),vec2i(u.size)-1);return field[u32(q.y)*u.size.x+u32(q.x)].z;}
@fragment fn fs(v:V)->@location(0) vec4f {
 let p=v.uv*vec2f(u.size)-.5;let q=vec2i(floor(p));let f=fract(p);
 let d=mix(mix(density(q),density(q+vec2i(1,0)),f.x),mix(density(q+vec2i(0,1)),density(q+vec2i(1,1)),f.x),f.y);
 let a=min(.91,1.0-exp(-d*1.6));
 return vec4f(vec3f(.025,.032,.027)*a,a);
}`;

/** Small fixed simulation field independent of backing-store DPR. All buffers/groups are reused. */
export class FluidInk {
  readonly sources = new InkSources();
  readonly quality;
  private readonly fields: GPUBuffer[];
  private readonly pressures: GPUBuffer[];
  private readonly auxiliary: GPUBuffer;
  private readonly uniform: GPUBuffer;
  private readonly splats: GPUBuffer;
  private readonly renderUniform: GPUBuffer;
  private readonly pipelines: Record<string, GPUComputePipeline> = {};
  private readonly groups: GPUBindGroup[][];
  private readonly renderGroups: GPUBindGroup[];
  private readonly display: GPURenderPipeline;
  private current = 0;
  private previousTime = 0;
  private clear = true;
  private steps = 0;
  private activeUntil = 0;
  private readonly params = new ArrayBuffer(48);
  private readonly sourceData = new Float32Array(MAX_SPLATS*8);
  readonly bytes: number;
  constructor(private readonly engine: HaiyueEngine, compact: boolean) {
    const d=engine.device; this.quality=fluidQuality(compact);
    const cells=this.quality.width*this.quality.height;
    const make=(size:number,label:string)=>d.createBuffer({label,size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    this.fields=[make(cells*16,'Ink field A'),make(cells*16,'Ink field B')];
    this.pressures=[make(cells*4,'Ink pressure A'),make(cells*4,'Ink pressure B')];
    this.auxiliary=make(cells*8,'Ink divergence and curl');
    this.splats=make(MAX_SPLATS*32,'Ink sources');
    this.uniform=d.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.renderUniform=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const entries: GPUBindGroupLayoutEntry[] = [
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
      ...[1,2,3,4,5,6].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:([1,4,6].includes(binding)?'read-only-storage':'storage') as GPUBufferBindingType}})),
    ];
    const layout=d.createBindGroupLayout({entries});const pipelineLayout=d.createPipelineLayout({bindGroupLayouts:[layout]});
    const module=d.createShaderModule({label:'Ink stable fluid WGSL',code:compute});
    for(const entryPoint of ['advect','analyze','confine','jacobi','project']) this.pipelines[entryPoint]=d.createComputePipeline({layout:pipelineLayout,compute:{module,entryPoint}});
    this.groups=[0,1].map(f=>[0,1].map(p=>d.createBindGroup({layout,entries:[this.uniform,this.fields[f]!,this.fields[1-f]!,this.auxiliary,this.pressures[p]!,this.pressures[1-p]!,this.splats].map((buffer,binding)=>({binding,resource:{buffer}}))})));
    const rm=d.createShaderModule({label:'Ink density composite',code:render});
    this.display=d.createRenderPipeline({layout:'auto',vertex:{module:rm,entryPoint:'vs'},fragment:{module:rm,entryPoint:'fs',targets:[{format:engine.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},multisample:{count:engine.msaaSamples}});
    d.queue.writeBuffer(this.renderUniform,0,new Uint32Array([this.quality.width,this.quality.height,0,0]));
    this.renderGroups=this.fields.map(buffer=>d.createBindGroup({layout:this.display.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.renderUniform}},{binding:1,resource:{buffer}}]}));
    this.bytes=cells*48+MAX_SPLATS*32+64;
  }
  reset(): void {this.sources.reset();this.clear=true;this.previousTime=0;this.activeUntil=0;}
  simulate(encoder:GPUCommandEncoder,time:number): void {
    if(this.clear){for(const b of [...this.fields,...this.pressures,this.auxiliary])encoder.clearBuffer(b);this.clear=false;}
    const dt=time-this.previousTime;
    if(dt<1/this.quality.hz-1e-5)return;
    this.previousTime=time;
    const pending=this.sources.pending;
    if(pending.length)this.activeUntil=time+8;
    if(time>this.activeUntil)return;
    pending.forEach((s,i)=>this.sourceData.set([s.x+300,450-s.y,s.radius,s.ink,s.vx,-s.vy,s.swirl,0],i*8));
    const u32=new Uint32Array(this.params), f32=new Float32Array(this.params);
    u32[0]=this.quality.width;u32[1]=this.quality.height;f32[2]=Math.min(.05,dt);f32[3]=time;u32[4]=pending.length;
    const d=this.engine.device;d.queue.writeBuffer(this.uniform,0,this.params);
    if(pending.length)d.queue.writeBuffer(this.splats,0,this.sourceData,0,pending.length*8);
    pending.length=0;
    encoder.clearBuffer(this.pressures[0]!);encoder.clearBuffer(this.pressures[1]!);
    const pass=encoder.beginComputePass({label:'Ink fluid advection, curl, pressure'});
    const dispatch=(name:string,f:number,p=0)=>{pass.setPipeline(this.pipelines[name]!);pass.setBindGroup(0,this.groups[f]![p]!);pass.dispatchWorkgroups(Math.ceil(this.quality.width/8),Math.ceil(this.quality.height/8));};
    const a=this.current,b=1-a;
    dispatch('advect',a);dispatch('analyze',b);dispatch('confine',b);dispatch('analyze',a);
    let pressure=0;
    for(let i=0;i<this.quality.iterations;i++){dispatch('jacobi',a,pressure);pressure=1-pressure;}
    dispatch('project',a,pressure);pass.end();this.current=b;this.steps++;
  }
  draw(pass:GPURenderPassEncoder):void {pass.setPipeline(this.display);pass.setBindGroup(0,this.renderGroups[this.current]!);pass.draw(3);}
  snapshot(){return{...this.quality,steps:this.steps,bytes:this.bytes,pending:this.sources.pending.length,emitted:this.sources.emitted,impacts:this.sources.impacts,passesPerStep:this.quality.iterations+5};}
  async readDensity():Promise<{mass:number;occupied:number;finite:boolean}> {
    const d=this.engine.device,size=this.fields[this.current]!.size;
    const b=d.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{const e=d.createCommandEncoder();e.copyBufferToBuffer(this.fields[this.current]!,0,b,0,size);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const a=new Float32Array(b.getMappedRange());let mass=0,occupied=0,finite=true;for(let i=2;i<a.length;i+=4){const n=a[i]!;mass+=n;if(n>.01)occupied++;if(!Number.isFinite(n)||!Number.isFinite(a[i-1]!)||!Number.isFinite(a[i-2]!))finite=false;}b.unmap();return{mass,occupied,finite};}finally{b.destroy();}
  }
  destroy():void{for(const b of [...this.fields,...this.pressures,this.auxiliary,this.uniform,this.splats,this.renderUniform])b.destroy();}
}
