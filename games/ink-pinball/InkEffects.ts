import type { HaiyueEngine } from '@haiyue/engine';
import { System, type World } from '@haiyue/engine/ecs';
import { beginRenderCommandPass, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { FluidInk } from './FluidInk';
import { BUMPERS } from '../pinball/rules';
import { WaterEvents, SPLASH_LIFETIME, RIPPLE_LIFETIME, type WaterSource } from './waterModel';

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
 let p=item.rect.xy+vec2f(0,view.padding)+vec2f(local.x*c-local.y*s,local.x*s+local.y*c);
 var out:Vertex;out.pos=vec4f(p/view.size*vec2f(2,-2)+vec2f(-1,1),0,1);out.uv=uv;out.index=instance;return out;
}
@fragment fn fs(v:Vertex)->@location(0) vec4f {
 let item=items[v.index]; let uv=v.uv; let age=item.fx.y;let kind=item.fx.z;
 if(kind>8.5){
  // Domain-warped mist circulates around the pearl; its painted centre stays clear.
  let p=(uv-.5)*2.0;let r=length(p);let angle=atan2(p.y,p.x);
  let t=view.time*.48+item.fx.w;
  let flow=fbm(p*3.8+vec2f(cos(t),sin(t))*.8);
  let edge=.76+(flow-.5)*.19;
  let ring=exp(-pow((r-edge)*18.0,2.0));
  let strand=.5+.5*sin(angle*3.0-t*2.0+flow*8.0);
  let grain=noise(p*16.0+vec2f(-t,t*.6));
  let fringe=exp(-pow((r-.85-(grain-.5)*.15)*10.0,2.0))*.16;
  let mask=smoothstep(.57,.65,r)*(1.0-smoothstep(.9,1.0,r));
  let a=(ring*(.14+strand*.3)+fringe)*mask;
  return vec4f(mix(vec3f(.16,.27,.22),vec3f(.53,.61,.44),strand)*a,a);
 }
 if(kind>7.5){
  // One local quad per impact: ballistic droplets, a short upward jet and wet outlines.
  let p=(uv-vec2f(.5,.76))*vec2f(180,150);
  var water=0.0;var outline=0.0;
  for(var i=0;i<12;i++){
   let seed=f32(i);let h=hash(vec2f(seed+item.fx.w,7.3));
   let t=max(0.0,age*.95-h*.055);
   let vx=(seed/11.0*2.0-1.0)*(100.0+h*50.0);
   let vy=180.0+h*95.0;
   let centre=vec2f(vx*t,-vy*t+330.0*t*t);
   let direction=normalize(vec2f(vx,-vy+660.0*t));let delta=p-centre;
   let q=vec2f(dot(delta,vec2f(-direction.y,direction.x)),dot(delta,direction)/1.8);
   let r=1.3+h*1.2;let distance=length(q);
   let fade=(1.0-smoothstep(.66,.95,age))*(1.0-smoothstep(-1.0,8.0,centre.y));
   outline=max(outline,(1.0-smoothstep(r,r+.6,distance))*fade);
   water=max(water,(1.0-smoothstep(r-.5,r,distance))*fade);
  }
  let height=65.0*sin(clamp(age/.45,0.0,1.0)*3.14159265);
  let jet=(1.0-smoothstep(2.0,5.5,abs(p.x+sin(p.y*.11)*2.0)))
    *smoothstep(-height-2.0,-height+3.0,p.y)*(1.0-smoothstep(-2.0,2.0,p.y))
    *(1.0-smoothstep(.3,.48,age));
  water=max(water,jet*.75);outline=max(outline,jet);
  let a=outline*.85;let tint=mix(vec3f(.22,.29,.27),vec3f(.96,.97,.9),water/max(outline,.001));
  return vec4f(tint*a,a);
 }
 if(kind>6.5){
  // Perspective river mask keeps the moving surface off the painted banks.
  let bank=1.0-smoothstep(.26+uv.y*.15,.34+uv.y*.16,abs(uv.x-.5));
  let fade=smoothstep(0.0,.13,uv.y)*(1.0-smoothstep(.85,1.0,uv.y))*bank;
  let distortion=noise(uv*vec2f(15,24)+vec2f(view.time*.06,0.0));
  let wave=sin(uv.y*145.0+sin(uv.x*24.0+view.time*.32)*1.1-view.time*1.8+distortion*2.0);
  var rings=0.0;
  for(var i=0;i<3;i++){
   let n=f32(i);let centre=vec2f(.37+.12*sin(n*7.0),.3+n*.26);
   let phase=fract(view.time*.19+n*.33);let d=length((uv-centre)*vec2f(1,3.2));
   rings+=exp(-pow((d-phase*.43-.025)*140.0,2.0))*sin(phase*3.14159265);
  }
  let light=pow(max(0.0,wave),12.0)*.22;
  let dark=pow(max(0.0,-wave),16.0)*.10+rings*.25;
  let a=(light+dark)*fade;
  return vec4f(mix(vec3f(.24,.31,.29),vec3f(.98,.97,.9),light/max(light+dark,.001))*a,a);
 }
 if(kind>5.5){
  let p=(uv-.5)*2.0;let d=length(p)+noise(uv*19.0)*.012;
  var rings=0.0;
  for(var i=0;i<3;i++){
   let radius=age*.87+.05-f32(i)*.115;
   rings+=exp(-pow((d-radius)*100.0,2.0))*smoothstep(0.0,.08,radius);
  }
  let broken=.65+.35*noise(uv*35.0);
  let a=rings*pow(max(0.0,1.0-age),1.2)*broken*.6;
  return vec4f(vec3f(.20,.29,.27)*a,a);
 }
 if(kind>4.5){
  if(item.fx.w>.5){
   // Follow the right-hand painted cascade, then split around the lower rock.
   let axis=.65-uv.y*.30+sin(uv.y*12.0)*.025;
   let main=exp(-pow((uv.x-axis)/.115,2.0));
   let tributary=exp(-pow((uv.x-(axis+.23))/.065,2.0))*smoothstep(.35,.65,uv.y);
   let channel=main+tributary*.55;
   let flow=fbm(vec2f(uv.x*27.0,uv.y*9.0-view.time*2.2));
   let ribbons=.5+.5*sin(uv.y*66.0-view.time*19.0+noise(vec2f(uv.x*23.0,2.1))*5.0);
   let fade=smoothstep(.02,.13,uv.y)*(1.0-smoothstep(.85,1.0,uv.y));
   let light=channel*(.22+pow(ribbons,4.0)*.46+flow*.32)*fade;
   let dark=channel*(1.0-ribbons)*smoothstep(.35,.8,flow)*.16*fade;
   let foam=exp(-pow((uv.y-.90)*16.0,2.0)-pow((uv.x-.43)*4.0,2.0))
     *smoothstep(.38,.72,noise(uv*vec2f(23,31)-vec2f(0,view.time*2.0)))*.28;
   let a=min(.88,light+dark+foam);
   let tint=mix(vec3f(.26,.31,.28),vec3f(.97,.97,.9),(light+foam)/max(light+dark+foam,.001));
   return vec4f(tint*a,a);
  }

  let axis=.5+sin(uv.y*8.0)*.08;
  let edge=1.0-smoothstep(.18,.5,abs(uv.x-axis));
  let stream=fbm(vec2f(uv.x*19.0,uv.y*8.0-view.time*2.4));
  let strands=pow(.5+.5*sin(uv.x*100.0+stream*6.0),3.0);
  let a=edge*smoothstep(0.0,.1,uv.y)*(1.0-smoothstep(.8,1.0,uv.y))*(.12+strands*.45+stream*.2);
  return vec4f(vec3f(.96,.96,.88)*a,a);
 }
 if(kind>3.5){
  let cloud=fbm(uv*vec2f(5,3)+vec2f(view.time*.028,-view.time*.015));
  let mask=exp(-dot((uv-.5)*vec2f(2.3,3.2),(uv-.5)*vec2f(2.3,3.2)));
  let a=mask*smoothstep(.24,.72,cloud)*.23;
  return vec4f(vec3f(.92,.925,.86)*a,a);
 }
 if(kind>2.5){let a=textureSampleLevel(brush,linearSampler,uv,0).a*.48;return vec4f(vec3f(.28,.32,.26)*a,a);}
 let grain=noise(uv*vec2f(31,17)+item.rect.xy*.09);
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
  for(var i=0;i<4;i++){
   let a=f32(i)*1.5707963;let offset=vec2f(cos(a),sin(a))*radius*vec2f(.55,1.6);
   bloom+=textureSampleLevel(brush,linearSampler,warped+offset,0).a/4.0;
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

/** Shared-device scene pass: fluid wake, ink ball, pale rails and living landscape effects. */
export class InkEffects extends System {
  private fluid!: FluidInk;
  private readonly water = new WaterEvents();
  private ballVisible = true;
  ambient = true;
  private atmosphereTime = 0;
  private readonly mainParams = new Float32Array(4);
  private time = 0; private ball = { x: 235, y: -321 }; private passes = 0;
  private texture!: GPUTexture;
  private mainPipeline!: GPURenderPipeline; private uiPipeline!: GPURenderPipeline;
  private mainUniform!: GPUBuffer;
  private mainItems!: GPUBuffer;
  private mainGroup!: GPUBindGroup;
  private readonly data = new Float32Array(64 * 8);
  private readonly rails: number[][] = [];
  private readonly hiddenRails = new Set<number>();
  constructor(private readonly engine: HaiyueEngine) {
    super(() => false); this.priority = 20; this.name = 'Ink diffusion shader';
  }
  async init(): Promise<void> {
    const device = this.engine.device;
    this.fluid = new FluidInk(this.engine, matchMedia("(max-width: 600px)").matches);
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
    this.mainItems = device.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const group = (pipeline: GPURenderPipeline, uniform: GPUBuffer, items: GPUBuffer) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: items } }, { binding: 2, resource: this.texture.createView() }, { binding: 3, resource: sampler }] });
    this.mainGroup = group(this.mainPipeline, this.mainUniform, this.mainItems);
  }
  addRail(x: number, y: number, length: number, width: number, angle: number): number {
    if (this.rails.length >= 32) throw new Error('Ink rail capacity exceeded');
    this.rails.push([x + 300, 450 - y, length * 1.12 + 8, width * 2.7, angle, 0, 3, 0]);
    return this.rails.length - 1;
  }
  setRailVisible(index: number, visible: boolean): void { if (visible) this.hiddenRails.delete(index); else this.hiddenRails.add(index); }
  sample(time: number, x: number, y: number, playing: boolean): void { this.fluid.sources.sample(time, x, y, playing); }
  impact(x:number,y:number,strength=1):void {this.fluid.sources.impact(x,y,strength);}
  ripple(x:number,y:number):void {this.water.ripple(x,y,this.time);}
  splash(x:number,y:number,strength:number,source:WaterSource,time=this.time):void {this.water.splash(x,y,time,strength,source);}
  sync(time: number, x: number, y: number, visible=true): void { if(this.ambient)this.atmosphereTime=time; this.time = time; this.ball = { x, y }; this.ballVisible=visible; }
  reset(): void { this.fluid.reset(); this.water.reset(); this.atmosphereTime=0; }
  record(_world: World, context: RenderCommandContext): this {
    const device = this.engine.device;
    this.fluid.simulate(context.encoder,this.time);
    let count = 0;
    for(const item of [[295,320,450,170,0,0,4,0],[320,500,480,180,0,0,4,0],[96,385,27,127,0,0,5,0],[550,523,42,168,0,0,5,1]])this.data.set(item,count++*8);
    this.data.set([300,728,480,330,0,0,7,0],count++*8);
    this.water.advance(this.time);
    for(const r of this.water.ripples){const age=(this.time-r.since)/RIPPLE_LIFETIME;this.data.set([r.x+300,450-r.y,180*r.strength,44*r.strength,0,age,6,0],count++*8);}
    BUMPERS.forEach((b, i) => { const size = b.radius * 2 + 30; this.data.set([b.x+300,450-b.y,size,size,0,0,9,i*2.1],count++*8); });
    const atmosphereCount=count;
    this.rails.forEach((rail, i) => { if (!this.hiddenRails.has(i)) this.data.set(rail, count++ * 8); });
    if(this.ballVisible)this.data.set([this.ball.x + 300, 450 - this.ball.y, 38, 38, 0, 0, 1, 0], count++ * 8);
    for(const s of this.water.splashes){const age=(this.time-s.since)/SPLASH_LIFETIME;this.data.set([s.x+300,450-s.y-39*s.strength,180*s.strength,150*s.strength,0,age,8,s.since],count++*8);}
    this.mainParams.set([600,1200,this.atmosphereTime,150]);
    device.queue.writeBuffer(this.mainUniform, 0, this.mainParams);
    device.queue.writeBuffer(this.mainItems, 0, this.data,0,count*8);
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);
    passEncoder.setPipeline(this.mainPipeline); passEncoder.setBindGroup(0, this.mainGroup); passEncoder.draw(6, atmosphereCount);
    const w=this.engine.canvas!.width,h=this.engine.canvas!.height;
    passEncoder.setViewport(0,h*.125,w,h*.75,0,1);
    this.fluid.draw(passEncoder);
    passEncoder.setViewport(0,0,w,h,0,1);
    passEncoder.setPipeline(this.mainPipeline); passEncoder.setBindGroup(0, this.mainGroup); passEncoder.draw(6,count-atmosphereCount,0,atmosphereCount);
    if (ownsPass) passEncoder.end();
    this.passes++;return this;
  }
  verifyFluid(){return this.fluid.readDensity();}
  /** Offscreen fixture verifies actual alpha evolution, not just shader submission. */
  async verifyDiffusion(kind=2): Promise<{ changed: number; transparent: number; opaque: number }> {
    const device = this.engine.device;
    const target = device.createTexture({ size: [256, 128], format: this.engine.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const items = device.createBuffer({ size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const readback = device.createBuffer({ size: 256 * 128 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const group = device.createBindGroup({ layout: this.uiPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: items } }, { binding: 2, resource: this.texture.createView() }, { binding: 3, resource: device.createSampler({ minFilter: 'linear', magFilter: 'linear' }) }] });
    const capture = async (time: number) => {
      device.queue.writeBuffer(items, 0, new Float32Array([128,64,240,170,0,kind===8?(time===0?.16:.5):0,kind,1.7]));
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
  snapshot() { return { shader: 'stable-fluid-advection-vorticity-pressure', passes: this.passes, fluid: this.fluid.snapshot(), sceneViewport: [600,1200], railOpacity: .48, atmosphere:{orbAuras:3,openGates:this.hiddenRails.size,waterfalls:2,fogBanks:2,riverSurfaces:1,ripples:this.water.ripples.length,splashes:this.water.splashes.length,waterEntries:{...this.water.counts}} }; }
  override destroy(): this {
    this.texture?.destroy(); this.mainUniform?.destroy(); this.mainItems?.destroy(); this.fluid?.destroy();
    return super.destroy();
  }
}
