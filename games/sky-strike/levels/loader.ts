export interface FixedSpawnPosition {
  readonly mode: 'fixed';
  readonly x: number;
}

export interface RandomSpawnPosition {
  readonly mode: 'random';
  readonly minX: number;
  readonly maxX: number;
}

export type SpawnPosition = FixedSpawnPosition | RandomSpawnPosition;

export interface LevelSpawnGroup {
  readonly atMs: number;
  readonly enemyId: string;
  readonly position: SpawnPosition;
  readonly count?: number;
  readonly intervalMs?: number;
}

export interface SkyStrikeLevel {
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly bossId: string;
  readonly spawns: readonly LevelSpawnGroup[];
}

export interface CompiledLevelSpawn {
  readonly atMs: number;
  readonly enemyId: string;
  readonly position: SpawnPosition;
}

const LEVEL_PATHS = [
  'levels/level-01.json',
  'levels/level-02.json',
  'levels/level-03.json',
] as const;

export async function loadSkyStrikeLevels(): Promise<readonly SkyStrikeLevel[]> {
  return Promise.all(LEVEL_PATHS.map(async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`[SKY_STRIKE_LEVEL_LOAD_FAILED] ${path}: HTTP ${response.status}.`);
    return parseLevel(await response.json(), path);
  }));
}

export function compileLevelTimeline(level: SkyStrikeLevel): CompiledLevelSpawn[] {
  return level.spawns
    .flatMap(group => Array.from({ length: group.count ?? 1 }, (_, index) => ({
      atMs: group.atMs + index * (group.intervalMs ?? 0),
      enemyId: group.enemyId,
      position: group.position,
    })))
    .sort((a, b) => a.atMs - b.atMs);
}

export function resolveSpawnX(position: SpawnPosition, random: () => number): number {
  if (position.mode === 'fixed') return position.x;
  return position.minX + (position.maxX - position.minX) * random();
}

function parseLevel(value: unknown, path: string): SkyStrikeLevel {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || !isFiniteNumber(value.seed)
    || typeof value.bossId !== 'string'
    || !Array.isArray(value.spawns)) {
    throw new Error(`[SKY_STRIKE_LEVEL_INVALID] ${path} has an invalid root object.`);
  }
  const spawns = value.spawns.map((spawn, index) => parseSpawn(spawn, `${path}#spawns[${index}]`));
  if (!spawns.some(spawn => spawn.enemyId === value.bossId)) {
    throw new Error(`[SKY_STRIKE_LEVEL_INVALID] ${path} must schedule boss "${value.bossId}".`);
  }
  return Object.freeze({
    id: value.id,
    name: value.name,
    seed: Math.floor(value.seed),
    bossId: value.bossId,
    spawns: Object.freeze(spawns),
  });
}

function parseSpawn(value: unknown, label: string): LevelSpawnGroup {
  if (!isRecord(value)
    || !isFiniteNumber(value.atMs)
    || value.atMs < 0
    || typeof value.enemyId !== 'string'
    || !isSpawnPosition(value.position)) {
    throw new Error(`[SKY_STRIKE_LEVEL_INVALID] ${label} is invalid.`);
  }
  const count = value.count === undefined ? 1 : value.count;
  const intervalMs = value.intervalMs === undefined ? 0 : value.intervalMs;
  if (!isFiniteNumber(count)
    || !Number.isInteger(count)
    || count < 1
    || count > 32
    || !isFiniteNumber(intervalMs)
    || intervalMs < 0) {
    throw new Error(`[SKY_STRIKE_LEVEL_INVALID] ${label} has an invalid count or interval.`);
  }
  return Object.freeze({
    atMs: value.atMs,
    enemyId: value.enemyId,
    position: Object.freeze(value.position),
    count,
    intervalMs,
  });
}

function isSpawnPosition(value: unknown): value is SpawnPosition {
  if (!isRecord(value)) return false;
  if (value.mode === 'fixed') return isFiniteNumber(value.x) && value.x >= 24 && value.x <= 456;
  return value.mode === 'random'
    && isFiniteNumber(value.minX)
    && isFiniteNumber(value.maxX)
    && value.minX >= 24
    && value.maxX <= 456
    && value.minX <= value.maxX;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
