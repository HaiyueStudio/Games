import { healthRingColor } from './RacerEffects';

/** One small GUI texture; ring length and colour reflect exact hull health. */
export class HudDialTexture {
  readonly texture: GPUTexture;
  private readonly uniform: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly group: GPUBindGroup;
  private readonly view: GPUTextureView;
  private readonly values = new Float32Array(8);
  private lastHealth = -1;
  constructor(private readonly device: GPUDevice) {
    this.texture = device.createTexture({ label: 'NeonCircuit.hullDial', size: [384, 384], format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.view = this.texture.createView();
    this.uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ code: /* wgsl */ `
      struct State { value: vec4<f32>, color: vec4<f32> }
      @group(0) @binding(0) var<uniform> hull: State;
      struct Out { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> }
      @vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
        let p = array<vec2<f32>, 3>(vec2<f32>(-1,-1), vec2<f32>(3,-1), vec2<f32>(-1,3));
        var o: Out; o.position = vec4<f32>(p[i],0,1); o.uv = p[i] * vec2<f32>(0.5,-0.5) + 0.5; return o;
      }
      @fragment fn fs(o: Out) -> @location(0) vec4<f32> {
        let q = o.uv - 0.5; let radius = length(q);
        let angle = fract(atan2(q.x, -q.y) / 6.2831853 + 1.0);
        let ring = 1.0 - smoothstep(0.013, 0.020, abs(radius - 0.444));
        let lit = select(0.0, 1.0, angle <= hull.value.x && hull.value.x > 0.0);
        let glow = exp(-abs(radius - 0.444) * 95.0) * 0.24 * lit;
        let ringColor = mix(vec3<f32>(0.09,0.16,0.21), hull.color.rgb, lit);
        // Transparent centre lets the generated instrument face show through.
        return vec4<f32>(ringColor, max(ring, glow));
      }
    ` });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
    this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
    this.update(100);
  }
  update(health: number, commands?: () => GPUCommandEncoder): void {
    if (health === this.lastHealth) return;
    this.lastHealth = health;
    this.values[0] = Math.min(1, Math.max(0, health / 100));
    this.values.set(healthRingColor(health), 4);
    this.device.queue.writeBuffer(this.uniform, 0, this.values);
    const encoder = commands?.() ?? this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'clear', storeOp: 'store', clearValue: [0,0,0,0] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group); pass.draw(3); pass.end(); if (!commands) this.device.queue.submit([encoder.finish()]);
  }
  destroy(): void { this.uniform.destroy(); this.texture.destroy(); }
}
