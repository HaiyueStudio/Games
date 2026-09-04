import { evaluateMugenAirAction, type MugenAirSnapshot, type MugenAirSnapshotOptions } from '../import/air/MugenAirRuntime';
import type { MugenViewerAction } from './MugenCharacterModel';

export interface MugenViewerPlaybackState {
  readonly actionId: string;
  readonly tick: number;
  readonly playing: boolean;
  readonly loop: boolean;
  readonly speed: number;
}

export class MugenViewerController {
  #selected: MugenViewerAction;
  #tick = 0;
  #playing = true;
  #loop = true;
  #speed = 1;
  #accumulator = 0;

  constructor(action: MugenViewerAction) { this.#selected = action; }

  get selected(): MugenViewerAction { return this.#selected; }
  get tick(): number { return this.#tick; }
  get playing(): boolean { return this.#playing; }
  get loop(): boolean { return this.#loop; }
  get speed(): number { return this.#speed; }
  get renderFraction(): number { return Math.min(0.999_999, this.#accumulator); }
  get displayTick(): number {
    const action = this.#selected.action;
    if (action.totalTicks === null || this.#tick < action.totalTicks) return this.#tick;
    return action.preLoopTicks + ((this.#tick - action.preLoopTicks) % action.loopTicks!);
  }

  state(): MugenViewerPlaybackState {
    return Object.freeze({ actionId: this.#selected.id, tick: this.#tick, playing: this.#playing, loop: this.#loop, speed: this.#speed });
  }

  select(action: MugenViewerAction): void { this.#selected = action; this.#tick = 0; this.#accumulator = 0; }
  setPlaying(value: boolean): void { this.#playing = value; }
  togglePlaying(): void { this.#playing = !this.#playing; }
  setLoop(value: boolean): void { this.#loop = value; this.#clampNonLoop(); }
  setSpeed(value: number): void {
    if (!Number.isFinite(value) || value <= 0 || value > 16) throw new RangeError('MUGEN viewer playback speed must be in (0,16].');
    this.#speed = value;
  }

  seek(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('MUGEN viewer seek tick must be a non-negative safe integer.');
    this.#tick = tick;
    this.#accumulator = 0;
    this.#clampNonLoop();
  }

  first(): void { this.seek(0); }
  last(): void { this.seek(lastInspectableTick(this.#selected)); }
  stepTick(delta: -1 | 1): void { this.#playing = false; this.seek(Math.max(0, this.#tick + delta)); }

  stepElement(direction: -1 | 1): void {
    this.#playing = false;
    const starts = observableElementStarts(this.#selected);
    if (starts.length === 0) { this.seek(0); return; }
    if (direction > 0) {
      const next = starts.find(value => value.tick > this.#tick);
      if (next !== undefined) this.seek(next.tick);
      else if (this.#loop && this.#selected.action.totalTicks !== null) this.seek(starts.find(value => value.elementIndex >= this.#selected.action.loopStart)?.tick ?? starts[0]!.tick);
      else this.seek(starts[starts.length - 1]!.tick);
      return;
    }
    const previous = [...starts].reverse().find(value => value.tick < this.#tick);
    this.seek(previous?.tick ?? starts[0]!.tick);
  }

  advanceSeconds(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('MUGEN viewer elapsed seconds must be finite and non-negative.');
    if (!this.#playing) return 0;
    this.#accumulator += Math.min(seconds, 0.25) * 60 * this.#speed;
    const ticks = Math.floor(this.#accumulator);
    this.#accumulator -= ticks;
    if (ticks === 0) return 0;
    const maximum = Number.MAX_SAFE_INTEGER - this.#tick;
    this.#tick += Math.min(ticks, maximum);
    if (!this.#loop && this.#selected.action.totalTicks !== null) {
      const end = Math.max(0, this.#selected.action.totalTicks - 1);
      if (this.#tick >= end) { this.#tick = end; this.#playing = false; this.#accumulator = 0; }
    }
    return ticks;
  }

  snapshot(options: MugenAirSnapshotOptions): MugenAirSnapshot {
    return evaluateMugenAirAction(this.#selected.action, this.#tick, { ...options, renderFraction: this.renderFraction });
  }

  #clampNonLoop(): void {
    if (!this.#loop && this.#selected.action.totalTicks !== null) this.#tick = Math.min(this.#tick, Math.max(0, this.#selected.action.totalTicks - 1));
  }
}

export function lastInspectableTick(action: MugenViewerAction): number {
  if (action.action.totalTicks !== null) return Math.max(0, action.action.totalTicks - 1);
  let tick = 0;
  for (const element of action.action.elements) {
    if (element.durationTicks === -1) return tick;
    if (element.durationTicks > 0) tick += element.durationTicks;
  }
  return tick;
}

/** First observable frame backed by a real SFF sprite, used to avoid opening a partial action on a long missing frame. */
export function firstDrawableTick(action: MugenViewerAction): number | null {
  let tick = 0;
  for (const element of action.action.elements) {
    if (element.durationTicks !== 0 && element.spriteId !== null) return tick;
    if (element.durationTicks > 0) tick += element.durationTicks;
  }
  return null;
}

function observableElementStarts(action: MugenViewerAction): readonly { readonly elementIndex: number; readonly tick: number }[] {
  const starts: Array<{ readonly elementIndex: number; readonly tick: number }> = [];
  let tick = 0;
  for (let elementIndex = 0; elementIndex < action.action.elements.length; elementIndex++) {
    const element = action.action.elements[elementIndex]!;
    if (element.durationTicks !== 0) starts.push(Object.freeze({ elementIndex, tick }));
    if (element.durationTicks > 0) tick += element.durationTicks;
  }
  return Object.freeze(starts);
}
