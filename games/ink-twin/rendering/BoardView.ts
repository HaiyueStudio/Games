import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, Geometry3D, Mesh3D, World } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GameEngine } from '../../session/GameEngine';
import type { GameState } from '../rules/model';
import type { InkBoardArt } from '../art/InkBoardArt';

/** Paint the ink once per move; Engine owns presentation, host textures and the GPU lifecycle. */
export class InkBoardView {
  readonly engine: GameEngine;
  private readonly raster = document.createElement('canvas');
  private readonly world = new World('Ink Twin board');
  private texture: GPUTexture | null = null;
  private disposed = false;
  constructor(readonly canvas: HTMLCanvasElement, private readonly art: InkBoardArt) {
    this.raster.width = this.raster.height = 1024;
    this.engine = new GameEngine({ canvas, msaaSamples: 4, clearColor: { r: .66, g: .66, b: .63, a: 1 }, devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2) });
  }
  async init(): Promise<void> {
    await this.engine.init(); if (this.disposed) return;
    this.texture = this.engine.device.createTexture({ label: 'Ink Twin live board', size: [1024, 1024], format: 'rgba8unorm-srgb', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    const lens = new Camera3D({ type: 'orthographic', near: .1, far: 100 });
    lens.orthoLeft = -1; lens.orthoRight = 1; lens.orthoTop = 1; lens.orthoBottom = -1;
    const camera = new Entity('Paper camera').addComponent(lens).addComponent(new CartesianTransform3D({ position: [0, 0, 10] }));
    this.world.addEntity(camera);
    this.world.addSystem(new Render3DSystem(this.engine, camera, { loadOp: 'clear', toneMapping: 'none' }));
    const geometry = new Geometry3D({ positions: new Float32Array([-1, 1, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0]), textureCoordinates: [{ set: 0, data: new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]) }], indices: new Uint16Array([0, 1, 2, 0, 2, 3]), cullMode: 'none' });
    this.world.addEntity(new Entity('Ink on xuan paper').addComponent(new CartesianTransform3D()).addComponent(new Mesh3D(geometry, new BasicMaterial({ texture: this.texture, color: [1, 1, 1, 1], cullMode: 'none', depthWrite: false }))));
    const integration = new RenderIntegration(this.engine, { label: 'InkTwin.board' });
    this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.engine.on('update', event => this.world.update(event.detail.time, event.detail.delta));
  }
  draw(state: GameState, active: 'black' | 'white'): void {
    if (!this.texture || this.disposed) return;
    this.art.draw(this.raster, state, active);
    this.engine.device.queue.copyExternalImageToTexture({ source: this.raster }, { texture: this.texture }, [1024, 1024]);
  }
  resize(): void { if (this.engine.state === 'ready') this.engine.resizeToDisplaySize(); }
  run(): void { if (!this.disposed) this.engine.run(); }
  destroy(): void {
    if (this.disposed) return; this.disposed = true;
    this.engine.stop(); this.world.destroy(); this.texture?.destroy(); this.texture = null; this.engine.destroy();
  }
}
