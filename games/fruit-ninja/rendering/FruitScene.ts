import { BasicMaterial, Camera2D, Camera3D, CartesianTransform3D, Entity, Geometry3D, Mesh3D, Transform2D, World, type HaiyueEngine } from '@haiyue/engine';
import { ParticleEmitter2D } from '@haiyue/engine/components';
import { Particle2DRenderSystem, Particle2DSystem, Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import type { Item, Point, Round } from '../rules/model';

export interface View { x: number; y: number; width: number; height: number; scale: number }
type Visual = { transform: CartesianTransform3D; mesh: Mesh3D; material: BasicMaterial };
type Fragment = Item & { age: number; frame: number };
type Stroke = { a: Point; b: Point; age: number };
const COLORS = [[1, .14, .18, 1], [1, .56, .08, 1], [1, .25, .38, 1], [.56, .9, .12, 1], [1, .88, .42, 1], [1, .18, .3, 1], [1, .96, .85, 1], [.68, .26, .92, 1]] as const;
function quad(u = 0, v = 0, right = 1, bottom = 1, aspect = 1): Geometry3D {
  return new Geometry3D({ positions: new Float32Array([-aspect / 2, .5, 0, -aspect / 2, -.5, 0, aspect / 2, -.5, 0, aspect / 2, .5, 0]),
    textureCoordinates: [{ set: 0, data: new Float32Array([u, v, u, bottom, right, bottom, right, v]) }], indices: new Uint16Array([0, 1, 2, 0, 2, 3]), cullMode: 'none' });
}
export async function loadAtlas(src: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = src; await image.decode(); return image;
}
function backdrop(): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(512, 370, 10, 512, 380, 650);
  gradient.addColorStop(0, '#224740'); gradient.addColorStop(1, '#0b211f'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 768);
  ctx.strokeStyle = '#ffffff05'; ctx.lineWidth = 1;
  for (let x = 0; x < 1024; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 768); ctx.stroke(); }
  for (let y = 0; y < 768; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke(); }
  ctx.strokeStyle = '#afdab619'; ctx.lineWidth = 2;
  for (const radius of [190, 280]) { ctx.beginPath(); ctx.arc(512, 380, radius, 0, Math.PI * 2); ctx.stroke(); }
  return canvas;
}

/** Atlas quads and a bounded ribbon pool; Engine owns GPU uploads, blending and particles. */
export class FruitScene {
  readonly world = new World('Fruit sprites');
  private readonly camera = new Camera3D({ type: 'orthographic', near: .1, far: 2000 });
  private readonly particleCamera = new Camera2D({ viewportMode: 'fixed' });
  // Generated atlases have approximate cell gutters. Explicit measured bounds keep
  // neighboring fruit out of each frame, preserving the source pixel aspect ratio.
  private readonly frames = [...Array.from({ length: 12 }, (_, n) => {
    const [left, right] = [[16, 404], [404, 728], [744, 1070]][n % 3]!;
    const [top, bottom] = [[0, 354], [355, 704], [704, 1078], [1078, 1448]][Math.floor(n / 3)]!;
    return quad(left! / 1086, top! / 1448, right! / 1086, bottom! / 1448, (right! - left!) / (bottom! - top!));
  }), ...Array.from({ length: 12 }, (_, n) => {
    const [left, right] = [[16, 380], [400, 718], [750, 1070]][n % 3]!;
    const [top, bottom] = [[0, 350], [350, 700], [700, 1048], [1048, 1448]][Math.floor(n / 3)]!;
    return quad(left! / 1086, top! / 1448, right! / 1086, bottom! / 1448, (right! - left!) / (bottom! - top!));
  }), quad(0, 0, .5, 1), quad(.5, 0, 1, 1)];
  private readonly unit = quad();
  private readonly sprites: Visual[] = [];
  private readonly ribbons: Visual[] = [];
  private readonly emitters: { emitter: ParticleEmitter2D; transform: Transform2D }[] = [];
  private readonly background: Visual;
  private fragments: Fragment[] = [];
  private strokes: Stroke[] = [];
  private emitterIndex = 0;
  private flash = 0;
  constructor(private readonly engine: HaiyueEngine, effects: World, private readonly fruitAtlas: HTMLImageElement, private readonly extraFruitAtlas: HTMLImageElement, private readonly itemAtlas: HTMLImageElement) {
    const camera = new Entity('Fruit camera').addComponent(this.camera).addComponent(new CartesianTransform3D({ position: [0, 0, 1000] }));
    this.world.addEntity(camera);
    const render = new Render3DSystem(engine, camera, { loadOp: 'clear' }); render.transparentSort = true; this.world.addSystem(render);
    this.background = this.visual('Backdrop', backdrop());
    for (let i = 0; i < 88; i++) this.sprites.push(this.visual(`Fruit slot ${i}`, fruitAtlas));
    for (let i = 0; i < 64; i++) this.ribbons.push(this.visual(`Blade ribbon ${i}`));
    const camera2D = new Entity('Juice camera').addComponent(this.particleCamera).addComponent(new Transform2D()); effects.addEntity(camera2D);
    effects.addSystem(new Particle2DSystem()); effects.addSystem(new Particle2DRenderSystem(engine, camera2D, { loadOp: 'load', priority: 100 }));
    for (let i = 0; i < 16; i++) {
      const emitter = new ParticleEmitter2D({ maxParticles: 72, emissionRate: 0, emitting: false, lifetime: [.25, .65], angle: [0, Math.PI * 2], startSize: [4, 12], endSize: 1, seed: 100 + i });
      const transform = new Transform2D(); this.emitters.push({ emitter, transform });
      effects.addEntity(new Entity(`Juice emitter ${i}`).addComponent(transform).addComponent(emitter));
    }
    const integration = new RenderIntegration(engine, { label: 'Fruit.scene' }); this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, () => ({ pass: 'shared' }));
  }
  private visual(name: string, texture?: HTMLImageElement | HTMLCanvasElement): Visual {
    const transform = new CartesianTransform3D({ scale: [0, 0, 1] });
    const material = new BasicMaterial({ ...(texture ? { texture } : {}), blending: 'normal', depthWrite: false, cullMode: 'none' });
    const mesh = new Mesh3D(this.unit, material); this.world.addEntity(new Entity(name).addComponent(transform).addComponent(mesh));
    return { transform, material, mesh };
  }
  private place(visual: Visual, x: number, y: number, width: number, height: number, angle: number, z: number): void {
    visual.transform.setPosition(x - this.engine.displayWidth / 2, this.engine.displayHeight / 2 - y, z);
    visual.transform.setScale(width, height, 1); visual.transform.setRotation(0, 0, -angle);
  }
  trail(a: Point, b: Point): void {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return;
    this.strokes.push({ a: { ...a }, b: { ...b }, age: 0 }); if (this.strokes.length > 32) this.strokes.shift();
  }
  cut(item: Item, view: View): void {
    const { emitter, transform } = this.emitters[this.emitterIndex++ % this.emitters.length]!;
    const bomb = item.kind === 'bomb', color = item.kind === 'fruit' ? COLORS[item.fruit]! : bomb ? [1, .42, .06, 1] as const : [.3, 1, .8, 1] as const;
    transform.setPosition(view.x + item.x * view.scale - this.engine.displayWidth / 2, this.engine.displayHeight / 2 - view.y - item.y * view.scale);
    emitter.clear(); emitter.startColor = color; emitter.endColor = [color[0], color[1] * .6, color[2] * .5, 0];
    emitter.speed = bomb ? [100, 460] : [60, 260]; emitter.gravity = [0, bomb ? -130 : -420];
    emitter.startSize = bomb ? [7, 25] : [3, 12]; emitter.blendMode = bomb ? 'additive' : 'normal'; emitter.emit(bomb ? 72 : 34);
    if (bomb) this.flash = .28;
    if (item.kind === 'fruit') {
      for (let side = 0; side < 2; side++) this.fragments.push({ ...item, frame: item.fruit * 3 + 1 + side, age: 0, vx: item.vx + (side ? 150 : -150), vy: item.vy * .25 - 100, spin: side ? 3 : -3 });
      if (this.fragments.length > 64) this.fragments.splice(0, this.fragments.length - 64);
    }
  }
  sync(round: Round, view: View, dt: number): void {
    const w = this.engine.displayWidth, h = this.engine.displayHeight;
    this.camera.orthoLeft = -w / 2; this.camera.orthoRight = w / 2; this.camera.orthoTop = h / 2; this.camera.orthoBottom = -h / 2;
    this.particleCamera.setViewportFit({ designWidth: w, designHeight: h, viewportMode: 'fixed' });
    this.particleCamera.resize(w, h);
    this.flash = Math.max(0, this.flash - dt);
    this.background.material.color = [1 + this.flash * 2, 1 - this.flash, 1 - this.flash, 1];
    const backgroundScale = Math.max(w / 1024, h / 768);
    this.place(this.background, w / 2, h / 2, 1024 * backgroundScale, 768 * backgroundScale, 0, -10);
    for (const part of this.fragments) { part.age += dt; part.x += part.vx * dt; part.y += part.vy * dt; part.vy += round.height * 2 * dt; part.angle += part.spin * dt; }
    this.fragments = this.fragments.filter(part => part.age < 1 && part.y < round.height + 100);
    let index = 0;
    const draw = (item: Item, frame: number, opacity: number) => {
      const sprite = this.sprites[index++]!; sprite.mesh.geometry = this.frames[frame]!;
      sprite.material.texture = frame < 12 ? this.fruitAtlas : frame < 24 ? this.extraFruitAtlas : this.itemAtlas; sprite.material.color = [1, 1, 1, opacity];
      const size = item.radius * 2.65 * view.scale;
      this.place(sprite, view.x + item.x * view.scale, view.y + item.y * view.scale, size, size, item.angle, index * .01);
    };
    for (const item of round.items) draw(item, item.kind === 'fruit' ? item.fruit * 3 : item.kind === 'bomb' ? 24 : 25, 1);
    for (const part of this.fragments) draw(part, part.frame, Math.min(1, (1 - part.age) * 3));
    while (index < this.sprites.length) this.sprites[index++]!.transform.setScale(0, 0, 1);
    this.strokes.forEach(stroke => { stroke.age += dt; }); this.strokes = this.strokes.filter(stroke => stroke.age < .22);
    index = 0;
    for (const stroke of this.strokes) {
      const fade = 1 - stroke.age / .22, dx = stroke.b.x - stroke.a.x, dy = stroke.b.y - stroke.a.y;
      for (let layer = 0; layer < 2; layer++) {
        const ribbon = this.ribbons[index++]!; ribbon.material.color = layer ? [.9, 1, .96, fade] : [.25, 1, .72, fade * .36];
        this.place(ribbon, (stroke.a.x + stroke.b.x) / 2, (stroke.a.y + stroke.b.y) / 2, Math.hypot(dx, dy) + 2, (layer ? 3 : 13) * fade, Math.atan2(dy, dx), 4 + layer);
      }
    }
    while (index < this.ribbons.length) this.ribbons[index++]!.transform.setScale(0, 0, 1);
  }
  clear(): void { this.fragments = []; this.strokes = []; this.flash = 0; for (const { emitter } of this.emitters) emitter.clear(); }
  snapshot() { return { fragments: this.fragments.length, trail: this.strokes.length, particles: this.emitters.reduce((sum, slot) => sum + slot.emitter.activeParticles, 0), spriteCapacity: this.sprites.length, viewport: { width: this.particleCamera.width, height: this.particleCamera.height } }; }
  destroy(): void { this.world.destroy(); }
}
