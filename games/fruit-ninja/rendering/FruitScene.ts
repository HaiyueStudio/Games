import { BasicMaterial, Camera2D, Camera3D, CartesianTransform3D, Entity, Geometry3D, Mesh3D, Transform2D, World, type HaiyueEngine } from '@haiyue/engine';
import { ParticleEmitter2D } from '@haiyue/engine/components';
import { Particle2DRenderSystem, Particle2DSystem, Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import type { AssetHandle } from '@haiyue/engine/assets';
import type { Item, Point, Round } from '../rules/model';
import { BLAST_SECONDS, MAX_BLASTS, bombShake, type Blast } from './bombFeedback';
import { createJuiceMark, juiceRandom, sampleJuiceDrip, JUICE_VARIANTS, STAIN_SECONDS, DRIPS_PER_STAIN, type JuiceMark } from './juice';
import { FLIGHT_SPEED, ITEM_RADIUS } from '../rules/model';
import { SPRITE_SIZE } from './layout';

export interface View { x: number; y: number; width: number; height: number; scale: number }
type Visual = { transform: CartesianTransform3D; mesh: Mesh3D; material: BasicMaterial };
type Fragment = Item & { age: number; frame: number };
type Stroke = { a: Point; b: Point; age: number };
type Texture = { readonly texture: GPUTexture };
const MAX_STAINS = 40;
const MAX_BURSTS = 16;
const COLORS = [[1, .14, .18, 1], [1, .56, .08, 1], [1, .25, .38, 1], [.56, .9, .12, 1], [1, .88, .42, 1], [1, .18, .3, 1], [1, .96, .85, 1], [.68, .26, .92, 1]] as const;
function quad(u = 0, v = 0, right = 1, bottom = 1, aspect = 1): Geometry3D {
  return new Geometry3D({ positions: new Float32Array([-aspect / 2, .5, 0, -aspect / 2, -.5, 0, aspect / 2, -.5, 0, aspect / 2, .5, 0]),
    textureCoordinates: [{ set: 0, data: new Float32Array([u, v, u, bottom, right, bottom, right, v]) }], indices: new Uint16Array([0, 1, 2, 0, 2, 3]), cullMode: 'none' });
}
export async function loadAtlas(src: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = src; await image.decode(); return image;
}
function juiceTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  for (let variant = 0; variant < JUICE_VARIANTS; variant++) {
    const random = juiceRandom(7919 * (variant + 1)), bias = random() * Math.PI * 2;
    ctx.save(); ctx.translate(variant % 4 * 256 + 128, Math.floor(variant / 4) * 256 + 128);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    const points = Array.from({ length: 20 }, (_, i) => {
      const angle = i / 20 * Math.PI * 2, radius = 25 + random() * 27;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    ctx.beginPath();
    const last = points.at(-1)!, first = points[0]!; ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    points.forEach((point, i) => { const next = points[(i + 1) % points.length]!; ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2); });
    ctx.closePath(); ctx.globalAlpha = .88; ctx.fill();
    for (let i = 0, count = 5 + Math.floor(random() * 9); i < count; i++) {
      const angle = bias + (random() - .5) * 5, length = 40 + random() * 52, width = 3 + random() * 10;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      ctx.globalAlpha = .55 + random() * .35; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(dx * 22, dy * 22); ctx.quadraticCurveTo(dx * length * .7 - dy * 9, dy * length * .7 + dx * 9, dx * length, dy * length); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(dx * length, dy * length, width * .8, width * .65, angle, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0, count = 12 + Math.floor(random() * 18); i < count; i++) {
      const angle = random() * Math.PI * 2, distance = 45 + random() * 66, radius = 1 + random() * 5;
      ctx.globalAlpha = .35 + random() * .6; ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * distance, Math.sin(angle) * distance, radius, radius * (.55 + random()), angle, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  return canvas;
}

function dripTexture(drop = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = drop ? 64 : 256;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff';
  ctx.beginPath();
  if (drop) {
    ctx.moveTo(32, 5); ctx.bezierCurveTo(28, 23, 16, 33, 19, 46); ctx.bezierCurveTo(22, 61, 45, 61, 46, 45); ctx.bezierCurveTo(47, 33, 35, 20, 32, 5);
  } else {
    ctx.moveTo(14, 0); ctx.bezierCurveTo(19, 65, 28, 152, 25, 256); ctx.lineTo(39, 256); ctx.bezierCurveTo(42, 152, 40, 65, 50, 0);
  }
  ctx.closePath(); ctx.fill(); return canvas;
}

function blastTexture(ring = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 124);
  for (const [stop, alpha] of ring ? [[0, 0], [.77, 0], [.86, .25], [.92, 1], [.97, .3], [1, 0]] : [[0, 1], [.2, .95], [.46, .65], [.72, .18], [1, 0]]) {
    gradient.addColorStop(stop!, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256); return canvas;
}

/** Atlas quads and a bounded ribbon pool; Engine owns GPU uploads, blending and particles. */
export class FruitScene {
  readonly world = new World('Fruit sprites');
  private readonly camera = new Camera3D({ type: 'orthographic', near: .1, far: 2000 });
  private readonly particleCamera = new Camera2D({ viewportMode: 'fixed' });
  private readonly cameraTransform = new CartesianTransform3D({ position: [0, 0, 1000] });
  private readonly particleCameraTransform = new Transform2D();
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
  private readonly stains: Visual[] = [];
  private readonly bursts: Visual[] = [];
  private readonly juiceFrames = Array.from({ length: JUICE_VARIANTS }, (_, i) => quad(i % 4 / 4, Math.floor(i / 4) / 3, (i % 4 + 1) / 4, (Math.floor(i / 4) + 1) / 3));
  private readonly drips: { trail: Visual; drop: Visual }[] = [];
  private readonly blastSlots: { glow: Visual; core: Visual; rings: Visual[]; smoke: Visual[]; shards: Visual[] }[] = [];
  private readonly impactFlash: Visual;
  private readonly emitters: { emitter: ParticleEmitter2D; transform: Transform2D }[] = [];
  private readonly background: Visual;
  private readonly textureSources: (HTMLImageElement | HTMLCanvasElement)[];
  private textures: AssetHandle<GPUTexture>[] = [];
  private atlases: Texture[] = [];
  private fragments: Fragment[] = [];
  private strokes: Stroke[] = [];
  private juice: JuiceMark[] = [];
  private emitterIndex = 0;
  private flash = 0;
  private blasts: Blast[] = [];
  private shake = { x: 0, y: 0 };
  private disposed = false;
  constructor(private readonly engine: HaiyueEngine, effects: World, fruitAtlas: HTMLImageElement, extraFruitAtlas: HTMLImageElement, itemAtlas: HTMLImageElement, private readonly backdrop: HTMLImageElement) {
    const background = backdrop, splatter = juiceTexture(), glow = blastTexture(), ring = blastTexture(true), drip = dripTexture(), drop = dripTexture(true);
    this.textureSources = [fruitAtlas, extraFruitAtlas, itemAtlas, background, splatter, glow, ring, drip, drop];
    const camera = new Entity('Fruit camera').addComponent(this.camera).addComponent(this.cameraTransform);
    this.world.addEntity(camera);
    const render = new Render3DSystem(engine, camera, { loadOp: 'clear' }); render.transparentSort = true; this.world.addSystem(render);
    this.background = this.visual('Backdrop', background);
    for (let i = 0; i < 88; i++) this.sprites.push(this.visual(`Fruit slot ${i}`, fruitAtlas));
    for (let i = 0; i < 64; i++) this.ribbons.push(this.visual(`Blade ribbon ${i}`));
    for (let index = 0; index < MAX_STAINS; index++) this.stains.push(this.visual(`Background juice ${index}`, splatter));
    for (let index = 0; index < MAX_BURSTS; index++) this.bursts.push(this.visual(`Juice burst ${index}`, splatter));
    for (let index = 0; index < MAX_STAINS * DRIPS_PER_STAIN; index++) this.drips.push({ trail: this.visual(`Juice run ${index}`, drip), drop: this.visual(`Juice drop ${index}`, drop) });
    this.impactFlash = this.visual('Bomb screen flash');
    for (let i = 0; i < MAX_BLASTS; i++) this.blastSlots.push({
      glow: this.visual(`Blast glow ${i}`, glow), core: this.visual(`Blast core ${i}`, glow),
      rings: Array.from({ length: 2 }, (_, j) => this.visual(`Shockwave ${i}:${j}`, ring)),
      smoke: Array.from({ length: 8 }, (_, j) => this.visual(`Blast smoke ${i}:${j}`, glow)),
      shards: Array.from({ length: 12 }, (_, j) => this.visual(`Bomb shard ${i}:${j}`)),
    });
    const camera2D = new Entity('Juice camera').addComponent(this.particleCamera).addComponent(this.particleCameraTransform); effects.addEntity(camera2D);
    effects.addSystem(new Particle2DSystem()); effects.addSystem(new Particle2DRenderSystem(engine, camera2D, { loadOp: 'load', priority: 100 }));
    for (let i = 0; i < 24; i++) {
      const emitter = new ParticleEmitter2D({ maxParticles: 128, emissionRate: 0, emitting: false, radial: true, lifetime: [.45, 1.05], angle: [0, Math.PI * 2], startSize: [5, 18], endSize: 1, shape: 'circle', shapeRadius: 5, seed: 100 + i });
      const transform = new Transform2D(); this.emitters.push({ emitter, transform });
      effects.addEntity(new Entity(`Juice emitter ${i}`).addComponent(transform).addComponent(emitter));
    }
    const integration = new RenderIntegration(engine, { label: 'Fruit.scene' }); this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, () => ({ pass: 'shared' }));
  }
  async initialize(signal: AbortSignal): Promise<void> {
    const assets = this.engine.assetManager;
    if (!assets) throw new Error('Fruit textures require an initialized Engine asset manager.');
    const results = await Promise.allSettled(this.textureSources.map(source => assets.loadTexture(source, { format: 'rgba8unorm-srgb', signal })));
    const handles = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failure = results.find(result => result.status === 'rejected');
    if (this.disposed || signal.aborted || failure) {
      for (const handle of handles) handle.release();
      if (failure) throw failure.reason;
      return;
    }
    this.textures = handles;
    this.atlases = handles.map(handle => ({ get texture() { return handle.value; } }));
    for (const sprite of this.sprites) sprite.material.texture = this.atlases[0]!;
    this.background.material.texture = this.atlases[3]!;
    for (const mark of [...this.stains, ...this.bursts]) mark.material.texture = this.atlases[4]!;
    for (const drip of this.drips) { drip.trail.material.texture = this.atlases[7]!; drip.drop.material.texture = this.atlases[8]!; }
    for (const slot of this.blastSlots) {
      for (const visual of [slot.glow, slot.core, ...slot.smoke]) visual.material.texture = this.atlases[5]!;
      for (const visual of slot.rings) visual.material.texture = this.atlases[6]!;
    }
  }
  private visual(name: string, texture?: HTMLImageElement | HTMLCanvasElement | Texture): Visual {
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
    const scale = Math.max(.4, item.radius / ITEM_RADIUS * view.scale);
    emitter.speed = bomb ? [260 * scale, 950 * scale] : [150 * scale, 620 * scale]; emitter.gravity = [0, (bomb ? -320 : -700) * scale];
    emitter.lifetime = bomb ? [.3, .85] : [.45, 1.05];
    emitter.startSize = bomb ? [9 * scale, 32 * scale] : [5 * scale, 19 * scale]; emitter.blendMode = bomb ? 'additive' : 'normal'; emitter.emit(bomb ? 128 : 112);
    if (bomb) {
      this.flash = .32;
      this.blasts.push({ x: item.x, y: item.y, radius: item.radius, age: 0, seed: item.id });
      if (this.blasts.length > MAX_BLASTS) this.blasts.shift();
    }
    if (item.kind === 'fruit') {
      this.juice.push(createJuiceMark(item));
      if (this.juice.length > MAX_STAINS) this.juice.shift();
      for (let side = 0; side < 2; side++) this.fragments.push({ ...item, frame: item.fruit * 3 + 1 + side, age: 0, vx: item.vx + (side ? 150 : -150), vy: item.vy * .25 - 100, spin: side ? 3 : -3 });
      if (this.fragments.length > 64) this.fragments.splice(0, this.fragments.length - 64);
    }
  }
  sync(round: Round, view: View, dt: number): void {
    const w = this.engine.displayWidth, h = this.engine.displayHeight;
    this.camera.orthoLeft = -w / 2; this.camera.orthoRight = w / 2; this.camera.orthoTop = h / 2; this.camera.orthoBottom = -h / 2;
    this.particleCamera.setViewportFit({ designWidth: w, designHeight: h, viewportMode: 'fixed' });
    this.particleCamera.resize(w, h);
    for (const blast of this.blasts) blast.age += dt;
    this.blasts = this.blasts.filter(blast => blast.age < BLAST_SECONDS);
    this.shake = bombShake(this.blasts, view.scale);
    this.cameraTransform.setPosition(this.shake.x, -this.shake.y, 1000);
    this.particleCameraTransform.setPosition(this.shake.x, -this.shake.y);
    this.flash = Math.max(0, this.flash - dt);
    this.background.material.color = [1 + this.flash * 2, 1 - this.flash, 1 - this.flash, 1];
    const backgroundScale = Math.max((w + 80) / this.backdrop.naturalWidth, (h + 80) / this.backdrop.naturalHeight);
    this.place(this.background, w / 2, h / 2, this.backdrop.naturalWidth * backgroundScale, this.backdrop.naturalHeight * backgroundScale, 0, -10);
    for (const mark of this.juice) mark.age += dt;
    this.juice = this.juice.filter(mark => mark.age < STAIN_SECONDS);
    let stainIndex = 0, burstIndex = 0, dripIndex = 0;
    for (const mark of this.juice) {
      const color = COLORS[mark.fruit]!, screenX = view.x + mark.x * view.scale, screenY = view.y + mark.y * view.scale;
      const stain = this.stains[stainIndex++]!, settle = 1 - Math.exp(-mark.age * 16);
      stain.mesh.geometry = this.juiceFrames[mark.variant]!;
      stain.material.color = [color[0], color[1], color[2], mark.opacity * Math.min(1, (STAIN_SECONDS - mark.age) / 8)];
      const size = mark.radius * 6.4 * view.scale * (.72 + settle * .28);
      this.place(stain, screenX, screenY, size * mark.stretch * mark.mirror, size * mark.squash, mark.angle, -6 + stainIndex * .001);
      for (const drip of mark.drips) {
        const slot = this.drips[dripIndex++]!, flow = sampleJuiceDrip(drip, mark.age);
        const x = screenX + drip.x * view.scale, top = screenY + drip.start * view.scale;
        const length = Math.max(0, Math.min(flow.length * view.scale, view.y + view.height - top));
        slot.trail.material.color = [color[0], color[1], color[2], flow.opacity * mark.opacity * .65];
        this.place(slot.trail, x, top + length / 2, drip.width * 2 * view.scale, flow.visible ? length : 0, 0, -5.8);
        const dropY = top + length + flow.dropOffset * view.scale, visible = flow.dropVisible && dropY < view.y + view.height - drip.width * 2 * view.scale;
        slot.drop.material.color = [color[0], color[1], color[2], flow.opacity * mark.opacity];
        const dropSize = visible ? drip.width * (2 + flow.progress) * view.scale : 0;
        this.place(slot.drop, x, dropY, dropSize, dropSize * 1.25, 0, -5.7);
      }
      if (mark.age < .38 && burstIndex < this.bursts.length) {
        const burst = this.bursts[burstIndex++]!, progress = mark.age / .38;
        burst.mesh.geometry = this.juiceFrames[mark.variant]!;
        burst.material.color = [color[0], color[1], color[2], (1 - progress) ** 1.5 * .8];
        const spread = mark.radius * 5 * view.scale * (.35 + Math.sin(progress * Math.PI / 2) * 1.25);
        this.place(burst, screenX, screenY, spread, spread, -mark.angle, 2);
      }
    }
    while (stainIndex < this.stains.length) this.stains[stainIndex++]!.transform.setScale(0, 0, 1);
    while (burstIndex < this.bursts.length) this.bursts[burstIndex++]!.transform.setScale(0, 0, 1);
    while (dripIndex < this.drips.length) { const slot = this.drips[dripIndex++]!; slot.trail.transform.setScale(0, 0, 1); slot.drop.transform.setScale(0, 0, 1); }
    const flightDt = dt * FLIGHT_SPEED;
    for (const part of this.fragments) { part.age += dt; part.x += part.vx * flightDt; part.y += part.vy * flightDt; part.vy += round.height * 2 * flightDt; part.angle += part.spin * flightDt; }
    this.fragments = this.fragments.filter(part => part.age < 1 && part.y < round.height + 100);
    let index = 0;
    const draw = (item: Item, frame: number, opacity: number) => {
      const sprite = this.sprites[index++]!; sprite.mesh.geometry = this.frames[frame]!;
      sprite.material.texture = this.atlases[frame < 12 ? 0 : frame < 24 ? 1 : 2]!; sprite.material.color = [1, 1, 1, opacity];
      const size = item.radius * SPRITE_SIZE * view.scale;
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
    this.drawBlasts(view);
  }
  private drawBlasts(view: View): void {
    for (let i = 0; i < this.blastSlots.length; i++) {
      const slot = this.blastSlots[i]!, blast = this.blasts[i];
      if (!blast) {
        for (const visual of [slot.glow, slot.core, ...slot.rings, ...slot.smoke, ...slot.shards]) visual.transform.setScale(0, 0, 1);
        continue;
      }
      const t = blast.age, x = view.x + blast.x * view.scale, y = view.y + blast.y * view.scale, radius = blast.radius * view.scale;
      const fire = Math.max(0, 1 - t / .48), swell = 1 - Math.exp(-t * 22);
      slot.glow.material.color = [1, .22 + fire * .35, .025, fire * .95];
      this.place(slot.glow, x, y, radius * (2 + swell * 7), radius * (2 + swell * 7), 0, 6);
      slot.core.material.color = [1, .9, .65, Math.max(0, 1 - t / .23)];
      this.place(slot.core, x, y, radius * (1.5 + swell * 3.5), radius * (1.5 + swell * 3.5), 0, 7);
      slot.rings.forEach((ring, j) => {
        const progress = Math.max(0, (t - j * .07) / .55), size = radius * (1.7 + Math.min(1, progress) ** .65 * 12);
        ring.material.color = [1, j ? .36 : .85, j ? .06 : .5, t < j * .07 ? 0 : Math.max(0, 1 - progress) ** 1.5 * .9];
        this.place(ring, x, y, size, size, 0, 8 + j * .01);
      });
      slot.smoke.forEach((smoke, j) => {
        const angle = j * Math.PI / 4 + blast.seed, spread = radius * (.5 + t * (1.5 + j % 3 * .4)), size = radius * (1.3 + t * 3);
        smoke.material.color = [.16 + fire * .35, .13 + fire * .08, .12, Math.min(1, t * 12) * (1 - t / BLAST_SECONDS) * .7];
        this.place(smoke, x + Math.cos(angle) * spread, y + Math.sin(angle) * spread - radius * t, size, size, angle, 5.5);
      });
      slot.shards.forEach((shard, j) => {
        const angle = j * 2.39996 + blast.seed, speed = radius * (5 + j % 4 * 2), distance = speed * t;
        const fade = Math.max(0, 1 - t / .8), size = radius * (.08 + j % 3 * .035);
        shard.material.color = j % 3 ? [.16, .13, .1, fade] : [1, .65, .12, fade];
        this.place(shard, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance + radius * 4 * t * t, size * 2.8, size, angle + t * (j % 2 ? 9 : -11), 9);
      });
    }
    this.impactFlash.material.color = [1, .72, .38, Math.max(0, (this.flash - .2) / .12) * .24];
    this.place(this.impactFlash, this.engine.displayWidth / 2, this.engine.displayHeight / 2, this.engine.displayWidth + 80, this.engine.displayHeight + 80, 0, 10);
  }
  clear(): void {
    this.fragments = []; this.strokes = []; this.juice = []; this.blasts = []; this.flash = 0; this.shake = { x: 0, y: 0 };
    this.cameraTransform.setPosition(0, 0, 1000); this.particleCameraTransform.setPosition(0, 0);
    for (const slot of this.blastSlots) for (const visual of [slot.glow, slot.core, ...slot.rings, ...slot.smoke, ...slot.shards]) visual.transform.setScale(0, 0, 1);
    this.impactFlash.transform.setScale(0, 0, 1);
    for (const slot of this.drips) { slot.trail.transform.setScale(0, 0, 1); slot.drop.transform.setScale(0, 0, 1); }
    for (const { emitter } of this.emitters) emitter.clear();
  }
  snapshot() { return { fragments: this.fragments.length, trail: this.strokes.length, stains: this.juice.length,
    juice: this.juice.map(mark => ({ variant: mark.variant, angle: mark.angle, stretch: mark.stretch, squash: mark.squash, age: mark.age, flows: mark.drips.map(drip => sampleJuiceDrip(drip, mark.age)) })), dripCapacity: this.drips.length,
    bursts: Math.min(MAX_BURSTS, this.juice.filter(mark => mark.age < .38).length), explosions: this.blasts.map(blast => ({ ...blast })), shake: { ...this.shake }, blastCapacity: this.blastSlots.length, texturesReady: this.textures.length === this.textureSources.length, particles: this.emitters.reduce((sum, slot) => sum + slot.emitter.activeParticles, 0), spriteCapacity: this.sprites.length, viewport: { width: this.particleCamera.width, height: this.particleCamera.height } }; }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.world.destroy();
    for (const handle of this.textures) handle.release();
    this.textures = []; this.atlases = [];
  }
}
