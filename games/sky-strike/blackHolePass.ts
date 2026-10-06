import type {HaiyueEngine} from '@haiyue/engine';
import {beginRenderCommandPass,type RenderCommandContext} from '@haiyue/engine/extension-authoring';
import type {IndexedSpritePlaneDescriptor} from '@haiyue/extensions/experimental/indexed-sprite';
import {BLACK_HOLE_BLAST_RADIUS,type SkyStrikeBlackHole} from './blackHole';
export type HoleVisual=ReturnType<SkyStrikeBlackHole['snapshot']>;
export function blackHolePortrait():IndexedSpritePlaneDescriptor {
  const size=256,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(x+0.5-size/2)/size,dy=(y+0.5-size/2)/size,r=Math.hypot(dx,dy),e=Math.hypot(dx,dy*3.2);
    const ring=Math.exp(-Math.abs(r-.19)*180),disk=Math.exp(-Math.abs(e-.3)*70),a=Math.atan2(dy,dx);
    const glow=Math.max(ring,disk*(.65+.35*Math.sin(a*8+r*150))),shadow=r<.175;
    const i=(y*size+x)*4;pixels[i]=shadow?1:Math.min(255,glow*255);pixels[i+1]=shadow?2:Math.min(255,glow*165);pixels[i+2]=shadow?8:Math.min(255,glow*85+ring*100);pixels[i+3]=shadow?255:Math.round(Math.min(1,glow*2)*255);
  }
  return{id:'fx:black-hole',width:size,height:size,format:'rgba8',pixels};
}
const shader=/* wgsl */`
struct Params {screen:vec4f,hole:vec4f,stage:vec4f,view:vec4f};
@group(0) @binding(0) var scene:texture_2d<f32>;
@group(0) @binding(1) var linearSampler:sampler;
@group(0) @binding(2) var<uniform> u:Params;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
  let x=f32((i<<1u)&2u);let y=f32(i&2u);return vec4f(x*2.0-1.0,1.0-y*2.0,0.0,1.0);
}
@fragment fn fs(@builtin(position) frag:vec4f)->@location(0) vec4f {
  let uv=frag.xy/u.screen.xy;let pixel=uv*u.screen.zw;
  let d=(pixel-u.hole.xy)/u.view.x;let dist=max(0.01,length(d));let dir=d/dist;
  let r=u.hole.z;let t=u.hole.w;let feeding=u.stage.x;let warning=u.stage.y;let wave=u.stage.z;
  var warped=pixel;
  let influence=1.0-smoothstep(r*1.3,r*5.5,dist);
  let lens=feeding*influence*r*r/(dist+12.0)*0.8;
  let tangent=vec2f(-dir.y,dir.x);
  warped+=(dir*lens+tangent*lens*0.2)*u.view.x;
  let waveRadius=wave*1150.0;
  let front=exp(-pow((dist-waveRadius)/38.0,2.0))*select(0.0,1.0,wave>0.0);
  warped+=dir*sin((dist-waveRadius)*.065)*front*42.0*u.view.x*(1.0-wave);
  let sampleUV=clamp(warped/u.screen.zw,vec2f(0.001),vec2f(0.999));
  var color=textureSampleLevel(scene,linearSampler,sampleUV,0.0).rgb;
  let a=atan2(d.y,d.x);
  let ellipse=length(vec2f(d.x,d.y*3.4));
  let bands=.62+.23*sin(a*11.0+t*3.0+dist*.13)+.15*sin(a*23.0-t*5.0);
  let disk=exp(-abs(ellipse-r*1.95)/max(3.0,r*.10))*bands;
  let halo=exp(-abs(dist-r*1.1)/max(2.0,r*.045));
  let wisps=exp(-abs(dist-r*1.6)/max(8.0,r*.35))*pow(max(0.0,sin(a*3.0+log(dist+1.0)*9.0-t*2.0)),10.0);
  color+=feeding*(vec3f(1.7,.75,.2)*disk+vec3f(.55,.7,1.5)*halo+vec3f(.18,.10,.35)*wisps);
  let shadow=1.0-smoothstep(r*.96,r*1.02,dist);
  color=mix(color,vec3f(.001,.002,.007),shadow*feeding);
  let danger=select(0.0,1.0,dist<=u.view.w);
  let pulse=.5+.5*sin(t*17.0);
  color+=warning*danger*vec3f(.16,.025,.035)*pulse;
  let boundary=exp(-abs(dist-u.view.w)/2.5);
  color+=warning*boundary*vec3f(1.2,.18,.08);
  color+=warning*feeding*exp(-abs(dist-r*1.45)/4.0)*vec3f(.4,1.1,1.8)*pulse;
  let flash=select(0.0,pow(max(0.0,1.0-wave*8.0),3.0),wave>0.0);
  color+=flash*exp(-dist/270.0)*vec3f(2.1,2.4,3.0);
  color+=front*(1.0-wave)*vec3f(.4,1.4,2.4);
  let echo=exp(-pow((dist-waveRadius*.82)/18.0,2.0))*select(0.0,1.0,wave>0.0);
  color+=echo*(1.0-wave)*vec3f(.7,.2,1.0);
  if(pixel.x<u.view.y||pixel.x>u.view.z){return vec4f(0.0,0.0,0.0,1.0);}
  return vec4f(color,1.0);
}`;
/** One scene resolve and one fullscreen lensing pass; GUI is rendered afterwards, undistorted. */
export class SkyStrikeBlackHolePass {
  private scene:GPUTexture|null=null;private multisample:GPUTexture|null=null;private bindGroup:GPUBindGroup|null=null;
  private readonly pipeline:GPURenderPipeline;private readonly uniform:GPUBuffer;private readonly sampler:GPUSampler;
  private width=0;private height=0;private passes=0;
  constructor(private readonly engine:HaiyueEngine){
    const device=engine.device,module=device.createShaderModule({label:'SkyStrike.black-hole.wgsl',code:shader});
    this.pipeline=device.createRenderPipeline({label:'SkyStrike.black-hole',layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:engine.format}]},primitive:{topology:'triangle-list'},multisample:{count:engine.msaaSamples}});
    this.uniform=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.sampler=device.createSampler({minFilter:'linear',magFilter:'linear'});
  }
  record(context:RenderCommandContext,visual:HoleVisual,view:{scale:number;left:number;width:number;cameraX:number},draw:(pass:GPURenderPassEncoder)=>void):void {
    const e=this.engine;
    if(this.width!==e.width||this.height!==e.height){this.releaseTargets();this.width=e.width;this.height=e.height;
      this.scene=e.device.createTexture({label:'SkyStrike.lens.scene',size:[e.width,e.height],format:e.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
      if(e.msaaSamples>1)this.multisample=e.device.createTexture({label:'SkyStrike.lens.msaa',size:[e.width,e.height],format:e.format,sampleCount:e.msaaSamples,usage:GPUTextureUsage.RENDER_ATTACHMENT});
      this.bindGroup=e.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.scene.createView()},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.uniform}}]});
    }
    const attachment:GPURenderPassColorAttachment={view:(this.multisample??this.scene!).createView(),loadOp:'clear',storeOp:this.multisample?'discard':'store',clearValue:{r:0,g:0,b:0,a:1},...(this.multisample?{resolveTarget:this.scene!.createView()}:{})};
    const offscreen=context.encoder.beginRenderPass({label:'SkyStrike.lens.source',colorAttachments:[attachment]});draw(offscreen);offscreen.end();
    const active=visual.phase==='feeding'||visual.phase==='warning';
    e.device.queue.writeBuffer(this.uniform,0,new Float32Array([e.width,e.height,e.displayWidth,e.displayHeight,
      view.left+(visual.x-view.cameraX)*view.scale,visual.y*view.scale,visual.radius,visual.ageMs/1000,
      active?1:0,visual.phase==='warning'?1:0,visual.phase==='wave'?Math.max(.0001,visual.phaseMs/3200):0,visual.progress,
      view.scale,view.left,view.left+view.width,BLACK_HOLE_BLAST_RADIUS]));
    const {passEncoder,ownsPass}=beginRenderCommandPass(context);passEncoder.setPipeline(this.pipeline);passEncoder.setBindGroup(0,this.bindGroup!);passEncoder.draw(3);if(ownsPass)passEncoder.end();this.passes++;
  }
  releaseTargets():void{this.scene?.destroy();this.multisample?.destroy();this.scene=null;this.multisample=null;this.bindGroup=null;this.width=0;this.height=0;}
  stats(){return{passes:this.passes,targetBytes:this.width*this.height*4*(1+this.engine.msaaSamples),shader:'gravitational-lens-and-wave'};}
  destroy():void{this.releaseTargets();this.uniform.destroy();}
}
