import type { RaceState } from './RaceRules';

export interface FallingFireball {
  id: number; distance: number; lateral: number; age: number; fallTime: number; radius: number; hit: boolean;
}
export const FIREBALL_LIFETIME = .9;
export const MAX_FIREBALLS = 4;
/** Fixed-step, seeded gameplay. A stationary warning precedes every impact; one lane always remains open. */
export class VolcanicHazards {
  readonly balls: FallingFireball[] = [];
  private readonly opponentHits = new Set<number>();
  private randomState: number;
  private next = 1.2;
  private serial = 0;
  private readonly seed: number;
  constructor(seed: number) { this.seed = seed; this.randomState = seed; }
  reset(): void { this.balls.length = 0; this.opponentHits.clear(); this.randomState = this.seed; this.next = 1.2; this.serial = 0; }
  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
  step(before: RaceState, state: RaceState, length: number, dt: number, damageEnabled = true, opponent = false, rival?: RaceState): { state: RaceState; hit: number } {
    if (state.destroyed || state.finished || dt <= 0) return { state, hit: 0 };
    // The first call advances the shared world; the second only tests the rival.
    // Alternate warnings between the two racers, including when one is stationary.
    let target=rival && this.serial%2===1?rival:state;
    if(rival && target.speed<=60)target=target===state?rival:state;
    if (!opponent) this.next -= dt;
    if (!opponent) for(let i=this.balls.length-1;i>=0;i--) if(this.balls[i]!.age>this.balls[i]!.fallTime+FIREBALL_LIFETIME) {
      this.opponentHits.delete(this.balls[i]!.id);this.balls.splice(i,1);
    }
    if (!opponent && this.next <= 0 && target.speed > 60 && this.balls.length < MAX_FIREBALLS) {
      const fallTime = 1.65 + this.random() * .35;
      this.balls.push({ id: ++this.serial, distance: (target.distance + Math.max(240, target.speed * fallTime)) % length,
        lateral: [-52, 0, 52][Math.floor(this.random() * 3)]! + (this.random() - .5) * 8,
        age: 0, fallTime, radius: 25 + this.random() * 8, hit: false });
      this.next = 2.7 + this.random() * 1.2;
    }
    let hit = 0;
    const wrap = (v: number): number => ((v + length / 2) % length + length) % length - length / 2;
    const advance = Math.max(0, wrap(state.distance - before.distance));
    for (const ball of this.balls) {
      const oldAge = opponent ? ball.age - dt : ball.age; if (!opponent) ball.age += dt;
      if ((opponent ? this.opponentHits.has(ball.id) : ball.hit) || ball.age < ball.fallTime || oldAge > ball.fallTime + FIREBALL_LIFETIME) continue;
      // Restrict the swept segment to the active part of this step, including the lap seam.
      const active = Math.max(0, Math.min(1, (ball.fallTime - oldAge) / dt));
      const offset = wrap(ball.distance - before.distance);
      const end=Math.max(active,Math.min(1,(ball.fallTime+FIREBALL_LIFETIME-oldAge)/dt));
      const t = advance > .0001 ? Math.max(active, Math.min(end, offset / advance)) : end;
      const along = Math.abs(offset - advance * t);
      const lateral = before.lateral + (state.lateral - before.lateral) * t;
      const across = lateral - ball.lateral;
      const radius = ball.radius + 9;
      if ((along / (radius * 1.5)) ** 2 + (across / radius) ** 2 < 1) {
        if (opponent) this.opponentHits.add(ball.id); else ball.hit = true;
        const severity = 1 - Math.min(1, Math.hypot(along / 1.5, across) / radius);
        hit = Math.max(hit, .45 + severity * .55);
        const health = damageEnabled ? Math.max(0, state.health - (16 + severity * 20)) : state.health;
        state = { ...state, health, destroyed: health <= 0, speed: state.speed * .62, boostRemaining: 0,
          damageSide: 0, impact: Math.max(state.impact, hit) };
      }
    }
    if(!rival) for (let i = this.balls.length - 1; i >= 0; i--) if (this.balls[i]!.age > this.balls[i]!.fallTime + FIREBALL_LIFETIME) { this.opponentHits.delete(this.balls[i]!.id); this.balls.splice(i, 1); }
    return { state, hit };
  }
}
