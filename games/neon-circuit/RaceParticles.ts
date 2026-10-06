import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D, createPlane3D, type World } from '@haiyue/engine';

type Vec3 = readonly [number, number, number];
interface Particle {
  transform: CartesianTransform3D; mesh: Mesh3D; material: BasicMaterial;
  age: number; life: number; position: number[]; velocity: number[];
  size: number; growth: number; opacity: number; spin: number; spark: boolean;
}

/** Bounded world-space billboards share the scene's HDR pass and depth attachment. */
export class RaceParticles {
  private readonly smoke: Particle[];
  private readonly sparks: Particle[];
  private carry = 0;
  private seed = 417;

  constructor(world: World, smokeTexture: GPUTexture, sparkTexture: GPUTexture) {
    const geometry = createPlane3D({ width: 1, height: 1, normal: 'z' });
    const create = (spark: boolean, index: number): Particle => {
      const material = new BasicMaterial({ texture: spark ? sparkTexture : smokeTexture,
        color: [1, 1, 1, 0], blending: spark ? 'additive' : 'normal', depthWrite: false, cullMode: 'none' });
      const mesh = new Mesh3D(geometry, material);
      mesh.disabled = true;
      const transform = new CartesianTransform3D();
      const entity = new Entity(`${spark ? 'Rail spark' : 'Smoke puff'} ${index}`);
      entity.addComponent(transform); entity.addComponent(mesh); world.addEntity(entity);
      return { transform, mesh, material, age: 0, life: 0, position: [0, 0, 0], velocity: [0, 0, 0],
        size: 1, growth: 1, opacity: 0, spin: 0, spark };
    };
    this.smoke = Array.from({ length: 72 }, (_, i) => create(false, i));
    this.sparks = Array.from({ length: 160 }, (_, i) => create(true, i));
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private emit(pool: Particle[], position: Vec3, velocity: Vec3, opacity: number, impact = false): void {
    const p = pool.find(item => item.life === 0);
    if (!p) return;
    p.age = 0; p.life = p.spark ? 0.25 + this.random() * 0.45 : impact ? 0.7 + this.random() * 0.5 : 1.3 + this.random() * 0.6;
    p.position = [...position]; p.velocity = [...velocity]; p.opacity = opacity;
    p.size = p.spark ? 1.5 + this.random() * 2 : 3 + this.random() * 2;
    p.growth = p.spark ? -p.size * 0.7 : impact ? 18 : 12;
    p.spin = this.random() * Math.PI * 2;
    p.mesh.disabled = false;
  }

  update(dt: number, position: Vec3, forward: Vec3, rate: number, opacity: number, running: boolean): void {
    if (!running) return;
    for (const pool of [this.smoke, this.sparks]) for (const p of pool) {
      if (!p.life) continue;
      p.age += dt;
      if (p.age >= p.life) { p.life = 0; p.mesh.disabled = true; continue; }
      p.velocity[1]! += (p.spark ? -65 : 4) * dt;
      for (let axis = 0; axis < 3; axis++) p.position[axis]! += p.velocity[axis]! * dt;
    }
    if (rate <= 0) { this.carry = 0; return; }
    this.carry = Math.min(2, this.carry + dt * rate);
    while (this.carry >= 1) {
      this.carry--;
      const side = this.random() > 0.5 ? 1 : -1;
      this.emit(this.smoke, [position[0] + forward[2] * side * 2.8, position[1], position[2] - forward[0] * side * 2.8],
        [-forward[0] * 7 + (this.random() - 0.5) * 3, 8 + this.random() * 5, -forward[2] * 7], opacity);
    }
  }

  /** Face the current camera, including while simulation is paused. */
  faceCamera(theta: number, phi: number): void {
    for (const pool of [this.smoke, this.sparks]) for (const p of pool) {
      if (!p.life) continue;
      const t = p.age / p.life;
      const size = p.size + p.growth * t;
      p.transform.setPosition(p.position[0]!, p.position[1]!, p.position[2]!)
        .setRotation(phi - Math.PI / 2, theta, p.spin + (p.spark ? 0 : p.age * 0.22)).setScale(size, size, size);
      const alpha = p.opacity * (1 - t) * (p.spark ? 1 : Math.min(1, p.age * 12));
      p.material.color = p.spark ? [1, 0.65 - t * 0.4, 0.08, alpha] : [0.72 - t * 0.22, 0.75 - t * 0.22, 0.8 - t * 0.22, alpha];
    }
  }

  collide(position: Vec3, inward: Vec3, forward: Vec3, severity: number): void {
    for (let i = 0; i < Math.round(22 + severity * 50); i++) {
      const speed = 28 + this.random() * 85;
      const spread = (this.random() - 0.5) * 1.8;
      this.emit(this.sparks, position, [(inward[0] + forward[0] * spread) * speed,
        15 + this.random() * 55, (inward[2] + forward[2] * spread) * speed], 1);
    }
    for (let i = 0; i < Math.round(3 + severity * 6); i++) this.emit(this.smoke, position,
      [inward[0] * (8 + this.random() * 15), 8 + this.random() * 15, inward[2] * (8 + this.random() * 15)], 0.38, true);
  }

  get counts(): { smoke: number; sparks: number } {
    return { smoke: this.smoke.filter(p => p.life > 0).length, sparks: this.sparks.filter(p => p.life > 0).length };
  }

  reset(): void {
    this.carry = 0; this.seed = 417;
    for (const pool of [this.smoke, this.sparks]) for (const p of pool) { p.life = 0; p.mesh.disabled = true; }
  }
}
