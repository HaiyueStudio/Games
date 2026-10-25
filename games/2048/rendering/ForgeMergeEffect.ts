import { CartesianTransform3D, Entity, Mesh3D, PbrMaterial, type World } from '@haiyue/engine';
import { Geometry3D, createBox3D, separateGeometryTriangles, subdivideGeometryTriangles } from '@haiyue/engine/geometry';
import type { Game2048Config } from '../rules/config';
import type { TileMerge } from '../rules/rules';
import { mergeMotion } from './mergeMotion';
import { tileAtlasGeometry } from './TileGeometry';
import type { MetalMaterials } from './MetalMaterials';

interface Batch {
  entity: Entity;
  mesh: Mesh3D;
  geometry: Geometry3D;
  merge: TileMerge | null;
}

/** One draw per merge, pooled for the board's maximum simultaneous merges. */
export class ForgeMergeEffect {
  private readonly source: Geometry3D;
  private readonly centers: Float32Array;
  private readonly batches: Batch[] = [];
  private readonly sparkMaterial = new PbrMaterial({ baseColor: [1, 0.58, 0.12, 1], emissiveFactor: [3, 0.8, 0.08], metallic: 0.6, roughness: 0.25, doubleSided: true });
  private readonly sparks: Geometry3D;
  private readonly sparkMesh: Mesh3D;
  private readonly sparkEntity: Entity;
  private elapsed = 0;
  private merges: readonly TileMerge[] = [];
  readonly durationMs: number;

  constructor(private readonly world: World, private readonly config: Game2048Config, private readonly materials: MetalMaterials) {
    this.source = separateGeometryTriangles(subdivideGeometryTriangles(tileAtlasGeometry(createBox3D({ width: config.geometry.tileWidth, height: config.geometry.tileHeight, depth: config.geometry.tileWidth }), config.geometry.tileWidth, config.geometry.tileWidth), { iterations: 2 }));
    this.centers = new Float32Array(this.source.positions.length / 3);
    for (let offset = 0; offset < this.source.positions.length; offset += 9) {
      for (let axis = 0; axis < 3; axis++) this.centers[offset / 3 + axis] = (this.source.positions[offset + axis]! + this.source.positions[offset + axis + 3]! + this.source.positions[offset + axis + 6]!) / 3;
    }
    this.durationMs = config.animation.moveDurationMs + 480;
    this.sparks = new Geometry3D({ positions: new Float32Array(config.rows * config.cols / 2 * 12 * 9), boundsMode: 'dynamic', cullMode: 'none' });
    this.sparkMesh = new Mesh3D(this.sparks, this.sparkMaterial);
    this.sparkMesh.disabled = true;
    this.sparkEntity = new Entity('Forge sparks').addComponent(new CartesianTransform3D()).addComponent(this.sparkMesh);
    world.addEntity(this.sparkEntity);
  }

  get activeCount(): number { return this.merges.length; }
  get triangleCount(): number { return this.source.positions.length / 9 * 2; }
  get poolSize(): number { return this.batches.length; }

  start(merges: readonly TileMerge[]): void {
    this.clear(); this.elapsed = 0; this.merges = merges;
    for (let i = 0; i < merges.length; i++) {
      const merge = merges[i]!;
      let batch = this.batches[i];
      if (!batch) {
        const positions = new Float32Array(this.source.positions.length * 2);
        const normals = new Float32Array(positions.length);
        const sourceUv = this.source.getTextureCoordinates(0)!;
        const uvs = new Float32Array(sourceUv.length * 2);
        uvs.set(sourceUv); uvs.set(sourceUv, sourceUv.length);
        const geometry = new Geometry3D({ positions, normals, textureCoordinates: [{ set: 0, data: uvs }], boundsMode: 'dynamic', cullMode: 'none' });
        const mesh = new Mesh3D(geometry, this.materials.tile(merge.value / 2));
        const entity = new Entity(`Forge triangles ${i}`).addComponent(new CartesianTransform3D()).addComponent(mesh);
        this.world.addEntity(entity);
        batch = { geometry, mesh, entity, merge: null }; this.batches.push(batch);
      }
      batch.merge = merge; batch.mesh.disabled = false; batch.entity.disabled = false;
    }
    this.update(0);
  }

  update(deltaMs: number): void {
    if (!this.merges.length) return;
    this.elapsed += Math.max(0, deltaMs);
    const slide = Math.min(1, this.elapsed / this.config.animation.moveDurationMs);
    const p = Math.max(0, Math.min(1, (this.elapsed - this.config.animation.moveDurationMs) / 480));
    const eased = 1 - (1 - slide) ** 3;
    const size = this.source.positions.length;
    for (const batch of this.batches) {
      const merge = batch.merge; if (!merge) continue;
      batch.mesh.material = this.materials.tile(p < 0.48 ? merge.value / 2 : merge.value);
      for (let copy = 0; copy < 2; copy++) {
        const contributor = merge.sources[copy]!;
        const x = (contributor.fromCol + (merge.toCol - contributor.fromCol) * eased) * this.config.geometry.cellSize;
        const z = (contributor.fromRow + (merge.toRow - contributor.fromRow) * eased) * this.config.geometry.cellSize;
        for (let offset = 0; offset < size; offset += 9) {
          const index = offset / 9;
          const cx = this.centers[offset / 3]!, cy = this.centers[offset / 3 + 1]!, cz = this.centers[offset / 3 + 2]!;
          const motion = mergeMotion(p, index, copy), cosine = Math.cos(motion.rotation), sine = Math.sin(motion.rotation);
          for (let vertex = 0; vertex < 9; vertex += 3) {
            const src = offset + vertex, dst = copy * size + src;
            const vx = (this.source.positions[src]! - cx) * motion.scale;
            const vy = (this.source.positions[src + 1]! - cy) * motion.scale;
            const vz = (this.source.positions[src + 2]! - cz) * motion.scale;
            batch.geometry.positions[dst] = x + cx + vx * cosine - vy * sine + motion.x;
            batch.geometry.positions[dst + 1] = this.config.geometry.tileHeight * 0.55 + cy + vx * sine + vy * cosine + motion.y;
            batch.geometry.positions[dst + 2] = z + cz + vz + motion.z;
            const nx = this.source.normals![src]!, ny = this.source.normals![src + 1]!;
            batch.geometry.normals![dst] = nx * cosine - ny * sine;
            batch.geometry.normals![dst + 1] = nx * sine + ny * cosine;
            batch.geometry.normals![dst + 2] = this.source.normals![src + 2]!;
          }
        }
      }
      batch.geometry.markDirty();
    }
    this.updateSparks(p);
    if (this.elapsed >= this.durationMs) this.clear();
  }

  private updateSparks(p: number): void {
    this.sparks.positions.fill(0);
    this.sparkMesh.disabled = p <= 0 || p >= 0.72;
    this.sparkEntity.disabled = this.sparkMesh.disabled;
    let offset = 0;
    for (const merge of this.merges) for (let i = 0; i < 12; i++) {
      const angle = i * 2.39996;
      const travel = p * (1.2 + (i % 4) * 0.25), scale = 0.025 * Math.max(0, 1 - p / 0.72);
      const x = merge.toCol * this.config.geometry.cellSize + Math.cos(angle) * travel;
      const y = 0.36 + Math.sin(p * Math.PI) * (0.35 + (i % 3) * 0.16);
      const z = merge.toRow * this.config.geometry.cellSize + Math.sin(angle) * travel;
      this.sparks.positions.set([x - scale, y, z, x + scale, y, z, x, y + scale * 5, z], offset);
      offset += 9;
    }
    this.sparks.markDirty();
  }

  clear(): void {
    for (const batch of this.batches) { batch.mesh.disabled = true; batch.entity.disabled = true; batch.merge = null; }
    this.sparkMesh.disabled = true; this.sparkEntity.disabled = true; this.merges = [];
  }

  dispose(): void {
    this.clear();
    for (const batch of this.batches) this.world.removeEntity(batch.entity);
    this.world.removeEntity(this.sparkEntity); this.batches.length = 0;
  }
}
