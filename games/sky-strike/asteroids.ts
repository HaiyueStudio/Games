/** Deterministic neutral hazards and mining arm state. No renderer or platform dependency. */
export const MAX_ASTEROIDS = 28;
export const ASTEROID_CONTACT_DAMAGE = 100;
export const ASTEROID_SPRITES = ['asteroid-iron', 'asteroid-copper', 'asteroid-ice'] as const;
export interface MovingCircle { x: number; y: number; radius: number; previousX?: number; previousY?: number }
export interface Asteroid extends MovingCircle {
  readonly kind: 'asteroid';
  readonly sprite: string;
  readonly size: number;
  readonly maxHealth: number;
  health: number;
  vx: number; vy: number; rotation: number; spin: number;
  heldBy: number | null;
  thrown: boolean;
  flashMs: number;
}
export interface MiningShip { x: number; y: number; hitPoints: number; definition: { hitPoints: number }; entered: boolean }
export interface MiningArm {
  index: number;
  phase: 'idle' | 'reach' | 'windup' | 'recover';
  ageMs: number;
  x: number; y: number; startX: number; startY: number;
  rock: Asteroid | null;
  aimX: number; aimY: number;
}
export function asteroidHealth(size: number): number { return Math.round(Math.max(32, Math.min(108, size)) ** 2 * 0.018); }
export function miningGrabInterval(health: number, maxHealth: number): number {
  return 650 + 1850 * Math.max(0, Math.min(1, maxHealth > 0 ? health / maxHealth : 0));
}
/** First contact within a frame, including the relative motion of two fast objects. */
export function sweptCircleTime(a: MovingCircle, b: MovingCircle): number | null {
  const x = (a.previousX ?? a.x) - (b.previousX ?? b.x), y = (a.previousY ?? a.y) - (b.previousY ?? b.y);
  const dx = a.x - b.x - x, dy = a.y - b.y - y, radius = a.radius + b.radius;
  const c = x*x + y*y - radius*radius;
  if (c <= 0) return 0;
  const aa = dx*dx + dy*dy, bb = 2*(x*dx + y*dy), discriminant = bb*bb - 4*aa*c;
  if (aa < 1e-10 || discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / (2*aa);
  return t >= 0 && t <= 1 ? t : null;
}
export function armSocket(ship: MiningShip, index: number) {
  return { x: ship.x + (index % 2 ? 1 : -1) * 108, y: ship.y + (index < 2 ? -52 : 26) };
}
function armRest(ship: MiningShip, index: number) {
  const socket = armSocket(ship, index);
  return { x: Math.max(24, Math.min(456, socket.x + (index % 2 ? 1 : -1) * 62)), y: socket.y + 86 };
}
export class SkyStrikeAsteroids {
  readonly rocks: Asteroid[] = [];
  readonly arms: MiningArm[] = [];
  private spawnMs = 0;
  private grabMs = 900;
  private nextArm = 0;
  private random: () => number = () => 0.5;
  reset(random: () => number): void {
    this.clear(); this.random = random;
  }
  clear(): void { this.rocks.length = 0; this.arms.length = 0; this.spawnMs = 0; this.grabMs = 900; this.nextArm = 0; }
  spawn(x?: number, y?: number, size?: number): Asteroid | null {
    if (this.rocks.length >= MAX_ASTEROIDS) return null;
    const diameter = Math.max(32, Math.min(108, size ?? 32 + this.random() ** 1.2 * 76));
    const rock: Asteroid = { kind: 'asteroid', sprite: ASTEROID_SPRITES[Math.floor(this.random()*ASTEROID_SPRITES.length)]!,
      size: diameter, radius: diameter * 0.37, x: x ?? 28 + this.random()*424, y: y ?? -diameter,
      maxHealth: asteroidHealth(diameter), health: asteroidHealth(diameter), vx: (this.random()-0.5)*28,
      vy: 64 + this.random()*52, rotation: this.random()*Math.PI*2, spin: (this.random()-0.5)*1.3,
      heldBy: null, thrown: false, flashMs: 0 };
    rock.previousX = rock.x; rock.previousY = rock.y;
    this.rocks.push(rock); return rock;
  }
  damage(rock: Asteroid, damage: number): boolean {
    if (!this.rocks.includes(rock)) return false;
    rock.health -= Math.max(0, Number.isFinite(damage) ? damage : 0); rock.flashMs = 95;
    if (rock.health > 0) return false;
    this.remove(rock); return true;
  }
  remove(rock: Asteroid): void {
    const index = this.rocks.indexOf(rock); if (index < 0) return;
    this.rocks.splice(index, 1); rock.heldBy = null;
    for (const arm of this.arms) if (arm.rock === rock) { arm.rock = null; arm.phase = 'recover'; arm.ageMs = 0; }
  }
  releaseArms(): void {
    for (const arm of this.arms) if (arm.rock) { arm.rock.heldBy = null; arm.rock.vx = 0; arm.rock.vy = 90; }
    this.arms.length = 0;
  }
  update(deltaMs: number, active: boolean, intervalMs: number, boss: MiningShip | null, player: {x:number;y:number}): void {
    const dt = Math.max(0, Math.min(34, deltaMs)), seconds = dt/1000;
    if (active) {
      this.spawnMs -= dt;
      if (this.spawnMs <= 0) { this.spawn(); this.spawnMs += intervalMs; }
    } else this.spawnMs = 0;
    for (const rock of [...this.rocks]) {
      rock.previousX = rock.x; rock.previousY = rock.y;
      rock.flashMs = Math.max(0, rock.flashMs - dt);
      rock.rotation += rock.spin*seconds;
      if (rock.heldBy === null) { rock.x += rock.vx*seconds; rock.y += rock.vy*seconds; }
      if (rock.y > 960 + rock.size || rock.y < -220 || rock.x < -120 || rock.x > 600) this.remove(rock);
    }
    if (!boss || boss.hitPoints <= 0) { this.releaseArms(); return; }
    if (!this.arms.length) for (let i=0;i<4;i++) {
      const p = armRest(boss,i);
      this.arms.push({ index:i, phase:'idle', ageMs:0, ...p, startX:p.x, startY:p.y, rock:null, aimX:player.x, aimY:player.y });
    }
    if (boss.entered) {
      // Normalized cadence responds immediately to damage, even part way through a cooldown.
      this.grabMs -= dt * 2500 / miningGrabInterval(boss.hitPoints, boss.definition.hitPoints);
      if (this.grabMs <= 0) {
        for (let n=0;n<4;n++) {
          const arm = this.arms[(this.nextArm+n)%4]!;
          if (arm.phase !== 'idle') continue;
          const socket = armSocket(boss, arm.index);
          const candidates = this.rocks.filter(rock => rock.heldBy === null && !rock.thrown && rock.y > 35
            && rock.y < boss.y+260 && Math.hypot(rock.x-socket.x,rock.y-socket.y)<245);
          const rock = candidates[Math.floor(this.random()*candidates.length)];
          if (!rock) continue;
          arm.rock = rock; rock.heldBy = arm.index; arm.phase = 'reach'; arm.ageMs = 0;
          arm.startX = arm.x; arm.startY = arm.y; this.nextArm = (arm.index+1)%4;
          this.grabMs += 2500; break;
        }
        if (this.grabMs <= 0) this.grabMs = 180;
      }
    }
    for (const arm of this.arms) {
      arm.ageMs += dt;
      const rest = armRest(boss,arm.index), rock = arm.rock;
      if (arm.phase === 'idle' || arm.phase === 'recover') {
        const blend = Math.min(1,dt/100); arm.x += (rest.x-arm.x)*blend; arm.y += (rest.y-arm.y)*blend;
        if (arm.ageMs >= 280) arm.phase = 'idle';
      } else if (rock && arm.phase === 'reach') {
        const t = Math.min(1,arm.ageMs/260), ease = t*t*(3-2*t);
        arm.x = arm.startX+(rock.x-arm.startX)*ease; arm.y = arm.startY+(rock.y-arm.startY)*ease;
        if (t===1) { arm.phase='windup';arm.ageMs=0;arm.startX=arm.x;arm.startY=arm.y;arm.aimX=player.x;arm.aimY=player.y; }
      } else if (rock && arm.phase === 'windup') {
        const t = Math.min(1,arm.ageMs/520), ease = t*t*(3-2*t);
        arm.x = arm.startX+(rest.x-arm.startX)*ease; arm.y = arm.startY+(rest.y-24-arm.startY)*ease;
        rock.x=arm.x;rock.y=arm.y;
        if (t===1) {
          const dx=arm.aimX-rock.x,dy=arm.aimY-rock.y,length=Math.max(1,Math.hypot(dx,dy));
          const speed=490+(1-Math.max(0,boss.hitPoints/boss.definition.hitPoints))*190;
          rock.vx=dx/length*speed;rock.vy=dy/length*speed;rock.thrown=true;rock.heldBy=null;rock.spin*=3;
          arm.rock=null;arm.phase='recover';arm.ageMs=0;
        }
      }
    }
  }
  snapshot() { return { count:this.rocks.length, thrown:this.rocks.filter(r=>r.thrown).length,
    arms:this.arms.map(a=>({phase:a.phase,x:a.x,y:a.y,holding:!!a.rock})) }; }
}
