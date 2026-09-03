const FLAME_TEXTURE_WIDTH = 128;
const FLAME_TEXTURE_HEIGHT = 256;

export const THRUSTER_FLAME_WGSL = /* wgsl */ `
struct FlameParams {
  time: f32,
  speed: f32,
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
  let along = clamp(1.0 - in.uv.y, 0.0, 1.0);
  let speedLength = 0.34 + flame.speed * 0.48 + flame.boost * 0.18;
  let lengthMask = 1.0 - smoothstep(speedLength - 0.10, speedLength, along);
  let turbulence = (noise21(vec2<f32>(in.uv.x * 9.0, along * 15.0 - flame.time * 13.0)) - 0.5)
    * (0.08 + along * 0.20);
  let center = 0.5 + turbulence;
  let width = mix(0.34 + flame.boost * 0.08, 0.025, along);
  let radial = 1.0 - smoothstep(width * 0.28, width, abs(in.uv.x - center));
  let pulse = 0.82 + 0.18 * sin(flame.time * 31.0 + along * 23.0 + flame.flicker);
  let alpha = radial * lengthMask * pulse * (1.0 - smoothstep(0.82, 1.0, along));
  let core = 1.0 - smoothstep(0.0, width * 0.24, abs(in.uv.x - center));
  let outer = mix(vec3<f32>(0.05, 0.72, 1.0), vec3<f32>(1.0, 0.04, 0.58), along);
  let color = outer * (1.1 + flame.boost * 0.8) + vec3<f32>(0.78, 0.98, 1.0) * core * 1.8;
  return vec4<f32>(color * alpha, alpha);
}
`;

export class ThrusterFlameTexture {
  readonly texture: GPUTexture;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformValues = new Float32Array(4);
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly view: GPUTextureView;

  constructor(private readonly device: GPUDevice) {
    this.texture = device.createTexture({
      label: 'NeonCircuit.thrusterFlame.texture',
      size: [FLAME_TEXTURE_WIDTH, FLAME_TEXTURE_HEIGHT],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.view = this.texture.createView();
    this.uniformBuffer = device.createBuffer({
      label: 'NeonCircuit.thrusterFlame.uniforms',
      size: this.uniformValues.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const module = device.createShaderModule({ label: 'NeonCircuit.thrusterFlame.shader', code: THRUSTER_FLAME_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'NeonCircuit.thrusterFlame.pipeline',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list' },
    });
    this.bindGroup = device.createBindGroup({
      label: 'NeonCircuit.thrusterFlame.bindGroup',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  update(timeSeconds: number, speedRatio: number, boostStrength: number): void {
    this.uniformValues[0] = timeSeconds;
    this.uniformValues[1] = speedRatio;
    this.uniformValues[2] = boostStrength;
    this.uniformValues[3] = 1.37;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformValues);
    const encoder = this.device.createCommandEncoder({ label: 'NeonCircuit.thrusterFlame.encoder' });
    const pass = encoder.beginRenderPass({
      label: 'NeonCircuit.thrusterFlame.renderPass',
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
    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
    this.texture.destroy();
  }
}
