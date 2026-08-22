export type EnemyTier = 'normal' | 'elite' | 'boss';
export type BulletPattern = 'aimed' | 'spread' | 'burst' | 'ring' | 'spiral';
export type FlightPattern = 'straight' | 'weave' | 'sweep' | 'dive' | 'fortress';

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

export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 960;
export const PLAYER_SPEED = 330;
export const PLAYER_FIRE_INTERVAL_MS = 105;
export const BOSS_FIRST_APPEARANCE_MS = 55_000;

export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
  { id: 'scout', sprite: 'assets/enemy-scout.png', tier: 'normal', hitPoints: 3, speed: 116, score: 100, size: 58, fireIntervalMs: 1800, bulletPattern: 'aimed', flightPattern: 'straight' },
  { id: 'dart', sprite: 'assets/enemy-dart.png', tier: 'normal', hitPoints: 4, speed: 172, score: 140, size: 52, fireIntervalMs: 2200, bulletPattern: 'aimed', flightPattern: 'dive' },
  { id: 'bomber', sprite: 'assets/enemy-bomber.png', tier: 'normal', hitPoints: 14, speed: 66, score: 320, size: 82, fireIntervalMs: 1450, bulletPattern: 'spread', flightPattern: 'straight' },
  { id: 'splitter', sprite: 'assets/enemy-splitter.png', tier: 'normal', hitPoints: 8, speed: 88, score: 220, size: 72, fireIntervalMs: 1300, bulletPattern: 'burst', flightPattern: 'weave' },
  { id: 'stealth', sprite: 'assets/enemy-stealth.png', tier: 'normal', hitPoints: 7, speed: 124, score: 240, size: 72, fireIntervalMs: 1650, bulletPattern: 'spread', flightPattern: 'sweep' },
  { id: 'gunship', sprite: 'assets/enemy-gunship.png', tier: 'normal', hitPoints: 18, speed: 55, score: 420, size: 88, fireIntervalMs: 1050, bulletPattern: 'burst', flightPattern: 'straight' },
  { id: 'drone', sprite: 'assets/enemy-drone.png', tier: 'normal', hitPoints: 5, speed: 104, score: 170, size: 56, fireIntervalMs: 1500, bulletPattern: 'aimed', flightPattern: 'weave' },
  { id: 'crimson-lance', sprite: 'assets/elite-crimson-lance.png', tier: 'elite', hitPoints: 72, speed: 52, score: 2400, size: 120, fireIntervalMs: 720, bulletPattern: 'spread', flightPattern: 'sweep' },
  { id: 'violet-fortress', sprite: 'assets/elite-violet-fortress.png', tier: 'elite', hitPoints: 105, speed: 38, score: 3600, size: 138, fireIntervalMs: 820, bulletPattern: 'ring', flightPattern: 'fortress' },
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
