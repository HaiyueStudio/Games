import { CompletionSweep } from './completion-sweep';
import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, HaiyueEngine, Mesh3D, World, createPlane3D } from '@haiyue/engine';
import { RenderIntegration, requireEngineDevice } from '@haiyue/engine/experimental';
import { Render3DSystem } from '@haiyue/engine/systems';
import { paintBoard, type ViewState } from './board-painter';

export class BoardView {
  private engine!: HaiyueEngine;
  private renderer!: Render3DSystem;
  private world!: World;
  private texture!: GPUTexture;
  private material = new BasicMaterial();
  private surface = document.createElement('canvas');
  private pending = 2;
  private observer: ResizeObserver | null = null;
  private stopped = false;
  private lastState: ViewState | null = null;
  private readonly sweep = new CompletionSweep();
  private lastPaint = 0;
  private readonly visibility = () => {
    this.sweep.cancel();
    if(!document.hidden && this.lastState)this.draw(this.lastState);
  };
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({ canvas, clearColor: { r: .02, g: .045, b: .065, a: 1 }, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio, 2) });
    await this.engine.init();
    if (this.stopped) { this.engine.destroy(); return; }
    this.world = new World('LED Sudoku');
    const camera = new Entity('LED camera');
    camera.addComponent(new Camera3D({ type: 'orthographic', left: -1, right: 1, top: 1, bottom: -1, near: .1, far: 20 }));
    const transform = new CartesianTransform3D({ position: [0, 4, 0] }); transform.setRotation(-Math.PI / 2, 0, 0); camera.addComponent(transform); this.world.addEntity(camera);
    const integration = new RenderIntegration(this.engine, { label: 'LED Sudoku board' }); this.world.addRuntimeIntegration(integration);
    this.renderer=new Render3DSystem(this.engine, camera, { loadOp: 'clear' });this.world.addSystem(this.renderer);
    const board = new Entity('LED board surface'); board.addComponent(new CartesianTransform3D()); board.addComponent(new Mesh3D(createPlane3D({ width: 2, height: 2, normal: 'y' }), this.material)); this.world.addEntity(board);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.surface.width = this.surface.height = 1260;
    this.createTexture();
    this.engine.on('device-restored', () => { this.createTexture(); if (this.lastState) this.draw(this.lastState); });
    this.engine.on('update', ({ detail: { time, delta } }) => {
      if(this.sweep.active && this.lastState){
        const now=performance.now(),progress=this.sweep.progress(now);
        if(progress===undefined || now-this.lastPaint>=32)this.paint(this.lastState,progress);
      }
      if (this.pending > 0) { this.world.update(time, delta); this.pending--; } });
    this.observer = new ResizeObserver(() => { this.engine.resizeToDisplaySize(); this.pending = 3; }); this.observer.observe(canvas);
    document.addEventListener('visibilitychange',this.visibility);
    this.engine.resizeToDisplaySize(); this.engine.run();
  }
  private createTexture(): void {
    this.texture?.destroy();
    this.texture = requireEngineDevice(this.engine).createTexture({ label: 'LED Sudoku raster', size: [1260, 1260], format: 'rgba8unorm-srgb', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    this.material.texture = this.texture;
  }
  draw(state: ViewState): void {
    if (this.stopped) return;
    this.renderer.toneMapping=state.theme==='light-blue'?'none':'reinhard';
    this.lastState = state;
    this.sweep.observe(state.puzzle,state.completed===true,performance.now());
    this.paint(state,this.sweep.progress(performance.now()));
  }
  private paint(state: ViewState, completionProgress?: number): void {
    this.lastPaint=performance.now();
    paintBoard(this.surface.getContext('2d')!, {...state,completionProgress});
    requireEngineDevice(this.engine).queue.copyExternalImageToTexture({ source: this.surface }, { texture: this.texture }, [1260, 1260]);
    this.pending = 3;
  }
  stop(): void { this.stopped = true; this.sweep.cancel(); document.removeEventListener('visibilitychange',this.visibility); this.observer?.disconnect(); this.world?.destroy(); this.texture?.destroy(); this.engine?.destroy(); }
}
