export type EnemyTier = 'normal' | 'elite' | 'boss';
export type BulletPattern = 'aimed' | 'spread' | 'burst' | 'ring' | 'spiral';
export type FlightPattern = 'straight' | 'weave' | 'sweep' | 'dive' | 'fortress';
export type WeaponForm = 'basic' | 'red' | 'blue' | 'purple';
export type PowerupForm = Exclude<WeaponForm, 'basic'>;
export type EnemyBulletColor = 'red' | 'blue';

export interface EnemyDefinition {
  readonly id: string;
  readonly sprite: string;
  readonly tier: EnemyTier;
  readonly hitPoints: number;
  readonly speed: number;
  readonly score: number;
  readonly size: number;
  readonly fireIntervalMs: number;
  readonly bulletPattern: BulletPattern;
  readonly flightPattern: FlightPattern;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface WeaponProfile {
  readonly form: WeaponForm;
  readonly level: number;
  readonly damage: number;
  readonly projectileCount: number;
  readonly fireIntervalMs: number;
  readonly spreadSpeed: number;
  readonly beamWidth: number;
  readonly beamDamagePerSecond: number;
  readonly attractionRadius: number;
}

export interface EnemyProjectileProfile {
  readonly color: EnemyBulletColor;
  readonly cssColor: string;
  readonly damage: number;
}

export interface LaserTarget {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 960;
export const PLAYER_SPEED = 330;
export const PLAYER_FIRE_INTERVAL_MS = 105;
export const BOSS_FIRST_APPEARANCE_MS = 55_000;
export const PLAYER_MAX_LIVES = 3;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_REGEN_PER_SECOND = 1;
export const RED_ENEMY_BULLET_DAMAGE = 35;
export const BLUE_ENEMY_BULLET_DAMAGE = 60;
export const BOSS_LASER_DAMAGE = 100;
export const POWERUP_FORM_INTERVAL_MS = 8_000;
export const MAX_WEAPON_LEVEL = 3;
export const ENEMY_FIRE_INTERVAL_MULTIPLIER = 2;

export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
  { id: 'scout', sprite: 'assets/enemy-scout.png', tier: 'normal', hitPoints: 5, speed: 116, score: 100, size: 58, fireIntervalMs: 1800, bulletPattern: 'aimed', flightPattern: 'straight' },
  { id: 'dart', sprite: 'assets/enemy-dart.png', tier: 'normal', hitPoints: 6, speed: 172, score: 140, size: 52, fireIntervalMs: 2200, bulletPattern: 'aimed', flightPattern: 'dive' },
  { id: 'bomber', sprite: 'assets/enemy-bomber.png', tier: 'normal', hitPoints: 24, speed: 66, score: 320, size: 82, fireIntervalMs: 1450, bulletPattern: 'spread', flightPattern: 'straight' },
  { id: 'splitter', sprite: 'assets/enemy-splitter.png', tier: 'normal', hitPoints: 16, speed: 88, score: 220, size: 72, fireIntervalMs: 1300, bulletPattern: 'burst', flightPattern: 'weave' },
  { id: 'stealth', sprite: 'assets/enemy-stealth.png', tier: 'normal', hitPoints: 8, speed: 124, score: 240, size: 72, fireIntervalMs: 1650, bulletPattern: 'spread', flightPattern: 'sweep' },
  { id: 'gunship', sprite: 'assets/enemy-gunship.png', tier: 'normal', hitPoints: 36, speed: 55, score: 420, size: 88, fireIntervalMs: 1050, bulletPattern: 'burst', flightPattern: 'straight' },
  { id: 'drone', sprite: 'assets/enemy-drone.png', tier: 'normal', hitPoints: 7, speed: 104, score: 170, size: 56, fireIntervalMs: 1500, bulletPattern: 'aimed', flightPattern: 'weave' },
  { id: 'crimson-lance', sprite: 'assets/elite-crimson-lance.png', tier: 'elite', hitPoints: 78, speed: 52, score: 2400, size: 120, fireIntervalMs: 720, bulletPattern: 'spread', flightPattern: 'sweep' },
  { id: 'violet-fortress', sprite: 'assets/elite-violet-fortress.png', tier: 'elite', hitPoints: 118, speed: 38, score: 3600, size: 138, fireIntervalMs: 820, bulletPattern: 'ring', flightPattern: 'fortress' },
  { id: 'dreadnought', sprite: 'assets/boss-dreadnought.png', tier: 'boss', hitPoints: 520, speed: 34, score: 25_000, size: 292, fireIntervalMs: 260, bulletPattern: 'spiral', flightPattern: 'fortress' },
]);

const ENEMY_BY_ID = new Map(ENEMY_DEFINITIONS.map(definition => [definition.id, definition]));
export const NORMAL_ENEMIES = Object.freeze(ENEMY_DEFINITIONS.filter(definition => definition.tier === 'normal'));
export const ELITE_ENEMIES = Object.freeze(ENEMY_DEFINITIONS.filter(definition => definition.tier === 'elite'));
export const BOSS_ENEMY = requiredEnemyDefinition('dreadnought');

export function requiredEnemyDefinition(id: string): EnemyDefinition {
  const definition = ENEMY_BY_ID.get(id);
  if (!definition) throw new Error(`[SKY_STRIKE_UNKNOWN_ENEMY] No enemy definition for "${id}".`);
  return definition;
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function createNormalSpawnSequence(seed: number, count: number): string[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => {
    const index = Math.min(NORMAL_ENEMIES.length - 1, Math.floor(random() * NORMAL_ENEMIES.length));
    return NORMAL_ENEMIES[index]?.id ?? NORMAL_ENEMIES[0]!.id;
  });
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radius = a.radius + b.radius;
  return dx * dx + dy * dy <= radius * radius;
}

export function aimedVelocity(fromX: number, fromY: number, toX: number, toY: number, speed: number): Velocity {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length * speed, y: dy / length * speed };
}

export function velocityFromAngle(angle: number, speed: number): Velocity {
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}

export function clampToPlayfield(value: number, radius: number, maximum: number): number {
  return Math.max(radius, Math.min(maximum - radius, value));
}

export function regeneratePlayerHealth(health: number, deltaSeconds: number): number {
  const safeHealth = Math.max(0, Math.min(PLAYER_MAX_HEALTH, health));
  const safeDelta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  return Math.min(PLAYER_MAX_HEALTH, safeHealth + safeDelta * PLAYER_REGEN_PER_SECOND);
}

export function enemyFireIntervalMs(baseIntervalMs: number, wave: number): number {
  const base = Math.max(1, Number.isFinite(baseIntervalMs) ? baseIntervalMs : 1);
  const safeWave = Math.max(0, Number.isFinite(wave) ? wave : 0);
  return base * ENEMY_FIRE_INTERVAL_MULTIPLIER * Math.max(0.62, 1 - safeWave * 0.018);
}

export function weaponProfile(form: WeaponForm, requestedLevel: number): WeaponProfile {
  const level = form === 'basic' ? 0 : Math.max(1, Math.min(MAX_WEAPON_LEVEL, Math.floor(requestedLevel)));
  if (form === 'red') {
    return {
      form,
      level,
      damage: [0, 2, 2.75, 3.5][level] ?? 2,
      projectileCount: [0, 3, 5, 7][level] ?? 3,
      fireIntervalMs: 100,
      spreadSpeed: [0, 88, 126, 164][level] ?? 88,
      beamWidth: 0,
      beamDamagePerSecond: 0,
      attractionRadius: 0,
    };
  }
  if (form === 'blue') {
    return {
      form,
      level,
      damage: [0, 5, 7.5, 10][level] ?? 5,
      projectileCount: [0, 2, 3, 4][level] ?? 2,
      fireIntervalMs: 140,
      spreadSpeed: 0,
      beamWidth: 0,
      beamDamagePerSecond: 0,
      attractionRadius: 0,
    };
  }
  if (form === 'purple') {
    return {
      form,
      level,
      damage: 0,
      projectileCount: 0,
      fireIntervalMs: 70,
      spreadSpeed: 0,
      beamWidth: [0, 8, 12, 17][level] ?? 8,
      beamDamagePerSecond: [0, 21, 31, 43][level] ?? 21,
      attractionRadius: [0, 105, 135, 170][level] ?? 105,
    };
  }
  return {
    form: 'basic',
    level: 0,
    damage: 2,
    projectileCount: 2,
    fireIntervalMs: PLAYER_FIRE_INTERVAL_MS,
    spreadSpeed: 10,
    beamWidth: 0,
    beamDamagePerSecond: 0,
    attractionRadius: 0,
  };
}

export function upgradeWeapon(currentForm: WeaponForm, currentLevel: number, pickup: PowerupForm): { form: PowerupForm; level: number } {
  return {
    form: pickup,
    level: currentForm === pickup ? Math.min(MAX_WEAPON_LEVEL, Math.max(1, currentLevel + 1)) : 1,
  };
}

export function nextPowerupForm(form: PowerupForm): PowerupForm {
  if (form === 'red') return 'blue';
  if (form === 'blue') return 'purple';
  return 'red';
}

export function enemyProjectileProfile(definition: EnemyDefinition): EnemyProjectileProfile {
  const blue = definition.bulletPattern === 'burst' || definition.bulletPattern === 'ring';
  return blue
    ? { color: 'blue', cssColor: '#48a7ff', damage: BLUE_ENEMY_BULLET_DAMAGE }
    : { color: 'red', cssColor: '#ff415e', damage: RED_ENEMY_BULLET_DAMAGE };
}

export function selectLaserTarget<T extends LaserTarget>(
  originX: number,
  originY: number,
  attractionRadius: number,
  targets: readonly T[],
): T | null {
  let selected: T | null = null;
  let selectedScore = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (target.y >= originY || target.y < -target.radius) continue;
    const lateral = Math.abs(target.x - originX);
    if (lateral > attractionRadius + target.radius) continue;
    const score = (originY - target.y) + lateral * 1.7;
    if (score < selectedScore) {
      selected = target;
      selectedScore = score;
    }
  }
  return selected;
}

export function distancePointToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-8) return Math.hypot(pointX - startX, pointY - startY);
  const t = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared));
  return Math.hypot(pointX - (startX + dx * t), pointY - (startY + dy * t));
}
