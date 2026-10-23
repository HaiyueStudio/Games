import { CartesianTransform3D, Entity, World } from '@haiyue/engine';
import { ParticleEmitter3D } from '@haiyue/engine/components';

interface ActiveExplosionEmitter {
  readonly entity: Entity;
  readonly emitter: ParticleEmitter3D;
}

/** Native instanced fire/spark/smoke presentation for triggered bombs. */
export class Match3ExplosionEffect {
  private readonly active: ActiveExplosionEmitter[] = [];

  constructor(private readonly world: World) {}

  get particleCount(): number {
    return this.active.reduce((total, item) => total + item.emitter.activeParticles, 0);
  }

  get emitterCount(): number {
    return this.active.length;
  }

  explode(
    tileId: number,
    position: readonly [number, number, number],
    power: 1 | 2,
  ): void {
    const scale = power === 2 ? 1.55 : 1;
    this.addEmitter(`BombFire-${tileId}`, position, new ParticleEmitter3D({
      maxParticles: power === 2 ? 128 : 72,
      emissionRate: power === 2 ? 110 : 68,
      burst: power === 2 ? 58 : 34,
      duration: power === 2 ? 0.48 : 0.34,
      loop: false,
      seed: tileId * 97 + 11,
      lifetime: [0.34, 0.78],
      speed: [1.1 * scale, 3.9 * scale],
      direction: [0, 1, 0],
      spread: 1.35,
      gravity: [0, 1.4, 0],
      startSize: [0.22 * scale, 0.52 * scale],
      endSize: [0.025, 0.09 * scale],
      rotation: [0, Math.PI * 2],
      angularVelocity: [-3.5, 3.5],
      startColor: [1, 0.97, 0.22, 1],
      endColor: [1, 0.025, 0.002, 0],
      shape: 'sphere',
      shapeRadius: 0.24 * scale,
      blendMode: 'additive',
      radial: true,
      depthTest: true,
      depthWrite: false,
      sortMode: 'none',
    }), 0.40);

    this.addEmitter(`BombSparks-${tileId}`, position, new ParticleEmitter3D({
      maxParticles: power === 2 ? 64 : 36,
      emissionRate: 0,
      burst: power === 2 ? 58 : 32,
      duration: 0.01,
      loop: false,
      seed: tileId * 131 + 23,
      lifetime: [0.28, 0.64],
      speed: [3.2 * scale, 7.4 * scale],
      direction: [0, 1, 0],
      spread: Math.PI,
      gravity: [0, -5.4, 0],
      startSize: [0.055 * scale, 0.12 * scale],
      endSize: [0.005, 0.018],
      startColor: [1, 0.72, 0.08, 1],
      endColor: [1, 0.08, 0.005, 0],
      shape: 'sphere',
      shapeRadius: 0.12 * scale,
      blendMode: 'additive',
      radial: true,
      depthTest: true,
      depthWrite: false,
      sortMode: 'none',
    }), 0.44);

    this.addEmitter(`BombSmoke-${tileId}`, position, new ParticleEmitter3D({
      maxParticles: power === 2 ? 48 : 28,
      emissionRate: power === 2 ? 30 : 18,
      burst: power === 2 ? 16 : 9,
      duration: power === 2 ? 0.68 : 0.48,
      loop: false,
      seed: tileId * 173 + 37,
      lifetime: [0.72, 1.25],
      speed: [0.35, 1.15 * scale],
      direction: [0, 1, 0],
      spread: 0.72,
      gravity: [0, 0.34, 0],
      startSize: [0.17 * scale, 0.34 * scale],
      endSize: [0.48 * scale, 0.82 * scale],
      rotation: [0, Math.PI * 2],
      angularVelocity: [-0.8, 0.8],
      startColor: [0.22, 0.15, 0.13, 0.42],
      endColor: [0.035, 0.035, 0.055, 0],
      shape: 'sphere',
      shapeRadius: 0.18 * scale,
      blendMode: 'normal',
      radial: true,
      depthTest: true,
      depthWrite: false,
      sortMode: 'back-to-front',
    }), 0.22);
  }

  update(): void {
    for (let index = this.active.length - 1; index >= 0; index--) {
      const item = requiredItem(this.active, index, 'explosion emitters');
      if (item.emitter.simulationTime < 1.8 || item.emitter.activeParticles > 0) continue;
      this.world.removeEntity(item.entity);
      this.active.splice(index, 1);
    }
  }

  clear(): void {
    for (const item of this.active) this.world.removeEntity(item.entity);
    this.active.length = 0;
  }

  private addEmitter(
    name: string,
    position: readonly [number, number, number],
    emitter: ParticleEmitter3D,
    zOffset: number,
  ): void {
    const entity = new Entity(name)
      .addComponent(new CartesianTransform3D({ position: [position[0], position[1], position[2] + zOffset] }))
      .addComponent(emitter);
    this.world.addEntity(entity);
    this.active.push({ entity, emitter });
  }
}

function requiredItem<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} is missing index ${index}.`);
  return value;
}
