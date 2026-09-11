import test from 'node:test';import assert from 'node:assert/strict';
import {SkyStrikeBlackHole,advancePlayer,BLACK_HOLE_CAPACITY,BLACK_HOLE_ABSORPTION_SCALE,BLACK_HOLE_GROWTH_PER_SECOND,BLACK_HOLE_BLAST_RADIUS,BLACK_HOLE_MAX_Y,PLAYER_DRAG_MAX_SPEED} from '../sky-strike/blackHole.ts';
import {asteroidHealth} from '../sky-strike/asteroids.ts';
const advance=(h,ms)=>{let blasts=0;while(ms>0){const dt=Math.min(16,ms);blasts+=Number(h.update(dt));ms-=dt;}return blasts;};
test('absorption is reduced 70 percent and size grows continuously even after a large body',()=>{
 const h=new SkyStrikeBlackHole();h.reset(true);h.absorb(90);h.absorb(Infinity);assert.equal(h.mass,0);assert.equal(h.radius,22);
 let previous=h.radius;for(let i=0;i<200;i++){h.update(16);assert.ok(h.radius>=previous);assert.ok(h.radius-previous<=76/BLACK_HOLE_CAPACITY*BLACK_HOLE_GROWTH_PER_SECOND*.016+1e-9);previous=h.radius;}
 assert.equal(h.mass,90*BLACK_HOLE_ABSORPTION_SCALE);assert.ok(h.influence>160);
 h.absorb(999999);previous=h.radius;h.update(16);assert.ok(h.radius-previous<.1);assert.equal(h.phase,'feeding');
});
test('warning starts after continuous growth finishes and lasts two seconds, then one bounded wave',()=>{
 const h=new SkyStrikeBlackHole();h.reset(true);h.absorb(BLACK_HOLE_CAPACITY/BLACK_HOLE_ABSORPTION_SCALE);
 while(h.phase==='feeding')h.update(16);
 assert.equal(h.mass,BLACK_HOLE_CAPACITY);assert.equal(h.radius,98);const xy=[h.x,h.y];assert.equal(advance(h,1999),0);assert.equal(h.phase,'warning');assert.deepEqual([h.x,h.y],xy);assert.equal(advance(h,1),1);assert.equal(h.phase,'wave');assert.equal(advance(h,3200),0);assert.equal(h.phase,'spent');h.reset();assert.equal(h.mass,0);assert.equal(h.snapshot().absorbedMass,0);assert.equal(h.phase,'inactive');
});
test('blast is a center-relative circle and the hole stays above 40 percent screen height',()=>{
 const h=new SkyStrikeBlackHole();h.reset(true);
 for(let i=0;i<20000;i++){h.update(34);assert.ok(h.y<=BLACK_HOLE_MAX_Y);}
 for(const a of [0,.7,1.6,3,4.8]){assert.ok(h.inBlast({x:h.x+Math.cos(a)*(BLACK_HOLE_BLAST_RADIUS-.01),y:h.y+Math.sin(a)*(BLACK_HOLE_BLAST_RADIUS-.01)}));assert.ok(!h.inBlast({x:h.x+Math.cos(a)*(BLACK_HOLE_BLAST_RADIUS+.01),y:h.y+Math.sin(a)*(BLACK_HOLE_BLAST_RADIUS+.01)}));}
 assert.ok(h.inBlast({x:h.x,y:h.y+470}));assert.ok(!h.inBlast({x:h.x+220,y:h.y+470}));
});
test('both bullet directions curve into a spiral, and passive time alone never feeds the hole',()=>{
 for(const vy of [-700,400]){const h=new SkyStrikeBlackHole();h.reset(true);h.absorb(180);advance(h,4000);const b={x:320,y:230,vx:0,vy,radius:4};let swallowed=false;
 for(let i=0;i<1600;i++){h.bend(b,16);b.x+=b.vx*.016;b.y+=b.vy*.016;if(h.contains(b)){swallowed=true;break;}}assert.ok(swallowed);assert.equal(h.mass,54);}
 const h=new SkyStrikeBlackHole();h.reset(true);advance(h,30000);assert.equal(h.mass,0);assert.ok(h.x>=148&&h.x<=332&&h.y>=132&&h.y<=228);
});
test('drag tracking is speed bounded, follows gradually and gravity accelerates approach while resisting escape',()=>{
 const p={x:240,y:500},near={x:240,y:300},away={x:240,y:800},force={x:0,y:-100};
 const a=advancePlayer(p,near,{x:0,y:0},force,16),b=advancePlayer(p,away,{x:0,y:0},force,16);
 assert.ok(p.y-a.y>b.y-p.y);assert.ok(Math.hypot(a.x-p.x,a.y-p.y)<=PLAYER_DRAG_MAX_SPEED*.016);assert.ok(a.y>near.y);
 let q={...p};for(let i=0;i<600;i++)q=advancePlayer(q,near,{x:0,y:0},{x:0,y:0},16);assert.ok(Math.abs(q.y-near.y)<.01);
});
test('asteroid hit points are reduced 15 percent across all sizes',()=>{for(const size of [32,48,64,80,108])assert.equal(asteroidHealth(size),Math.round(size*size*.018*.85));});

test('small singularity drains near-core orbits rather than accumulating permanent bullets',()=>{
 for(const vy of [-700,400]){const h=new SkyStrikeBlackHole();h.reset(true);const b={x:h.x+38,y:h.y+8,vx:0,vy,radius:3};let caught=false;
 for(let i=0;i<1000;i++){h.bend(b,16);b.x+=b.vx*.016;b.y+=b.vy*.016;if(h.contains(b)){caught=true;break;}}assert.ok(caught);assert.equal(h.mass,0);}
});
