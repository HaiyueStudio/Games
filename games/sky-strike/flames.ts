/** Deterministic fire simulation. Burning wrecks own their fuse independently of enemy lifetime. */
export interface FireBody { x:number; y:number; radius:number; hitPoints:number; entered:boolean; definition:{tier:string; size:number;renderAspect?:number; flameStyle?:'elite'|'boss'} }
export interface FlameCone { x:number;y:number;angle:number;range:number;minRange?:number;maxRange?:number;halfAngle:number;boss:boolean;warning:boolean;ageMs:number;seed?:number }
export interface FlameNozzle { x:number;y:number;pivotX:number;pivotY:number;angle:number;size:number;boss:boolean;heat:number }
/** Normalized gun mount/art coordinates shared by combat and the level preview. */
export const INFERNO_GUN={pivotX:.165,pivotY:.028,drawScale:.36,pivotV:.12,muzzleV:.93} as const;
export const FLAME_EMIT_MS=50, MAX_FLAME_PACKETS=384;
export const FLAME_SPEED={elite:420,long:520,wide:400} as const;
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
 if(d+p.radius<(cone.minRange??0))return false;
 const relative=Math.atan2(Math.sin(Math.atan2(dy,dx)-cone.angle),Math.cos(Math.atan2(dy,dx)-cone.angle));
 if(Math.abs(relative)<=cone.halfAngle)return true;
 for(const side of [-1,1]){const a=cone.angle+side*cone.halfAngle,along=Math.max(cone.minRange??0,Math.min(cone.range,dx*Math.cos(a)+dy*Math.sin(a)));
  if(Math.hypot(dx-Math.cos(a)*along,dy-Math.sin(a)*along)<=p.radius)return true;}
 return false;
}
export class SkyStrikeFlames<T extends FireBody> {
 private casters=new Map<T,{ageMs:number;angles:number[];cycle:number;emitMs:number}>();
 private packets:(FlameCone&{source:T;speed:number;lifeMs:number})[]=[];
 readonly nozzles:FlameNozzle[]=[];
 private remainderMs=0;
 private ignited=new WeakSet<T>();
 readonly charges:IgnitedHull<T>[]=[];
 cones:FlameCone[]=[];
 burnMs=0;burnDamage=0;
 private tickMs=0;
 clearBurn():void{this.burnMs=0;this.burnDamage=0;this.tickMs=0;}
 clear():void{this.casters.clear();this.packets=[];this.nozzles.length=0;this.remainderMs=0;this.ignited=new WeakSet();this.charges.length=0;this.cones=[];this.clearBurn();}
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
  this.remainderMs+=Math.max(0,deltaMs);
  while(this.remainderMs>=10){const step=10;this.remainderMs-=step;
   for(let i=this.charges.length-1;i>=0;i--){const c=this.charges[i]!;
    if(c.source&&enemies.includes(c.source)&&c.source.hitPoints>0){c.x=c.source.x;c.y=c.source.y;}else c.source=null;
    c.remainingMs-=step;if(c.remainingMs<=0){this.charges.splice(i,1);explosions.push({...c});}
   }
   for(const e of this.casters.keys())if(!enemies.includes(e)||e.hitPoints<=0)this.casters.delete(e);
   this.packets=this.packets.filter(p=>enemies.includes(p.source)&&p.source.hitPoints>0);
   for(const p of this.packets){p.ageMs+=step;p.range=Math.min(p.maxRange!,p.ageMs*p.speed/1000);p.minRange=Math.max(0,(p.ageMs-FLAME_EMIT_MS*2)*p.speed/1000);}
   this.packets=this.packets.filter(p=>p.minRange!<p.maxRange!);
   this.nozzles.length=0;
   for(const e of enemies){if(!e.definition.flameStyle||!e.entered||e.hitPoints<=0)continue;
    const boss=e.definition.flameStyle==='boss',active=boss?2400:1800,cycleLength=active+1600;
    let state=this.casters.get(e);if(!state){state={ageMs:0,angles:boss?[Math.PI/2,Math.PI/2]:[Math.PI/2],cycle:0,emitMs:FLAME_EMIT_MS};this.casters.set(e,state);}
    const emitting=state.ageMs<active;
    const profile=!boss?FIRE_PROFILES.elite:state.cycle%2===0?FIRE_PROFILES.long:FIRE_PROFILES.wide;
    const speed=!boss?FLAME_SPEED.elite:state.cycle%2===0?FLAME_SPEED.long:FLAME_SPEED.wide;
    for(let i=0;i<state.angles.length;i++){
     const pivotX=e.x+(boss?(i===0?-1:1)*e.definition.size*INFERNO_GUN.pivotX:0),pivotY=e.y+(boss?e.definition.size*(e.definition.renderAspect??1)*INFERNO_GUN.pivotY:e.definition.size*.51);
     const target=Math.PI/2+Math.max(-.55,Math.min(.55,Math.atan2(player.y-pivotY,player.x-pivotX)-Math.PI/2));
     const limit=(boss&&profile===FIRE_PROFILES.long&&emitting?NARROW_FLAME_TURN_SPEED:.45)*step/1000;
     state.angles[i]!+=Math.max(-limit,Math.min(limit,target-state.angles[i]!));
     const angle=state.angles[i]!,size=e.definition.size*INFERNO_GUN.drawScale,d=boss?size*(INFERNO_GUN.muzzleV-INFERNO_GUN.pivotV):0,x=pivotX+Math.cos(angle)*d,y=pivotY+Math.sin(angle)*d;
     this.nozzles.push({x,y,pivotX,pivotY,angle,size,boss,heat:emitting?1:.2});
     if(emitting&&state.emitMs>=FLAME_EMIT_MS&&this.packets.length<MAX_FLAME_PACKETS){
      this.packets.push({source:e,x,y,angle,range:speed*.01,minRange:0,maxRange:profile.range,halfAngle:profile.halfAngle,boss,warning:false,ageMs:10,seed:i*.71+state.cycle*1.37,speed,lifeMs:profile.range/speed*1000});
     }
    }
    if(state.emitMs>=FLAME_EMIT_MS)state.emitMs=0;
    state.emitMs+=step;state.ageMs+=step;
    if(state.ageMs>=cycleLength){state.ageMs=0;state.cycle++;state.emitMs=FLAME_EMIT_MS;}
   }
   this.cones=this.packets.map(({source,speed,lifeMs,...cone})=>cone);
   for(const other of enemies)if(other.definition.tier==='normal'&&other.hitPoints>0&&this.cones.some(jet=>jet.boss&&inFlame(jet,other)))this.ignite(other);
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
