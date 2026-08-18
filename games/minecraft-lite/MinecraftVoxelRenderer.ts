import {
  CartesianTransform3D,
  ColorSRGB,
  Entity,
  createBox3D,
} from '@haiyue/engine';
import { InstancedMesh3D } from '@haiyue/engine/components';
import { InstancedPbrMaterial } from '@haiyue/engine/material';
import { mat4 } from 'wgpu-matrix';
import { MINECRAFT_BLOCK_COLORS, requiredBlockColor } from './MinecraftRules';
import type { BlockCell, MinecraftWorld, VisibleBlock } from './MinecraftWorld';

const MAX_RENDERED_BLOCKS = 240_000;
const BUILD_CHUNK_SIZE = 4_000;

/** Incremental instanced-cube presentation for the deterministic voxel world. */
export class MinecraftVoxelRenderer {
  readonly entity: Entity;
  readonly material = new InstancedPbrMaterial(MAX_RENDERED_BLOCKS, {
    metallic: 0.02,
    roughness: 0.88,
  });

  private readonly _keys: string[] = [];
  private readonly _indices = new Map<string, number>();
  private readonly _matrix = mat4.identity() as Float32Array;
  private readonly _linearPalette = MINECRAFT_BLOCK_COLORS.map(color => (
    ColorSRGB.fromHex(color.hex).writeLinear(new Float32Array(4))
  ));

  constructor() {
    this.material.setActiveInstanceCount(0);
    this.entity = new Entity('Minecraft voxel terrain')
      .addComponent(new CartesianTransform3D())
      .addComponent(new InstancedMesh3D(
        createBox3D({ width: 0.985, height: 0.985, depth: 0.985 }),
        this.material,
      ));
  }

  get visibleBlockCount(): number { return this._keys.length; }

  async buildInitial(world: MinecraftWorld): Promise<void> {
    this._keys.length = 0;
    this._indices.clear();
    let chunkCount = 0;
    for (const block of world.visibleBlocks()) {
      this._insert(world, block);
      chunkCount += 1;
      if (chunkCount >= BUILD_CHUNK_SIZE) {
        chunkCount = 0;
        await nextFrame();
      }
    }
    this.material.setActiveInstanceCount(this._keys.length);
  }

  syncNeighborhood(world: MinecraftWorld, changed: Readonly<BlockCell>): void {
    for (const cell of world.affectedVisibilityCells(changed)) this._syncCell(world, cell);
    this.material.setActiveInstanceCount(this._keys.length);
  }

  private _syncCell(world: MinecraftWorld, cell: Readonly<BlockCell>): void {
    const key = blockKey(cell);
    const index = this._indices.get(key);
    const paletteIndex = world.getBlock(cell.x, cell.y, cell.z);
    if (paletteIndex !== null && world.isVisible(cell)) {
      if (index === undefined) this._insert(world, { ...cell, paletteIndex });
      else this._writeColor(index, paletteIndex);
      return;
    }
    if (index !== undefined) this._remove(key, index);
  }

  private _insert(world: MinecraftWorld, block: Readonly<VisibleBlock>): void {
    if (this._keys.length >= this.material.instanceCount) {
      throw new Error(`Minecraft visible block capacity exceeded ${this.material.instanceCount.toLocaleString()}.`);
    }
    const key = blockKey(block);
    if (this._indices.has(key)) return;
    const index = this._keys.length;
    const center = world.worldCenter(block);
    mat4.identity(this._matrix);
    this._matrix[12] = center[0];
    this._matrix[13] = center[1];
    this._matrix[14] = center[2];
    this.material.setTransform(index, this._matrix);
    this._writeColor(index, block.paletteIndex);
    this._keys.push(key);
    this._indices.set(key, index);
  }

  private _writeColor(index: number, paletteIndex: number): void {
    requiredBlockColor(paletteIndex);
    const color = this._linearPalette[paletteIndex];
    if (!color) throw new RangeError(`Missing linear block color ${paletteIndex}.`);
    this.material.setColor(index, color[0]!, color[1]!, color[2]!, 1);
  }

  private _remove(key: string, index: number): void {
    const lastIndex = this._keys.length - 1;
    const movedKey = this._keys[lastIndex];
    if (index !== lastIndex && movedKey) {
      this.material.copyInstance(lastIndex, index);
      this._keys[index] = movedKey;
      this._indices.set(movedKey, index);
    }
    this._keys.pop();
    this._indices.delete(key);
  }
}

function blockKey(cell: Readonly<BlockCell>): string {
  return `${cell.x},${cell.y},${cell.z}`;
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
