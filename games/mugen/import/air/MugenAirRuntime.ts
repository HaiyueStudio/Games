import type {
  MugenAirAction,
  MugenAirBank,
  MugenAirBlend,
  MugenAirCollisionBox,
  MugenAirElement,
  MugenAirInterpolation,
  MugenAirSpriteReference,
} from './types';

export interface MugenAirWorldTransform {
  readonly x: number;
  readonly y: number;
  readonly facing?: 1 | -1;
  readonly coordinateScale?: number;
}

export interface MugenAirSnapshotOptions extends MugenAirWorldTransform {
  readonly renderFraction?: number;
  readonly spriteById?: (id: string) => MugenAirSpriteReference | null;
}

export interface MugenAirWorldCollisionBox {
  readonly kind: 'clsn1' | 'clsn2';
  readonly sourceIndex: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MugenAirRenderSnapshot {
  readonly spriteId: string | null;
  readonly spriteGroup: number;
  readonly spriteItem: number;
  readonly missingSprite: boolean;
  readonly positionX: number;
  readonly positionY: number;
  readonly axisX: number;
  readonly axisY: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationRadians: number;
  readonly blend: MugenAirBlend;
  readonly interpolationProgress: number;
  readonly interpolated: readonly MugenAirInterpolation[];
}

export interface MugenAirSnapshot {
  readonly actionNumber: number;
  readonly actionTick: number;
  readonly frameIndex: number;
  readonly frameTick: number;
  readonly completedLoops: number;
  readonly generation: number;
  readonly element: MugenAirElement;
  readonly clsn1: readonly MugenAirWorldCollisionBox[];
  readonly clsn2: readonly MugenAirWorldCollisionBox[];
  readonly render: MugenAirRenderSnapshot;
}

export interface MugenAirDebugLine {
  readonly kind: 'clsn1' | 'clsn2' | 'axis';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly rgba: readonly [number, number, number, number];
}

export interface MugenAirDebugOverlay {
  readonly hashExcluded: true;
  readonly label: string;
  readonly lines: readonly MugenAirDebugLine[];
}

interface LocatedFrame {
  readonly index: number;
  readonly frameTick: number;
  readonly completedLoops: number;
}

export function evaluateMugenAirAction(action: MugenAirAction, actionTick: number, options: MugenAirSnapshotOptions, generation = 0): MugenAirSnapshot {
  assertTick(actionTick);
  const transform = validateTransform(options);
  const located = locateFrame(action, actionTick);
  const element = action.elements[located.index]!;
  const nextIndex = nextFrameIndex(action, located.index);
  const next = nextIndex === null ? null : action.elements[nextIndex]!;
  const duration = element.durationTicks > 0 ? element.durationTicks : 1;
  const progress = next === null ? 0 : Math.min(1, Math.max(0, (located.frameTick + transform.renderFraction) / duration));
  const interpolated = next?.interpolateToThis ?? EMPTY_INTERPOLATION;
  const offsetX = interpolate(interpolated, 'offset', element.offsetX, next?.offsetX, progress);
  const offsetY = interpolate(interpolated, 'offset', element.offsetY, next?.offsetY, progress);
  const signedScaleX = interpolate(interpolated, 'scale', element.scaleX, next?.scaleX, progress);
  const signedScaleY = interpolate(interpolated, 'scale', element.scaleY, next?.scaleY, progress);
  const angleDegrees = interpolate(interpolated, 'angle', element.angleDegrees, next?.angleDegrees, progress);
  const blend = interpolateBlend(interpolated, element.blend, next?.blend, progress);
  const sprite = element.spriteId === null ? null : options.spriteById?.(element.spriteId) ?? null;
  const isBlank = element.spriteGroup === -1 || element.spriteItem === -1;
  const render: MugenAirRenderSnapshot = Object.freeze({
    spriteId: element.spriteId,
    spriteGroup: element.spriteGroup,
    spriteItem: element.spriteItem,
    missingSprite: !isBlank && (element.spriteId === null || (options.spriteById !== undefined && sprite === null)),
    positionX: Math.fround(transform.x + offsetX * transform.facing * transform.coordinateScale),
    positionY: Math.fround(transform.y + offsetY * transform.coordinateScale),
    axisX: sprite?.axisX ?? 0,
    axisY: sprite?.axisY ?? 0,
    flipX: xor(element.flipX, transform.facing === -1, signedScaleX < 0),
    flipY: xor(element.flipY, signedScaleY < 0),
    scaleX: Math.fround(Math.abs(signedScaleX) * transform.coordinateScale),
    scaleY: Math.fround(Math.abs(signedScaleY) * transform.coordinateScale),
    rotationRadians: Math.fround(angleDegrees * Math.PI / 180 * transform.facing),
    blend,
    interpolationProgress: Math.fround(progress),
    interpolated,
  });
  return Object.freeze({
    actionNumber: action.number,
    actionTick,
    frameIndex: located.index,
    frameTick: located.frameTick,
    completedLoops: located.completedLoops,
    generation,
    element,
    clsn1: transformBoxes(element.clsn1, 'clsn1', transform),
    clsn2: transformBoxes(element.clsn2, 'clsn2', transform),
    render,
  });
}

export class MugenAirActionPlayer {
  readonly bank: MugenAirBank;
  #actions: ReadonlyMap<number, MugenAirAction>;
  #action: MugenAirAction;
  #tick = 0;
  #generation = 0;

  constructor(bank: MugenAirBank, initialAction?: number) {
    if (bank.actions.length === 0) throw new RangeError('MUGEN AIR bank has no actions.');
    this.bank = bank;
    this.#actions = new Map(bank.actions.map(action => [action.number, action]));
    const number = initialAction ?? bank.actions[0]!.number;
    const action = this.#actions.get(number);
    if (!action) throw new RangeError(`Unknown MUGEN AIR action ${number}.`);
    this.#action = action;
  }

  get actionNumber(): number { return this.#action.number; }
  get actionTick(): number { return this.#tick; }
  get generation(): number { return this.#generation; }

  changeAction(actionNumber: number, options: { readonly restartIfSame?: boolean } = {}): void {
    const action = this.#actions.get(actionNumber);
    if (!action) throw new RangeError(`Unknown MUGEN AIR action ${actionNumber}.`);
    if (action === this.#action && options.restartIfSame === false) return;
    this.#action = action;
    this.#tick = 0;
    this.#generation++;
  }

  restart(): void { this.#tick = 0; this.#generation++; }

  seek(actionTick: number): void { assertTick(actionTick); this.#tick = actionTick; }

  advance(ticks = 1): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError('MUGEN AIR advance ticks must be a non-negative safe integer.');
    const next = this.#tick + ticks;
    if (!Number.isSafeInteger(next)) throw new RangeError('MUGEN AIR action tick exceeds the safe integer range.');
    this.#tick = next;
  }

  snapshot(options: MugenAirSnapshotOptions): MugenAirSnapshot {
    return evaluateMugenAirAction(this.#action, this.#tick, options, this.#generation);
  }
}

export function createMugenAirDebugOverlay(snapshot: MugenAirSnapshot, axisSize = 6): MugenAirDebugOverlay {
  if (!Number.isFinite(axisSize) || axisSize <= 0) throw new RangeError('MUGEN AIR debug axis size must be finite and positive.');
  const lines: MugenAirDebugLine[] = [];
  for (const box of [...snapshot.clsn1, ...snapshot.clsn2]) {
    const rgba = box.kind === 'clsn1' ? CLSN1_COLOR : CLSN2_COLOR;
    lines.push(line(box.kind, box.left, box.top, box.right, box.top, rgba));
    lines.push(line(box.kind, box.right, box.top, box.right, box.bottom, rgba));
    lines.push(line(box.kind, box.right, box.bottom, box.left, box.bottom, rgba));
    lines.push(line(box.kind, box.left, box.bottom, box.left, box.top, rgba));
  }
  const x = snapshot.render.positionX;
  const y = snapshot.render.positionY;
  lines.push(line('axis', x - axisSize, y, x + axisSize, y, AXIS_COLOR));
  lines.push(line('axis', x, y - axisSize, x, y + axisSize, AXIS_COLOR));
  return Object.freeze({
    hashExcluded: true,
    label: `action=${snapshot.actionNumber} frame=${snapshot.frameIndex} frameTick=${snapshot.frameTick} tick=${snapshot.actionTick}`,
    lines: Object.freeze(lines),
  });
}

function locateFrame(action: MugenAirAction, tick: number): LocatedFrame {
  if (action.totalTicks === null) {
    let remaining = tick;
    for (let index = 0; index < action.elements.length; index++) {
      const duration = action.elements[index]!.durationTicks;
      if (duration === -1) return { index, frameTick: remaining, completedLoops: 0 };
      if (duration <= 0) continue;
      if (remaining < duration) return { index, frameTick: remaining, completedLoops: 0 };
      remaining -= duration;
    }
    throw new Error(`Invalid infinite AIR action ${action.number}.`);
  }
  const loopTicks = action.loopTicks!;
  let effectiveTick = tick;
  let completedLoops = 0;
  let start = 0;
  if (tick >= action.totalTicks) {
    completedLoops = 1 + Math.floor((tick - action.totalTicks) / loopTicks);
    effectiveTick = action.preLoopTicks + ((tick - action.preLoopTicks) % loopTicks);
    start = action.loopStart;
  } else if (tick >= action.preLoopTicks && action.loopStart > 0) {
    start = action.loopStart;
  }
  let remaining = start === 0 ? effectiveTick : effectiveTick - action.preLoopTicks;
  for (let index = start; index < action.elements.length; index++) {
    const duration = action.elements[index]!.durationTicks;
    if (duration <= 0) continue;
    if (remaining < duration) return { index, frameTick: remaining, completedLoops };
    remaining -= duration;
  }
  throw new Error(`Invalid finite AIR action ${action.number}.`);
}

function nextFrameIndex(action: MugenAirAction, index: number): number | null {
  for (let next = index + 1; next < action.elements.length; next++) if (action.elements[next]!.durationTicks > 0 || action.elements[next]!.durationTicks === -1) return next;
  if (action.totalTicks === null) return null;
  for (let next = action.loopStart; next < action.elements.length; next++) if (action.elements[next]!.durationTicks > 0) return next;
  return null;
}

function transformBoxes(boxes: readonly MugenAirCollisionBox[], kind: 'clsn1' | 'clsn2', transform: Required<MugenAirSnapshotOptions>): readonly MugenAirWorldCollisionBox[] {
  return Object.freeze(boxes.map(box => {
    const firstX = transform.x + box.left * transform.facing * transform.coordinateScale;
    const secondX = transform.x + box.right * transform.facing * transform.coordinateScale;
    return Object.freeze({
      kind,
      sourceIndex: box.index,
      left: Math.fround(Math.min(firstX, secondX)),
      top: Math.fround(transform.y + box.top * transform.coordinateScale),
      right: Math.fround(Math.max(firstX, secondX)),
      bottom: Math.fround(transform.y + box.bottom * transform.coordinateScale),
    });
  }));
}

function interpolate(kinds: readonly MugenAirInterpolation[], kind: MugenAirInterpolation, current: number, next: number | undefined, progress: number): number {
  return next !== undefined && kinds.includes(kind) ? Math.fround(current + (next - current) * progress) : current;
}

function interpolateBlend(kinds: readonly MugenAirInterpolation[], current: MugenAirBlend, next: MugenAirBlend | undefined, progress: number): MugenAirBlend {
  if (!kinds.includes('blend') || next === undefined) return current;
  return Object.freeze({
    mode: current.mode,
    sourceAlpha: Math.fround(current.sourceAlpha + (next.sourceAlpha - current.sourceAlpha) * progress),
    destinationAlpha: Math.fround(current.destinationAlpha + (next.destinationAlpha - current.destinationAlpha) * progress),
  });
}

function validateTransform(options: MugenAirSnapshotOptions): Required<MugenAirSnapshotOptions> {
  const facing = options.facing ?? 1;
  const coordinateScale = options.coordinateScale ?? 1;
  const renderFraction = options.renderFraction ?? 0;
  if (![options.x, options.y, coordinateScale, renderFraction].every(Number.isFinite)) throw new RangeError('MUGEN AIR snapshot transform must contain finite numbers.');
  if (facing !== 1 && facing !== -1) throw new RangeError('MUGEN AIR facing must be 1 or -1.');
  if (coordinateScale <= 0) throw new RangeError('MUGEN AIR coordinateScale must be positive.');
  if (renderFraction < 0 || renderFraction >= 1) throw new RangeError('MUGEN AIR renderFraction must be in [0,1).');
  return { ...options, facing, coordinateScale, renderFraction, spriteById: options.spriteById ?? (() => null) };
}

function assertTick(value: number): void { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('MUGEN AIR action tick must be a non-negative safe integer.'); }
function xor(...values: readonly boolean[]): boolean { return values.reduce((result, value) => result !== value, false); }
function line(kind: MugenAirDebugLine['kind'], x1: number, y1: number, x2: number, y2: number, rgba: readonly [number, number, number, number]): MugenAirDebugLine { return Object.freeze({ kind, x1, y1, x2, y2, rgba }); }

const EMPTY_INTERPOLATION: readonly MugenAirInterpolation[] = Object.freeze([]);
const CLSN1_COLOR: readonly [number, number, number, number] = Object.freeze([1, 0.2, 0.2, 1]);
const CLSN2_COLOR: readonly [number, number, number, number] = Object.freeze([0.2, 0.55, 1, 1]);
const AXIS_COLOR: readonly [number, number, number, number] = Object.freeze([1, 1, 0.2, 1]);
