export const SMOKE_HEALTH = 50;
export const FIRE_HEALTH = 30;

/** Rear exhaust face centers in model units, scaled by 0.078 and rebased around Y=60. */
export const EXHAUST_SOCKETS = [[-6.32, 0.55, -19.45], [6.32, 0.55, -19.45]] as const;

export function propulsionEnvelope(speed: number, throttle: boolean, racing: boolean, boost: number, destroyed: boolean, maximumSpeed: number): number {
  if (destroyed) return 0;
  if (!racing || !throttle) return 1.35;
  return 8 + Math.min(1, Math.max(0, speed) / maximumSpeed) * 13 + Math.min(1, Math.max(0, boost)) * 5;
}

export function damageEnvelope(health: number): { smokeRate: number; smokeOpacity: number; fire: number } {
  const damage = Math.min(1, Math.max(0, (SMOKE_HEALTH - health) / SMOKE_HEALTH));
  return {
    smokeRate: health <= SMOKE_HEALTH ? 3 + damage * 13 : 0,
    smokeOpacity: 0.16 + damage * 0.28,
    fire: health < FIRE_HEALTH ? 0.16 + 0.32 * Math.min(1, (FIRE_HEALTH - health) / FIRE_HEALTH) : 0,
  };
}

export function speedFov(speed: number, maximumSpeed: number): number {
  const ratio = Math.min(1, Math.max(0, speed) / maximumSpeed);
  // One smooth quadratic through 0 km/h = 60°, 360 = 40°, 522 = 30°.
  // No slope break at cruise speed; the camera's existing time filter eases changes.
  const cruiseRatio = 360 / 522;
  const bend = (30 * cruiseRatio - 20) / (cruiseRatio * (1 - cruiseRatio));
  return (60 - (30 - bend) * ratio - bend * ratio * ratio) * Math.PI / 180;
}

/** Raise the sightline as the lens narrows, and follow the road's uphill/downhill tangent. */
export function speedCameraPhi(speed: number, roadPitch: number, maximumSpeed: number): number {
  const ratio = Math.min(1, Math.max(0, speed) / maximumSpeed);
  const lift = ratio * ratio * (3 - 2 * ratio) * 0.22;
  return Math.max(0.65, Math.min(1.95, 1.18 + lift + roadPitch));
}

/** Match the engine's Y * X * Z Euler order, including bank and pitch. */
export function rotateBodyPoint(point: readonly number[], pitch: number, heading: number, bank: number): [number, number, number] {
  const x = point[0]!, y = point[1]!, z = point[2]!;
  const bx = Math.cos(bank) * x - Math.sin(bank) * y;
  const by = Math.sin(bank) * x + Math.cos(bank) * y;
  const py = Math.cos(pitch) * by - Math.sin(pitch) * z;
  const pz = Math.sin(pitch) * by + Math.cos(pitch) * z;
  return [Math.cos(heading) * bx + Math.sin(heading) * pz, py, -Math.sin(heading) * bx + Math.cos(heading) * pz];
}

/** Strict thirds: exact 2/3 remains green and exact 1/3 remains amber. */
export function healthRingColor(health: number): readonly [number, number, number, number] {
  return health < 100 / 3 ? [1, 0.22, 0.16, 1] : health < 200 / 3 ? [1, 0.66, 0.12, 1] : [0.32, 0.95, 0.60, 1];
}

/** The physics impact already combines speed and contact incidence. */
export function wallHaptic(impact: number): 'light' | 'medium' | 'heavy' {
  const strength = Number.isFinite(impact) ? Math.max(0, Math.min(1, impact)) : 0;
  return strength < 0.36 ? 'light' : strength < 0.66 ? 'medium' : 'heavy';
}
