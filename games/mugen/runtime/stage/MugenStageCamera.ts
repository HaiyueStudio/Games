export interface MugenStageCameraConfig {
  readonly start: readonly [number, number];
  readonly horizontalBounds: readonly [number, number];
  readonly verticalBounds: readonly [number, number];
  readonly localCoord: readonly [number, number];
  readonly tension: number;
  readonly verticalFollow: number;
  readonly floorTension: number;
  readonly screenMargins: readonly [number, number];
  readonly playerBounds: readonly [number, number];
}

export interface MugenStageCameraFighter {
  readonly id: string;
  readonly position: readonly [number, number];
  readonly moveCamera: readonly [horizontal: boolean, vertical: boolean];
}

export interface MugenStageCameraSnapshot {
  readonly position: readonly [number, number];
  readonly screenBounds: readonly [number, number];
  readonly visibleBounds: readonly [number, number];
}

/** Deterministic MUGEN camera dead-zone and player screen-edge authority. */
export class MugenStageCamera {
  readonly config: Readonly<MugenStageCameraConfig>;
  #x: number;
  #y: number;

  constructor(config: MugenStageCameraConfig) {
    validatePair(config.start, 'start'); validateOrdered(config.horizontalBounds, 'horizontalBounds'); validateOrdered(config.verticalBounds, 'verticalBounds'); validateOrdered(config.playerBounds, 'playerBounds'); validatePositivePair(config.localCoord, 'localCoord'); validateNonNegativePair(config.screenMargins, 'screenMargins');
    if (config.screenMargins[0] + config.screenMargins[1] >= config.localCoord[0]) throw new RangeError('MUGEN stage screen margins leave no playable width.');
    if (!Number.isFinite(config.tension) || config.tension < 0 || config.tension > config.localCoord[0] / 2) throw new RangeError('MUGEN camera tension is outside the stage viewport.');
    if (!Number.isFinite(config.verticalFollow) || config.verticalFollow < 0 || config.verticalFollow > 1 || !Number.isFinite(config.floorTension) || config.floorTension < 0) throw new RangeError('MUGEN vertical camera settings are invalid.');
    this.config = Object.freeze({ ...config, start: freezePair(config.start), horizontalBounds: freezePair(config.horizontalBounds), verticalBounds: freezePair(config.verticalBounds), localCoord: freezePair(config.localCoord), screenMargins: freezePair(config.screenMargins), playerBounds: freezePair(config.playerBounds) });
    this.#x = clamp(config.start[0], config.horizontalBounds[0], config.horizontalBounds[1]); this.#y = clamp(config.start[1], config.verticalBounds[0], config.verticalBounds[1]);
  }

  reset(): MugenStageCameraSnapshot { this.#x = clamp(this.config.start[0], this.config.horizontalBounds[0], this.config.horizontalBounds[1]); this.#y = clamp(this.config.start[1], this.config.verticalBounds[0], this.config.verticalBounds[1]); return this.snapshot(); }

  update(fighters: readonly MugenStageCameraFighter[]): MugenStageCameraSnapshot {
    const horizontal = fighters.filter(value => value.moveCamera[0]).map(value => value.position[0]);
    if (horizontal.length > 0) {
      const minimum = Math.min(...horizontal); const maximum = Math.max(...horizontal); const leftOutside = minimum < this.#x - this.config.tension; const rightOutside = maximum > this.#x + this.config.tension;
      if (leftOutside && rightOutside) this.#x = (minimum + maximum) / 2;
      else if (leftOutside) this.#x = minimum + this.config.tension;
      else if (rightOutside) this.#x = maximum - this.config.tension;
      this.#x = clamp(this.#x, this.config.horizontalBounds[0], this.config.horizontalBounds[1]);
    }
    const vertical = fighters.filter(value => value.moveCamera[1]).map(value => value.position[1]);
    if (vertical.length > 0) { const highest = Math.min(...vertical); const rise = Math.min(0, highest + this.config.floorTension); const target = this.config.start[1] + rise * this.config.verticalFollow; this.#y = clamp(target, this.config.verticalBounds[0], this.config.verticalBounds[1]); }
    this.#x = f32(this.#x); this.#y = f32(this.#y); return this.snapshot();
  }

  constrainX(position: number, screenBound: boolean): number {
    const visible = this.snapshot().screenBounds; const minimum = Math.max(this.config.playerBounds[0], screenBound ? visible[0] : -Infinity); const maximum = Math.min(this.config.playerBounds[1], screenBound ? visible[1] : Infinity);
    return f32(clamp(position, minimum, maximum));
  }

  snapshot(): MugenStageCameraSnapshot {
    const halfWidth = this.config.localCoord[0] / 2; const visibleBounds = freezePair([this.#x - halfWidth, this.#x + halfWidth]); const screenBounds = freezePair([visibleBounds[0] + this.config.screenMargins[0], visibleBounds[1] - this.config.screenMargins[1]]);
    return Object.freeze({ position: freezePair([this.#x, this.#y]), screenBounds, visibleBounds });
  }
}

function validatePair(value: readonly [number, number], label: string): void { if (!Array.isArray(value) || value.length !== 2 || value.some(item => !Number.isFinite(item))) throw new TypeError(`MUGEN camera ${label} must contain two finite values.`); }
function validateOrdered(value: readonly [number, number], label: string): void { validatePair(value, label); if (value[0] > value[1]) throw new RangeError(`MUGEN camera ${label} must be ordered.`); }
function validatePositivePair(value: readonly [number, number], label: string): void { validatePair(value, label); if (value.some(item => item <= 0)) throw new RangeError(`MUGEN camera ${label} must be positive.`); }
function validateNonNegativePair(value: readonly [number, number], label: string): void { validatePair(value, label); if (value.some(item => item < 0)) throw new RangeError(`MUGEN camera ${label} cannot be negative.`); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function f32(value: number): number { const result = Math.fround(value); return Object.is(result, -0) ? 0 : result; }
function freezePair(value: readonly [number, number]): readonly [number, number] { return Object.freeze([f32(value[0]), f32(value[1])]); }
