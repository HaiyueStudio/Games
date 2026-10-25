import { BasicMaterial, ColorSRGB } from '@haiyue/engine';
import { TETRIS_COLORS, type PieceKind } from '../rules/rules';

/** A single GPU-generated surface shared by every block and flying shard. */
export class NeonSurface {
  readonly texture: GPUTexture;
  private readonly clock: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindings: GPUBindGroup;
  private readonly view: GPUTextureView;
  private readonly materials = new Map<PieceKind, BasicMaterial>();
  constructor(private readonly device: GPUDevice) {
    this.texture = device.createTexture({ label: 'Tetris flowing neon', size: [256, 256], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.view = this.texture.createView();
    this.clock = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ label: 'Tetris iridescent surface WGSL', code: /* wgsl */`
      @group(0) @binding(0) var<uniform> clock: vec4f;
      struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
      @vertex fn vs(@builtin(vertex_index) i: u32) -> Vertex {
        let p = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
        var v: Vertex; v.position=vec4f(p[i],0,1); v.uv=p[i]*.5+.5; return v;
      }
      @fragment fn fs(v: Vertex) -> @location(0) vec4f {
        let p=v.uv; let t=clock.x;
        let wave=sin(p.x*8.0+t*1.2)*cos(p.y*6.0-t*.8);
        let film=.5+.5*cos(6.283185*(p.x*.35+p.y*.3+wave*.13+t*.12+vec3f(0,.33,.67)));
        let d=min(min(p.x,1.0-p.x),min(p.y,1.0-p.y));
        let rim=1.0-smoothstep(.015,.065,d);
        let bevel=1.0-smoothstep(.04,.16,d);
        let sweep=pow(.5+.5*sin((p.x+p.y)*9.0+wave-t*2.0),18.0);
        let base=film*(.35+.25*wave)+vec3f(.12,.14,.22);
        return vec4f(base+film*bevel*.5+vec3f(.7,.9,1)*rim*.85+sweep*.28,1);
      }` });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
    this.bindings = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.clock } }] });
    this.update(0);
  }
  material(kind: PieceKind): BasicMaterial {
    let material = this.materials.get(kind);
    if (!material) {
      const c = ColorSRGB.fromHex(TETRIS_COLORS[kind]);
      material = new BasicMaterial({ color: [c.r * .65 + .35, c.g * .65 + .35, c.b * .65 + .35, 1], texture: this.texture });
      this.materials.set(kind, material);
    }
    return material;
  }
  update(seconds: number): void {
    this.device.queue.writeBuffer(this.clock, 0, new Float32Array([seconds, 0, 0, 0]));
    const encoder = this.device.createCommandEncoder({ label: 'Tetris surface animation' });
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.bindings); pass.draw(3); pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  dispose(): void { this.texture.destroy(); this.clock.destroy(); this.materials.clear(); }
}
