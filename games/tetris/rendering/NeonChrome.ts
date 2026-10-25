interface Surface { texture: GPUTexture; view: GPUTextureView; buffer: GPUBuffer; bindings: GPUBindGroup; mode: number; width: number; height: number }

/** Tetris chrome: the HUD and board share the blocks' animated cyan/violet spectrum. */
export class NeonChrome {
  readonly panel: GPUTexture;
  readonly titlePanel: GPUTexture;
  readonly button: GPUTexture;
  readonly board: GPUTexture;
  readonly boardWidth: number;
  readonly boardDepth: number;
  private readonly surfaces: Surface[] = [];
  private readonly pipeline: GPURenderPipeline;
  private readonly params = new Float32Array(8);
  private flashAt = -10;
  constructor(private readonly device: GPUDevice, cols: number, rows: number) {
    this.boardWidth = cols * .58 + .8; this.boardDepth = rows * .58 + .8;
    this.params[4] = cols; this.params[5] = rows;
    const module = device.createShaderModule({ label: 'Tetris neon chrome WGSL', code: /* wgsl */`
      struct Params { time:f32, mode:f32, width:f32, height:f32, cols:f32, rows:f32, flash:f32, pad:f32 }
      @group(0) @binding(0) var<uniform> u:Params;
      struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f }
      @vertex fn vs(@builtin(vertex_index) i:u32)->Vertex {
        let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
        var v:Vertex;v.position=vec4f(p[i],0,1);v.uv=p[i]*.5+.5;return v;
      }
      fn spectrum(t:f32)->vec3f { return .55+.45*cos(6.2831853*(t+vec3f(0,.32,.64))); }
      fn rounded(p:vec2f,b:vec2f,r:f32)->f32 { let q=abs(p)-b+r;return length(max(q,vec2f(0)))+min(max(q.x,q.y),0.0)-r; }
      @fragment fn fs(v:Vertex)->@location(0) vec4f {
        let size=vec2f(u.width,u.height); let p=v.uv*size;let board=u.mode>2.5;let button=u.mode>1.5&&!board;
        let margin=select(9.0,15.0,board);let radius=select(11.0,17.0,board);
        let d=rounded(p-size*.5,size*.5-margin,radius);
        let inside=1.0-smoothstep(-.8,.8,d);
        let edge=exp(-abs(d)*1.1);let halo=exp(-abs(d)*.18);
        let film=spectrum(v.uv.x*.3+v.uv.y*.35+sin(v.uv.y*6.0+u.time*.7)*.08-u.time*.075);
        let flow=pow(.5+.5*sin(v.uv.x*6.0-v.uv.y*5.0-u.time*1.2),9.0);
        var color=vec3f(.013,.021,.052)+film*(.025+flow*.045);
        if(button) {
          color=vec3f(.035,.045,.12)+film*(.09+flow*.16);
          color+=exp(-abs(p.y-12.0)*.45)*film*.3;
          let glint=exp(-pow((v.uv.x-fract(u.time*.14))*14.0,2.0));
          color+=glint*.08;
        } else if(!board) {
          let scan=pow(.5+.5*cos(p.y*1.5),12.0);
          color+=film*scan*.012;
          let rule=exp(-abs(p.y-size.y*.44)*1.0);
          color+=film*rule*.22;
          let corner=step(abs(p.x-size.x*.5),size.x*.5-24.0)*step(abs(p.y-size.y*.5),size.y*.5-23.0);
          color+=film*corner*.012;
        }
        if(board) {
          let worldSize=vec2f(u.cols*.58+.8,u.rows*.58+.8);
          let cells=(v.uv*worldSize-.4)/.58;
          let inGrid=step(0.0,cells.x)*step(cells.x,u.cols)*step(0.0,cells.y)*step(cells.y,u.rows);
          let f=fract(cells);let distance=min(min(f.x,1.0-f.x),min(f.y,1.0-f.y));
          let grid=1.0-smoothstep(.012,.035,distance);
          let bevel=1.0-smoothstep(.035,.14,distance);
          let band=exp(-pow((cells.y/u.rows-fract(u.time*.1))*13.0,2.0));
          color=vec3f(.009,.016,.035)+film*(.018+flow*.024);
          color+=inGrid*(film*(grid*.32+bevel*.05)+vec3f(.025,.1,.15)*band*(.18+grid*.8));
          color+=inGrid*u.flash*film*(.18+grid*.5);
          // Twin side rails and traveling light segments frame the playable grid.
          let rail=exp(-abs(abs(p.x-size.x*.5)-(size.x*.5-23.0))*.8);
          color+=rail*film*(.4+.5*pow(.5+.5*sin(v.uv.y*35.0-u.time*3.0),8.0));
        }
        color+=film*(edge*.85+halo*.15)*(1.0+u.flash*.6);
        let alpha=inside+halo*.62*(1.0-inside);
        return vec4f(color,alpha);
      }` });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
    const create = (mode: number, width: number, height: number, size: [number, number]): GPUTexture => {
      const texture = device.createTexture({ label: `Tetris neon chrome ${mode}`, size, format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      const buffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const bindings = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
      this.surfaces.push({ texture, view: texture.createView(), buffer, bindings, mode, width, height }); return texture;
    };
    this.titlePanel = create(0, 230, 125, [460, 250]);
    this.panel = create(1, 220, 310, [440, 620]);
    this.button = create(2, 132, 56, [396, 168]);
    this.board = create(3, 512, 1024, [512, 1024]);
    this.update(0);
  }
  flash(seconds: number): void { this.flashAt = seconds; }
  reset(): void { this.flashAt = -10; }
  update(seconds: number): void {
    this.params[0] = seconds; this.params[6] = Math.max(0, 1 - (seconds - this.flashAt) / .85);
    const encoder = this.device.createCommandEncoder({ label: 'Tetris chrome animation' });
    for (const s of this.surfaces) {
      this.params[1] = s.mode; this.params[2] = s.width; this.params[3] = s.height;
      this.device.queue.writeBuffer(s.buffer, 0, this.params);
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: s.view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      pass.setPipeline(this.pipeline); pass.setBindGroup(0, s.bindings); pass.draw(3); pass.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }
  dispose(): void { for (const s of this.surfaces) { s.texture.destroy(); s.buffer.destroy(); } this.surfaces.length = 0; }
}
