import { System, type World } from '@haiyue/engine';
import { beginRenderCommandPass, type IEngine, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { playGrid } from './layout';

const coverTime = 180;
const revealTime = 220;
const label = 'Dafeiyu room transition';
type Phase = 'closing' | 'covered' | 'opening';

export interface PortalFocus {
  x: number;
  y: number;
  cols: number;
  rows: number;
}

const shader = /* wgsl */ `
struct Mask {
  extent: vec2f,
  center: vec2f,
  radius: f32,
  glow: f32,
}
@group(0) @binding(0) var<uniform> mask: Mask;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  let position = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3))[index];
  return VertexOut(vec4f(position, 0, 1), vec2f(position.x + 1, 1 - position.y) * 0.5);
}

@fragment fn fs(input: VertexOut) -> @location(0) vec4f {
  let distanceToCenter = length(input.uv * mask.extent - mask.center);
  let edge = distanceToCenter - mask.radius;
  let rim = 1 - smoothstep(0.5, 2.8, abs(edge));
  let softLight = 1 - smoothstep(1.0, 18.0, abs(edge));
  let deep = mix(vec3f(0.025, 0.11, 0.19), vec3f(0.055, 0.22, 0.30), 1 - input.uv.y);
  let color = mix(deep, vec3f(0.52, 0.93, 0.87), (rim * 0.85 + softLight * 0.15) * mask.glow);
  let opacity = max(smoothstep(-1.0, 3.0, edge), (rim * 0.86 + softLight * 0.12) * mask.glow);
  return vec4f(color * opacity, opacity);
}
`;

export class LagoonPortal extends System {
  readonly recoveryLabel = label;
  readonly recoverySource = { kind: 'render-system', system: 'LagoonPortal' };
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly values = new Float32Array(8);
  private readonly unregister: (() => void) | undefined;
  private elapsed = 0;
  private focus: PortalFocus | undefined;
  private animation: Phase | undefined;
  private onCovered: (() => void) | undefined;
  private gpu: { pipeline: GPURenderPipeline; group: GPUBindGroup; uniform: GPUBuffer; samples: number } | undefined;
  get phase(): Phase | undefined { return this.animation; }

  constructor(private readonly engine: IEngine) {
    super(() => false);
    this.unregister = engine.registerDeviceRecoveryParticipant?.(this);
  }

  cover(focus?: PortalFocus): Promise<void> | undefined {
    if (this.reducedMotion.matches) return;
    this.animation = 'closing';
    this.focus = focus;
    this.elapsed = 0;
    return new Promise(resolve => { this.onCovered = resolve; });
  }

  reveal(focus?: PortalFocus): void {
    this.animation = this.reducedMotion.matches ? undefined : 'opening';
    this.focus = focus;
    this.elapsed = 0;
  }

  tick(delta: number): void {
    if (!this.animation || this.animation === 'covered') return;
    this.elapsed += Math.min(delta, 48);
    if (this.animation === 'closing' && (this.elapsed >= coverTime || this.reducedMotion.matches)) {
      this.animation = 'covered';
      this.onCovered?.();
      this.onCovered = undefined;
    } else if (this.animation === 'opening' && (this.elapsed >= revealTime || this.reducedMotion.matches)) {
      this.animation = undefined;
    }
  }

  private prepare(samples: number): NonNullable<LagoonPortal['gpu']> {
    if (this.gpu?.samples === samples) return this.gpu;
    this.gpu?.uniform.destroy();
    const device = this.engine.device;
    const module = device.createShaderModule({ label, code: shader });
    const pipeline = device.createRenderPipeline({ label, layout: 'auto', vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.engine.format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      } }] }, multisample: { count: samples } });
    const uniform = device.createBuffer({ label, size: this.values.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
    return this.gpu = { pipeline, group, uniform, samples };
  }

  record(_world: World, context: RenderCommandContext): this {
    if (!this.animation || this.reducedMotion.matches) return this;
    const width = context.view?.displayWidth ?? this.engine.displayWidth;
    const height = context.view?.displayHeight ?? this.engine.displayHeight;
    if (!width || !height) return this;
    let x = width / 2, y = height / 2;
    if (this.focus) {
      const { cols, rows } = this.focus;
      const grid = playGrid(width, height, cols, rows, true);
      x = grid.x + (this.focus.x + .5) * grid.cell;
      y = grid.y + (this.focus.y + .5) * grid.cell;
    }
    const progress = this.animation === 'closing' ? 1 - this.elapsed / coverTime :
      this.animation === 'opening' ? this.elapsed / revealTime : 0;
    const farthest = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
    this.values.set([width, height, x, y, (farthest + 44) * progress ** 1.55 - 20, Math.min(1, progress * 9)]);
    const gpu = this.prepare(context.view?.sampleCount ?? this.engine.msaaSamples);
    this.engine.device.queue.writeBuffer(gpu.uniform, 0, this.values);
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);
    passEncoder.setPipeline(gpu.pipeline);
    passEncoder.setBindGroup(0, gpu.group);
    passEncoder.draw(3);
    if (ownsPass) passEncoder.end();
    return this;
  }

  suspendForDeviceLoss(): void { }
  recoverGpuResource(_device: GPUDevice, signal: AbortSignal): void {
    signal.throwIfAborted();
    this.gpu?.uniform.destroy();
    this.gpu = undefined;
  }
  override destroy(): this {
    this.animation = undefined;
    this.onCovered?.();
    this.onCovered = undefined;
    this.unregister?.();
    this.gpu?.uniform.destroy();
    this.gpu = undefined;
    return super.destroy();
  }
}
