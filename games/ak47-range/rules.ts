import { NavMesh, NavMeshPath } from '@haiyue/engine/navigation';
export interface Point { x: number; z: number }
export interface Actor extends Point { heading: number }
export interface Bullet extends Point { id: number; y: number; dx: number; dz: number; age: number; team: 'player' | 'enemy' }
export interface Obstacle extends Point { width: number; depth: number; height: number }
export interface Enemy extends Actor {
  id: number; health: number; cooldown: number; alert: boolean; memory: number; goal: Point;
  repath: number; path: NavMeshPath; waypoint: number; flash: number;
}
export const MAGAZINE = 30;
export const RELOAD_SECONDS = 2.2;
export const FIRE_INTERVAL = 0.1;
export const BULLET_SPEED = 32;
export const ARENA_LIMIT = 18;
export const SPAWN_SECONDS = 3;
export const SIGHT_RANGE = 26;
export const BODY_RADIUS = 0.35;
export const OBSTACLES: readonly Obstacle[] = [
  { x: -5, z: 0, width: 2.5, depth: 6, height: 2.1 },
  { x: 5, z: -3, width: 2.5, depth: 5, height: 2.1 },
  { x: -3, z: -8, width: 5, depth: 2, height: 2.4 },
  { x: 9, z: 6, width: 5, depth: 2.5, height: 2.2 },
  { x: -9, z: 9, width: 4, depth: 2, height: 2.2 },
  { x: 1, z: 10, width: 2, depth: 4, height: 2.1 },
  { x: -12, z: -7, width: 2, depth: 4, height: 2.5 },
  { x: 10, z: -12, width: 4, depth: 2, height: 2.4 },
];
/** Entry fraction for one of this arena's solid cover volumes; also used for fog rays. */
function coverEntry(a: Point, b: Point, box: Obstacle, padding = 0): number {
  let enter = 0, leave = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.x - box.width / 2 - padding, box.x + box.width / 2 + padding],
    [a.z, b.z - a.z, box.z - box.depth / 2 - padding, box.z + box.depth / 2 + padding],
  ] as const) {
    if (Math.abs(delta) < 1e-10) { if (start < min || start > max) return Infinity; }
    else { const t1 = (min - start) / delta, t2 = (max - start) / delta;
      enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2)); }
    if (enter > leave) return Infinity;
  }
  return enter;
}
function bodyEntry(a: Point, b: Point, body: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, x = a.x - body.x, z = a.z - body.z;
  const aa = dx * dx + dz * dz, cc = x * x + z * z - BODY_RADIUS ** 2;
  if (cc <= 0) return 0;
  const bb = x * dx + z * dz, disc = bb * bb - aa * cc;
  if (disc < 0 || aa === 0) return Infinity;
  const t = (-bb - Math.sqrt(disc)) / aa;
  return t >= 0 && t <= 1 ? t : Infinity;
}
interface StickDirection { readonly strength: number; readonly direction: { readonly x: number; readonly y: number } }
/** Right stick owns facing while held, even at its center. Translation stays with the left stick. */
export function resolvePlayerHeading(current: number, movement: StickDirection, aim: StickDirection & { readonly active: boolean }, dt: number): number {
  if (aim.active) return aim.strength > 0 ? Math.atan2(-aim.direction.x, -aim.direction.y) : current;
  if (movement.strength === 0) return current;
  const desired = Math.atan2(-movement.direction.x, -movement.direction.y);
  const turn = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const step = Math.max(0, Math.min(0.1, dt)) * 14;
  return current + Math.max(-step, Math.min(step, turn));
}
export class RangeRules {
  ammo = MAGAZINE; shots = 0; hits = 0; kills = 0; health = 100; damageEvents = 0;
  firing = false; reloadRemaining = 0; cooldown = 0; time = 0; spawned = 0;
  readonly bullets: Bullet[] = [];
  readonly enemies: Enemy[] = [];
  readonly obstacles = OBSTACLES;
  readonly player: Actor = { x: 0, z: 3, heading: 0 };
  readonly navigation: NavMesh;
  private randomState: number;
  private spawnRemaining = SPAWN_SECONDS;
  private bulletId = 0;
  constructor(seed = 0x42a47) {
    this.randomState = seed >>> 0;
    const walkable = new Uint8Array(40 * 40);
    for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++)
      walkable[z * 40 + x] = this.free({ x: x - 19.5, z: z - 19.5 }, 0.5) ? 1 : 0;
    this.navigation = new NavMesh({ origin: [-20, -20], cellSize: 1, columns: 40, rows: 40,
      heights: new Float32Array(1600), walkable });
  }
  get alive(): boolean { return this.health > 0; }
  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  setFiring(value: boolean): void { this.firing = value && this.alive; }
  reload(): boolean {
    if (!this.alive || this.reloadRemaining > 0 || this.ammo === MAGAZINE) return false;
    this.reloadRemaining = RELOAD_SECONDS; return true;
  }
  coverFraction(a: Point, b: Point): number {
    let t = Infinity;
    for (const box of this.obstacles) t = Math.min(t, coverEntry(a, b, box));
    return t;
  }
  canSee(observer: Actor, point: Point): boolean {
    const x = point.x - observer.x, z = point.z - observer.z, distance = Math.hypot(x, z);
    if (distance > SIGHT_RANGE) return false;
    if (distance > 1e-8 && (-Math.sin(observer.heading) * x - Math.cos(observer.heading) * z) / distance < Math.SQRT1_2 - 1e-9) return false;
    return this.coverFraction(observer, point) >= 1 - 1e-7;
  }
  private free(p: Point, radius = BODY_RADIUS): boolean {
    return Math.abs(p.x) <= ARENA_LIMIT && Math.abs(p.z) <= ARENA_LIMIT &&
      this.obstacles.every(box => Math.abs(p.x - box.x) >= box.width / 2 + radius || Math.abs(p.z - box.z) >= box.depth / 2 + radius);
  }
  move(from: Point, desired: Point): Point {
    const result = { ...from }, dx = desired.x - from.x, dz = desired.z - from.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let i = 0; i < steps; i++) {
      const nx = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, result.x + dx / steps));
      if (this.free({ x: nx, z: result.z })) result.x = nx;
      const nz = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, result.z + dz / steps));
      if (this.free({ x: result.x, z: nz })) result.z = nz;
    }
    return result;
  }
  spawnEnemy(position?: Point): Enemy {
    const edge = Math.floor(this.random() * 4), along = this.random() * 34 - 17;
    const start = position ?? (edge < 2 ? { x: edge ? 17.5 : -17.5, z: along } : { x: along, z: edge === 2 ? -17.5 : 17.5 });
    const enemy: Enemy = { ...start, id: ++this.spawned, health: 3, heading: Math.atan2(start.x, start.z),
      cooldown: 0.6, alert: false, memory: 0, goal: { x: 0, z: 0 }, repath: 0, path: new NavMeshPath(), waypoint: 1, flash: 0 };
    this.enemies.push(enemy); return enemy;
  }
  /** Fixed combat slices and injected seed make visibility, AI, and fire reproducible. */
  step(dt: number, muzzle: Point & { y: number }, heading: number, body: Point = muzzle): void {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be finite and non-negative');
    Object.assign(this.player, body, { heading });
    for (let remaining = Math.min(dt, 0.1); remaining > 1e-9 && this.alive;) {
      const slice = Math.min(remaining, 1 / 120); this.tick(slice, muzzle, heading); remaining -= slice;
    }
  }
  private tick(dt: number, muzzle: Point & { y: number }, heading: number): void {
    this.time += dt; this.spawnRemaining -= dt;
    if (this.spawnRemaining <= 1e-8) {
      this.spawnEnemy();
      this.spawnRemaining += SPAWN_SECONDS;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadRemaining > 0) {
      this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
      if (this.reloadRemaining < 1e-8) { this.reloadRemaining = 0; this.ammo = MAGAZINE; }
    } else if (this.firing && this.ammo > 0 && this.cooldown < 1e-8) {
      this.ammo--; this.shots++; this.cooldown = FIRE_INTERVAL;
      // The hand may put the muzzle through a wall: it cannot fire from the other side.
      if (this.coverFraction(this.player, muzzle) > 1) this.emit(muzzle, heading, 'player');
    }
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]!, next = { x: b.x + b.dx * BULLET_SPEED * dt, z: b.z + b.dz * BULLET_SPEED * dt };
      let first = this.coverFraction(b, next), hit: Enemy | 'player' | null = null;
      if (b.team === 'enemy') {
        const t = bodyEntry(b, next, this.player); if (t < first) { first = t; hit = 'player'; }
      } else for (const enemy of this.enemies) {
        const t = bodyEntry(b, next, enemy); if (enemy.health > 0 && t < first) { first = t; hit = enemy; }
      }
      if (hit === 'player') { this.health = Math.max(0, this.health - 12); this.damageEvents++; }
      else if (hit) { hit.health--; this.hits++; if (hit.health === 0) this.kills++; }
      b.x = next.x; b.z = next.z; b.age += dt;
      if (first <= 1 || b.age > 1.5 || Math.abs(b.x) > 20 || Math.abs(b.z) > 20) this.bullets.splice(i, 1);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i]!.health <= 0) this.enemies.splice(i, 1);
    if (!this.alive) { this.cancel(); this.bullets.length = 0; }
  }
  private emit(muzzle: Point & { y: number }, heading: number, team: Bullet['team']): void {
    this.bullets.push({ id: ++this.bulletId, ...muzzle, dx: -Math.sin(heading), dz: -Math.cos(heading), age: 0, team });
  }
  private updateEnemy(enemy: Enemy, dt: number): void {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt); enemy.flash = Math.max(0, enemy.flash - dt);
    const sees = this.canSee(enemy, this.player), distance = Math.hypot(enemy.x - this.player.x, enemy.z - this.player.z);
    if (sees) {
      if (!enemy.alert) enemy.cooldown = Math.max(enemy.cooldown, 0.6);
      enemy.goal = { x: this.player.x, z: this.player.z }; enemy.memory = 5;
    } else enemy.memory = Math.max(0, enemy.memory - dt);
    enemy.alert = sees;
    if (sees && distance < 13) {
      enemy.heading = Math.atan2(enemy.x - this.player.x, enemy.z - this.player.z);
      if (enemy.cooldown <= 1e-8) { this.emit({ x: enemy.x, z: enemy.z, y: 1.1 }, enemy.heading, 'enemy'); enemy.cooldown = 0.9; enemy.flash = 0.07; }
      return;
    }
    if (Math.hypot(enemy.x - enemy.goal.x, enemy.z - enemy.goal.z) < 0.6) {
      // Search waypoints are independent of the hidden player's position.
      const goal = this.navigation.projectPoint([this.random() * 28 - 14, 0, this.random() * 28 - 14], { radius: BODY_RADIUS });
      if (goal) enemy.goal = { x: goal[0]!, z: goal[2]! };
      enemy.repath = 0;
    }
    enemy.repath -= dt;
    if (enemy.repath <= 0) {
      this.navigation.findPath([enemy.x, 0, enemy.z], [enemy.goal.x, 0, enemy.goal.z], { radius: BODY_RADIUS }, enemy.path);
      enemy.waypoint = 1; enemy.repath = 0.8;
    }
    if (enemy.waypoint >= enemy.path.pointCount) { enemy.heading += dt * 1.2; return; }
    const index = enemy.waypoint * 3, tx = enemy.path.points[index]!, tz = enemy.path.points[index + 2]!;
    const d = Math.hypot(tx - enemy.x, tz - enemy.z);
    if (d < 0.15) { enemy.waypoint++; return; }
    const desiredHeading = Math.atan2(enemy.x - tx, enemy.z - tz);
    const turn = Math.atan2(Math.sin(desiredHeading - enemy.heading), Math.cos(desiredHeading - enemy.heading));
    enemy.heading += Math.max(-dt * 2.8, Math.min(dt * 2.8, turn));
    if (Math.abs(turn) > 0.4) return;
    const step = Math.min(d, dt * 2.0), moved = this.move(enemy, { x: enemy.x + (tx - enemy.x) / d * step, z: enemy.z + (tz - enemy.z) / d * step });
    enemy.x = moved.x; enemy.z = moved.z;
  }
  restart(): void {
    this.health = 100; this.kills = 0; this.time = 0; this.spawned = 0; this.ammo = MAGAZINE;
    this.cooldown = 0; this.reloadRemaining = 0; this.spawnRemaining = SPAWN_SECONDS;
    this.enemies.length = 0; this.bullets.length = 0; this.cancel();
    Object.assign(this.player, { x: 0, z: 3, heading: 0 });
  }
  cancel(): void { this.firing = false; }
}
