export const WATER_LEVEL = -365;
export const SPLASH_LIFETIME = .95;
export const RIPPLE_LIFETIME = 2.2;
export type WaterSource = 'ball' | 'fish' | 'leap';
export interface WaterEvent { x:number; y:number; since:number; strength:number; source:WaterSource }

export function entersRiver(x:number, y:number, vy:number):boolean {
  return x > -252 && x < 205 && y <= WATER_LEVEL && vy < 0;
}

/** Fixed event budgets, driven only by the game's pausable simulation clock. */
export class WaterEvents {
  readonly splashes:WaterEvent[]=[];
  readonly ripples:WaterEvent[]=[];
  readonly counts={ball:0,fish:0,leap:0};
  ripple(x:number,y:number,time:number,strength=1,source:WaterSource='leap'):void {
    if(this.ripples.length===8)this.ripples.shift();
    this.ripples.push({x,y,since:time,strength,source});
  }
  splash(x:number,y:number,time:number,strength:number,source:WaterSource):void {
    strength=Math.max(.5,Math.min(1.4,strength));
    if(this.splashes.length===4)this.splashes.shift();
    this.splashes.push({x,y,since:time,strength,source});this.counts[source]++;
    this.ripple(x,y,time,strength,source);
  }
  advance(time:number):void {
    for(const [events,lifetime] of [[this.splashes,SPLASH_LIFETIME],[this.ripples,RIPPLE_LIFETIME]] as const)
      while(events.length && time-events[0]!.since>=lifetime)events.shift();
  }
  reset():void {this.splashes.length=0;this.ripples.length=0;this.counts.ball=0;this.counts.fish=0;this.counts.leap=0;}
}
