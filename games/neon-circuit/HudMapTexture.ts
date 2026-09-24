import { hudMapBasis, hudMapPoint, hudMapProjection } from './HudMapMath';
import type { RaceTrack, RacePose } from './RaceRules';

/** Persistent 3D segment buffer, projected by the GPU into the existing GUI image.
 * Only the vehicle basis and marker change per frame; no canvas/texture uploads. */
export class HudMapTexture {
  readonly texture: GPUTexture;
  private readonly depth: GPUTexture;
  private readonly vertices: GPUBuffer;
  private readonly uniform: GPUBuffer;
  private readonly linePipeline: GPURenderPipeline;
  private readonly backgroundPipeline: GPURenderPipeline;
  private readonly backgroundGroup: GPUBindGroup;
  private readonly overlayPipeline: GPURenderPipeline;
  private readonly group: GPUBindGroup;
  private readonly overlayGroup: GPUBindGroup;
  private readonly view: GPUTextureView;
  private readonly depthView: GPUTextureView;
  private readonly projection;
  private readonly count: number;
  private basis = hudMapBasis({x:0,y:0,z:0,heading:0,pitch:0,bank:0});
  private marker = {x:.5,y:.5,depth:0};
  private readonly values = new Float32Array(24);
  private readonly previousValues = new Float32Array(24).fill(NaN);
  constructor(private readonly device: GPUDevice, track: RaceTrack, color: string) {
    this.projection=hudMapProjection(track);this.count=track.samples.length;
    const data=new Float32Array(this.count*6);
    for(let i=0;i<this.count;i++) for(let end=0;end<2;end++) {
      const p=track.samples[(i+end)%this.count]!;
      for(const [axis,key] of (['x','y','z'] as const).entries()) data[i*6+end*3+axis]=(p[key]-this.projection.center[axis]!)*this.projection.scale;
    }
    this.vertices=device.createBuffer({label:'HudMap.3dCurve',size:data.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
    device.queue.writeBuffer(this.vertices,0,data);
    this.texture=device.createTexture({label:'HudMap.spatialOverview',size:[320,320],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    this.depth=device.createTexture({label:'HudMap.curveDepth',size:[320,320],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
    this.view=this.texture.createView();this.depthView=this.depth.createView();
    this.uniform=device.createBuffer({size:96,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const shader=device.createShaderModule({label:'HudMap.project3d',code:/* wgsl */ `
      struct State { right:vec4<f32>, up:vec4<f32>, depth:vec4<f32>, marker:vec4<f32>, color:vec4<f32>, opponent:vec4<f32> }
      @group(0) @binding(0) var<uniform> state:State;
      struct Out { @builtin(position) p:vec4<f32>, @location(0) uv:vec2<f32>, @location(1) edge:f32, @location(2) depth:f32 }
      fn project(p:vec3<f32>)->vec3<f32> {return vec3<f32>(dot(p,state.right.xyz),dot(p,state.up.xyz),dot(p,state.depth.xyz));}
      @vertex fn line(@builtin(vertex_index) i:u32,@location(0) a:vec3<f32>,@location(1) b:vec3<f32>)->Out {
        let pa=project(a);let pb=project(b);let delta=pb.xy-pa.xy;
        let normal=vec2<f32>(-delta.y,delta.x)/max(length(delta),.000001);
        let corners=array<vec2<f32>,6>(vec2<f32>(0,-1),vec2<f32>(1,-1),vec2<f32>(0,1),vec2<f32>(0,1),vec2<f32>(1,-1),vec2<f32>(1,1));
        let c=corners[i];let q=mix(pa,pb,c.x);let xy=q.xy+normal*c.y*.009;
        var o:Out;o.p=vec4<f32>(xy*2.,.5-q.z,1);o.uv=vec2<f32>(xy.x,-xy.y)+.5;o.edge=c.y;o.depth=q.z;return o;
      }
      @fragment fn curve(o:Out)->@location(0) vec4<f32> {
        if(length(o.uv-.5)>.475 || abs(o.edge)>.95){discard;}
        let light=clamp(.62+o.depth*1.3,.25,1.);
        let core=1.-smoothstep(.25,.95,abs(o.edge));
        return vec4<f32>(state.color.rgb*light+vec3<f32>(.25)*core,core*.85+.15);
      }
      @vertex fn full(@builtin(vertex_index) i:u32)->Out {
        let p=array<vec2<f32>,3>(vec2<f32>(-1,-1),vec2<f32>(3,-1),vec2<f32>(-1,3));
        var o:Out;o.p=vec4<f32>(p[i],0,1);o.uv=p[i]*vec2<f32>(.5,-.5)+.5;o.edge=0;o.depth=0;return o;
      }
      @fragment fn background(o:Out)->@location(0) vec4<f32> {
        let radius=length(o.uv-.5);if(radius>.498){discard;}
        let glow=exp(-radius*5.);
        return vec4<f32>(vec3<f32>(.006,.021,.04)+state.color.rgb*.025*glow,(1.-smoothstep(.49,.498,radius))*.96);
      }
      fn segment(p:vec2<f32>,a:vec2<f32>,b:vec2<f32>)->f32 {let d=b-a;return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),.000001),0.,1.));}
      @fragment fn marker(o:Out)->@location(0) vec4<f32> {
        let p=o.uv-state.marker.xy;
        let a=vec2<f32>(0,-.037);let b=vec2<f32>(-.025,.025);let c=vec2<f32>(.025,.025);
        let edge=min(segment(p,a,b),min(segment(p,b,c),segment(p,c,a)));
        let inside=p.y>=a.y && p.y<=b.y && abs(p.x)<(p.y-a.y)*.403;
        let radius=length(o.uv-state.opponent.xy);
        let nearby=distance(state.marker.xy,state.opponent.xy)<.075;
        let ring=select(.028,.046,nearby);
        // A wider ring stays visible around the yellow arrow even at identical positions.
        if(state.opponent.w>0. && abs(radius-ring)<.006){return vec4<f32>(1.,.25,.65,1.);}
        if(inside){return vec4<f32>(1.,.85,.35,1.);}
        if(edge<.008){return vec4<f32>(.006,.02,.035,1.);}
        if(state.opponent.w>0.) {
          if(!nearby && radius<.012){return vec4<f32>(1.,.25,.65,1.);}
          if(abs(radius-ring)<.011){return vec4<f32>(.006,.02,.035,1.);}
        }
        discard; return vec4<f32>(0);
      }
    `});
    const blend:GPUBlendState={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
    this.linePipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'line',buffers:[{arrayStride:24,stepMode:'instance',attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'}]}]},fragment:{module:shader,entryPoint:'curve',targets:[{format:'rgba8unorm',blend}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'}});
    this.backgroundPipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'full'},fragment:{module:shader,entryPoint:'background',targets:[{format:'rgba8unorm',blend}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
    this.overlayPipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'full'},fragment:{module:shader,entryPoint:'marker',targets:[{format:'rgba8unorm',blend}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
    const entries=[{binding:0,resource:{buffer:this.uniform}}];
    this.group=device.createBindGroup({layout:this.linePipeline.getBindGroupLayout(0),entries});
    this.backgroundGroup=device.createBindGroup({layout:this.backgroundPipeline.getBindGroupLayout(0),entries});
    this.overlayGroup=device.createBindGroup({layout:this.overlayPipeline.getBindGroupLayout(0),entries});
    const hex=parseInt(color.replace('#',''),16);
    this.values.set([(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255,1],16);
  }
  update(pose:RacePose,opponent?:RacePose,commands?: () => GPUCommandEncoder):void {
    this.basis=hudMapBasis(pose);this.marker=hudMapPoint(this.projection,pose,this.basis);
    this.values.set(this.basis.right,0);this.values.set(this.basis.up,4);this.values.set(this.basis.depth,8);
    this.values.set([this.marker.x,this.marker.y,this.marker.depth,0],12);
    const rival=opponent?hudMapPoint(this.projection,opponent,this.basis):null;
    this.values.set(rival?[rival.x,rival.y,rival.depth,1]:[0,0,0,0],20);
    if(this.values.every((value,index)=>value===this.previousValues[index]))return;
    this.previousValues.set(this.values);
    this.device.queue.writeBuffer(this.uniform,0,this.values);
    const encoder=commands?.() ?? this.device.createCommandEncoder();
    const pass=encoder.beginRenderPass({colorAttachments:[{view:this.view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}],depthStencilAttachment:{view:this.depthView,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard'}});
    pass.setPipeline(this.backgroundPipeline);pass.setBindGroup(0,this.backgroundGroup);pass.draw(3);
    pass.setPipeline(this.linePipeline);pass.setBindGroup(0,this.group);pass.setVertexBuffer(0,this.vertices);pass.draw(6,this.count);
    pass.setPipeline(this.overlayPipeline);pass.setBindGroup(0,this.overlayGroup);pass.draw(3);pass.end();if (!commands) this.device.queue.submit([encoder.finish()]);
  }
  /** Diagnostic readback is called only by the browser fixture, never during gameplay. */
  async inspectMarkers():Promise<{playerPixels:number;opponentPixels:number}> {
    const buffer=this.device.createBuffer({size:320*320*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
      const encoder=this.device.createCommandEncoder();
      encoder.copyTextureToBuffer({texture:this.texture},{buffer,bytesPerRow:1280},[320,320]);
      this.device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);
      const pixels=new Uint8Array(buffer.getMappedRange());let playerPixels=0,opponentPixels=0;
      for(let i=0;i<pixels.length;i+=4) {
        if(pixels[i]!>240 && pixels[i+1]!>210 && pixels[i+2]!<120)playerPixels++;
        if(pixels[i]!>240 && pixels[i+1]!<90 && pixels[i+2]!>140 && pixels[i+2]!<210)opponentPixels++;
      }
      return {playerPixels,opponentPixels};
    } finally {buffer.destroy();}
  }
  get snapshot(){return {opponentStyle:'magenta-ring',opponent:Array.from(this.values.slice(20,24)),mode:'spatial-curve',basis:{...this.basis},marker:{...this.marker},projection:{...this.projection},segments:this.count};}
  destroy():void{this.vertices.destroy();this.texture.destroy();this.depth.destroy();this.uniform.destroy();}
}
