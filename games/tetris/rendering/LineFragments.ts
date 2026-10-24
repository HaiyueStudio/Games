import { CartesianTransform3D, Entity, Mesh3D, type World } from '@haiyue/engine';
import { Geometry3D, createBox3D, separateGeometryTriangles, subdivideGeometryTriangles } from '@haiyue/engine/geometry';
import type { PieceKind } from '../rules/rules';
import type { NeonSurface } from './NeonSurface';

interface Batch { entity: Entity; mesh: Mesh3D; geometry: Geometry3D; row: number; col: number }
export interface ClearedBlock { row: number; col: number; kind: PieceKind }

/** One pooled draw per shattered block, never one entity per triangle. */
export class LineFragments {
  private readonly source = separateGeometryTriangles(subdivideGeometryTriangles(createBox3D({ width: .54, height: .34, depth: .54 }), { iterations: 1 }));
  private readonly batches: Batch[] = [];
  private count = 0;
  private elapsed = 0;
  readonly trianglesPerBlock = this.source.positions.length / 9;
  get activeCount(): number { return this.count; }
  get poolSize(): number { return this.batches.length; }
  constructor(private readonly world: World, private readonly surface: NeonSurface, private readonly maxBlocks: number) {}
  start(blocks: readonly ClearedBlock[]): void {
    this.clear(); this.elapsed = 0;
    for (const block of blocks.slice(0, this.maxBlocks)) {
      let batch = this.batches[this.count];
      if (!batch) {
        const geometry = new Geometry3D({ positions: this.source.positions.slice(), textureCoordinates: [{ set: 0, data: this.source.getTextureCoordinates(0)!.slice() }], boundsMode: 'dynamic', cullMode: 'none' });
        const mesh = new Mesh3D(geometry, this.surface.material(block.kind));
        const entity = new Entity(`Tetris fragments ${this.count}`).addComponent(new CartesianTransform3D()).addComponent(mesh);
        this.world.addEntity(entity);
        batch = { entity, mesh, geometry, row: 0, col: 0 }; this.batches.push(batch);
      }
      batch.row = block.row; batch.col = block.col;
      batch.mesh.material = this.surface.material(block.kind);
      batch.entity.disabled = batch.mesh.disabled = false; this.count++;
    }
    this.update(0);
  }
  update(delta: number): void {
    if (!this.count) return;
    this.elapsed += Math.max(0, delta);
    const t = this.elapsed / 1000, scale = Math.max(0, 1 - Math.max(0, t - .35) / .8);
    if (t >= 1.15) { this.clear(); return; }
    const p = this.source.positions;
    for (let b = 0; b < this.count; b++) {
      const batch = this.batches[b]!;
      for (let o = 0; o < p.length; o += 9) {
        const id = o / 9 + batch.row * 97 + batch.col * 131;
        const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
        const cx = (p[o]! + p[o + 3]! + p[o + 6]!) / 3;
        const cy = (p[o + 1]! + p[o + 4]! + p[o + 7]!) / 3;
        const cz = (p[o + 2]! + p[o + 5]! + p[o + 8]!) / 3;
        const spin = t * (hash(id + 4) * 12 - 6), c = Math.cos(spin), s = Math.sin(spin);
        const tilt = t * (hash(id + 6) * 10 - 5), ct = Math.cos(tilt), st = Math.sin(tilt);
        const x = batch.col * .58 + cx + (hash(id) - .5) * 3.8 * t;
        const y = .17 + cy + (1.2 + hash(id + 1) * 2) * t - 5 * t * t;
        const z = batch.row * .58 + cz + (hash(id + 2) - .5) * 3 * t;
        for (let v = 0; v < 9; v += 3) {
          const vx = (p[o + v]! - cx) * scale, vy = (p[o + v + 1]! - cy) * scale, vz = (p[o + v + 2]! - cz) * scale;
          const rx = vx * c - vy * s, ry = vx * s + vy * c;
          batch.geometry.positions[o + v] = x + rx;
          batch.geometry.positions[o + v + 1] = y + ry * ct - vz * st;
          batch.geometry.positions[o + v + 2] = z + ry * st + vz * ct;
        }
      }
      batch.geometry.markDirty();
    }
  }
  clear(): void { for (const b of this.batches) b.entity.disabled = b.mesh.disabled = true; this.count = 0; }
  dispose(): void { this.clear(); for (const b of this.batches) this.world.removeEntity(b.entity); this.batches.length = 0; }
}
