import {
  BrowserMultiplayerInput,
  FixedStepClock,
  hashSimulationState,
  type BrowserMultiplayerInputOptions,
  type FixedStepAdvanceResult,
  type FixedStepTick,
  type SimulationStateValue,
} from '@haiyue/engine/experimental/simulation';

export type MugenFacing = -1 | 1;
export type MugenScreenDirection = 'N' | 'U' | 'D' | 'L' | 'R' | 'UL' | 'UR' | 'DL' | 'DR';
export type MugenFacingDirection = 'N' | 'U' | 'D' | 'F' | 'B' | 'UF' | 'UB' | 'DF' | 'DB';
export type MugenControl = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'c' | 'x' | 'y' | 'z' | 'start';

export interface MugenSourceActionState {
  readonly action: string;
  readonly value: number;
  readonly held: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
}

export interface MugenSourcePlayerInput {
  readonly id: string;
  readonly actions: readonly MugenSourceActionState[];
  /** Official AILevel contract: 0 is human/off, 1..8 is CPU difficulty. */
  readonly aiLevel?: number;
  /** Command names asserted directly by the CPU command source for this tick. */
  readonly aiCommands?: readonly string[];
}

export interface MugenSourceInputSnapshot {
  readonly tick: number;
  readonly players: readonly MugenSourcePlayerInput[];
}

export interface MugenPlayerInputFrame {
  readonly tick: number;
  readonly playerId: string;
  readonly facing: MugenFacing;
  readonly axes: readonly [horizontal: number, vertical: number];
  readonly facingAxes: readonly [forward: number, vertical: number];
  readonly screenDirection: MugenScreenDirection;
  readonly facingDirection: MugenFacingDirection;
  readonly held: readonly MugenControl[];
  readonly pressed: readonly MugenControl[];
  readonly released: readonly MugenControl[];
  readonly aiLevel: number;
  readonly aiCommands: readonly string[];
  readonly hash: string;
}

export interface MugenTickInput {
  readonly tick: number;
  readonly players: readonly MugenPlayerInputFrame[];
  readonly hash: string;
}

export interface MugenReplayHeaderV1 {
  readonly schemaVersion: 1;
  readonly tickRateHz: 60;
  readonly profile: string;
  readonly seed: string | number;
  readonly runtimeRevision: string;
  readonly players: readonly Readonly<{ id: string; packageSha256: string }>[];
}

export interface MugenInputReplayV1 {
  readonly header: MugenReplayHeaderV1;
  readonly ticks: readonly MugenTickInput[];
}

export const MUGEN_DEFAULT_PLAYER_BINDINGS = Object.freeze([
  Object.freeze({
    id: 'P1',
    gamepadIndex: 0,
    bindings: Object.freeze({
      up: { keys: ['KeyW'], gamepadAxes: [{ axis: 1, direction: 'negative' as const }] },
      down: { keys: ['KeyS'], gamepadAxes: [{ axis: 1, direction: 'positive' as const }] },
      left: { keys: ['KeyA'], gamepadAxes: [{ axis: 0, direction: 'negative' as const }] },
      right: { keys: ['KeyD'], gamepadAxes: [{ axis: 0, direction: 'positive' as const }] },
      a: { keys: ['KeyJ'], gamepadButtons: [0] }, b: { keys: ['KeyK'], gamepadButtons: [1] }, c: { keys: ['KeyL'], gamepadButtons: [2] },
      x: { keys: ['KeyU'], gamepadButtons: [3] }, y: { keys: ['KeyI'], gamepadButtons: [4] }, z: { keys: ['KeyO'], gamepadButtons: [5] },
      start: { keys: ['Enter'], gamepadButtons: [9] },
    }),
  }),
  Object.freeze({
    id: 'P2',
    gamepadIndex: 1,
    bindings: Object.freeze({
      up: { keys: ['ArrowUp'], gamepadAxes: [{ axis: 1, direction: 'negative' as const }] },
      down: { keys: ['ArrowDown'], gamepadAxes: [{ axis: 1, direction: 'positive' as const }] },
      left: { keys: ['ArrowLeft'], gamepadAxes: [{ axis: 0, direction: 'negative' as const }] },
      right: { keys: ['ArrowRight'], gamepadAxes: [{ axis: 0, direction: 'positive' as const }] },
      a: { keys: ['Numpad1'], gamepadButtons: [0] }, b: { keys: ['Numpad2'], gamepadButtons: [1] }, c: { keys: ['Numpad3'], gamepadButtons: [2] },
      x: { keys: ['Numpad4'], gamepadButtons: [3] }, y: { keys: ['Numpad5'], gamepadButtons: [4] }, z: { keys: ['Numpad6'], gamepadButtons: [5] },
      start: { keys: ['Numpad0'], gamepadButtons: [9] },
    }),
  }),
] as const) satisfies BrowserMultiplayerInputOptions['players'];

export interface MugenBrowserInputOptions {
  readonly players?: BrowserMultiplayerInputOptions['players'];
  readonly eventTarget?: EventTarget;
  readonly visibilityTarget?: EventTarget & Readonly<{ hidden?: boolean }>;
  readonly getGamepads?: BrowserMultiplayerInputOptions['getGamepads'];
  readonly preventDefault?: boolean;
  readonly historyTicks?: number;
  readonly transformSource?: (source: MugenSourceInputSnapshot) => MugenSourceInputSnapshot;
}

export interface MugenFixedStepInputDriverOptions extends MugenBrowserInputOptions {
  readonly maxSubSteps?: number;
  readonly maxBacklogTicks?: number;
}

/** Product adapter that owns the public Engine sampler and MUGEN-facing tick history together. */
export class MugenBrowserInput {
  readonly source: BrowserMultiplayerInput;
  readonly history: MugenInputHistory;
  readonly #transformSource: (source: MugenSourceInputSnapshot) => MugenSourceInputSnapshot;

  constructor(options: MugenBrowserInputOptions = {}) {
    this.source = new BrowserMultiplayerInput({
      players: options.players ?? MUGEN_DEFAULT_PLAYER_BINDINGS,
      preventDefault: options.preventDefault ?? true,
      ...(options.eventTarget === undefined ? {} : { eventTarget: options.eventTarget }),
      ...(options.visibilityTarget === undefined ? {} : { visibilityTarget: options.visibilityTarget }),
      ...(options.getGamepads === undefined ? {} : { getGamepads: options.getGamepads }),
    });
    this.history = new MugenInputHistory(options.historyTicks);
    this.#transformSource = options.transformSource ?? (source => source);
  }

  get suspended(): boolean { return this.source.suspended; }
  get disposed(): boolean { return this.source.disposed; }

  sample(tick: number, facingByPlayer: Readonly<Record<string, MugenFacing>>): MugenTickInput {
    return this.history.push(this.#transformSource(this.source.sample(tick)), facingByPlayer);
  }

  release(): this { this.source.release(); return this; }

  reset(): this {
    this.source.reset();
    this.history.reset();
    return this;
  }

  dispose(): void {
    this.source.dispose();
    this.history.reset();
  }
}

/** 60 Hz product driver that coordinates visibility pause, browser input and MUGEN tick history. */
export class MugenFixedStepInputDriver {
  readonly clock: FixedStepClock;
  readonly input: MugenBrowserInput;
  #wasSuspended = false;
  #disposed = false;

  constructor(options: MugenFixedStepInputDriverOptions = {}) {
    this.clock = new FixedStepClock({ tickRateHz: 60, maxSubSteps: options.maxSubSteps ?? 8, maxBacklogTicks: options.maxBacklogTicks ?? 120 });
    this.input = new MugenBrowserInput(options);
  }

  get disposed(): boolean { return this.#disposed; }

  advance(
    frameDeltaMs: number,
    facingAtTick: (tick: number) => Readonly<Record<string, MugenFacing>>,
    callback: (input: MugenTickInput, step: FixedStepTick) => void,
  ): FixedStepAdvanceResult {
    this.#assertLive();
    if (this.input.suspended) {
      this.#wasSuspended = true;
      this.clock.pause();
      return this.clock.advance(0, () => undefined);
    }
    this.clock.resume();
    const delta = this.#wasSuspended ? 0 : frameDeltaMs;
    this.#wasSuspended = false;
    return this.clock.advance(delta, step => callback(this.input.sample(step.tick, facingAtTick(step.tick)), step));
  }

  reset(): this {
    this.#assertLive();
    this.clock.reset();
    this.input.reset();
    this.#wasSuspended = this.input.suspended;
    return this;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.clock.pause();
    this.input.dispose();
  }

  #assertLive(): void { if (this.#disposed) throw new Error('MUGEN fixed-step input driver has been disposed.'); }
}

export class MugenInputHistory {
  readonly maxTicks: number;
  readonly #ticks: MugenTickInput[] = [];
  #tick = 0;

  constructor(maxTicks = 180) {
    this.maxTicks = integerRange(maxTicks, 1, 3_600, 'maxTicks');
  }

  get tick(): number { return this.#tick; }
  get length(): number { return this.#ticks.length; }

  push(source: MugenSourceInputSnapshot, facingByPlayer: Readonly<Record<string, MugenFacing>>): MugenTickInput {
    if (!Number.isSafeInteger(source.tick) || source.tick !== this.#tick + 1) throw new RangeError(`MUGEN input tick must advance exactly from ${this.#tick} to ${this.#tick + 1}.`);
    if (!Array.isArray(source.players) || source.players.length < 1 || source.players.length > 8) throw new TypeError('MUGEN input requires from 1 to 8 players.');
    const ids = new Set<string>();
    const players = source.players.map(player => {
      if (ids.has(player.id)) throw new TypeError(`MUGEN input player id is duplicated: ${player.id}.`);
      ids.add(player.id);
      const facing = facingByPlayer[player.id];
      if (facing !== -1 && facing !== 1) throw new TypeError(`MUGEN input facing is missing for player ${player.id}.`);
      return createMugenPlayerInputFrame(source.tick, player, facing);
    });
    const value = { tick: source.tick, players } as unknown as SimulationStateValue;
    const result = Object.freeze({ tick: source.tick, players: Object.freeze(players), hash: hashSimulationState(value) });
    this.#tick = source.tick;
    this.#ticks.push(result);
    if (this.#ticks.length > this.maxTicks) this.#ticks.shift();
    return result;
  }

  at(playerId: string, ticksAgo = 0): MugenPlayerInputFrame | null {
    const offset = integerRange(ticksAgo, 0, this.maxTicks - 1, 'ticksAgo');
    return this.#ticks[this.#ticks.length - 1 - offset]?.players.find(player => player.playerId === playerId) ?? null;
  }

  snapshot(): readonly MugenTickInput[] { return Object.freeze([...this.#ticks]); }

  reset(): this {
    this.#ticks.length = 0;
    this.#tick = 0;
    return this;
  }
}

export class MugenInputReplayRecorder {
  readonly header: MugenReplayHeaderV1;
  readonly maxTicks: number;
  readonly #ticks: MugenTickInput[] = [];

  constructor(header: MugenReplayHeaderV1, maxTicks = 60 * 60 * 20) {
    this.header = validateMugenReplayHeader(header);
    this.maxTicks = integerRange(maxTicks, 1, 60 * 60 * 24, 'maxTicks');
  }

  record(input: MugenTickInput): this {
    if (this.#ticks.length >= this.maxTicks) throw new RangeError(`MUGEN input replay exceeds ${this.maxTicks} ticks.`);
    const expected = this.#ticks.length + 1;
    if (input.tick !== expected) throw new RangeError(`MUGEN input replay tick must advance exactly to ${expected}.`);
    this.#ticks.push(input);
    return this;
  }

  finish(): MugenInputReplayV1 {
    return Object.freeze({ header: this.header, ticks: Object.freeze([...this.#ticks]) });
  }
}

export function createMugenReplayHeader(input: Omit<MugenReplayHeaderV1, 'schemaVersion' | 'tickRateHz'>): MugenReplayHeaderV1 {
  return validateMugenReplayHeader({ schemaVersion: 1, tickRateHz: 60, ...input });
}

export function createMugenPlayerInputFrame(tick: number, source: MugenSourcePlayerInput, facing: MugenFacing): MugenPlayerInputFrame {
  if (!Number.isSafeInteger(tick) || tick < 1) throw new RangeError('MUGEN player input tick must be a positive integer.');
  if (facing !== -1 && facing !== 1) throw new TypeError('MUGEN player facing must be -1 or 1.');
  const controls = new Map<MugenControl, MugenSourceActionState>();
  for (const action of source.actions) {
    if (!Number.isFinite(action.value) || typeof action.held !== 'boolean' || typeof action.pressed !== 'boolean' || typeof action.released !== 'boolean') throw new TypeError(`MUGEN player input action state is invalid: ${action.action}.`);
    if (!isMugenControl(action.action)) continue;
    if (controls.has(action.action)) throw new TypeError(`MUGEN player input action is duplicated: ${action.action}.`);
    controls.set(action.action, action);
  }
  const left = controls.get('left')?.held === true;
  const right = controls.get('right')?.held === true;
  const up = controls.get('up')?.held === true;
  const down = controls.get('down')?.held === true;
  const horizontal = Number(right) - Number(left);
  const vertical = Number(down) - Number(up);
  const forward = horizontal * facing;
  const held = filterControls(controls, 'held');
  const pressed = filterControls(controls, 'pressed');
  const released = filterControls(controls, 'released');
  const aiLevel = integerRange(source.aiLevel ?? 0, 0, 8, 'MUGEN AI level');
  const aiCommands = normalizeAiCommands(source.aiCommands ?? []);
  if (aiLevel === 0 && aiCommands.length > 0) throw new TypeError('MUGEN AI commands require an AI level from 1 to 8.');
  const base = {
    tick,
    playerId: normalizePlayerId(source.id),
    facing,
    axes: Object.freeze([horizontal, vertical]) as readonly [number, number],
    facingAxes: Object.freeze([forward, vertical]) as readonly [number, number],
    screenDirection: screenDirection(horizontal, vertical),
    facingDirection: facingDirection(forward, vertical),
    held,
    pressed,
    released,
    aiLevel,
    aiCommands,
  };
  return Object.freeze({ ...base, hash: hashSimulationState(base as unknown as SimulationStateValue) });
}

function validateMugenReplayHeader(value: MugenReplayHeaderV1): MugenReplayHeaderV1 {
  if (value.schemaVersion !== 1 || value.tickRateHz !== 60) throw new TypeError('MUGEN replay header must use schema version 1 and 60 Hz.');
  if (typeof value.profile !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(value.profile)) throw new TypeError('MUGEN replay profile is invalid.');
  if ((typeof value.seed !== 'string' && typeof value.seed !== 'number') || (typeof value.seed === 'number' && !Number.isSafeInteger(value.seed)) || (typeof value.seed === 'string' && (value.seed.length < 1 || value.seed.length > 128))) throw new TypeError('MUGEN replay seed is invalid.');
  if (typeof value.runtimeRevision !== 'string' || !/^[A-Za-z0-9._+-]{1,96}$/u.test(value.runtimeRevision)) throw new TypeError('MUGEN replay runtime revision is invalid.');
  if (!Array.isArray(value.players) || value.players.length < 1 || value.players.length > 8) throw new TypeError('MUGEN replay player inventory is invalid.');
  const ids = new Set<string>();
  const players = value.players.map(player => {
    const id = normalizePlayerId(player.id);
    if (ids.has(id)) throw new TypeError(`MUGEN replay player id is duplicated: ${id}.`);
    ids.add(id);
    if (!/^[a-f0-9]{64}$/u.test(player.packageSha256)) throw new TypeError(`MUGEN replay package hash is invalid for player ${id}.`);
    return Object.freeze({ id, packageSha256: player.packageSha256 });
  });
  return Object.freeze({ schemaVersion: 1, tickRateHz: 60, profile: value.profile, seed: value.seed, runtimeRevision: value.runtimeRevision, players: Object.freeze(players) });
}

function filterControls(states: ReadonlyMap<MugenControl, MugenSourceActionState>, property: 'held' | 'pressed' | 'released'): readonly MugenControl[] {
  return Object.freeze(MUGEN_CONTROLS.filter(control => states.get(control)?.[property] === true));
}

function screenDirection(horizontal: number, vertical: number): MugenScreenDirection {
  if (vertical < 0) return horizontal < 0 ? 'UL' : horizontal > 0 ? 'UR' : 'U';
  if (vertical > 0) return horizontal < 0 ? 'DL' : horizontal > 0 ? 'DR' : 'D';
  return horizontal < 0 ? 'L' : horizontal > 0 ? 'R' : 'N';
}

function facingDirection(forward: number, vertical: number): MugenFacingDirection {
  if (vertical < 0) return forward < 0 ? 'UB' : forward > 0 ? 'UF' : 'U';
  if (vertical > 0) return forward < 0 ? 'DB' : forward > 0 ? 'DF' : 'D';
  return forward < 0 ? 'B' : forward > 0 ? 'F' : 'N';
}

function isMugenControl(value: string): value is MugenControl { return MUGEN_CONTROL_SET.has(value); }
function normalizeAiCommands(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length > 1_024) throw new TypeError('MUGEN AI command inventory is invalid.');
  const result = [...new Set(values.map(value => {
    if (typeof value !== 'string' || value.length < 1 || value.length > 128 || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new TypeError('MUGEN AI command name is invalid.');
    return value.toLowerCase();
  }))].sort();
  return Object.freeze(result);
}
function normalizePlayerId(value: string): string { if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(value)) throw new TypeError('MUGEN input player id is invalid.'); return value; }
function integerRange(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`); return value; }

const MUGEN_CONTROLS: readonly MugenControl[] = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);
const MUGEN_CONTROL_SET = new Set<string>(MUGEN_CONTROLS);
