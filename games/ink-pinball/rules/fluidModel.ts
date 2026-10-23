/** Table-space emitters, kept separate from the GPU fluid solver. */
export const MAX_SPLATS = 24;
export interface InkSplat { x: number; y: number; vx: number; vy: number; radius: number; ink: number; swirl: number }
export function fluidQuality(compact: boolean) {
  return compact ? { width: 128, height: 192, iterations: 8, hz: 30 } : { width: 192, height: 288, iterations: 12, hz: 60 };
}
export class InkSources {
  readonly pending: InkSplat[] = [];
  private previous: { x: number; y: number; time: number } | null = null;
  emitted = 0; impacts = 0;
  add(splat: InkSplat): void {
    if (this.pending.length >= MAX_SPLATS) this.pending.shift();
    this.pending.push(splat); this.emitted++;
  }
  sample(time: number, x: number, y: number, playing: boolean): void {
    if (!playing) { this.previous = null; return; }
    const last = this.previous;
    if (!last) { this.previous = { x, y, time }; return; }
    const distance = Math.hypot(x-last.x, y-last.y), dt = time-last.time;
    if (distance > 70 || dt <= 0) { this.previous = { x, y, time }; return; }
    if (distance < 5) return;
    this.previous = { x, y, time };
    const count = Math.min(4, Math.ceil(distance / 10));
    for(let i=1;i<=count;i++) this.add({ x:last.x+(x-last.x)*i/count, y:last.y+(y-last.y)*i/count,
      vx:(x-last.x)/dt*.28, vy:(y-last.y)/dt*.28, radius:10, ink:.26, swirl:28 });
  }
  impact(x: number, y: number, strength = 1): void {
    this.impacts++;
    this.add({ x,y,vx:0,vy:0,radius:21,ink:.8*strength,swirl:95 });
    for(let i=0;i<6;i++) {
      const angle=i*Math.PI/3 + this.impacts*.61;
      const dx=Math.cos(angle),dy=Math.sin(angle);
      this.add({ x:x+dx*12,y:y+dy*12,vx:dx*150,vy:dy*150,radius:7,ink:.34*strength,swirl:i%2?45:-45 });
    }
  }
  reset(): void { this.pending.length=0; this.previous=null; this.emitted=0; this.impacts=0; }
}
