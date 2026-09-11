/** Deterministic mining-boss supplies; separate from enemy/asteroid random streams. */
export const BOMB_CRATE_HEALTH = 42;
export const BOMB_CRATE_FIRST_MS = 6000;
export interface BombCrate {
  readonly kind: 'bomb-crate';
  x: number; y: number; previousX: number; previousY: number;
  baseX: number; radius: number; health: number; ageMs: number; flashMs: number;
}
export class SkyStrikeBombCrates {
  readonly crates: BombCrate[] = [];
  private remainingMs = BOMB_CRATE_FIRST_MS;
  private random: () => number = () => 0.5;
  reset(random: () => number): void { this.clear(); this.random = random; }
  clear(): void { this.crates.length = 0; this.remainingMs = BOMB_CRATE_FIRST_MS; }
  spawn(x = 55 + this.random() * 370, y = -36): BombCrate | null {
    if (this.crates.length >= 1) return null;
    const crate: BombCrate = {kind:'bomb-crate',x,y,previousX:x,previousY:y,baseX:x,radius:27,health:BOMB_CRATE_HEALTH,ageMs:0,flashMs:0};
    this.crates.push(crate);return crate;
  }
  update(deltaMs: number, active: boolean, looseBombs: number): void {
    if (!active) { this.clear(); return; }
    const dt = Math.max(0,Math.min(34,deltaMs));
    this.remainingMs -= dt;
    if (this.remainingMs <= 0) {
      if (looseBombs < 2) this.spawn();
      this.remainingMs = 10000 + this.random()*5000;
    }
    for (const c of [...this.crates]) {
      c.previousX=c.x;c.previousY=c.y;c.ageMs+=dt;c.flashMs=Math.max(0,c.flashMs-dt);
      c.y+=62*dt/1000;c.x=c.baseX+Math.sin(c.ageMs*0.0018)*15;
      if(c.y>1000)this.crates.splice(this.crates.indexOf(c),1);
    }
  }
  damage(crate: BombCrate, damage: number): boolean {
    if(!this.crates.includes(crate)||!Number.isFinite(damage)||damage<=0)return false;
    crate.health-=damage;crate.flashMs=110;
    if(crate.health>0)return false;
    this.crates.splice(this.crates.indexOf(crate),1);return true;
  }
  snapshot(){return {count:this.crates.length,nextMs:Math.max(0,this.remainingMs),items:this.crates.map(c=>({x:c.x,y:c.y,health:c.health}))};}
}
