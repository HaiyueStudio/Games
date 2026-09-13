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
  constructor(private readonly device: GPUDevice) {
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
      @fragment fn fs(o: Out) -> @location(0) vec4<f32> {
        let uv = o.uv;
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
  update(seconds: number): void {
    if (seconds === this.lastTime) return;
    this.time = this.lastTime = seconds; this.values[0] = seconds;
    this.device.queue.writeBuffer(this.uniform, 0, this.values);
    const encoder = this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{
      view: this.views[0]!, loadOp: 'clear', storeOp: 'store', clearValue: [0,0,0,1] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group); pass.draw(3); pass.end();
    // Filter the animated surface on-GPU. Distant tiles sample these levels rather than shimmer.
    for (let level = 1; level < this.views.length; level++) {
      const mip = encoder.beginRenderPass({ colorAttachments: [{ view: this.views[level]!, loadOp: 'clear', storeOp: 'store', clearValue: [0,0,0,1] }] });
      mip.setPipeline(this.mipPipeline); mip.setBindGroup(0, this.mipGroups[level - 1]!); mip.draw(3); mip.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }
  destroy(): void { this.texture.destroy(); this.uniform.destroy(); }
}
