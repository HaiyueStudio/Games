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
  readonly frame?: TrackFrame;
  readonly section?: string;
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
  readonly headingOffset: number;
  readonly health: number;
  readonly destroyed: boolean;
  readonly impact: number;
  readonly collisionCooldown: number;
  readonly damageSide: -1 | 0 | 1;
}

export interface RaceStepResult {
  readonly state: RaceState;
  readonly events: readonly ('boost' | 'wall' | 'lap' | 'finish' | 'destroyed')[];
}

export interface RacePose extends TrackControlPoint {
  readonly heading: number;
  readonly pitch: number;
  readonly bank: number;
  readonly frame?: TrackFrame;
}

export const TOTAL_LAPS = 3;
export const TRACK_SCALE = 1.8;
export const BOOST_DECELERATION = 200;
export const ROAD_HALF_WIDTH = 92;
export const RAIL_LIMIT = ROAD_HALF_WIDTH - 10;
export const MAX_HEALTH = 100;
export const BURN_HEALTH = 30;
export const BOOST_PAD_HALF_WIDTH = 16;
export const CRUISE_MAX_SPEED = 1000;
export const BOOST_MAX_SPEED = 1450;
export const BOOST_DURATION_SECONDS = 1.8;
export const BOOST_ZONES = Object.freeze([0.08, 0.275, 0.47, 0.675, 0.865] as const);
export const BOOST_PAD_LENGTH = 96;
export interface BoostPad { readonly progress: number; readonly lateral: number }
/** Shared by collision rules and road meshes: short, staggered pads in all three lanes. */
export const BOOST_PADS: readonly BoostPad[] = Object.freeze(BOOST_ZONES.flatMap(progress => [
  { progress, lateral: 0 }, { progress: progress + 0.032, lateral: -58 },
  { progress: progress + 0.064, lateral: 58 },
]).map(pad => Object.freeze(pad)));

export const TRACK_CONTROL_POINTS: readonly TrackControlPoint[] = Object.freeze([
  { x: 0, y: 72, z: -3_260 },
  { x: 720, y: 98, z: -3_210 },
  { x: 1_460, y: 178, z: -2_980 },
  { x: 2_180, y: 295, z: -2_510 },
  { x: 2_760, y: 245, z: -1_820 },
  { x: 3_110, y: 122, z: -980 },
  { x: 3_180, y: 205, z: -80 },
  { x: 2_960, y: 338, z: 780 },
  { x: 2_470, y: 415, z: 1_520 },
  { x: 1_720, y: 302, z: 2_090 },
  { x: 850, y: 158, z: 2_420 },
  { x: 20, y: 286, z: 2_520 },
  { x: -720, y: 458, z: 2_320 },
  { x: -1360, y: 365, z: 1740 },
  { x: -1550, y: 214, z: 1300 },
  { x: -2000, y: 126, z: 920 },
  { x: -2500, y: 232, z: 650 },
  { x: -2930, y: 396, z: 200 },
  { x: -3_220, y: 318, z: -610 },
  { x: -3_060, y: 168, z: -1_430 },
  { x: -2_560, y: 112, z: -2_120 },
  { x: -1_840, y: 268, z: -2_650 },
  { x: -1180, y: 442, z: -2860 },
  { x: -570, y: 315, z: -2880 },
]);

export function createRaceTrack(segmentCount = 360, controlPoints: readonly TrackControlPoint[] = TRACK_CONTROL_POINTS): RaceTrack {
  if (controlPoints.length < 4) throw new Error('A circuit needs at least four control points.');
  const count = Math.max(48, Math.floor(segmentCount));
  const positions = Array.from({ length: count }, (_, index) => {
    const scaled = index / count * controlPoints.length;
    const controlIndex = Math.floor(scaled);
    const local = scaled - controlIndex;
    return catmullRomPoint(controlPoints, controlIndex, local);
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
    headingOffset: 0,
    health: MAX_HEALTH,
    destroyed: false,
    impact: 0,
    collisionCooldown: 0,
    damageSide: 0,
  };
}

/** Fixed, bounded integration keeps wall damage and cornering stable across render rates. */
export function stepRace(track: RaceTrack, state: RaceState, controls: RaceControls, deltaSeconds: number, damageEnabled = true): RaceStepResult {
  if (state.finished || state.destroyed) return { state, events: [] };
  const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05);
  if (dt === 0) return { state, events: [] };
  const count = Math.ceil(dt / (1 / 120));
  const events: RaceStepResult['events'][number][] = [];
  for (let index = 0; index < count; index++) {
    const result = integrateRace(track, state, controls, dt / count, damageEnabled);
    state = result.state;
    events.push(...result.events);
    if (state.finished || state.destroyed) break;
  }
  return { state, events };
}

export function steeringYawRate(speed: number): number {
  return 0.62 + Math.min(1, Math.max(0, speed) / (CRUISE_MAX_SPEED * 0.77)) * 0.34;
}

function integrateRace(track: RaceTrack, state: RaceState, controls: RaceControls, dt: number, damageEnabled: boolean): RaceStepResult {
  const throttle = clamp01(controls.throttle);
  const brake = clamp01(controls.brake);
  const steer = clamp(controls.steer, -1, 1);
  const events: RaceStepResult['events'][number][] = [];
  let boostRemaining = Math.max(0, state.boostRemaining - dt);
  const turning = Math.abs(steer);
  const speedLimit = (boostRemaining > 0 ? BOOST_MAX_SPEED : CRUISE_MAX_SPEED) * (1 - turning * 0.04);
  // A lower thrust ceiling never discards existing momentum. Boost expiry and
  // steering scrub speed off over time; the HUD reads this actual simulation speed.
  let speed = state.speed > speedLimit
    ? Math.max(speedLimit, state.speed - (BOOST_DECELERATION + turning * 135 + brake * 1000 + (throttle > 0 ? 0 : 110)) * dt)
    : clamp(state.speed + (throttle * 600 - brake * 1000 - (throttle > 0 ? 27 : 110)
      - turning * state.speed * 0.065 + (boostRemaining > 0 ? 780 : 0)) * dt, 0, speedLimit);

  // Track coordinates locate the road; they do not steer the ship. Preserve its
  // world heading as the road tangent changes underneath it, including at the seam.
  const center = sampleTrack(track, state.distance);
  let headingOffset = state.headingOffset + steer * steeringYawRate(speed) * dt;
  const advance = speed * Math.max(0.12, Math.cos(headingOffset)) * dt;
  let distance = state.distance + advance;
  headingOffset = clamp(headingOffset - frameTurn(center, sampleTrack(track, distance)), -1.35, 1.35);
  let lateralSpeed = state.lateralSpeed + (speed * Math.sin(headingOffset) - state.lateralSpeed) * (1 - Math.exp(-dt * 14));
  let lateral = state.lateral + lateralSpeed * dt;
  let health = state.health;
  let damageSide = state.damageSide;
  let wallHits = state.wallHits;
  let impact = state.impact * Math.exp(-dt * 7);
  let collisionCooldown = Math.max(0, state.collisionCooldown - dt);
  if (Math.abs(lateral) > RAIL_LIMIT) {
    const side = Math.sign(lateral);
    // Engine camera screen-right is the negative road-right axis, also when inverted.
    damageSide = side > 0 ? -1 : 1;
    const normalSpeed = Math.abs(lateralSpeed);
    const incidence = clamp01(normalSpeed / Math.max(1, speed));
    lateral = side * RAIL_LIMIT;
    if (collisionCooldown <= 0) {
      const severity = clamp01(speed / BOOST_MAX_SPEED * (0.35 + incidence * 0.9));
      if (damageEnabled) health -= 2 + 42 * (speed / CRUISE_MAX_SPEED) ** 2 * (0.16 + incidence * 0.84);
      impact = Math.max(impact, 0.18 + severity * 0.82);
      speed *= 0.48 - incidence * 0.26;
      boostRemaining = 0;
      collisionCooldown = 0.22;
      wallHits++;
      events.push('wall');
    } else {
      // Sustained scraping still costs hull and speed, without a hit every frame.
      if (damageEnabled) health -= (2 + normalSpeed * 0.025) * dt;
      speed *= Math.exp(-dt * 3);
    }
    lateralSpeed = -side * normalSpeed * 0.28;
    headingOffset = -side * Math.min(0.28, Math.abs(headingOffset) * 0.4 + 0.04);
  }
  health = clamp(health, 0, MAX_HEALTH);
  const destroyed = health <= 0;
  let lap = state.lap;
  let finished = false;
  if (destroyed) {
    speed = 0;
    lateralSpeed = 0;
    boostRemaining = 0;
    events.push('destroyed');
  } else if (distance >= track.length) {
    distance %= track.length;
    if (lap >= TOTAL_LAPS) {
      finished = true;
      speed = 0;
      boostRemaining = 0;
      events.push('finish');
    } else {
      lap++;
      events.push('lap');
    }
  }
  const zone = boostZoneAt(distance / track.length, lateral, track.length);
  if (!destroyed && !finished && collisionCooldown === 0 && zone >= 0 && zone !== state.activeBoostZone) {
    boostRemaining = BOOST_DURATION_SECONDS;
    speed = Math.max(speed, CRUISE_MAX_SPEED * 0.9);
    events.push('boost');
  }
  return { state: { distance, speed, lateral, lateralSpeed, lap, elapsed: state.elapsed + dt,
    boostRemaining, activeBoostZone: zone, wallHits, finished, headingOffset, health, destroyed, impact, collisionCooldown, damageSide }, events };
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
    ...(current.frame && next.frame ? { frame: interpolateFrame(current.frame,next.frame,t), section: current.section } : {}),
  };
}

export function racePose(track: RaceTrack, state: Pick<RaceState, 'distance' | 'lateral'> & Partial<Pick<RaceState, 'headingOffset'>>): RacePose {
  const center = sampleTrack(track, state.distance);
  const right = center.frame?.right ?? bankedRight(center.heading, center.pitch, center.bank);
  return {
    x: center.x + right[0] * state.lateral,
    y: center.y + right[1] * state.lateral,
    z: center.z + right[2] * state.lateral,
    heading: center.heading + (state.headingOffset ?? 0),
    pitch: center.pitch,
    bank: center.bank,
    ...(center.frame ? {frame:turnFrame(center.frame,state.headingOffset ?? 0)} : {}),
  };
}

export function boostZoneAt(progress: number, lateral: number, trackLength = 34000): number {
  const wrapped = ((progress % 1) + 1) % 1;
  return BOOST_PADS.findIndex(pad => Math.abs(lateral - pad.lateral) <= BOOST_PAD_HALF_WIDTH
    && circularDistance(wrapped, pad.progress) * trackLength <= BOOST_PAD_LENGTH / 2);
}

function catmullRomPoint(points: readonly TrackControlPoint[], index: number, t: number): TrackControlPoint {
  const count = points.length;
  const p0 = points[(index - 1 + count) % count]!;
  const p1 = points[index % count]!;
  const p2 = points[(index + 1) % count]!;
  const p3 = points[(index + 2) % count]!;
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


export interface Circuit {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly difficulty: string;
  readonly description: string;
  readonly color: string;
  readonly theme: 'harbor' | 'neon' | 'reactor' | 'cosmic' | 'daylight' | 'volcanic' | 'mobius';
  readonly seed: number;
  readonly points: readonly TrackControlPoint[];
}

const points = (values: readonly (readonly [number, number, number])[]): readonly TrackControlPoint[] =>
  values.map(([x, y, z]) => ({ x, y, z }));

export type TrackVector = readonly [number, number, number];
export interface TrackFrame { right: TrackVector; up: TrackVector; forward: TrackVector }
export const dot = (a: TrackVector, b: TrackVector): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a: TrackVector, b: TrackVector): TrackVector => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit = (v: TrackVector): TrackVector => { const n=Math.hypot(...v)||1; return [v[0]/n,v[1]/n,v[2]/n]; };
export const mixVector = (a: TrackVector,b: TrackVector,t:number): TrackVector => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export function turnFrame(frame: TrackFrame, yaw: number, roll = 0): TrackFrame {
  const f=unit(mixAxes(frame.forward,frame.right,Math.cos(yaw),Math.sin(yaw)));
  const r=unit(cross(frame.up,f));
  const right=mixAxes(r,frame.up,Math.cos(roll),Math.sin(roll));
  return { forward:f,right,up:cross(f,right) };
}
export function mixAxes(a: TrackVector,b: TrackVector,x:number,y:number): TrackVector { return [a[0]*x+b[0]*y,a[1]*x+b[1]*y,a[2]*x+b[2]*y]; }
export function interpolateFrame(a: TrackFrame,b: TrackFrame,t:number): TrackFrame {
  const forward=unit(mixVector(a.forward,b.forward,t));
  const right=unit(cross(mixVector(a.up,b.up,t),forward));
  return {forward,right,up:cross(forward,right)};
}
/** Steering curvature in the road plane; vertical loops do not introduce a false 180° yaw. */
export function frameTurn(a: {heading:number;frame?:TrackFrame}, b: {heading:number;frame?:TrackFrame}): number {
  return a.frame && b.frame ? Math.atan2(dot(b.frame.forward,a.frame.right),dot(b.frame.forward,a.frame.forward))
    : Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading));
}

/** A drifting vertical loop, a full barrel roll and a rising 1½-turn helix, joined by tangent-matched curves. */
export function createCoasterTrack(scale=1): RaceTrack {
  scale *= 0.75;
  const vertices: {p:TrackVector;roll:number;section:string}[]=[];
  const add=(n:number, fn:(t:number)=>TrackVector,section:string,roll:(t:number)=>number=()=>0) => {
    for(let i=0;i<n;i++) {const p=fn(i/n);vertices.push({p:[p[0]*scale,p[1]*scale,p[2]*scale],roll:roll(i/n),section});}
  };
  const bezier=(a:TrackVector,b:TrackVector,c:TrackVector,d:TrackVector,section:string,n=120,roll?:(t:number)=>number) => add(n,t=>{
    const s=1-t;return [0,1,2].map(i=>a[i]!*s*s*s+3*b[i]!*s*s*t+3*c[i]!*s*t*t+d[i]!*t*t*t) as unknown as TrackVector;
  },section,roll);
  bezier([-5000,1800,-9000],[-5000,1800,-8000],[-5000,1800,-7300],[-5000,1800,-6500],'launch');
  add(360,t=>[-5000+600*(t-Math.sin(t*2*Math.PI)/(2*Math.PI)),1800+1200*(1-Math.cos(t*2*Math.PI)),-6500+1200*Math.sin(t*2*Math.PI)+700*t],'loop');
  bezier([-4400,1800,-5800],[-4400,1800,-4200],[-4100,2400,-1000],[-1500,2400,-1000],'roll',240,t=>2*Math.PI*(t*t*(3-2*t)));
  add(540,t=>{const a=-Math.PI/2+t*3*Math.PI;return [-1500+2000*Math.cos(a),2400+2400*t,1000+2000*Math.sin(a)];},'helix');
  bezier([-1500,4800,3000],[-3700,5080,3000],[-5200,3500,6500],[-7200,2600,4500],'descent',160);
  bezier([-7200,2600,4500],[-9200,1700,2500],[-9500,1800,-2500],[-8500,1800,-6500],'return',200);
  bezier([-8500,1800,-6500],[-7500,1800,-10500],[-5000,1800,-11500],[-5000,1800,-9000],'home',160);
  const n=vertices.length;
  const forwards=vertices.map((_,i)=>unit(mixAxes(vertices[(i+1)%n]!.p,vertices[(i+n-1)%n]!.p,1,-1)));
  let right:TrackVector=unit(cross([0,1,0],forwards[0]!));
  const rights=forwards.map(f=>{right=unit(mixAxes(right,f,1,-dot(right,f)));return right;});
  // Close the transported frame without a discontinuity at the lap boundary.
  const f0=forwards[0]!, last=unit(mixAxes(rights[n-1]!,f0,1,-dot(rights[n-1]!,f0)));
  const seam=Math.atan2(dot(last,cross(f0,rights[0]!)),dot(last,rights[0]!));
  let distance=0;
  const samples:TrackSample[]=vertices.map((v,i)=>{
    if(i)distance+=Math.hypot(...mixAxes(v.p,vertices[i-1]!.p,1,-1));
    const f=forwards[i]!,r=rights[i]!,u=cross(f,r), angle=v.roll-seam*i/n;
    const rr=mixAxes(r,u,Math.cos(angle),Math.sin(angle)),up=cross(f,rr);
    return {x:v.p[0],y:v.p[1],z:v.p[2],heading:Math.atan2(f[0],f[2]),pitch:Math.asin(f[1]),bank:angle,distance,
      frame:{right:rr,up,forward:f},section:v.section};
  });
  return {samples,length:distance+Math.hypot(...mixAxes(vertices[0]!.p,vertices[n-1]!.p,1,-1))};
}

/** Oriented double cover of one half-twisted ribbon. The 12-unit slab separates its
 * two drivable faces; one lap traverses both faces before the frame closes. */
export function createMobiusTrack(scale = TRACK_SCALE): RaceTrack {
  const count = 1440, radius = 1900 * scale, halfThickness = 6;
  const vertices = Array.from({length: count}, (_, i) => {
    const angle = i / count * Math.PI * 4;
    const radial: TrackVector = [Math.cos(angle), 0, Math.sin(angle)];
    const right = mixAxes(radial, [0,1,0], Math.cos(angle / 2), Math.sin(angle / 2));
    const forward: TrackVector = [-Math.sin(angle), 0, Math.cos(angle)];
    // The transported frame keeps right × up = forward in the engine's road frame.
    const up = cross(forward, right);
    return {p: [radius * Math.cos(angle) + up[0] * halfThickness,
      1400 * scale + up[1] * halfThickness, radius * Math.sin(angle) + up[2] * halfThickness] as TrackVector,
      // Radial and tangent must use the same parameterization.
      angle};
  });
  // Use the actual offset curve tangent, so physics, camera and mesh share a frame.
  let distance = 0;
  const samples: TrackSample[] = vertices.map((v,i) => {
    const a=v.angle;
    const radial: TrackVector=[Math.cos(a),0,Math.sin(a)];
    const desired=mixAxes(radial,[0,1,0],Math.cos(a/2),Math.sin(a/2));
    const forward=unit(mixAxes(vertices[(i+1)%count]!.p,vertices[(i+count-1)%count]!.p,1,-1));
    const right=unit(mixAxes(desired,forward,1,-dot(desired,forward))),up=cross(forward,right);
    if(i) distance+=Math.hypot(...mixAxes(v.p,vertices[i-1]!.p,1,-1));
    return {x:v.p[0],y:v.p[1],z:v.p[2],distance,heading:Math.atan2(forward[0],forward[2]),
      pitch:Math.asin(forward[1]),bank:a/2,frame:{right,up,forward},section:i<count/2?'front':'back'};
  });
  return {samples,length:distance+Math.hypot(...mixAxes(vertices[0]!.p,vertices[count-1]!.p,1,-1))};
}

export const CIRCUITS: readonly Circuit[] = [
  { id: 'sky-harbor', name: '云端港湾', subtitle: 'SKY HARBOR', difficulty: '入门 · 高速宽弯',
    description: '沿空港外环加速，在开阔长弯中掌握转向与刹车。', color: '#ffbf69', theme: 'harbor', seed: 0x2fa192,
    points: points([[0,180,-2800],[1000,200,-2750],[2100,260,-2250],[2850,340,-1300],
      [3050,400,-100],[2800,420,1100],[1900,360,2100],[650,260,2600],[-650,200,2600],
      [-1900,230,2150],[-2800,310,1200],[-3050,400,0],[-2800,370,-1250],[-1900,280,-2300],[-900,200,-2750]]) },
  { id: 'neon-city', name: '霓虹都市', subtitle: 'NEON METROPOLIS', difficulty: '进阶 · 起伏长环',
    description: '穿行摩天楼群，征服高架连续弯与大落差坡道。', color: '#55eaff', theme: 'neon', seed: 0x91e10da5, points: TRACK_CONTROL_POINTS },
  { id: 'reactor-run', name: '反应堆回廊', subtitle: 'REACTOR RUN', difficulty: '专家 · 连续 S 弯',
    description: '深入能源核心，在折返弯和连续变向中守住车身。', color: '#d893ff', theme: 'reactor', seed: 0x871a20,
    points: points([[0,110,-2800],[1050,140,-2780],[2400,230,-2300],[2800,350,-1300],
      [2500,400,-350],[1600,310,100],[1400,220,850],[2350,180,1550],[2200,300,2400],
      [1000,400,2750],[-200,330,2450],[-750,230,1500],[-1450,150,1450],[-2050,180,2450],
      [-2950,300,2050],[-3100,380,900],[-2350,310,0],[-2900,220,-1000],[-2400,140,-2250],[-1100,100,-2800]]) },
  { id: 'rainbow-road', name: '彩虹之路', subtitle: 'RAINBOW ROAD', difficulty: '终极 · 星海立交',
    description: '穿越光环与流星雨，在交错的彩虹天路上攀升俯冲。', color: '#ffa7e7', theme: 'cosmic', seed: 0x5241494e,
    // A suspended figure eight: the two crossings are 1,700 units apart vertically.
    // Smooth climbs and banked bends preserve the car's continuous contact frame.
    points: Array.from({ length: 36 }, (_, i) => {
      const angle = i / 36 * Math.PI * 2;
      return { x: 3600 * Math.sin(angle), y: 1250 + 850 * Math.cos(angle) + 180 * Math.sin(angle * 2), z: 2800 * Math.sin(angle * 2) };
    }) },
  { id: 'sky-coaster', name: '晴空回旋', subtitle: 'SKY COASTER', difficulty: '极限 · 回环螺旋',
    description: '飞越晴空云海，穿过垂直回环、翻转天桥与盘旋上升的螺旋路。', color: '#58dcff', theme: 'daylight', seed: 0x534b5943,
    points: createCoasterTrack().samples },
  { id: 'ashfall', name: '熔火末途', subtitle: 'ASHFALL', difficulty: '生存 · 火山落火',
    description: '穿越喷发的火山与熔岩裂谷，观察落点预警，避开砸向路面的火球。', color: '#ff7747', theme: 'volcanic', seed: 0x41534846,
    points: points([[0,240,-3000],[1400,300,-3000],[2900,600,-2200],[3300,900,-700],
      [2500,760,600],[1200,450,1200],[800,300,2400],[-600,500,3000],[-2200,800,2200],
      [-3000,1100,700],[-2500,850,-700],[-1500,420,-2000]]) },
  { id: 'mobius-ring', name: '莫比乌斯星环', subtitle: 'MOBIUS ORBIT', difficulty: '极限 · 双面星环',
    description: '沿半扭转的星环驶向路面背面，在流动的星云纹路中完成双面巡航。',
    color: '#77ffe1', theme: 'mobius', seed: 0x4d4f4249, points: createMobiusTrack(1).samples },
];

export function circuitById(id: string | null): Circuit {
  return CIRCUITS.find(circuit => circuit.id === id) ?? CIRCUITS[0]!;
}

/** Fit the actual sampled centerline, using equal X/Z scale, into a route thumbnail. */
export function trackMap(track: RaceTrack): { path: string; start: readonly [number, number] } {
  const xs = track.samples.map(point => point.x);
  const zs = track.samples.map(point => point.frame ? point.z * 0.6 - point.y * 1.2 : point.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = Math.min(264 / (maxX - minX), 156 / (maxZ - minZ));
  const mapped = track.samples.map((point,i) => [150 + (point.x - (minX + maxX) / 2) * scale,
    96 + (zs[i]! - (minZ + maxZ) / 2) * scale] as const);
  return { path: mapped.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + ' Z', start: mapped[0]! };
}

export function circuitTrack(circuit: Circuit): RaceTrack {
  if(circuit.theme === 'mobius') return createMobiusTrack();
  if(circuit.theme === 'daylight') return createCoasterTrack(TRACK_SCALE);
  // Enlarge the route, not the ship/road width. Keep the original mesh sampling density.
  return createRaceTrack(Math.ceil(520 * TRACK_SCALE), circuit.points.map(p => ({ x: p.x * TRACK_SCALE, y: p.y * TRACK_SCALE, z: p.z * TRACK_SCALE })));
}
