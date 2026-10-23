import type { HaiyueEngine } from '@haiyue/engine';
const WGSL = /* wgsl */`
struct Drop { p:vec4f };
struct Params { time:f32, count:f32, pad:vec2f };
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read> drops:array<Drop>;
struct V { @builtin(position) pos:vec4f, @location(0) uv:vec2f };
fn hash(p:vec2f)->f32 {return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn noise(p:vec2f)->f32 {let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2f(1,0)),u.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1,1)),u.x),u.y);}
fn fbm(p:vec2f)->f32{return noise(p)*.57+noise(p*2.03+7.)*.28+noise(p*4.1)*.15;}
@vertex fn vs(@builtin(vertex_index) i:u32)->V {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var v:V;v.pos=vec4f(p[i],0,1);v.uv=p[i]*vec2f(.5,-.5)+.5;return v;}
@fragment fn fs(v:V)->@location(0) vec4f {
 let pixel=v.uv*vec2f(600,1200);var alpha=0.;
 for(var i=0u;i<u32(params.count);i++){
  let d=drops[i].p;let age=params.time-d.z;
  let p=(pixel-d.xy)/d.w;let radius=.12+sqrt(max(0.,age))*.85;
  if(length(p)>radius+.5){continue;}
  let flow=vec2f(fbm(p*3.+vec2f(age*.9,0)),fbm(p*3.7-vec2f(0,age*.6)))-.5;
  let q=p+flow*(.18+age*.17);let r=length(q);
  let edge=radius+(fbm(q*7.-age*.4)-.5)*.26;
  let body=(1.-smoothstep(edge-.2,edge+.1,r))*.24;
  let tendril=exp(-abs(r-edge)*23.)*(.22+fbm(q*15.+age)*.45);
  let fade=smoothstep(0.,.07,age)*(1.-smoothstep(.22,1.4,age));
  alpha=max(alpha,(body+tendril)*fade);
 }
 return vec4f(vec3f(.05,.075,.057),alpha);
}`;
const SKIN_WGSL = WGSL.slice(0,WGSL.indexOf('@fragment'))
  .replace('@group(0) @binding(1) var<storage,read> drops:array<Drop>;', '@group(0) @binding(1) var paint:texture_2d<f32>; @group(0) @binding(2) var linearSampler:sampler;') + /* wgsl */`
@fragment fn fs(v:V)->@location(0) vec4f {
 let t=params.time;let uv=v.uv;
 let flow=vec2f(fbm(uv*9.+t*.065),fbm(uv*11.-t*.05))-.5;
 let grain=noise(uv*vec2f(31,17));
 let warped=uv+flow*.014;let source=textureSampleLevel(paint,linearSampler,warped,0);
 let radius=(.008+(.5+.5*sin(t*.55+grain*5.))*.014)*(.45+grain);
 var halo=0.;
 for(var i=0;i<4;i++){let angle=f32(i)*1.5707963;halo+=textureSampleLevel(paint,linearSampler,warped+vec2f(cos(angle),sin(angle))*radius,0).a*.25;}
 let alpha=clamp(source.a+halo*.34*(1.-source.a),0.,1.);
 return vec4f(mix(vec3f(.12,.14,.11),source.rgb,source.a),alpha);
}`;
interface InkSkin {source:GPUTexture; texture:GPUTexture; uniform:GPUBuffer; group:GPUBindGroup; width:number;height:number}
/** Fixed half-resolution texture, composited by GuiImage on the engine's device. */
export class InkGuiEffects {
  readonly texture: GPUTexture;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniform: GPUBuffer;
  private readonly storage: GPUBuffer;
  private readonly group: GPUBindGroup;
  private readonly data = new Float32Array(32);
  private readonly params = new Float32Array(4);
  private drops: Array<{x:number;y:number;since:number;size:number}> = [];
  private needsClear = true;
  passes = 0;
  private skinPipeline:GPURenderPipeline | null=null;
  private skins=new Map<string,InkSkin>();
  private lastSkinTime=-100;
  skinPasses=0;
  constructor(private engine: HaiyueEngine) {
    const d=engine.device;
    this.texture=d.createTexture({label:'GUI ink blooms',size:[300,600],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
    this.uniform=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.storage=d.createBuffer({size:this.data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    const module=d.createShaderModule({label:'Button ink dissolving in water',code:WGSL});
    this.pipeline=d.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]}});
    this.group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.storage}}]});
  }
  initSkins(score:HTMLImageElement,drop:HTMLImageElement):void {
    const d=this.engine.device,module=d.createShaderModule({label:'GUI ink contour diffusion',code:SKIN_WGSL});
    this.skinPipeline=d.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]}});
    const sampler=d.createSampler({minFilter:'linear',magFilter:'linear'});
    for(const [key,img,width,height] of [['score',score,600,200],['drop',drop,200,200]] as const){
      const source=d.createTexture({size:[img.naturalWidth,img.naturalHeight],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
      d.queue.copyExternalImageToTexture({source:img},{texture:source},[img.naturalWidth,img.naturalHeight]);
      const texture=d.createTexture({label:`GUI ${key} ink skin`,size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
      const uniform=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      const group=d.createBindGroup({layout:this.skinPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:source.createView()},{binding:2,resource:sampler}]});
      this.skins.set(key,{source,texture,uniform,group,width,height});
    }
    this.renderSkins(0,true);
  }
  skin(key:string):GPUTexture|undefined{return this.skins.get(key)?.texture;}
  renderSkins(time:number,force=false):void {
    if(!this.skinPipeline||(!force&&time-this.lastSkinTime<1/30))return;
    this.lastSkinTime=time;const d=this.engine.device,e=d.createCommandEncoder({label:'GUI ink skins at 30 Hz'});
    for(const s of this.skins.values()){
      d.queue.writeBuffer(s.uniform,0,new Float32Array([time,0,0,0]));
      const p=e.beginRenderPass({colorAttachments:[{view:s.texture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
      p.setPipeline(this.skinPipeline);p.setBindGroup(0,s.group);p.draw(3);p.end();this.skinPasses++;
    }
    d.queue.submit([e.finish()]);
  }
  async verifySkins():Promise<{changed:number;transparent:number;opaque:number}> {
    const d=this.engine.device,s=this.skins.get('score')!,stride=Math.ceil(s.width*4/256)*256;
    const readback=d.createBuffer({size:stride*s.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const capture=async(time:number)=>{this.renderSkins(time,true);const e=d.createCommandEncoder();e.copyTextureToBuffer({texture:s.texture},{buffer:readback,bytesPerRow:stride},[s.width,s.height]);d.queue.submit([e.finish()]);await readback.mapAsync(GPUMapMode.READ);const out=new Uint8Array(readback.getMappedRange()).slice();readback.unmap();return out;};
    const saved=this.lastSkinTime;
    try{const a=await capture(0),b=await capture(6);let changed=0,transparent=0,opaque=0;
      for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const i=y*stride+x*4+3;if(Math.abs(a[i]!-b[i]!)>3)changed++;if(a[i]!<8)transparent++;if(a[i]!>240&&b[i]!>240)opaque++;}
      return{changed,transparent,opaque};
    }finally{readback.destroy();this.renderSkins(saved,true);}
  }
  burst(x:number,y:number,time:number,size:number):void {if(this.drops.length===8)this.drops.shift();this.drops.push({x,y,since:time,size});}
  render(time:number):void {
    this.drops=this.drops.filter(d=>time-d.since<1.4);
    if(!this.drops.length&&!this.needsClear)return;
    this.drops.forEach((d,i)=>this.data.set([d.x,d.y,d.since,d.size],i*4));
    this.params.set([time,this.drops.length,0,0]);
    const d=this.engine.device;d.queue.writeBuffer(this.uniform,0,this.params);d.queue.writeBuffer(this.storage,0,this.data);
    const encoder=d.createCommandEncoder({label:'GUI press ink'});
    const pass=encoder.beginRenderPass({colorAttachments:[{view:this.texture.createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
    if(this.drops.length){pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.draw(3);}pass.end();d.queue.submit([encoder.finish()]);
    this.needsClear=this.drops.length>0;this.passes++;
  }
  get active():number{return this.drops.length;}
  async inspect():Promise<{occupied:number;alpha:number}> {
    const d=this.engine.device, bytesPerRow=1280;
    const buffer=d.createBuffer({size:bytesPerRow*600,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const e=d.createCommandEncoder();e.copyTextureToBuffer({texture:this.texture},{buffer,bytesPerRow},[300,600]);d.queue.submit([e.finish()]);
    try{await buffer.mapAsync(GPUMapMode.READ);const p=new Uint8Array(buffer.getMappedRange());let occupied=0,alpha=0;for(let y=0;y<600;y++)for(let x=0;x<300;x++){const a=p[y*bytesPerRow+x*4+3]!;if(a>4)occupied++;alpha+=a;}return{occupied,alpha};}finally{buffer.unmap();buffer.destroy();}
  }
  dispose():void{for(const s of this.skins.values()){s.source.destroy();s.texture.destroy();s.uniform.destroy();}this.skins.clear();this.texture.destroy();this.uniform.destroy();this.storage.destroy();}
}
