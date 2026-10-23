/** Small projected GUI sprite: transforms artwork on the GPU without moving its hit target. */
export class HudSpriteTexture {
  readonly texture: GPUTexture;
  private readonly uniform: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly view: GPUTextureView;
  private group: GPUBindGroup | null = null;
  private source: GPUTexture | null = null;
  private last = '';
  constructor(private readonly device: GPUDevice, width = 320, height = width) {
    this.texture = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
    this.view = this.texture.createView();
    this.uniform = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ code: /* wgsl */ `
      struct State { pose: vec4<f32>, uv: vec4<f32>, look: vec4<f32> }
      @group(0) @binding(0) var<uniform> s: State;
      @group(0) @binding(1) var art: texture_2d<f32>;
      @group(0) @binding(2) var smp: sampler;
      struct Out { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> }
      @vertex fn vs(@builtin(vertex_index) i:u32) -> Out {
        let a = array<vec2<f32>,6>(vec2<f32>(0,0),vec2<f32>(1,0),vec2<f32>(0,1),vec2<f32>(0,1),vec2<f32>(1,0),vec2<f32>(1,1));
        let q = a[i] - 0.5; let y = q.y - s.look.z;
        let w = 1.0 - y * sin(s.pose.y) * 0.8;
        let p = vec2<f32>(q.x, y * cos(s.pose.y) + s.look.z);
        let r = vec2<f32>(p.x*cos(s.pose.x)-p.y*sin(s.pose.x),p.x*sin(s.pose.x)+p.y*cos(s.pose.x));
        var o:Out; o.p=vec4<f32>(r.x*2.0*s.pose.z, -(r.y*s.pose.z+s.pose.w*w)*2.0, 0, w);
        o.uv=s.uv.xy+a[i]*s.uv.zw; return o;
      }
      @fragment fn fs(o:Out)->@location(0) vec4<f32> {
        let c=textureSample(art,smp,o.uv); return vec4<f32>(c.rgb*s.look.x,c.a*s.look.y);
      }
    ` });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
  }
  render(source: GPUTexture, pose: { rotation?: number; tilt?: number; scale?: number; y?: number; opacity?: number; brightness?: number; pivot?: number; uv?: readonly number[] } = {}, commands?: () => GPUCommandEncoder): void {
    if (this.source !== source) {
      this.source = source; this.last = '';
      this.group = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: source.createView() },
        { binding: 2, resource: this.device.createSampler({ minFilter: 'linear', magFilter: 'linear' }) },
      ] });
    }
    const values = [pose.rotation ?? 0, pose.tilt ?? 0, pose.scale ?? 1, pose.y ?? 0, ...(pose.uv ?? [0,0,1,1]), pose.brightness ?? 1, pose.opacity ?? 1, pose.pivot ?? 0, 0];
    const key = values.map(v => v.toFixed(4)).join(','); if (key === this.last) return; this.last = key;
    this.device.queue.writeBuffer(this.uniform, 0, new Float32Array(values));
    const encoder = commands?.() ?? this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'clear', storeOp: 'store', clearValue: [0,0,0,0] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0,this.group!); pass.draw(6); pass.end(); if (!commands) this.device.queue.submit([encoder.finish()]);
  }
  destroy(): void { this.uniform.destroy(); this.texture.destroy(); }
}
