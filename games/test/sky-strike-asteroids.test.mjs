import test from 'node:test';
import assert from 'node:assert/strict';
import { SkyStrikeAsteroids, MAX_ASTEROIDS, asteroidHealth, miningGrabInterval, sweptCircleTime } from '../sky-strike/asteroids.ts';
import { createSeededRandom } from '../sky-strike/rules.ts';
import { loadSkyStrikeLevels } from '../sky-strike/levels/loader.ts';
import { readFileSync } from 'node:fs';
const ship=()=>({x:240,y:150,hitPoints:3400,definition:{hitPoints:3400},entered:true});
const player={x:240,y:820};
const field=()=>{const f=new SkyStrikeAsteroids();f.reset(createSeededRandom(91));return f;};
test('rocks have deterministic varied silhouettes, size-scaled HP and bounded population',()=>{
 const a=field(),b=field();for(let i=0;i<100;i++){a.spawn();b.spawn();}
 assert.deepEqual(a.rocks,b.rocks);assert.equal(a.rocks.length,MAX_ASTEROIDS);
 assert.equal(new Set(a.rocks.map(r=>r.sprite)).size,3);
 assert.ok(asteroidHealth(108)>asteroidHealth(64));assert.ok(asteroidHealth(64)>asteroidHealth(32));
 const rock=a.rocks[0],hp=rock.health;assert.equal(a.damage(rock,3),false);assert.equal(rock.health,hp-3);
 assert.equal(a.damage(rock,Infinity),false);assert.equal(a.damage(rock,hp),true);assert.ok(!a.rocks.includes(rock));
 for(let i=0;i<3000;i++)a.update(34,false,520,null,player);assert.equal(a.rocks.length,0);
});
test('swept collisions catch tunneling, moving targets, misses and first contact order',()=>{
 const bullet={previousX:100,previousY:900,x:100,y:400,radius:3};
 assert.ok(sweptCircleTime(bullet,{x:100,y:600,radius:20})!==null);
 assert.equal(sweptCircleTime(bullet,{x:150,y:600,radius:20}),null);
 assert.ok(sweptCircleTime(bullet,{x:100,y:750,radius:20})<sweptCircleTime(bullet,{x:100,y:600,radius:20}));
 assert.ok(sweptCircleTime({previousX:0,previousY:0,x:100,y:0,radius:1},{previousX:100,previousY:0,x:0,y:0,radius:1})!==null);
 assert.equal(sweptCircleTime({x:0,y:0,radius:1},{x:0,y:0,radius:1}),0);
 assert.equal(sweptCircleTime({x:0,y:0,radius:1},{x:10,y:0,radius:1}),null);
});
test('four arms acquire real rocks, telegraph then throw toward locked aim; held rocks remain destructible',()=>{
 const f=field(),boss=ship();for(const x of [80,180,300,400])for(const y of [180,260]) {const r=f.spawn(x,y,60);r.vx=r.vy=0;}
 let held=null,windup=null;
 for(let i=0;i<100;i++){f.update(16,false,520,boss,player);held=f.arms.find(a=>a.rock);if(held)break;}
 assert.equal(f.arms.length,4);assert.ok(held);const rock=held.rock;assert.ok(f.rocks.includes(rock));assert.equal(rock.heldBy,held.index);
 for(let i=0;i<30;i++){f.update(16,false,520,boss,player);if(held.phase==='windup'){windup=held;break;}}
 assert.ok(windup);assert.equal(windup.aimX,player.x);
 for(let i=0;i<40&&!rock.thrown;i++)f.update(16,false,520,boss,{x:30,y:800});
 assert.ok(rock.thrown);assert.equal(rock.heldBy,null);assert.ok(rock.vy>0);assert.ok(Math.abs((240-rock.x)*rock.vy-(820-rock.y)*rock.vx)<1e-5);
 const g=field();const r=g.spawn(100,200,50);r.vx=r.vy=0;
 for(let i=0;i<80&&!g.arms.some(a=>a.rock);i++)g.update(16,false,520,boss,player);
 assert.ok(g.arms.some(a=>a.rock===r));g.damage(r,999);assert.ok(g.arms.every(a=>a.rock!==r));
 g.releaseArms();assert.equal(g.arms.length,0);g.clear();assert.equal(g.rocks.length,0);
});
test('health-dependent cadence accelerates grabs and continuous belt remains bounded',()=>{
 assert.equal(miningGrabInterval(3400,3400),2500);assert.equal(miningGrabInterval(0,3400),650);
 const count=hp=>{const f=field(),boss=ship();boss.hitPoints=hp;let throws=0;const seen=new Set();
 for(let i=0;i<1200;i++){if(i%8===0){const r=f.spawn(40+(i%5)*90,170,40);if(r)r.vx=r.vy=0;}
 f.update(16,true,420,boss,player);for(const r of f.rocks)if(r.thrown&&!seen.has(r)){throws++;seen.add(r);}assert.ok(f.rocks.length<=MAX_ASTEROIDS);}
 return throws;};assert.ok(count(340)>count(3400));
});
test('eighth mission loads hazard timing and rejects malformed belt configuration',async()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../sky-strike/'+p,import.meta.url)));
 const levels=await loadSkyStrikeLevels(async p=>read(p));assert.equal(levels.length,8);assert.equal(levels[7].bossId,'ore-reaper');
 assert.ok(levels[7].asteroidBelt.startMs<levels[7].asteroidBelt.endMs);
 for(const patch of [{intervalMs:0},{startMs:-1},{endMs:1},{bossIntervalMs:NaN}])
 await assert.rejects(loadSkyStrikeLevels(async p=>{const l=read(p);if(l.asteroidBelt)Object.assign(l.asteroidBelt,patch);return l;}),/invalid asteroid belt/);
});
