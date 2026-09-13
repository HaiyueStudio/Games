import type {HaiyueEngine} from '@haiyue/engine';
import {MAX_FLAME_PACKETS,type FlameCone,type FlameNozzle} from './flames';
export interface LavaCore {x:number;y:number;width:number;height:number;rotation:number}

export const FLAME_WGSL=/* wgsl */`
struct View { screen:vec4f, camera:vec4f };
@group(0) @binding(0) var<uniform> u:View;
struct Input { @location(0) pose:vec4f,@location(1) band:vec4f,@location(2) effect:vec4f };
struct Out { @builtin(position) position:vec4f,@location(0) local:vec2f,@location(1) @interpolate(flat) band:vec4f,@location(2) @interpolate(flat) effect:vec4f };
@vertex fn vs(@builtin(vertex_index) i:u32,v:Input)->Out {
 let corners=array<vec2f,6>(vec2f(-1.,0.),vec2f(1.,0.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,0.),vec2f(1.,1.));
 let q=corners[i];var p=vec2f(q.x*v.pose.w,q.y*v.band.y);
 if(v.effect.z>0.5){p=vec2f(q.x*v.pose.w,(q.y-.5)*v.band.y);}
 let forward=vec2f(cos(v.pose.z),sin(v.pose.z));let side=vec2f(forward.y,-forward.x);
 let world=v.pose.xy+side*p.x+forward*p.y;
 let pixel=vec2f(u.camera.x+(world.x-u.camera.y+u.camera.z)*u.screen.z,(world.y+u.camera.w)*u.screen.z);
 var o:Out;o.position=vec4f(pixel/u.screen.xy*vec2f(2.,-2.)+vec2f(-1.,1.),0.,1.);o.local=p;o.band=v.band;o.effect=v.effect;return o;
}
fn hash(p:vec2f)->f32 {return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn noise(p:vec2f)->f32 {let i=floor(p);let f=fract(p);let s=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2f(1.,0.)),s.x),mix(hash(i+vec2f(0.,1.)),hash(i+vec2f(1.,1.)),s.x),s.y);}
fn fbm(p:vec2f)->f32 {var q=p;var n=0.;var a=.57;for(var j=0;j<4;j++){n+=a*noise(q);q=mat2x2f(.8,.6,-.6,.8)*q*2.07+vec2f(3.7,8.1);a*=.48;}return n;}
@fragment fn fs(v:Out)->@location(0) vec4f {
 let p=v.local;let t=v.effect.x;let seed=v.effect.y;
 if(v.effect.z>1.5){
  // Confine animated molten cells to the glass window, inside the metal frame.
  let uv=vec2f(p.x/v.band.z,p.y/v.band.y*2.);
  let mask=(1.-smoothstep(.75,1.,abs(uv.x)))*(1.-smoothstep(.80,1.,abs(uv.y)));
  let flow=vec2f(uv.x*2.3,uv.y*3.2-t*.65);
  let warp=vec2f(fbm(flow+vec2f(t*.21,0.)),fbm(flow+vec2f(9.,t*.14)));
  let n=fbm(flow+warp*2.8);
  let veins=pow(max(0.,1.-abs(n-.53)*9.),3.);
  let pulse=.88+.12*sin(t*2.1);
  let color=mix(vec3f(.95,.055,.002),vec3f(1.7,.53,.025),n)*pulse+vec3f(1.1,.8,.22)*veins;
  let alpha=mask*.76;
  return vec4f(color*alpha,alpha);
 }
 if(v.effect.z>0.5){
  // Cylindrical UV unwrap: scrolling the angular coordinate rotates the vent sleeve.
  let nx=clamp(p.x/v.band.z,-1.,1.);let ny=p.y/v.band.y+.5;
  let uv=vec2f(asin(nx)/3.14159+t*.8,ny);
  let slot=1.-smoothstep(.20,.29,abs(fract(uv.x*7.)-.5));
  let ends=smoothstep(.08,.22,ny)*(1.-smoothstep(.78,.92,ny));
  let light=sqrt(max(0.,1.-nx*nx));let grain=noise(uv*vec2f(91.,67.));
  let metal=vec3f(.37,.22,.09)*(.3+.85*light)+grain*.055;
  let hot=vec3f(1.8,.3,.012)*(.6+.3*noise(vec2f(uv.x*8.,ny*9.-t*3.)))*v.effect.w;
  let color=mix(metal,hot,slot*ends)*(1.-smoothstep(.75,1.,abs(nx)));
  return vec4f(color,1.-smoothstep(.9,1.,abs(nx)));
 }
 let d=length(p);let angle=abs(atan2(p.x,max(.001,p.y)));
 if(d<v.band.x||d>v.band.y||angle>v.band.z){discard;}
 let along=d/max(1.,v.band.w);let flow=vec2f(p.x*.042,d*.032-t*4.7+seed);
 let warp=vec2f(fbm(flow*.7+vec2f(t*.35,seed)),fbm(flow*.83+vec2f(12.3,-t*.28)))-.5;
 let turbulence=fbm(flow+warp*3.8);
 let tongues=fbm(vec2f(p.x*.08+warp.x*2.,d*.012-t*2.8));
 let edge=angle/max(.01,v.band.z);
 let envelope=1.-smoothstep(.56+turbulence*.22,1.,edge);
 let holes=smoothstep(.18,.65,turbulence+(.5-tongues)*.28);
 let front=1.-smoothstep(.85,1.,along);
 let bandWidth=max(1.,v.band.y-v.band.x);
 let bandFade=smoothstep(0.,bandWidth*.4,d-v.band.x)*(1.-smoothstep(bandWidth*.6,bandWidth,d-v.band.x));
 let density=envelope*smoothstep(.26,.70,turbulence)*front*bandFade*.72;
 let heat=clamp((1.-along)*.30+turbulence*.62+(1.-edge)*.12,0.,1.);
 var color=mix(vec3f(.55,.018,.004),vec3f(1.5,.21,.015),smoothstep(.18,.55,heat));
 color=mix(color,vec3f(1.8,.88,.19),smoothstep(.57,.85,heat));
 color=mix(color,vec3f(1.9,1.55,.9),smoothstep(.87,1.,heat));
 return vec4f(color*density,density*.82);
}`;

/** Instanced, clipped noise jets and UV-scrolled nozzle sleeves. No frame texture uploads. */
export class SkyStrikeFlamePass {
 private readonly pipeline:GPURenderPipeline;private readonly uniform:GPUBuffer;private readonly instances:GPUBuffer;private readonly bind:GPUBindGroup;
 private readonly data=new Float32Array((MAX_FLAME_PACKETS+64)*12);
 private count=0;
 constructor(private readonly engine:HaiyueEngine){
  const d=engine.device,module=d.createShaderModule({label:'SkyStrike.noise-flame.wgsl',code:FLAME_WGSL});
  this.pipeline=d.createRenderPipeline({label:'SkyStrike.noise-flame',layout:'auto',vertex:{module,entryPoint:'vs',buffers:[{arrayStride:48,stepMode:'instance',attributes:[{shaderLocation:0,offset:0,format:'float32x4'},{shaderLocation:1,offset:16,format:'float32x4'},{shaderLocation:2,offset:32,format:'float32x4'}]}]},fragment:{module,entryPoint:'fs',targets:[{format:engine.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'},multisample:{count:engine.msaaSamples}});
  this.uniform=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.instances=d.createBuffer({size:this.data.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  this.bind=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
 }
 draw(pass:GPURenderPassEncoder,cones:readonly FlameCone[],nozzles:readonly FlameNozzle[],time:number,view:{scale:number;left:number;cameraX:number},shakeX:number,shakeY:number,cores:readonly LavaCore[]=[]):void {
  this.count=0;const add=(values:number[])=>{if(this.count>=this.data.length/12)return;this.data.set(values,this.count++*12);};
  for(const n of nozzles)if(!n.boss){const width=n.size*.14;add([n.x,n.y-n.size*.23,Math.PI/2,width,0,n.size*.45,width,0,time/1000,0,1,n.heat]);}
  for(const c of cores)add([c.x,c.y,c.rotation+Math.PI/2,c.width/2,0,c.height,c.width/2,0,time/1000,0,2,1]);
  for(const c of cones){if(c.range<=0||c.warning)continue;add([c.x,c.y,c.angle,Math.max(4,c.range*Math.sin(c.halfAngle)),c.minRange??0,c.range,c.halfAngle,c.maxRange??c.range,time/1000,c.seed??0,0,1]);}
  if(!this.count)return;
  const e=this.engine;e.device.queue.writeBuffer(this.uniform,0,new Float32Array([e.displayWidth,e.displayHeight,view.scale,0,view.left,view.cameraX,shakeX,shakeY]));
  e.device.queue.writeBuffer(this.instances,0,this.data.subarray(0,this.count*12));pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bind);pass.setVertexBuffer(0,this.instances);pass.draw(6,this.count);
 }
 stats(){return{shader:'advected-fbm-flame',instances:this.count,maxInstances:this.data.length/12,bufferBytes:32+this.data.byteLength};}
 destroy():void{this.uniform.destroy();this.instances.destroy();}
}
