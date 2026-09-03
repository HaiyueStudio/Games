export type MugenTransientAnimationKind = 'hit-spark' | 'legacy-animation';
export type MugenTransientAnimationLayer = 'below' | 'above';

export interface MugenTransientAnimationSpawn {
  readonly id: string;
  readonly kind: MugenTransientAnimationKind;
  readonly animationOwnerId: string | 'fight';
  readonly animationNumber: number;
  readonly position: readonly [number, number];
  readonly facing: -1 | 1;
  readonly layer: MugenTransientAnimationLayer;
  readonly lifetimeTicks: number;
}

export interface MugenTransientAnimationFrame extends MugenTransientAnimationSpawn {
  readonly startedTick: number;
  readonly age: number;
}

interface MutableFrame extends MugenTransientAnimationSpawn { readonly startedTick: number; age: number }

/** Tick-driven lifetime authority for visual-only AIR events such as hit sparks. */
export class MugenTransientAnimationLifecycle {
  readonly #maxActive: number;
  readonly #maxLifetimeTicks: number;
  readonly #active = new Map<string, MutableFrame>();
  #tick = -1;
  #visible: readonly MugenTransientAnimationFrame[] = Object.freeze([]);

  constructor(options: Readonly<{ maxActive?: number; maxLifetimeTicks?: number }> = {}) {
    this.#maxActive = positiveInteger(options.maxActive ?? 512, 'maxActive');
    this.#maxLifetimeTicks = positiveInteger(options.maxLifetimeTicks ?? 600, 'maxLifetimeTicks');
  }

  get tick(): number { return this.#tick; }
  get activeCount(): number { return this.#active.size; }
  visible(): readonly MugenTransientAnimationFrame[] { return this.#visible; }

  clear(): void { this.#active.clear(); this.#tick = -1; this.#visible = Object.freeze([]); }

  advance(tick: number, spawns: readonly MugenTransientAnimationSpawn[]): readonly MugenTransientAnimationFrame[] {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('MUGEN transient animation tick must be a non-negative safe integer.');
    if (tick === this.#tick) return this.#visible;
    if (tick < this.#tick) this.clear();
    const elapsed = this.#tick < 0 ? 0 : tick - this.#tick;
    for (const [id, frame] of this.#active) { frame.age += elapsed; if (frame.age >= frame.lifetimeTicks) this.#active.delete(id); }

    const ids = new Set<string>();
    for (const spawn of spawns) {
      const id = spawn.id.trim(); if (id === '') throw new TypeError('MUGEN transient animation id cannot be empty.'); if (ids.has(id) || this.#active.has(id)) throw new TypeError(`MUGEN transient animation id ${id} is duplicated.`); ids.add(id);
      const lifetimeTicks = positiveInteger(spawn.lifetimeTicks, `${id}.lifetimeTicks`); if (lifetimeTicks > this.#maxLifetimeTicks) throw new RangeError(`MUGEN transient animation ${id} exceeds lifetime budget ${this.#maxLifetimeTicks}.`); if (this.#active.size >= this.#maxActive) throw new RangeError(`MUGEN transient animation active budget ${this.#maxActive} exceeded.`);
      this.#active.set(id, { ...spawn, id, position: Object.freeze([finite(spawn.position[0], `${id}.position.x`), finite(spawn.position[1], `${id}.position.y`)]) as readonly [number, number], facing: spawn.facing === -1 ? -1 : 1, lifetimeTicks, startedTick: tick, age: 0 });
    }
    this.#tick = tick; this.#visible = Object.freeze([...this.#active.values()].sort((left, right) => left.startedTick - right.startedTick || left.id.localeCompare(right.id, 'en')).map(freezeFrame)); return this.#visible;
  }
}

function freezeFrame(value: MutableFrame): MugenTransientAnimationFrame { return Object.freeze({ id: value.id, kind: value.kind, animationOwnerId: value.animationOwnerId, animationNumber: value.animationNumber, position: value.position, facing: value.facing, layer: value.layer, lifetimeTicks: value.lifetimeTicks, startedTick: value.startedTick, age: value.age }); }
function positiveInteger(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`MUGEN transient animation ${label} must be a positive safe integer.`); return value; }
function finite(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new RangeError(`MUGEN transient animation ${label} must be finite.`); return Math.fround(value); }
