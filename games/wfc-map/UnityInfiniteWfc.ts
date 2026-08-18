import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { UNITY_WFC_MODULES, type UnityWfcModule } from './unityModuleData';
import { UNITY_WFC_DOWN_CONNECTORS, UNITY_WFC_UP_CONNECTORS } from './unityModuleFaces';

type Vec3 = [number, number, number];

interface WaveSlot {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  options: number[];
  collapsed: boolean;
}

interface HistoryItem {
  readonly slot: WaveSlot;
  readonly removedOptions: Map<string, number[]>;
}

export interface CollapsedColumn {
  readonly x: number;
  readonly z: number;
  readonly modules: number[];
}

export interface UnityCollapseResult {
  readonly backtracks: number;
  readonly changedColumns: CollapsedColumn[];
}

const MODULE_COUNT = UNITY_WFC_MODULES.length;
const MASK_BYTES = Math.ceil(MODULE_COUNT / 8);
const ALL_OPTIONS = UNITY_WFC_MODULES.map((_module, index) => index);

// Unity direction order: left, down, back, right, up, forward.
const DIRECTION_OFFSETS: readonly Vec3[] = [
  [-1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function slotKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function columnKey(x: number, z: number): string {
  return `${x},${z}`;
}

function bytesFromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function hasBit(bytes: Uint8Array, index: number): boolean {
  return (requiredNumberAt(bytes, index >> 3, 'Unity WFC neighbor mask') & (1 << (index & 7))) !== 0;
}

function moduleAt(index: number): UnityWfcModule {
  return requiredItemAt(UNITY_WFC_MODULES, index, 'Unity WFC modules');
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sparse, persistent port of the Unity InfiniteMap/Slot collapse strategy.
 *
 * The important distinction from a conventional finite WFC solve is that
 * uncollapsed wave slots survive between chunk collapses. Constraint removals
 * therefore keep propagating through the same world instead of being discarded
 * with a temporary context volume after each chunk.
 */
export class UnityInfiniteWfcMap {
  readonly height: number;
  private readonly neighborMasks = UNITY_WFC_MODULES.map(module => module.neighbors.map(bytesFromHex));
  private readonly defaultLayerOptions: number[][];
  private readonly slots = new Map<string, WaveSlot>();
  private readonly history: HistoryItem[] = [];
  private readonly changedColumnKeys = new Set<string>();
  private workArea: Map<string, WaveSlot> | null = null;
  private random: () => number = mulberry32(0);
  private rangeCenterX = 0;
  private rangeCenterZ = 0;
  private rangeLimit = 25;
  private historyTotal = 0;
  private backtrackBarrier = 0;
  private backtrackAmount = 0;

  constructor(height: number) {
    if (!Number.isInteger(height) || height <= 0) throw new Error('Unity WFC map height must be a positive integer.');
    this.height = height;
    this.defaultLayerOptions = this.createDefaultLayerOptions();
  }

  reset(seed: number): void {
    this.slots.clear();
    this.history.length = 0;
    this.changedColumnKeys.clear();
    this.workArea = null;
    this.random = mulberry32(seed);
    this.historyTotal = 0;
    this.backtrackBarrier = 0;
    this.backtrackAmount = 0;
  }

  get initializedSlotCount(): number {
    return this.slots.size;
  }

  collapseArea(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    rangeLimit = 25,
  ): UnityCollapseResult {
    if (minX > maxX || minZ > maxZ) return { backtracks: 0, changedColumns: [] };
    this.rangeCenterX = Math.floor((minX + maxX) * 0.5);
    this.rangeCenterZ = Math.floor((minZ + maxZ) * 0.5);
    this.rangeLimit = rangeLimit;
    this.changedColumnKeys.clear();

    const targets = new Map<string, WaveSlot>();
    // Matches AbstractMap.Collapse(start, size): x, then y, then z.
    for (let x = minX; x <= maxX; x++) {
      for (let y = 0; y < this.height; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const slot = this.getSlot(x, y, z, true);
          if (slot && !slot.collapsed) targets.set(slot.key, slot);
        }
      }
    }
    this.workArea = targets;

    let backtracks = 0;
    let attempts = 0;
    const attemptLimit = Math.max(20000, targets.size * 400);
    while (this.workArea.size > 0) {
      if (attempts++ > attemptLimit) {
        this.workArea = null;
        throw new Error('Unity WFC collapse exceeded its recovery limit.');
      }
      const selected = this.lowestEntropySlot(this.workArea.values());
      if (!selected) break;
      try {
        this.collapseRandom(selected);
      } catch {
        backtracks++;
        if (this.historyTotal > this.backtrackBarrier) {
          this.backtrackBarrier = this.historyTotal;
          this.backtrackAmount = 2;
        } else {
          this.backtrackAmount *= 2;
        }
        this.undo(Math.max(1, this.backtrackAmount));
      }
    }

    this.workArea = null;
    const changedColumns: CollapsedColumn[] = [];
    for (const key of this.changedColumnKeys) {
      const [xText, zText] = key.split(',');
      const x = Number(xText);
      const z = Number(zText);
      const modules = this.getCollapsedColumn(x, z);
      if (modules) changedColumns.push({ x, z, modules });
    }
    changedColumns.sort((a, b) => a.z - b.z || a.x - b.x);
    return { backtracks, changedColumns };
  }

  getCollapsedColumn(x: number, z: number): number[] | null {
    const modules: number[] = [];
    for (let y = 0; y < this.height; y++) {
      const slot = this.getSlot(x, y, z, false);
      if (!slot?.collapsed || slot.options.length !== 1) return null;
      modules.push(requiredNumberAt(slot.options, 0, 'collapsed Unity WFC slot'));
    }
    return modules;
  }

  private neighborMask(option: number, direction: number): Uint8Array {
    return requiredItemAt(
      requiredItemAt(this.neighborMasks, option, 'Unity WFC neighbor masks'),
      direction,
      'Unity WFC direction masks',
    );
  }

  private getSlot(x: number, y: number, z: number, create: boolean): WaveSlot | null {
    if (y < 0 || y >= this.height) return null;
    const key = slotKey(x, y, z);
    const existing = this.slots.get(key);
    if (existing) return existing;
    if (!create || this.isOutsideRange(x, y, z)) return null;
    const slot: WaveSlot = {
      key,
      x,
      y,
      z,
      options: [...requiredItemAt(this.defaultLayerOptions, y, 'Unity WFC default layers')],
      collapsed: false,
    };
    this.slots.set(key, slot);
    return slot;
  }

  private isOutsideRange(x: number, y: number, z: number): boolean {
    return Math.hypot(x - this.rangeCenterX, y, z - this.rangeCenterZ) > this.rangeLimit;
  }

  private collapseRandom(slot: WaveSlot): void {
    if (slot.options.length === 0) throw new Error('Cannot collapse an empty Unity WFC slot.');
    if (slot.collapsed) throw new Error('Unity WFC slot is already collapsed.');
    const choice = this.weightedChoice(slot.options);
    const historyItem: HistoryItem = { slot, removedOptions: new Map() };
    this.history.push(historyItem);
    this.historyTotal++;
    if (this.history.length > 3000) this.history.shift();

    slot.collapsed = true;
    const removed = slot.options.filter(option => option !== choice);
    slot.options = [choice];
    this.recordRemoved(historyItem, slot, removed);
    if (!this.propagate([slot], historyItem)) throw new Error('Unity WFC propagation failed.');

    this.workArea?.delete(slot.key);
    this.changedColumnKeys.add(columnKey(slot.x, slot.z));
  }

  private propagate(starts: WaveSlot[], historyItem: HistoryItem): boolean {
    const queue = [...starts];
    const queued = new Set(starts.map(slot => slot.key));
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const slot = requiredItemAt(queue, cursor, 'Unity WFC propagation queue');
      queued.delete(slot.key);
      if (slot.options.length === 0) return false;

      for (let direction = 0; direction < DIRECTION_OFFSETS.length; direction++) {
        const [dx, dy, dz] = requiredItemAt(DIRECTION_OFFSETS, direction, 'Unity WFC direction offsets');
        const neighbor = this.getSlot(slot.x + dx, slot.y + dy, slot.z + dz, true);
        if (!neighbor || neighbor.collapsed) continue;

        const allowed = new Uint8Array(MASK_BYTES);
        for (const option of slot.options) {
          const mask = this.neighborMask(option, direction);
          for (let i = 0; i < MASK_BYTES; i++) {
            allowed[i] = requiredNumberAt(allowed, i, 'Unity WFC allowed mask')
              | requiredNumberAt(mask, i, 'Unity WFC neighbor mask');
          }
        }
        const filtered = neighbor.options.filter(option => hasBit(allowed, option));
        if (filtered.length === neighbor.options.length) continue;
        const filteredSet = new Set(filtered);
        this.recordRemoved(historyItem, neighbor, neighbor.options.filter(option => !filteredSet.has(option)));
        neighbor.options = filtered;
        if (filtered.length === 0) return false;
        if (!queued.has(neighbor.key)) {
          queue.push(neighbor);
          queued.add(neighbor.key);
        }
      }
    }
    return true;
  }

  private recordRemoved(historyItem: HistoryItem, slot: WaveSlot, removed: number[]): void {
    if (removed.length === 0) return;
    const recorded = historyItem.removedOptions.get(slot.key);
    if (recorded) recorded.push(...removed);
    else historyItem.removedOptions.set(slot.key, [...removed]);
  }

  private undo(steps: number): void {
    while (steps > 0 && this.history.length > 0) {
      const item = this.history.pop();
      if (!item) break;
      this.historyTotal = Math.max(0, this.historyTotal - 1);
      for (const [key, removed] of item.removedOptions) {
        const slot = this.slots.get(key);
        if (!slot) continue;
        const restored = new Set(slot.options);
        for (const option of removed) restored.add(option);
        slot.options = [...restored].sort((a, b) => a - b);
      }
      item.slot.collapsed = false;
      this.workArea?.set(item.slot.key, item.slot);
      this.changedColumnKeys.add(columnKey(item.slot.x, item.slot.z));
      steps--;
    }
    if (this.history.length === 0) this.backtrackBarrier = 0;
  }

  private lowestEntropySlot(slots: Iterable<WaveSlot>): WaveSlot | null {
    let selected: WaveSlot | null = null;
    let minEntropy = Number.POSITIVE_INFINITY;
    for (const slot of slots) {
      const entropy = this.entropy(slot.options);
      if (entropy < minEntropy) {
        selected = slot;
        minEntropy = entropy;
      }
    }
    return selected;
  }

  private entropy(options: number[]): number {
    let total = 0;
    let weightedLog = 0;
    for (const option of options) {
      const weight = moduleAt(option).weight;
      total += weight;
      weightedLog += weight * Math.log(weight);
    }
    return Math.log(total) - weightedLog / total;
  }

  private weightedChoice(options: number[]): number {
    let total = 0;
    for (const option of options) total += moduleAt(option).weight;
    let roll = this.random() * total;
    for (const option of options) {
      roll -= moduleAt(option).weight;
      if (roll <= 0) return option;
    }
    return requiredNumberAt(options, options.length - 1, 'Unity WFC weighted choice');
  }

  private createDefaultLayerOptions(): number[][] {
    const column = Array.from({ length: this.height }, (_unused, y) => ({
      options: ALL_OPTIONS.filter(option => this.allowsVerticalBoundary(option, y)),
    }));
    const queue = column.map((_cell, y) => y);
    const queued = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const y = requiredNumberAt(queue, cursor, 'Unity WFC default-column queue');
      queued.delete(y);
      const cell = requiredItemAt(column, y, 'Unity WFC default column');
      if (cell.options.length === 0) throw new Error('Unity WFC default column became impossible.');

      for (let direction = 0; direction < DIRECTION_OFFSETS.length; direction++) {
        const [_dx, dy, _dz] = requiredItemAt(DIRECTION_OFFSETS, direction, 'Unity WFC direction offsets');
        const neighborY = y + dy;
        // TilingMap(1, height, 1) wraps every horizontal neighbor back to this slot.
        const targetY = dy === 0 ? y : neighborY;
        if (targetY < 0 || targetY >= this.height) continue;
        const allowed = new Uint8Array(MASK_BYTES);
        for (const option of cell.options) {
          const mask = this.neighborMask(option, direction);
          for (let i = 0; i < MASK_BYTES; i++) {
            allowed[i] = requiredNumberAt(allowed, i, 'Unity WFC default allowed mask')
              | requiredNumberAt(mask, i, 'Unity WFC neighbor mask');
          }
        }
        const target = requiredItemAt(column, targetY, 'Unity WFC default column');
        const filtered = target.options.filter(option => hasBit(allowed, option));
        if (filtered.length === 0) throw new Error('Unity WFC default column became impossible.');
        if (filtered.length === target.options.length) continue;
        target.options = filtered;
        if (!queued.has(targetY)) {
          queue.push(targetY);
          queued.add(targetY);
        }
      }
    }
    return column.map(cell => [...cell.options]);
  }

  private allowsVerticalBoundary(index: number, y: number): boolean {
    if (y === 0 && requiredNumberAt(UNITY_WFC_DOWN_CONNECTORS, index, 'Unity WFC down connectors') !== 1) return false;
    if (y === this.height - 1 && requiredNumberAt(UNITY_WFC_UP_CONNECTORS, index, 'Unity WFC up connectors') !== 0) return false;
    return true;
  }
}
