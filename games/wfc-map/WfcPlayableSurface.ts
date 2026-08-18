import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { UNITY_WFC_MODULES } from './unityModuleData';
import { UNITY_WFC_FACE_WALKABLE, UNITY_WFC_SPAWN_FLAGS } from './unityModuleFaces';

export type WfcColumnMap = ReadonlyMap<string, readonly number[]>;

export interface WfcSurfaceSlot {
  readonly key: string;
  readonly columnKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly moduleIndex: number;
}

export interface WfcPlayableSurface {
  readonly slots: readonly WfcSurfaceSlot[];
  readonly slotKeys: ReadonlySet<string>;
  readonly anchorKey: string;
  readonly baseLayer: number;
  readonly topLayer: number;
  readonly footprintCount: number;
  readonly verticalTransitions: number;
}

// Unity direction order: left, down, back, right, up, forward.
export const WFC_DIRECTION_OFFSETS = [
  [-1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
] as const;

export function wfcSlotKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseColumnKey(key: string): readonly [number, number] {
  const parts = key.split(',');
  return [
    Number(requiredItemAt(parts, 0, 'WFC column x coordinate')),
    Number(requiredItemAt(parts, 1, 'WFC column z coordinate')),
  ];
}

function hasWalkableFace(moduleIndex: number): boolean {
  return requiredItemAt(UNITY_WFC_FACE_WALKABLE, moduleIndex, 'Unity WFC walkable faces').some(Boolean);
}

function buildWalkableSlots(columns: WfcColumnMap): Map<string, WfcSurfaceSlot> {
  const slots = new Map<string, WfcSurfaceSlot>();
  for (const [columnKey, column] of columns) {
    const [x, z] = parseColumnKey(columnKey);
    for (let y = 0; y < column.length; y++) {
      const moduleIndex = requiredNumberAt(column, y, 'collapsed Unity WFC column');
      if (!UNITY_WFC_SPAWN_FLAGS[moduleIndex] || !hasWalkableFace(moduleIndex)) continue;
      const key = wfcSlotKey(x, y, z);
      slots.set(key, { key, columnKey, x, y, z, moduleIndex });
    }
  }
  return slots;
}

function walkableNeighbors(
  slot: WfcSurfaceSlot,
  slots: ReadonlyMap<string, WfcSurfaceSlot>,
): WfcSurfaceSlot[] {
  const neighbors: WfcSurfaceSlot[] = [];
  const faces = requiredItemAt(UNITY_WFC_FACE_WALKABLE, slot.moduleIndex, 'Unity WFC walkable faces');
  for (let direction = 0; direction < WFC_DIRECTION_OFFSETS.length; direction++) {
    if (!requiredItemAt(faces, direction, 'Unity WFC walkable face')) continue;
    const [dx, dy, dz] = requiredItemAt(WFC_DIRECTION_OFFSETS, direction, 'WFC direction offset');
    const neighbor = slots.get(wfcSlotKey(slot.x + dx, slot.y + dy, slot.z + dz));
    if (!neighbor) continue;
    const neighborFaces = requiredItemAt(
      UNITY_WFC_FACE_WALKABLE,
      neighbor.moduleIndex,
      'Unity WFC neighbor walkable faces',
    );
    if (requiredItemAt(neighborFaces, (direction + 3) % 6, 'Unity WFC inverse walkable face')) {
      neighbors.push(neighbor);
    }
  }
  return neighbors;
}

function makeSurface(component: WfcSurfaceSlot[]): WfcPlayableSurface {
  const slotKeys = new Set(component.map(slot => slot.key));
  const layers = component.map(slot => slot.y);
  const footprintCount = new Set(component.map(slot => slot.columnKey)).size;
  let verticalTransitions = 0;
  for (const slot of component) {
    if (slotKeys.has(wfcSlotKey(slot.x, slot.y + 1, slot.z))) verticalTransitions++;
  }
  component.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  return {
    slots: component,
    slotKeys,
    anchorKey: requiredItemAt(component, 0, 'WFC playable-surface component').key,
    baseLayer: Math.min(...layers),
    topLayer: Math.max(...layers),
    footprintCount,
    verticalTransitions,
  };
}

function canAddHeightfieldSlot(
  slot: WfcSurfaceSlot,
  accepted: ReadonlyMap<string, WfcSurfaceSlot>,
  layersByColumn: ReadonlyMap<string, ReadonlySet<number>>,
): boolean {
  const layers = layersByColumn.get(slot.columnKey);
  if (!layers || layers.size === 0 || layers.has(slot.y)) return true;
  if (layers.size >= 2) return false;
  const otherY = layers.values().next().value as number | undefined;
  if (otherY === undefined || Math.abs(otherY - slot.y) !== 1) return false;
  const other = accepted.get(wfcSlotKey(slot.x, otherY, slot.z));
  if (!other) return false;
  const direction = slot.y > other.y ? 4 : 1;
  const otherFaces = requiredItemAt(UNITY_WFC_FACE_WALKABLE, other.moduleIndex, 'Unity WFC stair faces');
  const slotFaces = requiredItemAt(UNITY_WFC_FACE_WALKABLE, slot.moduleIndex, 'Unity WFC stair neighbor faces');
  return requiredItemAt(otherFaces, direction, 'Unity WFC stair face')
    && requiredItemAt(slotFaces, (direction + 3) % 6, 'Unity WFC inverse stair face');
}

function growHeightfieldSurface(
  componentSlots: ReadonlyMap<string, WfcSurfaceSlot>,
  seeds: readonly WfcSurfaceSlot[],
): WfcPlayableSurface {
  const accepted = new Map<string, WfcSurfaceSlot>();
  const layersByColumn = new Map<string, Set<number>>();
  const queue: WfcSurfaceSlot[] = [];
  const add = (slot: WfcSurfaceSlot): void => {
    if (accepted.has(slot.key)) return;
    accepted.set(slot.key, slot);
    const layers = layersByColumn.get(slot.columnKey);
    if (layers) layers.add(slot.y);
    else layersByColumn.set(slot.columnKey, new Set([slot.y]));
    queue.push(slot);
  };
  for (const seed of seeds) add(seed);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const slot = requiredItemAt(queue, cursor, 'WFC heightfield-surface queue');
    for (const neighbor of walkableNeighbors(slot, componentSlots)) {
      if (!accepted.has(neighbor.key) && canAddHeightfieldSlot(neighbor, accepted, layersByColumn)) add(neighbor);
    }
  }
  return makeSurface([...accepted.values()]);
}

function heightfieldSurfaces(component: WfcSurfaceSlot[]): WfcPlayableSurface[] {
  const componentSlots = new Map(component.map(slot => [slot.key, slot]));
  const verticalPairs: Array<readonly [WfcSurfaceSlot, WfcSurfaceSlot]> = [];
  for (const slot of component) {
    const upper = componentSlots.get(wfcSlotKey(slot.x, slot.y + 1, slot.z));
    if (upper && walkableNeighbors(slot, componentSlots).some(neighbor => neighbor.key === upper.key)) {
      verticalPairs.push([slot, upper]);
    }
  }
  if (verticalPairs.length === 0) return [growHeightfieldSurface(componentSlots, [requiredItemAt(component, 0, 'flat WFC surface')])];
  const surfaces = verticalPairs.map(pair => growHeightfieldSurface(componentSlots, pair));
  const unique = new Map<string, WfcPlayableSurface>();
  for (const surface of surfaces) {
    const key = [...surface.slotKeys].sort().join('|');
    unique.set(key, surface);
  }
  return [...unique.values()];
}

function connectedComponents(slots: ReadonlyMap<string, WfcSurfaceSlot>): WfcPlayableSurface[] {
  const unseen = new Set(slots.keys());
  const surfaces: WfcPlayableSurface[] = [];
  while (unseen.size > 0) {
    const firstKey = unseen.values().next().value as string | undefined;
    if (!firstKey) break;
    const first = slots.get(firstKey);
    if (!first) {
      unseen.delete(firstKey);
      continue;
    }
    unseen.delete(firstKey);
    const queue = [first];
    const component: WfcSurfaceSlot[] = [];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const slot = requiredItemAt(queue, cursor, 'WFC playable-surface queue');
      component.push(slot);
      for (const neighbor of walkableNeighbors(slot, slots)) {
        if (unseen.delete(neighbor.key)) queue.push(neighbor);
      }
    }
    surfaces.push(...heightfieldSurfaces(component));
  }
  return surfaces;
}

function surfaceScore(surface: WfcPlayableSurface): number {
  // A real height transition is preferred over a larger but disconnected flat floor.
  return (surface.verticalTransitions > 0 ? 1_000_000 : 0)
    + surface.footprintCount * 1_000
    + surface.slots.length * 10
    + (surface.topLayer - surface.baseLayer);
}

export function selectPlayableWfcSurface(
  columns: WfcColumnMap,
  preferredAnchorKey?: string,
): WfcPlayableSurface | null {
  const surfaces = connectedComponents(buildWalkableSlots(columns));
  if (surfaces.length === 0) return null;
  if (preferredAnchorKey) {
    const anchored = surfaces.filter(surface => surface.slotKeys.has(preferredAnchorKey));
    anchored.sort((a, b) => surfaceScore(b) - surfaceScore(a));
    if (anchored.length > 0) return requiredItemAt(anchored, 0, 'anchored WFC playable surface');
  }
  surfaces.sort((a, b) => surfaceScore(b) - surfaceScore(a));
  return requiredItemAt(surfaces, 0, 'best WFC playable surface');
}

export function isUsefulPlayableWfcSurface(surface: WfcPlayableSurface | null): boolean {
  return surface !== null
    && surface.verticalTransitions > 0
    && surface.footprintCount >= 8
    && surface.topLayer > surface.baseLayer;
}

export function describePlayableWfcSurface(surface: WfcPlayableSurface | null): string {
  if (!surface) return 'no walkable surface';
  const stairNames = surface.slots
    .filter(slot => /Stair/i.test(requiredItemAt(UNITY_WFC_MODULES, slot.moduleIndex, 'Unity WFC module').baseName))
    .length;
  return `${surface.footprintCount} columns · layers ${surface.baseLayer}-${surface.topLayer} · ${surface.verticalTransitions} stair links · ${stairNames} stair modules`;
}
