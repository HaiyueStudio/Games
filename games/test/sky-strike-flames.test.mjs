import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SkyStrikeFlames,inFlame,FIRE_PROFILES,IGNITION_MS,burningApproach,NARROW_FLAME_TURN_SPEED,IGNITED_APPROACH_SPEED} from '../sky-strike/flames.ts';
import {loadSkyStrikeLevels} from '../sky-strike/levels/loader.ts';
const body=(style='elite')=>({x:240,y:100,radius:20,entered:true,hitPoints:180,definition:{tier:style==='boss'?'boss':style==='normal'?'normal':'elite',size:100,...(style==='normal'?{}:{flameStyle:style})}});
const player={x:240,y:260,radius:8},safe={x:470,y:900,radius:8};
test('narrow active flame tracks gradually, while warning and wide flame retain aim',()=>{
 const f=new SkyStrikeFlames(),e=body('boss'),right={x:470,y:350,radius:8},left={x:10,y:350,radius:8};
 f.update(500,[e],player,true);const warning=f.cones[0].angle;f.update(500,[e],right,true);assert.equal(f.cones[0].angle,warning);
 f.update(200,[e],player,true);const start=f.cones[0].angle;f.update(1000,[e],right,true);
 const turned=f.cones[0].angle;assert.ok(turned<start);assert.ok(Math.abs(turned-start)<=NARROW_FLAME_TURN_SPEED+1e-9);
 f.update(100,[e],left,true);assert.ok(f.cones[0].angle>turned);assert.ok(f.cones[0].angle-turned<=NARROW_FLAME_TURN_SPEED*.1+1e-9);
 f.update(4200,[e],player,true);assert.equal(f.cones[0].range,FIRE_PROFILES.wide.range);
 const wide=f.cones[0].angle;f.update(600,[e],right,true);assert.equal(f.cones[0].angle,wide);
});
test('burning approach is bounded, partition-independent, and stops at the target',()=>{
 const from={x:30,y:40},to={x:300,y:400},next=burningApproach(from,to,1000);
 assert.ok(Math.abs(Math.hypot(next.x-from.x,next.y-from.y)-IGNITED_APPROACH_SPEED)<1e-9);
 let divided=from;for(let i=0;i<10;i++)divided=burningApproach(divided,to,100);
 assert.ok(Math.hypot(divided.x-next.x,divided.y-next.y)<1e-9);
 assert.deepEqual(burningApproach(from,to,100000),to);assert.deepEqual(burningApproach(to,to,100),to);
});
test('only live armed hulls chase; detachment keeps the original remaining fuse',()=>{
 const f=new SkyStrikeFlames(),e=body('normal');assert.equal(f.isIgnited(e),false);f.ignite(e);assert.equal(f.isIgnited(e),true);
 f.update(500,[e],safe);const remaining=f.charges[0].remainingMs;f.detach(e);assert.equal(f.isIgnited(e),false);assert.equal(f.charges[0].remainingMs,remaining);
});
test('finite flame sectors handle edges, origin, end cap and behind nozzle',()=>{
 const c={x:0,y:0,angle:Math.PI/2,range:100,halfAngle:.3};
 assert.ok(inFlame(c,{x:0,y:90,radius:4}));assert.ok(inFlame(c,{x:0,y:103,radius:4}));
 assert.ok(!inFlame(c,{x:0,y:105,radius:4}));assert.ok(!inFlame(c,{x:0,y:-20,radius:4}));
 assert.ok(inFlame(c,{x:0,y:0,radius:4}));assert.ok(!inFlame(c,{x:70,y:60,radius:4}));
});
test('elite telegraphs, deals 3 per 200ms inside, then exactly 25 burn damage over five seconds',()=>{
 const f=new SkyStrikeFlames(),e=body();assert.equal(f.update(890,[e],player).damage,0);
 assert.equal(f.update(200,[e],player).damage,3);
 let damage=0;for(let i=0;i<25;i++)damage+=f.update(200,[],safe).damage;
 assert.equal(damage,25);assert.equal(f.burnMs,0);assert.equal(f.update(2000,[],safe).damage,0);
});
test('overlapping flames use strongest damage, bosses alternate long/narrow and short/wide',()=>{
 const f=new SkyStrikeFlames(),e=body('boss'),elite=body();f.update(1190,[e,elite],player);f.clearBurn();
 assert.equal(f.update(200,[e,elite],player).damage,5);
 assert.equal(f.cones.find(c=>c.boss).range,FIRE_PROFILES.long.range);
 f.update(4000,[e],safe);assert.equal(f.cones[0].range,FIRE_PROFILES.wide.range);
 assert.ok(FIRE_PROFILES.wide.halfAngle>FIRE_PROFILES.long.halfAngle);
});
test('ignited fighter explodes at three seconds even after being shot down; repeated hits cannot postpone it',()=>{
 const f=new SkyStrikeFlames(),e=body('normal');f.ignite(e);f.update(1000,[e],safe);f.ignite(e);
 assert.equal(f.charges.length,1);e.x=300;f.detach(e);e.hitPoints=0;
 assert.equal(f.update(1990,[],safe).explosions.length,0);
 const result=f.update(10,[],safe);assert.equal(result.explosions.length,1);assert.equal(result.explosions[0].x,300);assert.equal(result.explosions[0].source,null);
 assert.equal(f.update(IGNITION_MS,[],safe).explosions.length,0);
});
test('only active Boss flame ignites normal hulls; elite fire and warning do not',()=>{
 for(const style of ['elite','boss']){
  const f=new SkyStrikeFlames(),e=body(style),small=body('normal');small.y=250;
  f.update(880,[e,small],safe);assert.equal(f.charges.length,0);
  f.update(600,[e,small],player);assert.equal(f.charges.length,style==='boss'?1:0);
 }
});
test('respawn protection prevents both contact and residual burn; reset clears owned hazards',()=>{
 const f=new SkyStrikeFlames(),e=body();f.update(1000,[e],player);assert.ok(f.burnMs>0);
 assert.equal(f.update(200,[e],player,true).damage,0);assert.equal(f.burnMs,0);
 f.ignite(body('normal'));f.clear();assert.deepEqual(f.snapshot(),{burnMs:0,burnDamage:0,cones:[],charges:[]});
});
test('fixed elapsed time preserves fuse and tick damage across frame partitions',()=>{
 const simulate=step=>{const f=new SkyStrikeFlames(),e=body(),small=body('normal');f.ignite(small);let damage=0,count=0;
  for(let time=0;time<3600;time+=step){const r=f.update(Math.min(step,3600-time),[e,small],player);damage+=r.damage;count+=r.explosions.length;}return {damage,count};};
 assert.deepEqual(simulate(10),simulate(20));assert.deepEqual(simulate(10),simulate(16));
});
test('mission 11 precedes mission 12 with flame elites and a flame boss',async()=>{
 const levels=await loadSkyStrikeLevels(p=>JSON.parse(readFileSync(new URL('../sky-strike/'+p,import.meta.url))));
 assert.equal(levels.length,12);assert.equal(levels[10].number,11);assert.equal(levels[10].bossId,'inferno-ark');assert.equal(levels[11].number,12);
 assert.ok(levels[10].spawns.some(s=>s.enemyId==='cinder-elite'));
});
