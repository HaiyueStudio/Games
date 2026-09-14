import test from 'node:test';
import assert from 'node:assert/strict';
import { WindshieldDamage } from '../neon-circuit/WindshieldDamage.ts';
import { CIRCUITS,circuitTrack,createInitialRaceState,stepRace,RAIL_LIMIT,frameTurn } from '../neon-circuit/RaceRules.ts';
test('rail impacts label the visible left/right side, including inverted road frames',()=>{
 for(const id of ['neon-city','mobius-ring'])for(const distance of [0,.5])for(const side of [-1,1]){
  const track=circuitTrack(CIRCUITS.find(c=>c.id===id));
  const initial={...createInitialRaceState(),distance:track.length*distance,speed:650,lateral:side*RAIL_LIMIT,lateralSpeed:side*500,headingOffset:side*.7};
  const result=stepRace(track,initial,{throttle:1,brake:0,steer:0},1/120);
  assert.ok(result.events.includes('wall'));assert.equal(result.state.damageSide,-side);
  const damage=new WindshieldDamage(77);damage.update(result.state.health,result.state.damageSide);
  assert.ok(damage.clusters.every(c=>c.side===-side && (c.side<0?c.x<.25:c.x>.75)));
 }
});
test('successive impacts vary fracture centres/seeds and only add cracks on their hit side',()=>{
 const a=new WindshieldDamage(22),b=new WindshieldDamage(22);
 for(const [health,side] of [[85,-1],[70,-1],[52,1],[33,1]]){a.update(health,side);b.update(health,side);}
 assert.deepEqual(a.snapshot,b.snapshot);assert.deepEqual(a.clusters.map(c=>c.side),[-1,-1,1,1]);
 assert.equal(new Set(a.clusters.map(c=>`${c.x},${c.y},${c.seed}`)).size,4);
 const revision=a.revision;for(let i=0;i<100;i++)a.update(33,1);assert.equal(a.revision,revision);
});
test('scraping is batched, fracture history bounded, and restart clears glass with a fresh layout',()=>{
 const damage=new WindshieldDamage(33);damage.update(95,-1);const first={...damage.clusters[0]};const rev=damage.revision;
 damage.update(94.9,-1);assert.equal(damage.revision,rev);
 for(let h=94;h>0;h--)damage.update(h,-1);assert.ok(damage.clusters.length<=10);
 damage.update(100,0);assert.equal(damage.clusters.length,0);damage.update(95,-1);assert.notDeepEqual(damage.clusters[0],first);
});
test('the two softened Neon City bends have bounded peak curvature without new sharp joins',()=>{
 const track=circuitTrack(CIRCUITS[1]);
 const k=track.samples.map((p,i)=>{const q=track.samples[(i+1)%track.samples.length];return Math.abs(frameTurn(p,q)/(q.distance>p.distance?q.distance-p.distance:track.length-p.distance));});
 assert.ok(Math.max(...k)<.0018);
 assert.ok(Math.max(...k.slice(470,640))<.0017,'former middle peak was .00344');
 assert.ok(Math.max(...k.slice(830),...k.slice(0,40))<.0015,'former closing peak was .00532');
 assert.ok(track.length>34000 && track.length<35500);
});
