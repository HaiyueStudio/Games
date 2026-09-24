/** A seamless, animated spectral road surface. U follows the track; V crosses it. */
export class RainbowRoadTexture {
  readonly texture: GPUTexture;
  private readonly uniform: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly group: GPUBindGroup;
  private readonly values = new Float32Array(4);
  private readonly views: GPUTextureView[];
  private readonly mipPipeline: GPURenderPipeline;
  private readonly mipGroups: GPUBindGroup[];
  private lastTime = Number.NaN;
  time = 0;
  constructor(private readonly device: GPUDevice, pattern: 'rainbow' | 'noise' = 'rainbow') {
    this.values[1] = pattern === 'noise' ? 1 : 0;
    this.texture = device.createTexture({ label: 'RainbowRoad.spectrum', size: [512, 256], mipLevelCount: 10, format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    this.uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ label: 'RainbowRoad.flowingSpectrum', code: /* wgsl */ `
      @group(0) @binding(0) var<uniform> clock: vec4<f32>;
      struct Out { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> }
      @vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
        let p = array<vec2<f32>,3>(vec2<f32>(-1,-1),vec2<f32>(3,-1),vec2<f32>(-1,3));
        var o: Out; o.p = vec4<f32>(p[i],0,1); o.uv = p[i] * vec2<f32>(0.5,-0.5) + 0.5; return o;
      }
      fn hash(p: vec2<f32>) -> f32 {
        return fract(sin(dot(p, vec2<f32>(127.1,311.7))) * 43758.5453);
      }
      fn noise(p: vec2<f32>) -> f32 {
        let cell=floor(p); let f=fract(p); let w=f*f*(3.0-2.0*f);
        return mix(mix(hash(cell),hash(cell+vec2<f32>(1,0)),w.x),
          mix(hash(cell+vec2<f32>(0,1)),hash(cell+vec2<f32>(1,1)),w.x),w.y);
      }
      fn cloud(p: vec2<f32>) -> f32 {
        return noise(p)*0.57+noise(p*2.0)*0.28+noise(p*4.0)*0.15;
      }
      @fragment fn fs(o: Out) -> @location(0) vec4<f32> {
        let uv = o.uv;
        if (clock.y > 0.5) {
          // Embed longitudinal UV on a circle for a truly seamless noise tile.
          let angle=uv.x*6.283185-clock.x*0.32;
          let p=vec2<f32>(cos(angle),sin(angle))*2.4+vec2<f32>(uv.y*4.0,clock.x*0.07);
          let n=cloud(p+vec2<f32>(noise(p+clock.x*0.09),noise(p-3.7))*0.9);
          let contours=pow(0.5+0.5*cos(n*38.0-clock.x*0.85),10.0);
          let mist=mix(vec3<f32>(0.025,0.055,0.10),vec3<f32>(0.13,0.09,0.27),n);
          let light=mix(vec3<f32>(0.08,0.62,0.51),vec3<f32>(0.38,0.19,0.7),n);
          // A subdued surface leaves the white boost arrows and rails legible.
          return vec4<f32>(mist+light*contours*0.45,1);
        }
        let hue = uv.y * 0.88 + clock.x * 0.045 + sin(uv.x * 6.283185 - clock.x * 0.7) * 0.035;
        let spectrum = clamp(abs(fract(hue + vec3<f32>(0, 0.666667, 0.333333)) * 6.0 - 3.0) - 1.0, vec3<f32>(0), vec3<f32>(1));
        let tile = abs(fract(uv * vec2<f32>(6,7)) - 0.5);
        let grid = smoothstep(0.465, 0.495, max(tile.x, tile.y));
        let glint = pow(max(0.0, sin(uv.x * 6.283185 - clock.x * 1.4)), 18.0) * 0.1;
        // Saturated luminous tiles with dark seams retain depth and road readability.
        let rgb = mix(spectrum * 0.72 + vec3<f32>(0.035), spectrum * 0.24 + vec3<f32>(0.02), grid * 0.72);
        return vec4<f32>(rgb + glint, 1);
      }
    ` });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
    this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
    this.views = Array.from({ length: 10 }, (_, level) => this.texture.createView({ baseMipLevel: level, mipLevelCount: 1 }));
    const mipModule = device.createShaderModule({ label: 'RainbowRoad.minification', code: /* wgsl */ `
      @group(0) @binding(0) var source: texture_2d<f32>;
      @group(0) @binding(1) var smp: sampler;
      struct Out { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> }
      @vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
        let p = array<vec2<f32>,3>(vec2<f32>(-1,-1),vec2<f32>(3,-1),vec2<f32>(-1,3));
        var o: Out; o.p = vec4<f32>(p[i],0,1); o.uv = p[i] * vec2<f32>(0.5,-0.5) + 0.5; return o;
      }
      @fragment fn fs(o: Out) -> @location(0) vec4<f32> { return textureSampleLevel(source, smp, o.uv, 0); }
    ` });
    this.mipPipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module: mipModule, entryPoint: 'vs' },
      fragment: { module: mipModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
    const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    this.mipGroups = this.views.slice(0, -1).map(view => device.createBindGroup({ layout: this.mipPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: view }, { binding: 1, resource: sampler }] }));
    this.update(0);
  }
  update(seconds: number, commands?: () => GPUCommandEncoder): void {
    if (seconds === this.lastTime) return;
    this.time = this.lastTime = seconds; this.values[0] = seconds;
    this.device.queue.writeBuffer(this.uniform, 0, this.values);
    const encoder = commands?.() ?? this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{
      view: this.views[0]!, loadOp: 'clear', storeOp: 'store', clearValue: [0,0,0,1] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group); pass.draw(3); pass.end();
    // Filter the animated surface on-GPU. Distant tiles sample these levels rather than shimmer.
    for (let level = 1; level < this.views.length; level++) {
      const mip = encoder.beginRenderPass({ colorAttachments: [{ view: this.views[level]!, loadOp: 'clear', storeOp: 'store', clearValue: [0,0,0,1] }] });
      mip.setPipeline(this.mipPipeline); mip.setBindGroup(0, this.mipGroups[level - 1]!); mip.draw(3); mip.end();
    }
    if (!commands) this.device.queue.submit([encoder.finish()]);
  }
  destroy(): void { this.texture.destroy(); this.uniform.destroy(); }
}
