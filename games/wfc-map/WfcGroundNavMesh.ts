import { NavMesh } from '@haiyue/engine/navigation';
import { requiredItemAt } from '../arrayAccess';
import { UNITY_WFC_FACE_WALKABLE } from './unityModuleFaces';
import type { WfcPlayableSurface, WfcSurfaceSlot } from './WfcPlayableSurface';

const HORIZONTAL_DIRECTIONS = [0, 2, 3, 5] as const;

export interface WfcGroundNavMeshOptions {
  readonly blockSize: number;
  readonly cellsPerBlock: number;
  readonly startX: number;
  readonly startZ: number;
  readonly surfaceY: number;
}

export interface WfcGroundNavMeshResult {
  readonly navMesh: NavMesh;
  readonly walkableCellCount: number;
}

interface Ramp {
  readonly lower: WfcSurfaceSlot;
  readonly upper: WfcSurfaceSlot;
  readonly lowPoint: readonly [number, number];
  readonly highPoint: readonly [number, number];
}

function edgePoint(direction: number): readonly [number, number] {
  if (direction === 0) return [0, 0.5];
  if (direction === 2) return [0.5, 0];
  if (direction === 3) return [1, 0.5];
  return [0.5, 1];
}

function horizontalWalkableDirections(slot: WfcSurfaceSlot): number[] {
  const faces = requiredItemAt(UNITY_WFC_FACE_WALKABLE, slot.moduleIndex, 'Unity WFC walkable faces');
  return HORIZONTAL_DIRECTIONS.filter(direction => requiredItemAt(faces, direction, 'Unity WFC walkable face'));
}

function findRamp(slots: readonly WfcSurfaceSlot[]): Ramp | null {
  for (let index = 0; index + 1 < slots.length; index++) {
    const lower = requiredItemAt(slots, index, 'WFC surface column');
    const upper = requiredItemAt(slots, index + 1, 'WFC surface column');
    if (upper.y !== lower.y + 1) continue;
    const lowerFaces = requiredItemAt(UNITY_WFC_FACE_WALKABLE, lower.moduleIndex, 'Unity WFC lower stair faces');
    const upperFaces = requiredItemAt(UNITY_WFC_FACE_WALKABLE, upper.moduleIndex, 'Unity WFC upper stair faces');
    if (!requiredItemAt(lowerFaces, 4, 'Unity WFC stair up face')
      || !requiredItemAt(upperFaces, 1, 'Unity WFC stair down face')) continue;
    const lowDirections = horizontalWalkableDirections(lower);
    const highDirections = horizontalWalkableDirections(upper);
    if (lowDirections.length === 0 || highDirections.length === 0) continue;
    let bestLow = requiredItemAt(lowDirections, 0, 'WFC lower stair exit');
    let bestHigh = requiredItemAt(highDirections, 0, 'WFC upper stair exit');
    let bestDistance = -1;
    for (const lowDirection of lowDirections) {
      for (const highDirection of highDirections) {
        const low = edgePoint(lowDirection);
        const high = edgePoint(highDirection);
        const distance = (high[0] - low[0]) ** 2 + (high[1] - low[1]) ** 2;
        if (distance > bestDistance) {
          bestDistance = distance;
          bestLow = lowDirection;
          bestHigh = highDirection;
        }
      }
    }
    return { lower, upper, lowPoint: edgePoint(bestLow), highPoint: edgePoint(bestHigh) };
  }
  return null;
}

function rampProgress(ramp: Ramp, x: number, z: number): number {
  const dx = ramp.highPoint[0] - ramp.lowPoint[0];
  const dz = ramp.highPoint[1] - ramp.lowPoint[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-6) return 0.5;
  return Math.max(0, Math.min(1, ((x - ramp.lowPoint[0]) * dx + (z - ramp.lowPoint[1]) * dz) / lengthSquared));
}

function boundaryDirection(localX: number, localZ: number, cellsPerBlock: number): number[] {
  const result: number[] = [];
  if (localX === 0) result.push(0);
  if (localZ === 0) result.push(2);
  if (localX === cellsPerBlock - 1) result.push(3);
  if (localZ === cellsPerBlock - 1) result.push(5);
  return result;
}

/** Builds one connected heightfield from the selected stair-connected WFC surface. */
export function buildWfcGroundNavMesh(
  surface: WfcPlayableSurface | null,
  options: WfcGroundNavMeshOptions,
): WfcGroundNavMeshResult | null {
  if (!surface || surface.slots.length === 0) return null;
  const slotsByColumn = new Map<string, WfcSurfaceSlot[]>();
  for (const slot of surface.slots) {
    const column = slotsByColumn.get(slot.columnKey);
    if (column) column.push(slot);
    else slotsByColumn.set(slot.columnKey, [slot]);
  }
  for (const slots of slotsByColumn.values()) slots.sort((a, b) => a.y - b.y);

  const minX = Math.min(...surface.slots.map(slot => slot.x));
  const maxX = Math.max(...surface.slots.map(slot => slot.x));
  const minZ = Math.min(...surface.slots.map(slot => slot.z));
  const maxZ = Math.max(...surface.slots.map(slot => slot.z));
  const columns = (maxX - minX + 1) * options.cellsPerBlock;
  const rows = (maxZ - minZ + 1) * options.cellsPerBlock;
  const heights = new Float32Array(columns * rows);
  heights.fill(Number.NaN);
  const walkable = new Uint8Array(columns * rows);

  for (const slots of slotsByColumn.values()) {
    const reference = requiredItemAt(slots, 0, 'WFC surface column');
    const ramp = findRamp(slots);
    const baseSlot = ramp?.lower ?? reference;
    const baseColumn = (reference.x - minX) * options.cellsPerBlock;
    const baseRow = (reference.z - minZ) * options.cellsPerBlock;
    for (let localZ = 0; localZ < options.cellsPerBlock; localZ++) {
      for (let localX = 0; localX < options.cellsPerBlock; localX++) {
        const normalizedX = (localX + 0.5) / options.cellsPerBlock;
        const normalizedZ = (localZ + 0.5) / options.cellsPerBlock;
        const progress = ramp ? rampProgress(ramp, normalizedX, normalizedZ) : 0;
        const height = (baseSlot.y - surface.baseLayer + progress) * options.blockSize + options.surfaceY;
        const allowed = boundaryDirection(localX, localZ, options.cellsPerBlock)
          .every(direction => slots.some(slot => requiredItemAt(
            requiredItemAt(UNITY_WFC_FACE_WALKABLE, slot.moduleIndex, 'Unity WFC NavMesh faces'),
            direction,
            'Unity WFC NavMesh edge',
          )));
        if (!allowed) continue;
        const cell = (baseRow + localZ) * columns + baseColumn + localX;
        heights[cell] = height;
        walkable[cell] = 1;
      }
    }
  }

  const cellSize = options.blockSize / options.cellsPerBlock;
  return {
    navMesh: new NavMesh({
      origin: [
        (minX - options.startX) * options.blockSize - options.blockSize * 0.5,
        (minZ - options.startZ) * options.blockSize - options.blockSize * 0.5,
      ],
      cellSize,
      columns,
      rows,
      heights,
      walkable,
      maxStepHeight: cellSize * 1.25,
    }),
    walkableCellCount: walkable.reduce((sum, value) => sum + value, 0),
  };
}
