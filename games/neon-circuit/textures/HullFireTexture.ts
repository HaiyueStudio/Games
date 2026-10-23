const FLAME_TEXTURE_WIDTH = 128;
const FLAME_TEXTURE_HEIGHT = 256;

export const HULL_FIRE_WGSL = /* wgsl */ `
struct FlameParams {
  time: f32,
  intensity: f32,
  boost: f32,
  flicker: f32,
}

@group(0) @binding(0) var<uniform> flame: FlameParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var output: VertexOutput;
  let position = positions[vertexIndex];
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = vec2<f32>(position.x * 0.5 + 0.5, 1.0 - (position.y * 0.5 + 0.5));
  return output;
}

fn hash21(point: vec2<f32>) -> f32 {
  return fract(sin(dot(point, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise21(point: vec2<f32>) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let blend = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash21(cell), hash21(cell + vec2<f32>(1.0, 0.0)), blend.x),
    mix(hash21(cell + vec2<f32>(0.0, 1.0)), hash21(cell + vec2<f32>(1.0, 1.0)), blend.x),
    blend.y
  );
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let height = 1.0 - in.uv.y;
  let flow = vec2<f32>(in.uv.x * 7.0, height * 9.0 - flame.time * 5.5);
  let turbulence = noise21(flow) * 0.65 + noise21(flow * 2.3) * 0.35;
  let bend = sin(height * 8.0 - flame.time * 4.0) * height * 0.1;
  let width = pow(1.0 - height, 1.2) * (0.18 + turbulence * 0.4);
  let edge = abs(in.uv.x - 0.5 + bend);
  let tongue = 1.0 - smoothstep(width * 0.7, width + 0.015, edge);
  let tip = 1.0 - smoothstep(0.35 + flame.intensity * 0.30, 0.98, height + turbulence * 0.18);
  let base = smoothstep(0.0, 0.09, height);
  let alpha = tongue * tip * base * flame.intensity;
  let heat = (1.0 - smoothstep(0.0, width * 0.65, edge)) * (1.0 - height);
  let color = mix(vec3<f32>(1.0, 0.045, 0.004), vec3<f32>(1.0, 0.72, 0.12), heat);
  return vec4<f32>(color, alpha);
}
`;

export class HullFireTexture {
  readonly texture: GPUTexture;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformValues = new Float32Array(4);
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly view: GPUTextureView;
  private lastTime = NaN;
  private lastIntensity = NaN;

  constructor(private readonly device: GPUDevice) {
    this.texture = device.createTexture({
      label: 'NeonCircuit.hullFire.texture',
      size: [FLAME_TEXTURE_WIDTH, FLAME_TEXTURE_HEIGHT],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.view = this.texture.createView();
    this.uniformBuffer = device.createBuffer({
      label: 'NeonCircuit.hullFire.uniforms',
      size: this.uniformValues.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const module = device.createShaderModule({ label: 'NeonCircuit.hullFire.shader', code: HULL_FIRE_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'NeonCircuit.hullFire.pipeline',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list' },
    });
    this.bindGroup = device.createBindGroup({
      label: 'NeonCircuit.hullFire.bindGroup',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  update(timeSeconds: number, intensity: number, commands?: () => GPUCommandEncoder): void {
    // A healthy hull needs one transparent frame, not a noise shader every frame.
    intensity = Math.max(0, Math.min(1, intensity));
    if (intensity === 0) timeSeconds = 0;
    if (this.lastTime === timeSeconds && this.lastIntensity === intensity) return;
    this.lastTime = timeSeconds;
    this.lastIntensity = intensity;
    this.uniformValues[0] = timeSeconds;
    this.uniformValues[1] = intensity;
    this.uniformValues[2] = 0;
    this.uniformValues[3] = 1.37;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformValues);
    const encoder = commands?.() ?? this.device.createCommandEncoder({ label: 'NeonCircuit.hullFire.encoder' });
    const pass = encoder.beginRenderPass({
      label: 'NeonCircuit.hullFire.renderPass',
      colorAttachments: [{
        view: this.view,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    if (!commands) this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
    this.texture.destroy();
  }
}
