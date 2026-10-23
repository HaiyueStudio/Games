/** Deterministic creature choreography in 600 × 900 table coordinates (Y up). */
export const DRAGON = { x:-129, y:287, radius:29, hold:.42, cooldown:1.8 } as const;
export const INK_TARGETS = [{x:-22,y:245},{x:80,y:270},{x:148,y:220}] as const;
export interface DragonState { phase:'idle'|'holding'|'cooldown'; since:number; captures:number; spits:number }
export function newDragon():DragonState{return{phase:'idle',since:0,captures:0,spits:0};}
export function advanceDragon(s:DragonState,time:number,touching:boolean):'capture'|'spit'|null{
 if(s.phase==='cooldown'&&time-s.since>=DRAGON.cooldown)s.phase='idle';
 if(s.phase==='idle'&&touching){s.phase='holding';s.since=time;s.captures++;return'capture';}
 if(s.phase==='holding'&&time-s.since>=DRAGON.hold){s.phase='cooldown';s.since=time;s.spits++;return'spit';}
 return null;
}
export const KOI_DURATION=1.45;
export function koiPose(progress:number){
 const p=Math.max(0,Math.min(1,progress));
 return {lift:210*4*p*(1-p),rotation:-360*p,travel:95*Math.sin(Math.PI*p),opacity:.58+.42*Math.sin(Math.PI*p)};
}
export function toadJump(elapsed:number){return elapsed<0||elapsed>.46?0:Math.sin(elapsed/.46*Math.PI)*38;}
