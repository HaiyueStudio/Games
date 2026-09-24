import { localizeCourse, TEXT, type Language } from './NeonLocale';
import { browserNeonRaster, uploadNeonCanvas, type NeonRaster } from './NeonRaster';
import { CIRCUITS, circuitTrack, trackMap } from './RaceRules';
import { carouselMetrics, carouselOffset } from './CarouselMath';
import { distanceKm } from './RaceUnits';

/** Static route/info layers projected over the existing frame skin. The result is a GuiImage texture. */
export class CircuitCarousel {
  texture: GPUTexture;
  private panel: GPUTexture | null = null;
  private readonly ink: GPUTexture;
  private readonly uniform: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private group: GPUBindGroup | null = null;
  private last = '';
  private size = '';
  constructor(private readonly device: GPUDevice, private readonly raster: NeonRaster = browserNeonRaster) {
    this.texture = this.target(1, 1);
    this.ink = device.createTexture({ label: 'NeonCircuit.carouselLabels', size: [640, 780, CIRCUITS.length], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    this.setLanguage('zh');
    this.uniform = device.createBuffer({ size: 32 + CIRCUITS.length * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const module = device.createShaderModule({ code: /* wgsl */ `
      struct State { view: vec4<f32>, shape: vec4<f32>, cards: array<vec4<f32>, ${CIRCUITS.length}> }
      @group(0) @binding(0) var<uniform> state: State;
      @group(0) @binding(1) var frame: texture_2d<f32>;
      @group(0) @binding(2) var ink: texture_2d_array<f32>;
      @group(0) @binding(3) var smp: sampler;
      struct Out { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> }
      @vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
        let p = array<vec2<f32>,3>(vec2<f32>(-1,-1),vec2<f32>(3,-1),vec2<f32>(-1,3));
        var o: Out; o.p = vec4<f32>(p[i],0,1); o.uv = p[i] * vec2<f32>(0.5,-0.5) + 0.5; return o;
      }
      @fragment fn fs(o: Out) -> @location(0) vec4<f32> {
        let q = (o.uv - 0.5) * state.view.xy; var rgb = vec3<f32>(0); var alpha = 0.0;
        for (var i = 0; i < ${CIRCUITS.length}; i++) {
          let card = state.cards[i]; let d = card.x; let yaw = -d * 0.62;
          let depth = abs(d) * state.view.z * 0.65;
          let localX = (q.x * (1.0 + depth / state.shape.y) - d * state.shape.x) / (cos(yaw) + q.x * sin(yaw) / state.shape.y);
          let w = 1.0 + (depth - sin(yaw) * localX) / state.shape.y;
          let uv = vec2<f32>(localX / state.view.z, (q.y * w - abs(d) * state.view.y * 0.045) / state.view.w) + 0.5;
          if (all(uv >= vec2<f32>(0)) && all(uv <= vec2<f32>(1))) {
            let base = textureSampleLevel(frame, smp, uv, 0.0);
            let text = textureSampleLevel(ink, smp, uv, i32(card.y), 0.0);
            let a = text.a + base.a * (1.0 - text.a);
            let color = (text.rgb * text.a + base.rgb * base.a * (1.0 - text.a)) / max(0.001,a);
            let opacity = a * clamp((1.5 - abs(d)) * 5.0, 0.0, 1.0);
            rgb = color * (1.0 - min(abs(d),1.0) * 0.36) * opacity + rgb * (1.0 - opacity);
            alpha = opacity + alpha * (1.0 - opacity);
          }
        }
        return vec4<f32>(rgb / max(alpha,0.001), alpha);
      }
    ` });
    this.pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
  }
  setLanguage(language: Language): void {
    for (const [index, original] of CIRCUITS.entries()) {
      const circuit = localizeCourse(original, language);
      const canvas = this.raster.canvas(640, 780), ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const text = (value: string, x: number, y: number, size: number, color = '#edf8ff', bold = false) => {
        ctx.font = `${bold ? '700' : '400'} ${size}px Arial, "PingFang SC", "Hiragino Sans", "Microsoft Yahei", sans-serif`;
        const measured = ctx.measureText(value).width;
        if (measured > 548) ctx.font = ctx.font.replace(`${size}px`, `${size * 548 / measured}px`);
        ctx.fillStyle = color; ctx.fillText(value, x, y);
      };
      text(`0${index + 1} / ${circuit.difficulty}`, 46, 80, 22, circuit.color);
      const track = circuitTrack(circuit), map = trackMap(track);
      ctx.save(); ctx.translate(44, 140); ctx.scale(1.84, 1.84);
      const drawPath = () => { ctx.beginPath(); for (const [, command, x, y] of map.path.matchAll(/([ML])([\d.]+),([\d.]+)/g)) { if (command === 'M') ctx.moveTo(Number(x), Number(y)); else ctx.lineTo(Number(x), Number(y)); } ctx.closePath(); }; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = circuit.color;
      if (circuit.theme === 'cosmic') {
        const rainbow = ctx.createLinearGradient(15, 0, 285, 190);
        ['#ff609c','#ffc963','#72ffb0','#64dfff','#ae82ff'].forEach((color, i) => rainbow.addColorStop(i / 4, color));
        ctx.strokeStyle = rainbow;
      }
      ctx.globalAlpha = 0.14; ctx.lineWidth = 13; drawPath(); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 3; drawPath(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(map.start[0], map.start[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      text(circuit.subtitle, 46, 534, 20, '#91a9c3'); text(circuit.name, 46, 593, 43, '#edf8ff', true);
      const words = circuit.description.split(language === 'zh' ? '，' : '\n');
      text(words[0]! + (language === 'zh' ? '，' : ''), 46, 641, 21, '#a6bfd3'); text(words[1]!, 46, 675, 21, '#a6bfd3');
      text(`${distanceKm(track.length).toFixed(1)} KM  /  3 ${TEXT[language].laps}`, 46, 708, 20, circuit.color);
      uploadNeonCanvas(this.device, this.raster, canvas, this.ink, index);
    }
    this.last = '';
  }
  private target(width: number, height: number): GPUTexture {
    return this.device.createTexture({ label: 'NeonCircuit.carousel', size: [width, height], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
  }
  setPanel(panel: GPUTexture): void {
    this.panel = panel;
    this.group = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: panel.createView() },
      { binding: 2, resource: this.ink.createView({ dimension: '2d-array' }) }, { binding: 3, resource: this.sampler },
    ] }); this.last = '';
  }
  render(width: number, height: number, position: number, commands?: () => GPUCommandEncoder): void {
    if (!this.panel || !this.group || width < 1 || height < 1) return;
    const key = `${width},${height},${position}`; if (key === this.last) return; this.last = key;
    const ratio = Math.min(2, 1800 / width), w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    const size = `${w},${h}`;
    if (size !== this.size) { this.texture.destroy(); this.texture = this.target(w,h); this.size = size; }
    const m = carouselMetrics(width, height), values = new Float32Array(8 + CIRCUITS.length * 4);
    values.set([width,height,m.cardWidth,m.cardHeight,m.spacing,m.focal,0,0]);
    const order = CIRCUITS.map((_, index) => index).sort((a,b) => Math.abs(carouselOffset(b,position,CIRCUITS.length)) - Math.abs(carouselOffset(a,position,CIRCUITS.length)));
    order.forEach((index,i) => values.set([carouselOffset(index,position,CIRCUITS.length),index,0,0],8+i*4));
    this.device.queue.writeBuffer(this.uniform,0,values);
    const encoder = commands?.() ?? this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{
      view: this.texture.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0,0,0,0] }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0,this.group); pass.draw(3); pass.end(); if (!commands) this.device.queue.submit([encoder.finish()]);
  }
  destroy(): void { this.texture.destroy(); this.ink.destroy(); this.uniform.destroy(); }
}
