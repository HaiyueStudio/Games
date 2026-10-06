/** A small render target scrolls the generated chevrons; the source bitmap is uploaded once. */
export class BoostStripTexture {
  readonly texture: GPUTexture;
  private readonly uniform: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly group: GPUBindGroup;
  private readonly view: GPUTextureView;
  private readonly values = new Float32Array(4);
  private lastPhase = NaN;

  constructor(private readonly device: GPUDevice, source: GPUTexture) {
    this.texture = device.createTexture({ label: 'NeonCircuit.boostScroll', size: [256, 256], format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.view = this.texture.createView();
    this.uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ code: /* wgsl */ `
      @group(0) @binding(0) var source: texture_2d<f32>;
      @group(0) @binding(1) var linearRepeat: sampler;
      @group(0) @binding(2) var<uniform> clock: vec4<f32>;
      struct Out { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> }
      @vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
        let p = array<vec2<f32>, 3>(vec2<f32>(-1,-1), vec2<f32>(3,-1), vec2<f32>(-1,3));
        var o: Out; o.position = vec4<f32>(p[i], 0, 1); o.uv = p[i] * vec2<f32>(0.5,-0.5) + 0.5; return o;
      }
      @fragment fn fs(o: Out) -> @location(0) vec4<f32> {
        // Output U is distance along the track. Arrow bitmap V points upward,
        // so reverse U and add phase to move the arrows toward increasing distance.
        let uv = vec2<f32>(o.uv.y, fract(-o.uv.x + clock.x));
        let color = textureSample(source, linearRepeat, uv).rgb;
        // Fade only the source's tiny wrapping seam, preserving the lit chevrons.
        let seam = smoothstep(0.0, 0.025, uv.y) * (1.0 - smoothstep(0.975, 1.0, uv.y));
        return vec4<f32>(mix(vec3<f32>(0.005, 0.025, 0.05), color, seam), 1.0);
      }
    ` });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
    this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: source.createView() },
      { binding: 1, resource: device.createSampler({ minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'repeat' }) },
      { binding: 2, resource: { buffer: this.uniform } },
    ] });
  }

  update(seconds: number, commands?: () => GPUCommandEncoder): void {
    this.values[0] = (seconds * 0.62) % 1;
    if (this.values[0] === this.lastPhase) return;
    this.lastPhase = this.values[0]!;
    this.device.queue.writeBuffer(this.uniform, 0, this.values);
    const encoder = commands?.() ?? this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group); pass.draw(3); pass.end();
    if (!commands) this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void { this.uniform.destroy(); this.texture.destroy(); }
}
