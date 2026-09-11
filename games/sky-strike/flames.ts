/** Deterministic fire simulation. Burning wrecks own their fuse independently of enemy lifetime. */
export interface FireBody { x:number; y:number; radius:number; hitPoints:number; entered:boolean; definition:{tier:string; size:number; flameStyle?:'elite'|'boss'} }
export interface FlameCone { x:number;y:number;angle:number;range:number;halfAngle:number;boss:boolean;warning:boolean;ageMs:number }
export interface IgnitedHull<T> { source:T|null;x:number;y:number;remainingMs:number;radius:number }
export const FIRE_TICK_MS=200, BURN_MS=5000, IGNITION_MS=3000, IGNITION_RADIUS=110, IGNITION_DAMAGE=60;
export const NARROW_FLAME_TURN_SPEED=.16, IGNITED_APPROACH_SPEED=60;
/** Burning hulls replace their regular flight path and cannot overshoot the player. */
export function burningApproach(body:{x:number;y:number},target:{x:number;y:number},deltaMs:number):{x:number;y:number}{
 const dx=target.x-body.x,dy=target.y-body.y,d=Math.hypot(dx,dy),step=Math.min(d,IGNITED_APPROACH_SPEED*Math.max(0,deltaMs)/1000);
 return d>0?{x:body.x+dx/d*step,y:body.y+dy/d*step}:{x:body.x,y:body.y};
}
export const FIRE_PROFILES={elite:{range:280,halfAngle:.55,inside:3,burn:1},long:{range:570,halfAngle:.18,inside:5,burn:2},wide:{range:330,halfAngle:.67,inside:5,burn:2}} as const;
/** Circle-sector intersection including radial edges and finite end cap. */
export function inFlame(cone:FlameCone,p:{x:number;y:number;radius:number}):boolean {
 const dx=p.x-cone.x,dy=p.y-cone.y,d=Math.hypot(dx,dy);
 if(d>cone.range+p.radius)return false;
 const relative=Math.atan2(Math.sin(Math.atan2(dy,dx)-cone.angle),Math.cos(Math.atan2(dy,dx)-cone.angle));
 if(Math.abs(relative)<=cone.halfAngle)return true;
 for(const side of [-1,1]){const a=cone.angle+side*cone.halfAngle,along=Math.max(0,Math.min(cone.range,dx*Math.cos(a)+dy*Math.sin(a)));
  if(Math.hypot(dx-Math.cos(a)*along,dy-Math.sin(a)*along)<=p.radius)return true;}
 return false;
}
export class SkyStrikeFlames<T extends FireBody> {
 private casters=new Map<T,{ageMs:number;angle:number;cycle:number}>();
 private ignited=new WeakSet<T>();
 readonly charges:IgnitedHull<T>[]=[];
 cones:FlameCone[]=[];
 burnMs=0;burnDamage=0;
 private tickMs=0;
 clearBurn():void{this.burnMs=0;this.burnDamage=0;this.tickMs=0;}
 clear():void{this.casters.clear();this.ignited=new WeakSet();this.charges.length=0;this.cones=[];this.clearBurn();}
 /** A repeated hit never resets a fuse. The 64-entry cap bounds out-of-view wrecks too. */
 ignite(source:T):void{
  if(this.ignited.has(source)||this.charges.length>=64)return;
  this.ignited.add(source);this.charges.push({source,x:source.x,y:source.y,remainingMs:IGNITION_MS,radius:IGNITION_RADIUS});
 }
 detach(source:T):void{for(const c of this.charges)if(c.source===source){c.x=source.x;c.y=source.y;c.source=null;}}
 isIgnited(source:T):boolean{return this.charges.some(c=>c.source===source);}
 update(deltaMs:number,enemies:readonly T[],player:{x:number;y:number;radius:number},protectedPlayer=false):{damage:number;explosions:IgnitedHull<T>[]} {
  let damage=0;const explosions:IgnitedHull<T>[]=[];
  // Small fixed upper-bound slices prevent frame-size dependent burns and fuse drift.
  for(let remaining=Math.max(0,deltaMs);remaining>0;){const step=Math.min(10,remaining);remaining-=step;
   for(let i=this.charges.length-1;i>=0;i--){const c=this.charges[i]!;
    if(c.source&&enemies.includes(c.source)&&c.source.hitPoints>0){c.x=c.source.x;c.y=c.source.y;}else c.source=null;
    c.remainingMs-=step;if(c.remainingMs<=0){this.charges.splice(i,1);explosions.push({...c});}
   }
   for(const e of this.casters.keys())if(!enemies.includes(e)||e.hitPoints<=0)this.casters.delete(e);
   this.cones=[];
   for(const e of enemies){if(!e.definition.flameStyle||!e.entered||e.hitPoints<=0)continue;
    const boss=e.definition.flameStyle==='boss',warning=boss?1200:900,active=boss?2400:1800,cycleLength=warning+active+1600;
    let state=this.casters.get(e);if(!state){state={ageMs:0,angle:Math.PI/2,cycle:0};this.casters.set(e,state);}
    const x=e.x,y=e.y+e.definition.size*(boss?.30:.41);
    if(state.ageMs===0){state.angle=Math.PI/2+Math.max(-.55,Math.min(.55,Math.atan2(player.y-y,player.x-x)-Math.PI/2));}
    state.ageMs+=step;
    if(state.ageMs>=cycleLength){state.ageMs=0;state.cycle++;}
    if(state.ageMs>=warning+active)continue;
    const profile=!boss?FIRE_PROFILES.elite:state.cycle%2===0?FIRE_PROFILES.long:FIRE_PROFILES.wide;
    if(boss&&profile===FIRE_PROFILES.long&&state.ageMs>=warning){
     const target=Math.PI/2+Math.max(-.55,Math.min(.55,Math.atan2(player.y-y,player.x-x)-Math.PI/2));
     const limit=NARROW_FLAME_TURN_SPEED*step/1000;
     state.angle+=Math.max(-limit,Math.min(limit,target-state.angle));
    }
    const cone={x,y,angle:state.angle,range:profile.range,halfAngle:profile.halfAngle,boss,warning:state.ageMs<warning,ageMs:state.ageMs};
    const jets=boss?[-1,1].map(side=>({...cone,x:x+side*e.definition.size*.19})):[cone];
    this.cones.push(...jets);
    if(boss&&!cone.warning)for(const other of enemies)if(other.definition.tier==='normal'&&other.hitPoints>0&&jets.some(jet=>inFlame(jet,other)))this.ignite(other);
   }
   if(protectedPlayer){this.clearBurn();continue;}
   let inside=0,burn=0;
   for(const cone of this.cones)if(!cone.warning&&inFlame(cone,player)){inside=Math.max(inside,cone.boss?5:3);burn=Math.max(burn,cone.boss?2:1);}
   if(inside){this.burnMs=BURN_MS;this.burnDamage=Math.max(this.burnDamage,burn);}
   if(inside||this.burnMs>0){this.tickMs+=step;while(this.tickMs>=FIRE_TICK_MS){this.tickMs-=FIRE_TICK_MS;damage+=inside||this.burnDamage;}}
   if(!inside){this.burnMs=Math.max(0,this.burnMs-step);if(this.burnMs===0)this.clearBurn();}
  }
  return {damage,explosions};
 }
 snapshot(){return {burnMs:this.burnMs,burnDamage:this.burnDamage,cones:this.cones.map(c=>({...c})),charges:this.charges.map(c=>({x:c.x,y:c.y,remainingMs:c.remainingMs,radius:c.radius,wreck:!c.source}))};}
}
