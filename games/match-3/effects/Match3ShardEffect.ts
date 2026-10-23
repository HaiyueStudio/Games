import { CartesianTransform3D, Entity, Mesh3D, World } from '@haiyue/engine';
import {
  Geometry3D,
  createBox3D,
  separateGeometryTriangles,
  subdivideGeometryTriangles,
} from '@haiyue/engine/geometry';
import type { BlinnPhongMaterial } from '@haiyue/engine/material';

interface ShardTemplate {
  readonly geometry: Geometry3D;
  readonly center: readonly [number, number, number];
}

interface ShardParticle {
  readonly entity: Entity;
  readonly transform: CartesianTransform3D;
  readonly origin: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly spin: readonly [number, number, number];
  elapsedMs: number;
}

const SHARD_LIFETIME_MS = 660;

/** Reusable presentation effect; it owns shard entities but no match-3 rules. */
export class Match3ShardEffect {
  private readonly templates: ShardTemplate[];
  private readonly particles: ShardParticle[] = [];

  constructor(
    private readonly world: World,
    tileSize: number,
    tileDepth: number,
  ) {
    const source = subdivideGeometryTriangles(createBox3D({
      width: tileSize,
      height: tileSize,
      depth: tileDepth,
    }), { iterations: 1 });
    this.templates = createShardTemplates(separateGeometryTriangles(source));
  }

  get triangleCount(): number {
    return this.templates.length;
  }

  get particleCount(): number {
    return this.particles.length;
  }

  shatter(
    tileId: number,
    material: BlinnPhongMaterial,
    tilePosition: readonly [number, number, number],
    triangleStride = 1,
  ): void {
    const stride = Math.max(1, Math.floor(triangleStride));
    for (let index = 0; index < this.templates.length; index += stride) {
      const template = requiredItem(this.templates, index, 'match-3 shard templates');
      const seed = tileId * 131 + index * 977;
      const jitterX = hashUnit(seed + 1) * 2 - 1;
      const jitterY = hashUnit(seed + 2) * 2 - 1;
      const jitterZ = hashUnit(seed + 3) * 2 - 1;
      const center = template.center;
      const origin: readonly [number, number, number] = [
        tilePosition[0] + center[0],
        tilePosition[1] + center[1],
        tilePosition[2] + center[2],
      ];
      const transform = new CartesianTransform3D({ position: [...origin] });
      const entity = new Entity(`GemShard-${tileId}-${index}`);
      entity.addComponent(transform);
      entity.addComponent(new Mesh3D(template.geometry, material));
      this.world.addEntity(entity);
      this.particles.push({
        entity,
        transform,
        origin,
        velocity: [
          center[0] * 3.1 + jitterX * 1.25,
          center[1] * 2.2 + 1.35 + jitterY * 0.8,
          center[2] * 2.8 + 1.1 + jitterZ * 1.05,
        ],
        spin: [
          (hashUnit(seed + 4) * 2 - 1) * 8.5,
          (hashUnit(seed + 5) * 2 - 1) * 8.5,
          (hashUnit(seed + 6) * 2 - 1) * 8.5,
        ],
        elapsedMs: 0,
      });
    }
  }

  update(deltaMs: number): void {
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = requiredItem(this.particles, index, 'match-3 shard particles');
      particle.elapsedMs += deltaMs;
      const progress = Math.min(1, particle.elapsedMs / SHARD_LIFETIME_MS);
      const travel = progress * 0.72;
      const scale = Math.max(0, 1 - smoothstep(0.28, 1, progress));
      particle.transform
        .setPosition(
          particle.origin[0] + particle.velocity[0] * travel,
          particle.origin[1] + particle.velocity[1] * travel - 2.7 * travel * travel,
          particle.origin[2] + particle.velocity[2] * travel,
        )
        .setRotation(
          particle.spin[0] * travel,
          particle.spin[1] * travel,
          particle.spin[2] * travel,
        )
        .setScale(scale, scale, scale);
      if (progress >= 1) {
        this.world.removeEntity(particle.entity);
        this.particles.splice(index, 1);
      }
    }
  }

  clear(): void {
    for (const particle of this.particles) this.world.removeEntity(particle.entity);
    this.particles.length = 0;
  }
}

function createShardTemplates(separated: Geometry3D): ShardTemplate[] {
  if (separated.indices !== null) throw new Error('Separated shard geometry must be non-indexed.');
  if (separated.positions.length % 9 !== 0) throw new Error('Separated shard geometry has incomplete triangles.');
  const templates: ShardTemplate[] = [];
  for (let offset = 0; offset < separated.positions.length; offset += 9) {
    const ax = requiredNumber(separated.positions, offset, 'shard positions');
    const ay = requiredNumber(separated.positions, offset + 1, 'shard positions');
    const az = requiredNumber(separated.positions, offset + 2, 'shard positions');
    const bx = requiredNumber(separated.positions, offset + 3, 'shard positions');
    const by = requiredNumber(separated.positions, offset + 4, 'shard positions');
    const bz = requiredNumber(separated.positions, offset + 5, 'shard positions');
    const cx = requiredNumber(separated.positions, offset + 6, 'shard positions');
    const cy = requiredNumber(separated.positions, offset + 7, 'shard positions');
    const cz = requiredNumber(separated.positions, offset + 8, 'shard positions');
    const center: readonly [number, number, number] = [
      (ax + bx + cx) / 3,
      (ay + by + cy) / 3,
      (az + bz + cz) / 3,
    ];
    const normals = separated.normals
      ? separated.normals.slice(offset, offset + 9)
      : triangleNormals(ax, ay, az, bx, by, bz, cx, cy, cz);
    templates.push({
      center,
      geometry: new Geometry3D({
        positions: new Float32Array([
          ax - center[0], ay - center[1], az - center[2],
          bx - center[0], by - center[1], bz - center[2],
          cx - center[0], cy - center[1], cz - center[2],
        ]),
        normals,
        cullMode: 'none',
      }),
    });
  }
  return templates;
}

function triangleNormals(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): Float32Array {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return new Float32Array([
    nx / length, ny / length, nz / length,
    nx / length, ny / length, nz / length,
    nx / length, ny / length, nz / length,
  ]);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

function hashUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function requiredNumber(values: Float32Array, index: number, label: string): number {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} is missing index ${index}.`);
  return value;
}

function requiredItem<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} is missing index ${index}.`);
  return value;
}
