import type { MugenAfterImageEffect } from '../runtime/effects/MugenOutputAuthority';

export interface MugenAfterImageSource<T> {
  readonly entityId: string;
  readonly effect: MugenAfterImageEffect;
  readonly value: T;
}

export interface MugenAfterImageTrail<T> {
  readonly entityId: string;
  readonly generation: number;
  readonly effect: MugenAfterImageEffect;
  readonly value: T;
}

interface HistorySlot<T> { readonly value: T | null }
interface EntityHistory<T> {
  effect: MugenAfterImageEffect;
  signature: string;
  restGap: number;
  readonly slots: HistorySlot<T>[];
}

/**
 * Render-only, tick-driven AfterImage history. It mirrors MUGEN's ring-buffer
 * selection: capture every timegap ticks and display capture offsets
 * framegap, framegap*2, ... up to length.
 */
export class MugenAfterImageHistory<T> {
  readonly #maxEntities: number;
  readonly #maxVisibleTrails: number;
  readonly #entities = new Map<string, EntityHistory<T>>();
  #tick = -1;
  #visible: readonly MugenAfterImageTrail<T>[] = Object.freeze([]);

  constructor(options: Readonly<{ maxEntities?: number; maxVisibleTrails?: number }> = {}) {
    this.#maxEntities = positiveInteger(options.maxEntities ?? 512, 'maxEntities');
    this.#maxVisibleTrails = positiveInteger(options.maxVisibleTrails ?? 512, 'maxVisibleTrails');
  }

  get tick(): number { return this.#tick; }
  get trackedEntityCount(): number { return this.#entities.size; }
  visibleTrails(): readonly MugenAfterImageTrail<T>[] { return this.#visible; }

  clear(): void {
    this.#entities.clear();
    this.#tick = -1;
    this.#visible = Object.freeze([]);
  }

  advance(tick: number, sources: readonly MugenAfterImageSource<T>[]): readonly MugenAfterImageTrail<T>[] {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('MUGEN AfterImage history tick must be a non-negative safe integer.');
    if (tick === this.#tick) return this.#visible;
    if (tick < this.#tick) this.clear();

    const gap = this.#tick < 0 ? 0 : tick - this.#tick - 1;
    const drainTicks = Math.min(gap, 3_600);
    for (let skipped = 0; skipped < drainTicks; skipped += 1) this.#advanceOne(new Map());
    if (gap > drainTicks) this.#entities.clear();

    const active = new Map<string, MugenAfterImageSource<T>>();
    for (const source of [...sources].sort((left, right) => left.entityId.localeCompare(right.entityId, 'en'))) {
      const entityId = source.entityId.trim();
      if (entityId === '') throw new TypeError('MUGEN AfterImage source entity id cannot be empty.');
      if (active.has(entityId)) throw new TypeError(`MUGEN AfterImage source ${entityId} is duplicated for tick ${tick}.`);
      active.set(entityId, source);
    }
    this.#advanceOne(active);
    this.#tick = tick;
    this.#visible = this.#collectVisible();
    return this.#visible;
  }

  #advanceOne(active: ReadonlyMap<string, MugenAfterImageSource<T>>): void {
    for (const [entityId, source] of active) {
      const signature = effectSignature(source.effect);
      const current = this.#entities.get(entityId);
      if (current === undefined) {
        if (this.#entities.size >= this.#maxEntities) throw new RangeError(`MUGEN AfterImage tracked-entity budget ${this.#maxEntities} exceeded.`);
        this.#entities.set(entityId, { effect: source.effect, signature, restGap: 0, slots: [] });
      } else if (current.signature !== signature) {
        current.effect = source.effect;
        current.signature = signature;
        current.restGap = 0;
        current.slots.length = 0;
      } else current.effect = source.effect;
    }

    for (const [entityId, state] of [...this.#entities.entries()].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
      const source = active.get(entityId);
      if (state.restGap <= 0) {
        state.slots.unshift(Object.freeze({ value: source?.value ?? null }));
        state.slots.length = Math.min(state.slots.length, state.effect.length);
        state.restGap = state.effect.timeGap;
      }
      state.restGap -= 1;
      if (source === undefined && !state.slots.some(slot => slot.value !== null)) this.#entities.delete(entityId);
    }
  }

  #collectVisible(): readonly MugenAfterImageTrail<T>[] {
    const result: MugenAfterImageTrail<T>[] = [];
    for (const [entityId, state] of [...this.#entities.entries()].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
      const end = Math.floor(Math.min(state.slots.length, state.effect.length) / state.effect.frameGap) * state.effect.frameGap;
      for (let offset = state.effect.frameGap; offset <= end; offset += state.effect.frameGap) {
        const value = state.slots[offset - 1]?.value;
        if (value === null || value === undefined) continue;
        if (result.length >= this.#maxVisibleTrails) return Object.freeze(result);
        result.push(Object.freeze({ entityId, generation: offset / state.effect.frameGap - 1, effect: state.effect, value }));
      }
    }
    return Object.freeze(result);
  }
}

function effectSignature(effect: MugenAfterImageEffect): string {
  return JSON.stringify([effect.length, effect.paletteColor, effect.paletteInvertAll, effect.paletteBright, effect.paletteContrast, effect.palettePostBright, effect.paletteAdd, effect.paletteMultiply, effect.timeGap, effect.frameGap, effect.transparency]);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`MUGEN AfterImage ${label} must be a positive safe integer.`);
  return value;
}
