import { hashSimulationState, type SimulationStateValue } from '@haiyue/engine/experimental/simulation';

export type MugenAssertSpecialFlag = 'intro' | 'invisible' | 'roundnotover' | 'nobardisplay' | 'nobg' | 'nofg' | 'nostandguard' | 'nocrouchguard' | 'noairguard' | 'noautoturn' | 'nojugglecheck' | 'nokosnd' | 'nokoslow' | 'noshadow' | 'globalnoshadow' | 'nomusic' | 'nowalk' | 'timerfreeze' | 'unguardable';
export type MugenTransparencyMode = 'default' | 'none' | 'add' | 'addalpha' | 'add1' | 'sub';
export type MugenForceFeedbackWaveform = 'sine' | 'square' | 'sinesquare' | 'off';

export interface MugenPaletteEffect {
  readonly remainingTicks: number;
  readonly elapsedTicks: number;
  readonly add: readonly [number, number, number];
  readonly multiply: readonly [number, number, number];
  readonly sineAdd: readonly [number, number, number, number];
  readonly invertAll: boolean;
  readonly color: number;
}

export interface MugenAfterImageEffect {
  readonly remainingTicks: number;
  readonly length: number;
  readonly paletteColor: number;
  readonly paletteInvertAll: boolean;
  readonly paletteBright: readonly [number, number, number];
  readonly paletteContrast: readonly [number, number, number];
  readonly palettePostBright: readonly [number, number, number];
  readonly paletteAdd: readonly [number, number, number];
  readonly paletteMultiply: readonly [number, number, number];
  readonly timeGap: number;
  readonly frameGap: number;
  readonly transparency: 'none' | 'add' | 'add1' | 'sub';
}

export interface MugenEntityOutputState {
  readonly entityId: string;
  readonly assertions: readonly MugenAssertSpecialFlag[];
  readonly transparency: Readonly<{ mode: MugenTransparencyMode; alpha: readonly [number, number] }> | null;
  readonly baseTransparency: Readonly<{ mode: MugenTransparencyMode; alpha: readonly [number, number] }> | null;
  readonly screenBound: Readonly<{ bound: boolean; moveCamera: readonly [boolean, boolean] }> | null;
  readonly palette: MugenPaletteEffect | null;
  readonly paletteRemap: Readonly<{ source: readonly [number, number]; destination: readonly [number, number] }> | null;
  readonly paletteIsolated: boolean;
  readonly afterImage: MugenAfterImageEffect | null;
  readonly displayOffset: readonly [number, number];
  readonly drawingAngle: number;
  readonly drawingTransform: Readonly<{ angle: number; scale: readonly [number, number] }> | null;
  readonly baseDrawingTransform: Readonly<{ angle: number; scale: readonly [number, number] }> | null;
  readonly victoryQuote: number | null;
}

export interface MugenEnvironmentColor { readonly remainingTicks: number; readonly color: readonly [number, number, number]; readonly under: boolean }

export interface MugenCameraShake {
  readonly remainingTicks: number;
  readonly elapsedTicks: number;
  readonly frequency: number;
  readonly amplitude: number;
  readonly phase: number;
}
export type MugenRgbAffineColorMatrix = readonly [number, number, number, number, number, number, number, number, number, number, number, number];

export type MugenOutputEvent =
  | Readonly<{ kind: 'force-feedback'; policy: 'browser-gamepad-best-effort'; entityId: string; rootId: string; target: 'self' | 'opponent'; waveform: MugenForceFeedbackWaveform; time: number; frequency: readonly [number, number, number, number]; amplitude: readonly [number, number, number, number] }>
  | Readonly<{ kind: 'clipboard-debug'; policy: 'internal-debug-buffer'; entityId: string; mode: 'replace' | 'append' | 'clear'; text: string; paramsSource: string }>
  | Readonly<{ kind: 'legacy-animation'; policy: 'fightfx-render-event'; entityId: string; animationNumber: number; position: readonly [number, number]; facing: -1 | 1; layer: 'below' | 'above' }>
  | Readonly<{ kind: 'hit-spark'; policy: 'character-or-fightfx-render-event'; entityId: string; animationOwnerId: string | 'fight'; animationNumber: number; position: readonly [number, number]; facing: -1 | 1; layer: 'above' }>
  | Readonly<{ kind: 'dust'; policy: 'fightfx-render-event'; entityId: string; positions: readonly (readonly [number, number])[]; spacing: number }>;

export interface MugenOutputAuthoritySnapshot {
  readonly schemaVersion: 4;
  readonly revision: 'm09-g08-output-authority-v4';
  readonly tick: number;
  readonly entities: readonly MugenEntityOutputState[];
  readonly backgroundPalette: MugenPaletteEffect | null;
  readonly allPalette: MugenPaletteEffect | null;
  readonly environmentColor: MugenEnvironmentColor | null;
  readonly cameraShake: MugenCameraShake | null;
  readonly events: readonly MugenOutputEvent[];
  readonly hash: string;
}

interface MutableEntityState {
  readonly assertions: Set<MugenAssertSpecialFlag>;
  transparency: MugenEntityOutputState['transparency'];
  baseTransparency: MugenEntityOutputState['baseTransparency'];
  screenBound: MugenEntityOutputState['screenBound'];
  palette: MugenPaletteEffect | null;
  paletteRemap: MugenEntityOutputState['paletteRemap'];
  paletteIsolated: boolean;
  afterImage: MugenAfterImageEffect | null;
  displayOffset: readonly [number, number];
  drawingAngle: number;
  drawingTransform: MugenEntityOutputState['drawingTransform'];
  baseDrawingTransform: MugenEntityOutputState['baseDrawingTransform'];
  victoryQuote: number | null;
}

/** Deterministic authority for G06-A visual, camera and host-output controller state. */
export class MugenOutputAuthority {
  #tick = -1;
  readonly #entities = new Map<string, MutableEntityState>();
  #backgroundPalette: MugenPaletteEffect | null = null;
  #allPalette: MugenPaletteEffect | null = null;
  #environmentColor: MugenEnvironmentColor | null = null;
  #cameraShake: MugenCameraShake | null = null;
  #events: MugenOutputEvent[] = [];

  beginTick(tick: number): this {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('MUGEN output tick must be a non-negative safe integer.');
    if (tick === this.#tick) throw new Error('MUGEN output tick is already open.');
    this.#tick = tick; this.#events = [];
    for (const state of this.#entities.values()) {
      state.assertions.clear(); state.transparency = null; state.screenBound = null; state.displayOffset = Object.freeze([0, 0]); state.drawingTransform = null;
      state.palette = advancePalette(state.palette); state.afterImage = advanceAfterImage(state.afterImage);
    }
    this.#backgroundPalette = advancePalette(this.#backgroundPalette);
    this.#allPalette = advancePalette(this.#allPalette);
    this.#environmentColor = advanceEnvironmentColor(this.#environmentColor);
    this.#cameraShake = advanceShake(this.#cameraShake);
    return this;
  }

  clearRound(): this { const quotes = [...this.#entities.entries()].flatMap(([id, state]) => state.victoryQuote === null ? [] : [[id, state.victoryQuote] as const]); this.#entities.clear(); for (const [id, quote] of quotes) this.#entity(id).victoryQuote = quote; this.#backgroundPalette = null; this.#allPalette = null; this.#environmentColor = null; this.#cameraShake = null; this.#events = []; return this; }
  assert(entityId: string, flags: readonly MugenAssertSpecialFlag[]): this { const state = this.#entity(entityId); for (const flag of flags) state.assertions.add(flag); return this; }
  setTransparency(entityId: string, mode: MugenTransparencyMode, alpha: readonly [number, number]): this { this.#entity(entityId).transparency = Object.freeze({ mode, alpha: alphaPair(alpha, 'Trans.alpha') }); return this; }
  setBaseTransparency(entityId: string, mode: MugenTransparencyMode, alpha: readonly [number, number]): this { this.#entity(entityId).baseTransparency = Object.freeze({ mode, alpha: alphaPair(alpha, 'Explod.alpha') }); return this; }
  setScreenBound(entityId: string, bound: boolean, moveCamera: readonly [boolean, boolean]): this { this.#entity(entityId).screenBound = Object.freeze({ bound, moveCamera: Object.freeze([Boolean(moveCamera[0]), Boolean(moveCamera[1])]) as readonly [boolean, boolean] }); return this; }
  setPalette(entityId: string, effect: MugenPaletteEffect): this { this.#entity(entityId).palette = effect.remainingTicks === 0 ? null : normalizePalette(effect); return this; }
  setPaletteRemap(entityId: string, source: readonly [number, number], destination: readonly [number, number]): this { this.#entity(entityId).paletteRemap = Object.freeze({ source: palettePair(source, 'RemapPal.source'), destination: palettePair(destination, 'RemapPal.dest') }); return this; }
  setPaletteIsolation(entityId: string, isolated: boolean): this { this.#entity(entityId).paletteIsolated = Boolean(isolated); return this; }
  setBackgroundPalette(effect: MugenPaletteEffect): this { this.#backgroundPalette = effect.remainingTicks === 0 ? null : normalizePalette(effect); return this; }
  setAllPalette(effect: MugenPaletteEffect): this { this.#allPalette = effect.remainingTicks === 0 ? null : normalizePalette(effect); return this; }
  setEnvironmentColor(effect: MugenEnvironmentColor): this { this.#environmentColor = effect.remainingTicks === 0 ? null : normalizeEnvironmentColor(effect); return this; }
  setDisplayOffset(entityId: string, value: readonly [number, number]): this { this.#entity(entityId).displayOffset = pair(value, 'Offset'); return this; }
  addDrawingAngle(entityId: string, value: number): this { const state = this.#entity(entityId); state.drawingAngle = finite(state.drawingAngle + value, 'AngleAdd.value'); return this; }
  multiplyDrawingAngle(entityId: string, value: number): this { const state = this.#entity(entityId); state.drawingAngle = finite(state.drawingAngle * value, 'AngleMul.value'); return this; }
  setDrawingAngle(entityId: string, value: number): this { this.#entity(entityId).drawingAngle = finite(value, 'AngleSet.value'); return this; }
  drawAngle(entityId: string, angle: number | null, scale: readonly [number, number]): this { const state = this.#entity(entityId); state.drawingTransform = Object.freeze({ angle: finite(angle ?? state.drawingAngle, 'AngleDraw.value'), scale: positivePair(scale, 'AngleDraw.scale') }); return this; }
  setBaseDrawingTransform(entityId: string, angle: number, scale: readonly [number, number]): this { this.#entity(entityId).baseDrawingTransform = Object.freeze({ angle: finite(angle, 'Explod.angle'), scale: nonNegativePair(scale, 'Explod.scale') }); return this; }
  setVictoryQuote(entityId: string, value: number): this { this.#entity(entityId).victoryQuote = boundedInteger(value, -1, 99, 'VictoryQuote.value'); return this; }
  setAfterImage(entityId: string, effect: MugenAfterImageEffect): this { this.#entity(entityId).afterImage = effect.remainingTicks === 0 ? null : normalizeAfterImage(effect); return this; }
  setAfterImageTime(entityId: string, time: number): this { const state = this.#entity(entityId); if (state.afterImage !== null) state.afterImage = time === 0 ? null : normalizeAfterImage({ ...state.afterImage, remainingTicks: lifetime(time, 'AfterImageTime.time') }); return this; }
  setCameraShake(effect: MugenCameraShake): this { this.#cameraShake = effect.remainingTicks === 0 ? null : normalizeShake(effect); return this; }
  emit(event: MugenOutputEvent): this { if (this.#events.length >= 512) throw new RangeError('MUGEN output event budget exceeded.'); this.#events.push(Object.freeze(event)); return this; }
  pruneEntities(validEntityIds: ReadonlySet<string>): this { for (const entityId of this.#entities.keys()) if (!validEntityIds.has(entityId)) this.#entities.delete(entityId); return this; }

  entity(entityId: string): MugenEntityOutputState { return freezeEntity(entityId, this.#entity(entityId)); }
  findEntity(entityId: string): MugenEntityOutputState | null { const state = this.#entities.get(entityId); return state === undefined ? null : freezeEntity(entityId, state); }
  snapshot(): MugenOutputAuthoritySnapshot {
    const base = Object.freeze({ schemaVersion: 4 as const, revision: 'm09-g08-output-authority-v4' as const, tick: this.#tick, entities: Object.freeze([...this.#entities.entries()].sort(([left], [right]) => left.localeCompare(right, 'en')).map(([id, state]) => freezeEntity(id, state))), backgroundPalette: this.#backgroundPalette, allPalette: this.#allPalette, environmentColor: this.#environmentColor, cameraShake: this.#cameraShake, events: Object.freeze([...this.#events]) });
    return Object.freeze({ ...base, hash: hashSimulationState(base as unknown as SimulationStateValue) });
  }

  restore(value: MugenOutputAuthoritySnapshot): this {
    if (value.schemaVersion !== 4 || value.revision !== 'm09-g08-output-authority-v4') throw new TypeError('MUGEN output snapshot revision is unsupported.');
    this.#tick = value.tick; this.#entities.clear();
    for (const entity of value.entities) this.#entities.set(entity.entityId, { assertions: new Set(entity.assertions), transparency: entity.transparency === null ? null : Object.freeze({ mode: entity.transparency.mode, alpha: alphaPair(entity.transparency.alpha, 'Trans.alpha') }), baseTransparency: entity.baseTransparency === null ? null : Object.freeze({ mode: entity.baseTransparency.mode, alpha: alphaPair(entity.baseTransparency.alpha, 'Explod.alpha') }), screenBound: entity.screenBound === null ? null : Object.freeze({ bound: entity.screenBound.bound, moveCamera: Object.freeze([...entity.screenBound.moveCamera]) as readonly [boolean, boolean] }), palette: entity.palette === null ? null : normalizePalette(entity.palette), paletteRemap: entity.paletteRemap === null ? null : Object.freeze({ source: palettePair(entity.paletteRemap.source, 'RemapPal.source'), destination: palettePair(entity.paletteRemap.destination, 'RemapPal.dest') }), paletteIsolated: Boolean(entity.paletteIsolated), afterImage: entity.afterImage === null ? null : normalizeAfterImage(entity.afterImage), displayOffset: pair(entity.displayOffset, 'Offset'), drawingAngle: finite(entity.drawingAngle, 'AngleSet.value'), drawingTransform: entity.drawingTransform === null ? null : Object.freeze({ angle: finite(entity.drawingTransform.angle, 'AngleDraw.value'), scale: positivePair(entity.drawingTransform.scale, 'AngleDraw.scale') }), baseDrawingTransform: entity.baseDrawingTransform === null ? null : Object.freeze({ angle: finite(entity.baseDrawingTransform.angle, 'Explod.angle'), scale: nonNegativePair(entity.baseDrawingTransform.scale, 'Explod.scale') }), victoryQuote: entity.victoryQuote === null ? null : boundedInteger(entity.victoryQuote, -1, 99, 'VictoryQuote.value') });
    this.#backgroundPalette = value.backgroundPalette === null ? null : normalizePalette(value.backgroundPalette); this.#allPalette = value.allPalette === null ? null : normalizePalette(value.allPalette); this.#environmentColor = value.environmentColor === null ? null : normalizeEnvironmentColor(value.environmentColor); this.#cameraShake = value.cameraShake === null ? null : normalizeShake(value.cameraShake); this.#events = value.events.map(event => Object.freeze({ ...event })) as MugenOutputEvent[];
    if (this.snapshot().hash !== value.hash) throw new TypeError('MUGEN output snapshot hash does not match its state.');
    return this;
  }

  #entity(entityId: string): MutableEntityState { const id = entityId.trim(); if (id === '') throw new TypeError('MUGEN output entity id cannot be empty.'); let state = this.#entities.get(id); if (!state) { state = { assertions: new Set(), transparency: null, baseTransparency: null, screenBound: null, palette: null, paletteRemap: null, paletteIsolated: false, afterImage: null, displayOffset: Object.freeze([0, 0]), drawingAngle: 0, drawingTransform: null, baseDrawingTransform: null, victoryQuote: null }; this.#entities.set(id, state); } return state; }
}

export function mugenShakeOffset(effect: MugenCameraShake | null): number { if (effect === null || effect.remainingTicks === 0) return 0; return Math.fround(effect.amplitude * Math.sin((effect.phase + effect.frequency * effect.elapsedTicks) * Math.PI / 180)); }
export function mugenPaletteColorMatrix(effect: MugenPaletteEffect | null): MugenRgbAffineColorMatrix | null {
  if (effect === null || effect.remainingTicks === 0) return null;
  const color = effect.color / 256; const grayscale = [1 / 3, 1 / 3, 1 / 3] as const; const sine = effect.sineAdd[3] === 0 ? 0 : Math.sin(2 * Math.PI * effect.elapsedTicks / effect.sineAdd[3]); const result: number[] = [];
  const append = (value: number): void => { const normalized = Math.fround(value); result.push(Object.is(normalized, -0) ? 0 : normalized); };
  for (let channel = 0; channel < 3; channel += 1) { const scale = effect.multiply[channel]! / 256; for (let source = 0; source < 3; source += 1) { const component = grayscale[source]! * (1 - color) + Number(channel === source) * color; append((effect.invertAll ? -component : component) * scale); } const additive = effect.add[channel]! + effect.sineAdd[channel]! * sine; append(((effect.invertAll ? 1 : 0) + additive / 255) * scale); }
  return Object.freeze(result) as unknown as MugenRgbAffineColorMatrix;
}
export function mugenAfterImageColorMatrix(effect: MugenAfterImageEffect, generation: number): MugenRgbAffineColorMatrix {
  const age = boundedInteger(generation, 0, 60, 'AfterImage.generation'); const color = effect.paletteColor / 256; const grayscale = [1 / 3, 1 / 3, 1 / 3] as const; const result: number[] = []; const append = (value: number): void => { const normalized = Math.fround(value); result.push(Object.is(normalized, -0) ? 0 : normalized); };
  for (let channel = 0; channel < 3; channel += 1) {
    const scale = effect.paletteContrast[channel]! / 256 * effect.paletteMultiply[channel]! ** age;
    for (let source = 0; source < 3; source += 1) { const component = grayscale[source]! * (1 - color) + Number(channel === source) * color; append((effect.paletteInvertAll ? -component : component) * scale); }
    const additive = effect.paletteBright[channel]! + age * effect.paletteAdd[channel]! + (age > 0 ? effect.palettePostBright[channel]! : 0);
    append(((effect.paletteInvertAll ? 1 : 0) + additive / 255) * scale);
  }
  return Object.freeze(result) as unknown as MugenRgbAffineColorMatrix;
}

function freezeEntity(entityId: string, state: MutableEntityState): MugenEntityOutputState { return Object.freeze({ entityId, assertions: Object.freeze([...state.assertions].sort()), transparency: state.transparency, baseTransparency: state.baseTransparency, screenBound: state.screenBound, palette: state.palette, paletteRemap: state.paletteRemap, paletteIsolated: state.paletteIsolated, afterImage: state.afterImage, displayOffset: state.displayOffset, drawingAngle: state.drawingAngle, drawingTransform: state.drawingTransform, baseDrawingTransform: state.baseDrawingTransform, victoryQuote: state.victoryQuote }); }
function advancePalette(value: MugenPaletteEffect | null): MugenPaletteEffect | null { if (value === null || value.remainingTicks === -1) return value === null ? null : normalizePalette({ ...value, elapsedTicks: value.elapsedTicks + 1 }); const remainingTicks = value.remainingTicks - 1; return remainingTicks <= 0 ? null : normalizePalette({ ...value, remainingTicks, elapsedTicks: value.elapsedTicks + 1 }); }
function advanceAfterImage(value: MugenAfterImageEffect | null): MugenAfterImageEffect | null { if (value === null || value.remainingTicks === -1) return value; const remainingTicks = value.remainingTicks - 1; return remainingTicks <= 0 ? null : normalizeAfterImage({ ...value, remainingTicks }); }
function advanceShake(value: MugenCameraShake | null): MugenCameraShake | null { if (value === null) return null; const remainingTicks = value.remainingTicks - 1; return remainingTicks <= 0 ? null : normalizeShake({ ...value, remainingTicks, elapsedTicks: value.elapsedTicks + 1 }); }
function advanceEnvironmentColor(value: MugenEnvironmentColor | null): MugenEnvironmentColor | null { if (value === null || value.remainingTicks === -1) return value; const remainingTicks = value.remainingTicks - 1; return remainingTicks <= 0 ? null : normalizeEnvironmentColor({ ...value, remainingTicks }); }
function normalizePalette(value: MugenPaletteEffect): MugenPaletteEffect { return Object.freeze({ remainingTicks: lifetime(value.remainingTicks, 'PalFX.time'), elapsedTicks: nonNegativeInteger(value.elapsedTicks, 'PalFX.elapsedTicks'), add: triple(value.add, 'PalFX.add'), multiply: nonNegativeTriple(value.multiply, 'PalFX.mul'), sineAdd: Object.freeze([finite(value.sineAdd[0], 'PalFX.sinadd.r'), finite(value.sineAdd[1], 'PalFX.sinadd.g'), finite(value.sineAdd[2], 'PalFX.sinadd.b'), nonNegativeInteger(value.sineAdd[3], 'PalFX.sinadd.period')]) as readonly [number, number, number, number], invertAll: Boolean(value.invertAll), color: boundedInteger(value.color, 0, 256, 'PalFX.color') }); }
function normalizeAfterImage(value: MugenAfterImageEffect): MugenAfterImageEffect { if (!['none', 'add', 'add1', 'sub'].includes(value.transparency)) throw new TypeError('MUGEN AfterImage transparency is invalid.'); return Object.freeze({ remainingTicks: lifetime(value.remainingTicks, 'AfterImage.time'), length: boundedInteger(value.length, 1, 60, 'AfterImage.length'), paletteColor: boundedInteger(value.paletteColor, 0, 256, 'AfterImage.palcolor'), paletteInvertAll: Boolean(value.paletteInvertAll), paletteBright: triple(value.paletteBright, 'AfterImage.palbright'), paletteContrast: nonNegativeTriple(value.paletteContrast, 'AfterImage.palcontrast'), palettePostBright: triple(value.palettePostBright, 'AfterImage.palpostbright'), paletteAdd: triple(value.paletteAdd, 'AfterImage.paladd'), paletteMultiply: nonNegativeTriple(value.paletteMultiply, 'AfterImage.palmul'), timeGap: boundedInteger(value.timeGap, 1, 60, 'AfterImage.timegap'), frameGap: boundedInteger(value.frameGap, 1, 60, 'AfterImage.framegap'), transparency: value.transparency }); }
function normalizeShake(value: MugenCameraShake): MugenCameraShake { return Object.freeze({ remainingTicks: nonNegativeInteger(value.remainingTicks, 'EnvShake.time'), elapsedTicks: nonNegativeInteger(value.elapsedTicks, 'EnvShake.elapsedTicks'), frequency: bounded(value.frequency, 0, 180, 'EnvShake.freq'), amplitude: finite(value.amplitude, 'EnvShake.ampl'), phase: finite(value.phase, 'EnvShake.phase') }); }
function normalizeEnvironmentColor(value: MugenEnvironmentColor): MugenEnvironmentColor { return Object.freeze({ remainingTicks: lifetime(value.remainingTicks, 'EnvColor.time'), color: Object.freeze(value.color.map((component, index) => boundedInteger(component, 0, 255, `EnvColor.value.${index}`))) as unknown as readonly [number, number, number], under: Boolean(value.under) }); }
function alphaPair(value: readonly [number, number], label: string): readonly [number, number] { return Object.freeze([bounded(value[0], 0, 256, `${label}.source`), bounded(value[1], 0, 256, `${label}.destination`)]); }
function palettePair(value: readonly [number, number], label: string): readonly [number, number] { return Object.freeze([boundedInteger(value[0], 0, 65_535, `${label}.group`), boundedInteger(value[1], 0, 65_535, `${label}.item`)]); }
function pair(value: readonly [number, number], label: string): readonly [number, number] { return Object.freeze([finite(value[0], `${label}.x`), finite(value[1], `${label}.y`)]); }
function positivePair(value: readonly [number, number], label: string): readonly [number, number] { const result = pair(value, label); if (result.some(component => component <= 0)) throw new RangeError(`MUGEN ${label} must be positive.`); return result; }
function nonNegativePair(value: readonly [number, number], label: string): readonly [number, number] { const result = pair(value, label); if (result.some(component => component < 0)) throw new RangeError(`MUGEN ${label} must be non-negative.`); return result; }
function triple(value: readonly [number, number, number], label: string): readonly [number, number, number] { return Object.freeze([finite(value[0], `${label}.r`), finite(value[1], `${label}.g`), finite(value[2], `${label}.b`)]); }
function nonNegativeTriple(value: readonly [number, number, number], label: string): readonly [number, number, number] { const result = triple(value, label); if (result.some(component => component < 0)) throw new RangeError(`MUGEN ${label} cannot be negative.`); return result; }
function lifetime(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < -1 || value > 1_000_000) throw new RangeError(`MUGEN ${label} must be -1 or a bounded non-negative integer.`); return value; }
function nonNegativeInteger(value: number, label: string): number { return boundedInteger(value, 0, 1_000_000, label); }
function boundedInteger(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`MUGEN ${label} must be an integer from ${minimum} to ${maximum}.`); return value; }
function bounded(value: number, minimum: number, maximum: number, label: string): number { const result = finite(value, label); if (result < minimum || result > maximum) throw new RangeError(`MUGEN ${label} must be from ${minimum} to ${maximum}.`); return result; }
function finite(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new RangeError(`MUGEN ${label} must be finite.`); return Math.fround(value); }
