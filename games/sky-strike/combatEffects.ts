import type { SkyStrikeBattleLayer } from './battleLayer';

interface Point { x: number; y: number }
interface MuzzleFlash { source: Point; dx: number; dy: number; angle: number; color: string; age: number; duration: number; width: number; length: number }
interface Detonation extends Point { age: number; size: number }
export const BOSS_BLAST_MS = 1400;
/** Pure, bounded envelope: no gameplay random stream or wall-clock dependency. */
export function bossShake(age: number): Point {
  if (age < 0 || age >= BOSS_BLAST_MS) return { x: 0, y: 0 };
  const strength = 14 * (1 - age / BOSS_BLAST_MS) ** 2;
  return { x: Math.cos(age * 0.091) * strength, y: Math.sin(age * 0.073 + 0.8) * strength * 0.78 };
}
/** Only visual state; collision bounds, timings and bullet velocities remain owned by game rules. */
export class SkyStrikeCombatEffects {
  private readonly flashes: MuzzleFlash[] = [];
  private readonly detonations: Detonation[] = [];
  shot(source: Point, dx: number, dy: number, vx: number, vy: number, color: string, form: string): void {
    if (this.flashes.length >= 96) this.flashes.shift();
    this.flashes.push({ source, dx, dy, angle: Math.atan2(vy,vx)-Math.PI/2, color, age: 0,
      duration: form === 'red' ? 150 : 105, width: form === 'red' ? 23 : form === 'blue' ? 12 : 17, length: form === 'blue' ? 42 : 30 });
  }
  detonate(x: number, y: number, size: number): void {
    if (this.detonations.length >= 4) this.detonations.shift();
    this.detonations.push({ x,y,size,age:0 });
  }
  update(delta: number): void {
    for (let i=this.flashes.length-1;i>=0;i--) { const f=this.flashes[i]!; f.age+=delta; if(f.age>=f.duration)this.flashes.splice(i,1); }
    for (let i=this.detonations.length-1;i>=0;i--) { const d=this.detonations[i]!; d.age+=delta; if(d.age>=BOSS_BLAST_MS)this.detonations.splice(i,1); }
  }
  clear(): void { this.flashes.length=0; this.detonations.length=0; }
  snapshot() { return { muzzleFlashes:this.flashes.length, detonations:this.detonations.length, shake:this.shake() }; }
  shake(): Point {
    const result = { x:0,y:0 };
    for (const d of this.detonations) { const s=bossShake(d.age); result.x+=s.x;result.y+=s.y; }
    return { x:Math.max(-16,Math.min(16,result.x)), y:Math.max(-16,Math.min(16,result.y)) };
  }
  draw(r: SkyStrikeBattleLayer): void {
    for (const f of this.flashes) {
      const p=1-f.age/f.duration, x=f.source.x+f.dx,y=f.source.y+f.dy;
      const length=f.length*(0.45+p*0.55), dx=-Math.sin(f.angle),dy=Math.cos(f.angle);
      r.sprite('assets/fx-flame.png',x+dx*length*0.45,y+dy*length*0.45,f.width*(0.7+p*0.3),length,f.angle,p,f.color,true);
      r.glow(x,y,10*p+3,f.color,p); r.disc(x,y,2.5*p,'#ffffff',p);
    }
    for (const d of this.detonations) {
      const t=d.age/BOSS_BLAST_MS, fade=(1-t)**2;
      r.ring(d.x,d.y,d.size*0.16+t*380,'#ffa45e',fade);
      if(t>0.08)r.ring(d.x,d.y,d.size*0.12+(t-0.08)*300,'#91eeff',fade*0.6,0.65);
      r.glow(d.x,d.y,d.size*(0.55+t*0.5),'#ff9138',Math.max(0,1-t*3));
      r.glow(d.x,d.y,d.size*0.32,'#fff2cc',Math.max(0,1-t*8));
    }
  }
}
