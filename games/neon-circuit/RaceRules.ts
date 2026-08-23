export interface TrackControlPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrackSample extends TrackControlPoint {
  readonly heading: number;
  readonly pitch: number;
  readonly bank: number;
  readonly distance: number;
}

export interface RaceTrack {
  readonly samples: readonly TrackSample[];
  readonly length: number;
}

export interface RaceControls {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
}

export interface RaceState {
  readonly distance: number;
  readonly speed: number;
  readonly lateral: number;
  readonly lateralSpeed: number;
  readonly lap: number;
  readonly elapsed: number;
  readonly boostRemaining: number;
  readonly activeBoostZone: number;
  readonly wallHits: number;
  readonly finished: boolean;
}

export interface RaceStepResult {
  readonly state: RaceState;
  readonly events: readonly ('boost' | 'wall' | 'lap' | 'finish')[];
}

export interface RacePose extends TrackControlPoint {
  readonly heading: number;
  readonly pitch: number;
  readonly bank: number;
}

export const TOTAL_LAPS = 3;
export const ROAD_HALF_WIDTH = 78;
export const RAIL_LIMIT = 88;
export const BOOST_PAD_HALF_WIDTH = 19;
export const CRUISE_MAX_SPEED = 360;
export const BOOST_MAX_SPEED = 510;
export const BOOST_DURATION_SECONDS = 1.15;
export const BOOST_ZONES = Object.freeze([0.145, 0.49, 0.805] as const);
export const BOOST_ZONE_HALF_LENGTH = 0.009;

export const TRACK_CONTROL_POINTS: readonly TrackControlPoint[] = Object.freeze([
  { x: 0, y: 35, z: -1_420 },
  { x: 640, y: 68, z: -1_340 },
  { x: 1_170, y: 132, z: -900 },
  { x: 1_420, y: 92, z: -260 },
  { x: 1_365, y: 18, z: 470 },
  { x: 980, y: 55, z: 1_030 },
  { x: 390, y: 158, z: 1_390 },
  { x: -285, y: 112, z: 1_430 },
  { x: -900, y: 28, z: 1_150 },
  { x: -1_310, y: 64, z: 610 },
  { x: -1_450, y: 148, z: -90 },
  { x: -1_295, y: 104, z: -760 },
  { x: -805, y: 26, z: -1_225 },
  { x: -310, y: 18, z: -1_090 },
]);

export function createRaceTrack(segmentCount = 180): RaceTrack {
  const count = Math.max(48, Math.floor(segmentCount));
  const positions = Array.from({ length: count }, (_, index) => {
    const scaled = index / count * TRACK_CONTROL_POINTS.length;
    const controlIndex = Math.floor(scaled);
    const local = scaled - controlIndex;
    return catmullRomPoint(controlIndex, local);
  });

  let distance = 0;
  const headings = positions.map((_, index) => {
    const previous = positions[(index - 1 + count) % count]!;
    const next = positions[(index + 1) % count]!;
    return Math.atan2(next.x - previous.x, next.z - previous.z);
  });
  const samples: TrackSample[] = positions.map((point, index) => {
    if (index > 0) distance += distance3(positions[index - 1]!, point);
    const previous = positions[(index - 1 + count) % count]!;
    const next = positions[(index + 1) % count]!;
    const horizontalDistance = Math.hypot(next.x - previous.x, next.z - previous.z);
    const turn = angleDelta(headings[(index - 2 + count) % count]!, headings[(index + 2) % count]!);
    return {
      ...point,
      heading: headings[index]!,
      pitch: Math.atan2(next.y - previous.y, Math.max(0.001, horizontalDistance)),
      bank: clamp(-turn * 2.8, -0.42, 0.42),
      distance,
    };
  });
  const length = distance + distance3(positions[count - 1]!, positions[0]!);
  return Object.freeze({ samples: Object.freeze(samples), length });
}

export function createInitialRaceState(): RaceState {
  return {
    distance: 0,
    speed: 0,
    lateral: 0,
    lateralSpeed: 0,
    lap: 1,
    elapsed: 0,
    boostRemaining: 0,
    activeBoostZone: -1,
    wallHits: 0,
    finished: false,
  };
}

export function stepRace(track: RaceTrack, state: RaceState, controls: RaceControls, deltaSeconds: number): RaceStepResult {
  if (state.finished) return { state, events: [] };
  const dt = Math.max(0, Math.min(0.05, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  const throttle = clamp01(controls.throttle);
  const brake = clamp01(controls.brake);
  const steer = clamp(controls.steer, -1, 1);
  const events: ('boost' | 'wall' | 'lap' | 'finish')[] = [];

  let boostRemaining = Math.max(0, state.boostRemaining - dt);
  let speed = state.speed;
  speed += throttle * 182 * dt;
  speed -= brake * 230 * dt;
  speed -= (throttle > 0 ? 11 : 34) * dt;
  if (boostRemaining > 0) speed += 165 * dt;

  const steeringAuthority = 72 + Math.min(1, speed / 170) * 118;
  let lateralSpeed = state.lateralSpeed + steer * steeringAuthority * dt;
  lateralSpeed *= Math.exp(-dt * (steer === 0 ? 5.8 : 3.5));
  let lateral = state.lateral + lateralSpeed * dt;

  if (Math.abs(lateral) > ROAD_HALF_WIDTH) speed *= Math.exp(-dt * 1.65);
  let wallHits = state.wallHits;
  if (Math.abs(lateral) > RAIL_LIMIT) {
    lateral = Math.sign(lateral) * RAIL_LIMIT;
    lateralSpeed *= -0.32;
    speed *= 0.72;
    wallHits++;
    events.push('wall');
  }

  speed = clamp(speed, 0, boostRemaining > 0 ? BOOST_MAX_SPEED : CRUISE_MAX_SPEED);
  let distance = state.distance + speed * dt;
  let lap = state.lap;
  let finished = false;
  if (distance >= track.length) {
    distance %= track.length;
    if (lap >= TOTAL_LAPS) {
      finished = true;
      speed = 0;
      events.push('finish');
    } else {
      lap++;
      events.push('lap');
    }
  }

  const zone = boostZoneAt(distance / track.length, lateral);
  if (zone >= 0 && zone !== state.activeBoostZone) {
    boostRemaining = BOOST_DURATION_SECONDS;
    speed = Math.max(speed, 215);
    events.push('boost');
  }

  return {
    state: {
      distance,
      speed,
      lateral,
      lateralSpeed,
      lap,
      elapsed: state.elapsed + dt,
      boostRemaining,
      activeBoostZone: zone,
      wallHits,
      finished,
    },
    events,
  };
}

export function sampleTrack(track: RaceTrack, distance: number): TrackSample {
  const wrapped = ((distance % track.length) + track.length) % track.length;
  let low = 0;
  let high = track.samples.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (track.samples[mid]!.distance <= wrapped) low = mid;
    else high = mid - 1;
  }
  const current = track.samples[low]!;
  const next = track.samples[(low + 1) % track.samples.length]!;
  const nextDistance = low === track.samples.length - 1 ? track.length : next.distance;
  const t = clamp01((wrapped - current.distance) / Math.max(0.0001, nextDistance - current.distance));
  return {
    x: lerp(current.x, next.x, t),
    y: lerp(current.y, next.y, t),
    z: lerp(current.z, next.z, t),
    heading: lerpAngle(current.heading, next.heading, t),
    pitch: lerp(current.pitch, next.pitch, t),
    bank: lerp(current.bank, next.bank, t),
    distance: wrapped,
  };
}

export function racePose(track: RaceTrack, state: Pick<RaceState, 'distance' | 'lateral'>): RacePose {
  const center = sampleTrack(track, state.distance);
  const right = bankedRight(center.heading, center.pitch, center.bank);
  return {
    x: center.x + right[0] * state.lateral,
    y: center.y + right[1] * state.lateral,
    z: center.z + right[2] * state.lateral,
    heading: center.heading,
    pitch: center.pitch,
    bank: center.bank,
  };
}

export function boostZoneAt(progress: number, lateral: number): number {
  if (Math.abs(lateral) > BOOST_PAD_HALF_WIDTH) return -1;
  const wrapped = ((progress % 1) + 1) % 1;
  return BOOST_ZONES.findIndex(center => circularDistance(wrapped, center) <= BOOST_ZONE_HALF_LENGTH);
}

function catmullRomPoint(index: number, t: number): TrackControlPoint {
  const count = TRACK_CONTROL_POINTS.length;
  const p0 = TRACK_CONTROL_POINTS[(index - 1 + count) % count]!;
  const p1 = TRACK_CONTROL_POINTS[index % count]!;
  const p2 = TRACK_CONTROL_POINTS[(index + 1) % count]!;
  const p3 = TRACK_CONTROL_POINTS[(index + 2) % count]!;
  return {
    x: catmull(p0.x, p1.x, p2.x, p3.x, t),
    y: catmull(p0.y, p1.y, p2.y, p3.y, t),
    z: catmull(p0.z, p1.z, p2.z, p3.z, t),
  };
}

function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

function distance3(a: TrackControlPoint, b: TrackControlPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function circularDistance(a: number, b: number): number {
  const delta = Math.abs(a - b);
  return Math.min(delta, 1 - delta);
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function bankedRight(heading: number, pitch: number, bank: number): readonly [number, number, number] {
  const baseRight: readonly [number, number, number] = [Math.cos(heading), 0, -Math.sin(heading)];
  const baseUp: readonly [number, number, number] = [
    -Math.sin(pitch) * Math.sin(heading),
    Math.cos(pitch),
    -Math.sin(pitch) * Math.cos(heading),
  ];
  const cosine = Math.cos(bank);
  const sine = Math.sin(bank);
  return [
    baseRight[0] * cosine + baseUp[0] * sine,
    baseRight[1] * cosine + baseUp[1] * sine,
    baseRight[2] * cosine + baseUp[2] * sine,
  ];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value: number): number { return clamp(value, 0, 1); }
