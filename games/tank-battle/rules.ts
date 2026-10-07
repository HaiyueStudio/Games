/** Fixed-step, seeded simulation. Coordinates are logical pixels; no browser APIs. */
export const SIZE = 416;
export const TILE = 16;
export const GRID = 26;
export const STEP = 1 / 60;
export type Terrain = 'ground' | 'brick' | 'steel' | 'snow' | 'water' | 'forest';
export type Direction = 0 | 1 | 2 | 3;
export type TankKind = 'player' | 'scout' | 'runner' | 'gunner' | 'heavy';
export type Phase = 'playing' | 'paused' | 'cleared' | 'gameover' | 'victory';
export const POWERUPS = ['star', 'shield', 'bomb', 'clock', 'shovel', 'life'] as const;
export type PowerupKind = typeof POWERUPS[number];
export const POWERUP_NAMES: Record<PowerupKind, string> = {
  star: '火力升级', shield: '无敌护盾', bomb: '全屏爆破', clock: '时间冻结', shovel: '基地加固', life: '额外生命',
};
export const VECTORS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }] as const;
export const ENEMY_STATS = {
  scout: { speed: 56, hp: 1, points: 100, cooldown: 110 },
  runner: { speed: 92, hp: 1, points: 200, cooldown: 125 },
  gunner: { speed: 62, hp: 2, points: 300, cooldown: 65 },
  heavy: { speed: 42, hp: 4, points: 400, cooldown: 100 },
};
export interface Tank {
  id: number; kind: TankKind; player: number; x: number; y: number; direction: Direction;
  hp: number; level: number; carrier: boolean; shield: number; cooldown: number;
  ai: number; slide: number; moving: boolean;
}
export interface Bullet {
  id: number; owner: number; player: number; x: number; y: number; direction: Direction; power: number;
}
export interface Pickup { id: number; kind: PowerupKind; x: number; y: number; ttl: number }
export interface Effect { x: number; y: number; ttl: number; kind: 'blast' | 'spark' | 'spawn' }
export interface Player { lives: number; score: number; level: number; respawn: number }
export interface GameState {
  version: 1; seed: number; tick: number; stage: number; mode: 1 | 2; phase: Phase;
  tiles: Terrain[]; tanks: Tank[]; bullets: Bullet[]; pickups: Pickup[]; effects: Effect[];
  players: Player[]; queue: number; spawned: number; killed: number; total: number;
  spawnTimer: number; nextId: number; baseAlive: boolean; freeze: number; fortify: number;
  stageTimer: number; message: string; messageTimer: number;
  sounds: Array<'shoot' | 'hit' | 'explode' | 'pickup' | 'over' | 'clear'>;
}
export interface Input { direction: Direction | null; fire: boolean }
export const IDLE: Input = { direction: null, fire: false };
export const STAGE_NAMES = ['边境哨所', '冰封峡谷', '海岸防线', '密林伏击', '钢铁要塞'];
// Each character is a 32-pixel block composed of four destructible 16-pixel cells.
const MAPS = [
  ['.............', '.B.BB.BB.B.B.', '.B.B...B.B.B.', '...B.S.S.B...', '.B...F.F...B.', '.BBB.F.F.BBB.', '.....WWW.....', '.BSB.....BSB.', '.B...B.B...B.', '...F.B.B.F...', '.B.F.....F.B.', '.............', '.............'],
  ['.............', '.N.B.N.N.B.N.', '.N.B.N.N.B.N.', '...S.....S...', '.BB.NNNNN.BB.', '....N.S.N....', '.NN.N.S.N.NN.', '.BB.N...N.BB.', '....N.B.N....', '.SS...B...SS.', '.N..B...B..N.', '.............', '.............'],
  ['.............', '.BB..B.B..BB.', '..W.......W..', '..W.B.S.B.W..', '..W.B...B.W..', '.FW...B...WF.', '.FWW..B..WWF.', '......S......', '.BB.W...W.BB.', '....W.B.W....', '.FF...B...FF.', '.............', '.............'],
  ['.............', '.F.B.F.F.B.F.', '.F.B.F.F.B.F.', '...F.....F...', '.BSF.B.B.FSB.', '.F...F.F...F.', '.FBB.F.F.BBF.', '.....S.S.....', '.FFF.....FFF.', '.B...B.B...B.', '...F.....F...', '.............', '.............'],
  ['.............', '.S.B.S.S.B.S.', '.S.B.....B.S.', '...BB.S.BB...', '.S....S....S.', '.S.BW...WB.S.', '...BW.S.WB...', '.S....S....S.', '.S.B.....B.S.', '...B.F.F.B...', '.BB..F.F..BB.', '.............', '.............'],
] as const;
const TERRAIN: Record<string, Terrain> = { '.': 'ground', B: 'brick', S: 'steel', N: 'snow', W: 'water', F: 'forest' };
export const FORT_CELLS = Array.from({ length: GRID * GRID }, (_, i) => i).filter(i => {
  const x = i % GRID; const y = Math.floor(i / GRID);
  return (y === 23 && x >= 11 && x <= 14) || ((x === 11 || x === 14) && y >= 24);
});
export function createMap(stage: number): Terrain[] {
  const layout = MAPS[Math.max(0, Math.min(MAPS.length - 1, stage - 1))]!;
  const tiles = Array.from({ length: GRID * GRID }, (_, i) =>
    TERRAIN[layout[Math.floor(i / GRID / 2)]![Math.floor((i % GRID) / 2)]!] ?? 'ground');
  for (const i of FORT_CELLS) tiles[i] = 'brick';
  return tiles;
}
function random(state: GameState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 0x100000000;
}
export function createTank(state: GameState, kind: TankKind, x: number, y: number, player = 0, carrier = false): Tank {
  return { id: state.nextId++, kind, player, x, y, direction: player ? 0 : 2,
    hp: kind === 'player' ? 1 : ENEMY_STATS[kind].hp,
    level: player ? state.players[player - 1]!.level : 0, carrier, shield: player ? 180 : 55,
    cooldown: player ? 0 : 40, ai: 60, slide: 0, moving: false };
}
export function createGame(mode: 1 | 2 = 1, seed = 1985): GameState {
  const state: GameState = {
    version: 1, seed: seed >>> 0, tick: 0, stage: 1, mode, phase: 'playing', tiles: createMap(1),
    tanks: [], bullets: [], pickups: [], effects: [], players: Array.from({ length: mode }, () => ({ lives: 3, score: 0, level: 0, respawn: 0 })),
    queue: 16, spawned: 0, killed: 0, total: 16, spawnTimer: 35, nextId: 1, baseAlive: true,
    freeze: 0, fortify: 0, stageTimer: 0, message: '守住基地，清除全部敌军', messageTimer: 210, sounds: [],
  };
  for (let p = 1; p <= mode; p++) state.tanks.push(createTank(state, 'player', p === 1 ? 144 : 272, 400, p));
  return state;
}
function overlap(ax: number, ay: number, bx: number, by: number, distance: number): boolean {
  return Math.abs(ax - bx) < distance && Math.abs(ay - by) < distance;
}
export function tileAt(state: GameState, x: number, y: number): Terrain {
  return state.tiles[Math.floor(y / TILE) * GRID + Math.floor(x / TILE)] ?? 'steel';
}
export function canMove(state: GameState, tank: Tank, x: number, y: number): boolean {
  const half = 12;
  if (x < half || y < half || x > SIZE - half || y > SIZE - half || overlap(x, y, 208, 400, 27)) return false;
  for (let row = Math.floor((y - half) / TILE); row <= Math.floor((y + half - 0.01) / TILE); row++) {
    for (let col = Math.floor((x - half) / TILE); col <= Math.floor((x + half - 0.01) / TILE); col++) {
      const tile = state.tiles[row * GRID + col];
      if (tile === 'brick' || tile === 'steel' || tile === 'water') return false;
    }
  }
  return !state.tanks.some(other => other.id !== tank.id && overlap(x, y, other.x, other.y, 25));
}
function move(state: GameState, tank: Tank, direction: Direction, speed: number): boolean {
  if (tank.direction % 2 !== direction % 2) {
    const x = direction % 2 ? tank.x : Math.round(tank.x / 16) * 16;
    const y = direction % 2 ? Math.round(tank.y / 16) * 16 : tank.y;
    if (Math.abs(x - tank.x) <= 6 && Math.abs(y - tank.y) <= 6 && canMove(state, tank, x, y)) { tank.x = x; tank.y = y; }
  }
  tank.direction = direction;
  const v = VECTORS[direction];
  const x = tank.x + v.x * speed * STEP; const y = tank.y + v.y * speed * STEP;
  if (!canMove(state, tank, x, y)) return false;
  tank.x = x; tank.y = y; return true;
}
function fire(state: GameState, tank: Tank): void {
  const limit = tank.player && tank.level >= 2 ? 2 : 1;
  if (tank.cooldown > 0 || state.bullets.filter(b => b.owner === tank.id).length >= limit) return;
  const v = VECTORS[tank.direction];
  state.bullets.push({ id: state.nextId++, owner: tank.id, player: tank.player,
    x: tank.x + v.x * 16, y: tank.y + v.y * 16, direction: tank.direction,
    power: tank.player ? tank.level : (tank.kind === 'gunner' ? 1 : 0) });
  tank.cooldown = tank.kind === 'player' ? (tank.level >= 1 ? 16 : 25) : ENEMY_STATS[tank.kind].cooldown;
  if (tank.player) state.sounds.push('shoot');
}
export function dropPowerup(state: GameState): void {
  const positions: Array<{ x: number; y: number }> = [];
  // Search cells reachable by tanks from either starting lane. Never place loot in water or sealed rooms.
  const visited = new Set<number>(); const pending = [{ x: 144, y: 400 }, { x: 272, y: 400 }];
  const probe = { id: -1 } as Tank;
  // Dynamic actors may leave; only static topology controls pickup reachability.
  const topology = { ...state, tanks: [] };
  for (let i = 0; i < pending.length; i++) {
    const point = pending[i]!; const key = point.y * SIZE + point.x;
    if (visited.has(key) || !canMove(topology, probe, point.x, point.y)) continue;
    visited.add(key);
    if (point.y < 368) positions.push(point);
    for (const v of VECTORS) pending.push({ x: point.x + v.x * 16, y: point.y + v.y * 16 });
  }
  const point = positions[Math.floor(random(state) * positions.length)] ?? { x: 144, y: 400 };
  const kind = POWERUPS[Math.floor(random(state) * POWERUPS.length)]!;
  state.pickups.push({ id: state.nextId++, kind, ...point, ttl: 900 });
  if (state.pickups.length > 5) state.pickups.shift();
  state.message = `发现补给 · ${POWERUP_NAMES[kind]}`; state.messageTimer = 160;
}
function destroy(state: GameState, tank: Tank, credit: number): void {
  state.tanks = state.tanks.filter(t => t.id !== tank.id);
  state.effects.push({ x: tank.x, y: tank.y, ttl: 25, kind: 'blast' });
  state.sounds.push('explode');
  if (tank.player) {
    const player = state.players[tank.player - 1]!;
    player.lives--; player.level = 0; player.respawn = 90;
  } else {
    state.killed++;
    if (credit > 0) state.players[credit - 1]!.score += ENEMY_STATS[tank.kind as Exclude<TankKind, 'player'>].points;
    if (tank.carrier) dropPowerup(state);
  }
}
export function applyPowerup(state: GameState, tank: Tank, kind: PowerupKind): void {
  if (!tank.player) return;
  const player = state.players[tank.player - 1]!;
  player.score += 500;
  if (kind === 'star') { tank.level = Math.min(3, tank.level + 1); player.level = tank.level; }
  if (kind === 'shield') tank.shield = 600;
  if (kind === 'life') player.lives++;
  if (kind === 'clock') { state.freeze = 600; state.bullets = state.bullets.filter(b => b.player > 0); }
  if (kind === 'shovel') { state.fortify = 1200; for (const i of FORT_CELLS) state.tiles[i] = 'steel'; }
  if (kind === 'bomb') {
    for (const enemy of [...state.tanks].filter(t => !t.player)) destroy(state, enemy, tank.player);
    state.bullets = state.bullets.filter(b => b.player > 0);
  }
  state.message = `P${tank.player} 获得 ${POWERUP_NAMES[kind]}`; state.messageTimer = 160;
  state.sounds.push('pickup');
}
function updateBullets(state: GameState): void {
  const removed = new Set<number>();
  for (const bullet of state.bullets) {
    if (removed.has(bullet.id)) continue;
    const v = VECTORS[bullet.direction];
    const distance = (bullet.power >= 1 ? 300 : 220) * STEP;
    // Substeps prevent tunneling through walls, tanks, or opposing projectiles.
    for (let sub = 0; sub < 3; sub++) {
      bullet.x += v.x * distance / 3; bullet.y += v.y * distance / 3;
      let hit = bullet.x < 0 || bullet.y < 0 || bullet.x >= SIZE || bullet.y >= SIZE;
      if (!hit && overlap(bullet.x, bullet.y, 208, 400, 15)) {
        state.baseAlive = false; hit = true;
        state.effects.push({ x: 208, y: 400, ttl: 40, kind: 'blast' });
      }
      const cells = new Set<number>();
      for (const side of [-2, 2]) {
        const x = bullet.x + (v.x ? 0 : side); const y = bullet.y + (v.y ? 0 : side);
        if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) cells.add(Math.floor(y / TILE) * GRID + Math.floor(x / TILE));
      }
      for (const cell of cells) {
        const terrain = state.tiles[cell];
        if (terrain === 'brick' || terrain === 'steel') {
          hit = true;
          if (terrain === 'brick' || (bullet.player > 0 && bullet.power >= 3)) state.tiles[cell] = 'ground';
        }
      }
      if (!hit) {
        for (const tank of state.tanks) {
          if (tank.id === bullet.owner || Boolean(tank.player) === Boolean(bullet.player)) continue;
          if (overlap(tank.x, tank.y, bullet.x, bullet.y, 14)) {
            hit = true;
            if (tank.shield <= 0 && --tank.hp <= 0) destroy(state, tank, bullet.player);
            break;
          }
        }
      }
      if (!hit) {
        const opposite = state.bullets.find(b => b.id !== bullet.id && !removed.has(b.id)
          && Boolean(b.player) !== Boolean(bullet.player) && overlap(bullet.x, bullet.y, b.x, b.y, 6));
        if (opposite) { removed.add(opposite.id); hit = true; }
      }
      if (hit) {
        removed.add(bullet.id); state.effects.push({ x: bullet.x, y: bullet.y, ttl: 8, kind: 'spark' });
        if (bullet.player) state.sounds.push('hit');
        break;
      }
    }
  }
  state.bullets = state.bullets.filter(b => !removed.has(b.id));
}
function chooseDirection(state: GameState, tank: Tank): Direction {
  const targets = state.tanks.filter(t => t.player);
  const target = random(state) < 0.48 ? { x: 208, y: 400 } : (targets[Math.floor(random(state) * targets.length)] ?? { x: 208, y: 400 });
  const preferred: Direction = Math.abs(target.x - tank.x) > Math.abs(target.y - tank.y)
    ? (target.x > tank.x ? 1 : 3) : (target.y > tank.y ? 2 : 0);
  const candidates: Direction[] = [preferred, 0, 1, 2, 3];
  if (random(state) < 0.3) candidates.unshift(Math.floor(random(state) * 4) as Direction);
  for (const dir of candidates) {
    const v = VECTORS[dir];
    if (canMove(state, tank, tank.x + v.x * 5, tank.y + v.y * 5)) return dir;
  }
  return preferred;
}
function spawnEnemy(state: GameState): void {
  if (state.queue <= 0 || state.tanks.filter(t => !t.player).length >= (state.mode === 2 ? 6 : 4)) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const x = [16, 208, 400][(state.spawned + attempt) % 3]!;
    if (state.tanks.some(t => overlap(t.x, t.y, x, 16, 32))) continue;
    const kinds: Array<Exclude<TankKind, 'player'>> = ['scout', 'runner', 'scout', 'gunner', 'heavy', 'runner'];
    const kind = kinds[(state.spawned + state.stage - 1) % kinds.length]!;
    const tank = createTank(state, kind, x, 16, 0, state.spawned % 4 === 2);
    state.tanks.push(tank); state.effects.push({ x, y: 16, kind: 'spawn', ttl: 35 });
    state.queue--; state.spawned++; state.spawnTimer = Math.max(65, 150 - state.stage * 10); return;
  }
}
export function nextStage(state: GameState): void {
  if (state.stage >= STAGE_NAMES.length) { state.phase = 'victory'; return; }
  state.stage++; state.tiles = createMap(state.stage); state.tanks = []; state.bullets = [];
  state.pickups = []; state.effects = []; state.freeze = 0; state.fortify = 0; state.stageTimer = 0;
  state.total = 14 + state.stage * 2; state.queue = state.total; state.killed = 0; state.spawned = 0; state.spawnTimer = 90;
  state.phase = 'playing'; state.message = `第 ${state.stage} 关 · ${STAGE_NAMES[state.stage - 1]}`; state.messageTimer = 200;
  for (let p = 1; p <= state.mode; p++) {
    const player = state.players[p - 1]!;
    // A knocked-out co-op partner rejoins at the next checkpoint.
    player.lives = Math.max(1, player.lives); player.respawn = 0;
    state.tanks.push(createTank(state, 'player', p === 1 ? 144 : 272, 400, p));
  }
}
export function stepGame(state: GameState, inputs: readonly Input[] = []): void {
  state.sounds = [];
  if (state.phase !== 'playing' && state.phase !== 'cleared') return;
  state.tick++;
  state.effects = state.effects.filter(e => --e.ttl > 0);
  state.messageTimer = Math.max(0, state.messageTimer - 1);
  if (state.phase === 'cleared') { if (--state.stageTimer <= 0) nextStage(state); return; }
  state.freeze = Math.max(0, state.freeze - 1);
  if (state.fortify > 0 && --state.fortify === 0) for (const i of FORT_CELLS) state.tiles[i] = 'brick';
  if (--state.spawnTimer <= 0 && state.freeze === 0) spawnEnemy(state);
  for (const tank of [...state.tanks]) {
    if (!state.tanks.includes(tank)) continue;
    tank.shield = Math.max(0, tank.shield - 1); tank.moving = false;
    if (!tank.player && state.freeze > 0) continue;
    tank.cooldown = Math.max(0, tank.cooldown - 1);
    if (tank.player) {
      const input = inputs[tank.player - 1] ?? IDLE;
      if (input.direction !== null) {
        tank.moving = move(state, tank, input.direction, 88 + tank.level * 5);
        tank.slide = tileAt(state, tank.x, tank.y) === 'snow' ? 20 : 0;
      } else if (tank.slide > 0) {
        tank.moving = move(state, tank, tank.direction, 88 * tank.slide-- / 20);
        if (!tank.moving || tileAt(state, tank.x, tank.y) !== 'snow') tank.slide = 0;
      }
      if (input.fire) fire(state, tank);
      for (const item of [...state.pickups]) {
        if (overlap(tank.x, tank.y, item.x, item.y, 24)) {
          state.pickups = state.pickups.filter(p => p.id !== item.id); applyPowerup(state, tank, item.kind);
        }
      }
    } else {
      if (--tank.ai <= 0) { tank.direction = chooseDirection(state, tank); tank.ai = 45 + Math.floor(random(state) * 90); }
      tank.moving = move(state, tank, tank.direction, ENEMY_STATS[tank.kind as Exclude<TankKind, 'player'>].speed + state.stage * 2);
      if (!tank.moving) { tank.ai = 0; fire(state, tank); }
      if (tank.cooldown <= 0 && random(state) < 0.08) fire(state, tank);
    }
  }
  updateBullets(state);
  state.pickups = state.pickups.filter(p => --p.ttl > 0);
  for (let p = 1; p <= state.mode; p++) {
    const player = state.players[p - 1]!;
    if (player.lives <= 0 || state.tanks.some(t => t.player === p)) continue;
    if (player.respawn > 0) { player.respawn--; continue; }
    const tank = createTank(state, 'player', p === 1 ? 144 : 272, 400, p);
    if (canMove(state, tank, tank.x, tank.y)) state.tanks.push(tank);
  }
  if (!state.baseAlive || state.players.every(p => p.lives <= 0)) {
    state.phase = 'gameover'; state.message = state.baseAlive ? '所有坦克已耗尽' : '基地被摧毁'; state.sounds.push('over');
  } else if (state.queue === 0 && !state.tanks.some(t => !t.player)) {
    state.phase = 'cleared'; state.stageTimer = 180; state.sounds.push('clear');
    state.message = state.stage === STAGE_NAMES.length ? '防线守住了！' : '区域肃清 · 即将进入下一关'; state.messageTimer = 180;
    for (const player of state.players) player.score += 1000;
  }
}

// Persist the complete simulation, including RNG and countdowns, for exact resume.
export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const s = value as GameState;
  const integer = (n: unknown, min = 0, max = 1e9): n is number => Number.isInteger(n) && Number(n) >= min && Number(n) <= max;
  const point = (p: { x: number; y: number }) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -16 && p.y >= -16 && p.x <= SIZE + 16 && p.y <= SIZE + 16;
  const direction = (d: unknown) => integer(d, 0, 3);
  if (s.version !== 1 || !integer(s.mode, 1, 2) || !integer(s.stage, 1, 5)
    || !integer(s.seed, 0, 0xffffffff) || !integer(s.tick) || !integer(s.nextId, 1)
    || !['playing', 'paused', 'cleared', 'gameover', 'victory'].includes(s.phase) || typeof s.baseAlive !== 'boolean') return false;
  if (!Array.isArray(s.tiles) || s.tiles.length !== GRID * GRID || !s.tiles.every(t => Object.values(TERRAIN).includes(t))) return false;
  if (!Array.isArray(s.players) || s.players.length !== s.mode || !s.players.every(p => p && integer(p.lives, 0, 9999) && integer(p.score) && integer(p.level, 0, 3) && integer(p.respawn, 0, 90))) return false;
  if (!Array.isArray(s.tanks) || s.tanks.length > 8 || !s.tanks.every(t => point(t) && integer(t.id, 1, s.nextId - 1)
    && ['player', 'scout', 'runner', 'gunner', 'heavy'].includes(t.kind) && integer(t.player, 0, s.mode)
    && (t.kind === 'player') === (t.player > 0) && integer(t.hp, 1, 4) && integer(t.level, 0, 3)
    && direction(t.direction) && typeof t.carrier === 'boolean' && typeof t.moving === 'boolean'
    && integer(t.shield, 0, 600) && integer(t.cooldown, 0, 150) && integer(t.ai, 0, 150) && integer(t.slide, 0, 20))) return false;
  if (new Set(s.tanks.map(t => t.id)).size !== s.tanks.length || new Set(s.tanks.filter(t => t.player).map(t => t.player)).size !== s.tanks.filter(t => t.player).length) return false;
  if (!Array.isArray(s.bullets) || s.bullets.length > 30 || !s.bullets.every(b => point(b) && integer(b.id, 1, s.nextId - 1) && integer(b.owner, 1, s.nextId - 1) && integer(b.player, 0, s.mode) && direction(b.direction) && integer(b.power, 0, 3))) return false;
  if (!Array.isArray(s.pickups) || s.pickups.length > 5 || !s.pickups.every(p => point(p) && integer(p.id, 1, s.nextId - 1) && POWERUPS.includes(p.kind) && integer(p.ttl, 1, 900))) return false;
  if (!Array.isArray(s.effects) || s.effects.length > 100 || !s.effects.every(e => point(e) && ['blast', 'spark', 'spawn'].includes(e.kind) && integer(e.ttl, 1, 40))) return false;
  return integer(s.total, 16, 24) && s.total === 14 + s.stage * 2 && integer(s.queue, 0, s.total)
    && integer(s.spawned, 0, s.total) && s.spawned + s.queue === s.total && integer(s.killed, 0, s.spawned)
    && integer(s.spawnTimer, -1e9, 150) && integer(s.freeze, 0, 600) && integer(s.fortify, 0, 1200)
    && integer(s.stageTimer, 0, 180) && integer(s.messageTimer, 0, 210) && typeof s.message === 'string' && s.message.length < 100
    && Array.isArray(s.sounds) && s.sounds.length <= 100 && s.sounds.every(sound => ['shoot', 'hit', 'explode', 'pickup', 'over', 'clear'].includes(sound));
}
