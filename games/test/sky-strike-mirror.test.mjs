import test from 'node:test';
import assert from 'node:assert/strict';
import {mirrorHit,mirrorVertices,reflectedVelocity,consumeMirrorBudget,prismShards,PRISM_SHARD_DAMAGE,PRISM_SHARD_STORM_MS} from '../sky-strike/mirrorPrism.ts';
import {ENEMY_DEFINITIONS} from '../sky-strike/rules.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('mirror triangle reflects from its bottom facet and respects corners and swept fast shots',()=>{
 const hull={x:240,y:300,radius:40,rotation:0,sides:3};
 const hit=mirrorHit({x:240,y:800},{x:240,y:150},hull,4);assert.ok(hit);near(hit.y,324);near(hit.nx,0);near(hit.ny,1);
 const v=reflectedVelocity(0,-700,hit.nx,hit.ny);near(v.x,0);near(v.y,700);
 assert.equal(mirrorHit({x:275,y:282},{x:275,y:265},hull),null,'empty triangle corner is not a circular hit box');
 assert.equal(mirrorHit({x:100,y:300},{x:100,y:300},hull),null);
});
test('rotated triangles and hexagons obey specular reflection and preserve speed',()=>{
 for(const sides of [3,6])for(const rotation of [0,.17,.6,1.7,3.2]){
  const hull={x:240,y:300,radius:70,rotation,sides},hit=mirrorHit({x:267,y:900},hull,hull);assert.ok(hit);
  const incoming={x:-27,y:-600},v=reflectedVelocity(incoming.x,incoming.y,hit.nx,hit.ny);
  near(Math.hypot(v.x,v.y),Math.hypot(incoming.x,incoming.y));near(v.x*hit.nx+v.y*hit.ny,-incoming.x*hit.nx-incoming.y*hit.ny);
  near(v.x*(-hit.ny)+v.y*hit.nx,incoming.x*(-hit.ny)+incoming.y*hit.nx);
  assert.equal(mirrorVertices(hull).length,sides);
 }
});
test('reflection budgets are finite, normal mirrors never fire and prism is a distinct boss',()=>{
 let remaining=32;for(let i=0;i<7;i++)remaining=consumeMirrorBudget(remaining,4);assert.equal(remaining,4);remaining=consumeMirrorBudget(remaining,900);assert.equal(remaining,0);
 assert.equal(consumeMirrorBudget(12,Infinity),12);assert.equal(consumeMirrorBudget(12,-4),12);
 const normal=ENEMY_DEFINITIONS.find(e=>e.id==='mirror-triangle'),boss=ENEMY_DEFINITIONS.find(e=>e.id==='crystal-prism');
 assert.equal(normal.bulletPattern,'none');assert.equal(normal.mirrorSides,3);assert.equal(normal.hitPoints,32);assert.equal(boss.mirrorSides,6);assert.equal(boss.bossAttack,'mirror-deploy');
});
test('prism shards are deterministic 90 damage hazards, with a full dodge interval',()=>{
 const shards=prismShards(240,142,.7);assert.deepEqual(shards,prismShards(240,142,.7));assert.equal(shards.length,30);
 assert.ok(shards.every(s=>s.hostile&&s.crystalShard&&s.damage===90&&s.lifeMs===PRISM_SHARD_STORM_MS));assert.equal(PRISM_SHARD_DAMAGE,90);
 assert.ok(shards.some(s=>s.vy>200));assert.ok(shards.some(s=>s.vy<0));assert.ok(PRISM_SHARD_STORM_MS>(960-142)/240*1000);
});
