const DEFAULT_WORLD_SIZE = 200;
const MAX_WORLD_SIZE = 200;
const MAX_WORLD_HEIGHT = 48;
const DEFAULT_TERRAIN_SEED = 0x4d_43_4c_54;
const BLOCK_PALETTE_SIZE = 10;

export interface BlockCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VisibleBlock extends BlockCell {
  readonly paletteIndex: number;
}

export interface VoxelRaycastHit {
  readonly block: BlockCell;
  readonly adjacent: BlockCell | null;
  readonly distance: number;
}

export interface MinecraftWorldOptions {
  readonly size?: number;
  readonly maxHeight?: number;
  readonly seed?: number;
  readonly generateTerrain?: boolean;
}

export interface MinecraftBlockEdit extends BlockCell {
  readonly paletteIndex: number | null;
}

const NEIGHBOR_OFFSETS: readonly (readonly [number, number, number])[] = Object.freeze([
  [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1],
]);

/** Dense deterministic voxel state. Rendering and browser input remain adapters around this model. */
export class MinecraftWorld {
  readonly size: number;
  readonly maxHeight: number;
  readonly seed: number;
  readonly originX: number;
  readonly originZ: number;

  private readonly _blocks: Uint8Array;
  private readonly _surfaceY: Int16Array;
  private _blockCount = 0;
  private readonly _edits = new Map<string, MinecraftBlockEdit>();

  constructor(options: MinecraftWorldOptions = {}) {
    this.size = integerInRange(options.size ?? DEFAULT_WORLD_SIZE, 1, MAX_WORLD_SIZE, 'world size');
    this.maxHeight = integerInRange(options.maxHeight ?? MAX_WORLD_HEIGHT, 2, MAX_WORLD_HEIGHT, 'world height');
    this.seed = (options.seed ?? DEFAULT_TERRAIN_SEED) >>> 0;
    this.originX = -this.size * 0.5;
    this.originZ = -this.size * 0.5;
    this._blocks = new Uint8Array(this.size * this.size * this.maxHeight);
    this._surfaceY = new Int16Array(this.size * this.size);
    this._surfaceY.fill(-1);
    if (options.generateTerrain !== false) this._generateTerrain();
  }

  get blockCount(): number { return this._blockCount; }

  contains(cell: Readonly<BlockCell>): boolean {
    return cell.x >= 0 && cell.x < this.size
      && cell.z >= 0 && cell.z < this.size
      && cell.y >= 0 && cell.y < this.maxHeight;
  }

  getBlock(x: number, y: number, z: number): number | null {
    if (!this.contains({ x, y, z })) return null;
    const encoded = this._blocks[this._index(x, y, z)] ?? 0;
    return encoded === 0 ? null : encoded - 1;
  }

  setBlock(cell: Readonly<BlockCell>, paletteIndex: number): boolean {
    if (!this.contains(cell)) return false;
    if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex >= BLOCK_PALETTE_SIZE) {
      throw new RangeError(`Block palette index ${paletteIndex} is outside 0..9.`);
    }
    const index = this._index(cell.x, cell.y, cell.z);
    const encoded = paletteIndex + 1;
    if (this._blocks[index] === encoded) return false;
    if (this._blocks[index] === 0) this._blockCount += 1;
    this._blocks[index] = encoded;
    const column = this._columnIndex(cell.x, cell.z);
    if (cell.y > this._surfaceY[column]!) this._surfaceY[column] = cell.y;
    this._edits.set(`${cell.x},${cell.y},${cell.z}`, { ...cell, paletteIndex });
    return true;
  }

  removeBlock(cell: Readonly<BlockCell>): boolean {
    if (!this.contains(cell)) return false;
    const index = this._index(cell.x, cell.y, cell.z);
    if (this._blocks[index] === 0) return false;
    this._blocks[index] = 0;
    this._blockCount -= 1;
    const column = this._columnIndex(cell.x, cell.z);
    if (this._surfaceY[column] === cell.y) this._surfaceY[column] = this._findSurfaceY(cell.x, cell.z, cell.y - 1);
    this._edits.set(`${cell.x},${cell.y},${cell.z}`, { ...cell, paletteIndex: null });
    return true;
  }

  applyEdits(edits: readonly MinecraftBlockEdit[]): void {
    for (const edit of edits) {
      if (edit.paletteIndex === null) this.removeBlock(edit);
      else this.setBlock(edit, edit.paletteIndex);
    }
  }

  snapshotEdits(): MinecraftBlockEdit[] {
    return [...this._edits.values()].map(edit => ({ ...edit }));
  }

  surfaceHeight(x: number, z: number): number | null {
    if (x < 0 || x >= this.size || z < 0 || z >= this.size) return null;
    const top = this._surfaceY[this._columnIndex(x, z)]!;
    return top < 0 ? null : top + 1;
  }

  surfaceHeightAtWorld(worldX: number, worldZ: number): number | null {
    const x = Math.floor(worldX - this.originX);
    const z = Math.floor(worldZ - this.originZ);
    return this.surfaceHeight(x, z);
  }

  worldCenter(cell: Readonly<BlockCell>): readonly [number, number, number] {
    return [this.originX + cell.x + 0.5, cell.y + 0.5, this.originZ + cell.z + 0.5];
  }

  spawnPosition(x = Math.floor(this.size * 0.5), z = Math.floor(this.size * 0.5)): readonly [number, number, number] {
    const height = this.surfaceHeight(x, z);
    if (height === null) throw new Error(`Spawn column (${x}, ${z}) has no ground.`);
    return [this.originX + x + 0.5, height, this.originZ + z + 0.5];
  }

  isVisible(cell: Readonly<BlockCell>): boolean {
    if (this.getBlock(cell.x, cell.y, cell.z) === null) return false;
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      if (cell.y + dy < 0) continue;
      if (this.getBlock(cell.x + dx, cell.y + dy, cell.z + dz) === null) return true;
    }
    return false;
  }

  *visibleBlocks(): IterableIterator<VisibleBlock> {
    for (let z = 0; z < this.size; z += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const top = this._surfaceY[this._columnIndex(x, z)]!;
        for (let y = 0; y <= top; y += 1) {
          const paletteIndex = this.getBlock(x, y, z);
          if (paletteIndex !== null && this.isVisible({ x, y, z })) yield { x, y, z, paletteIndex };
        }
      }
    }
  }

  affectedVisibilityCells(cell: Readonly<BlockCell>): readonly BlockCell[] {
    const result: BlockCell[] = [];
    for (const [dx, dy, dz] of [[0, 0, 0], ...NEIGHBOR_OFFSETS] as const) {
      const candidate = { x: cell.x + dx, y: cell.y + dy, z: cell.z + dz };
      if (this.contains(candidate)) result.push(candidate);
    }
    return result;
  }

  raycast(
    origin: readonly [number, number, number] | Float32Array,
    direction: readonly [number, number, number] | Float32Array,
    maxDistance = 8,
  ): VoxelRaycastHit | null {
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) return null;
    const length = Math.hypot(direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0);
    if (length <= 1e-8) return null;
    const dx = (direction[0] ?? 0) / length;
    const dy = (direction[1] ?? 0) / length;
    const dz = (direction[2] ?? 0) / length;
    const localX = (origin[0] ?? 0) - this.originX;
    const localY = origin[1] ?? 0;
    const localZ = (origin[2] ?? 0) - this.originZ;
    let x = Math.floor(localX);
    let y = Math.floor(localY);
    let z = Math.floor(localZ);
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);
    const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
    const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
    const deltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dz);
    let nextX = firstBoundaryDistance(localX, x, dx, stepX);
    let nextY = firstBoundaryDistance(localY, y, dy, stepY);
    let nextZ = firstBoundaryDistance(localZ, z, dz, stepZ);
    let distance = 0;
    let previous: BlockCell | null = null;

    while (distance <= maxDistance) {
      if (this.getBlock(x, y, z) !== null) {
        return { block: { x, y, z }, adjacent: previous, distance };
      }
      previous = { x, y, z };
      if (nextX <= nextY && nextX <= nextZ) {
        x += stepX;
        distance = nextX;
        nextX += deltaX;
      } else if (nextY <= nextZ) {
        y += stepY;
        distance = nextY;
        nextY += deltaY;
      } else {
        z += stepZ;
        distance = nextZ;
        nextZ += deltaZ;
      }
    }
    return null;
  }

  private _generateTerrain(): void {
    for (let z = 0; z < this.size; z += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const broad = valueNoise(x, z, 42, this.seed);
        const detail = valueNoise(x, z, 13, this.seed ^ 0x9e37_79b9);
        const height = Math.max(3, Math.min(this.maxHeight - 8, Math.round(4 + broad * 6 + detail * 2)));
        for (let y = 0; y < height; y += 1) {
          const depth = height - y - 1;
          const paletteIndex = depth === 0
            ? height >= 10 ? 8 : height <= 5 ? 2 : 3
            : depth <= 2 ? 1 : 9;
          this._setGeneratedBlock(x, y, z, paletteIndex);
        }
      }
    }
  }

  private _setGeneratedBlock(x: number, y: number, z: number, paletteIndex: number): void {
    this._blocks[this._index(x, y, z)] = paletteIndex + 1;
    this._blockCount += 1;
    this._surfaceY[this._columnIndex(x, z)] = y;
  }

  private _findSurfaceY(x: number, z: number, startY: number): number {
    for (let y = startY; y >= 0; y -= 1) if (this.getBlock(x, y, z) !== null) return y;
    return -1;
  }

  private _index(x: number, y: number, z: number): number {
    return (y * this.size + z) * this.size + x;
  }

  private _columnIndex(x: number, z: number): number {
    return z * this.size + x;
  }
}

function firstBoundaryDistance(value: number, cell: number, direction: number, step: number): number {
  if (step === 0) return Number.POSITIVE_INFINITY;
  const boundary = step > 0 ? cell + 1 : cell;
  return (boundary - value) / direction;
}

function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const sampleX = x / scale;
  const sampleZ = z / scale;
  const x0 = Math.floor(sampleX);
  const z0 = Math.floor(sampleZ);
  const tx = smooth(sampleX - x0);
  const tz = smooth(sampleZ - z0);
  const top = lerp(hash2d(x0, z0, seed), hash2d(x0 + 1, z0, seed), tx);
  const bottom = lerp(hash2d(x0, z0 + 1, seed), hash2d(x0 + 1, z0 + 1, seed), tx);
  return lerp(top, bottom, tz);
}

function hash2d(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 0x1f12_3bb5) ^ Math.imul(z, 0x5f35_6495) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9_f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9_f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffff_ffff;
}

function smooth(value: number): number { return value * value * (3 - 2 * value); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function integerInRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Minecraft ${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}
