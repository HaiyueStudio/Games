import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRound,advance,rank,isRecords,speed,gateBands,collidesWithGate,GATE_SHAPES,IMPACT_LIFETIME} from '../glass-rush/rules/model.ts';
const gate=(z,angle,width=1,shape='arc')=>({z,angle,width,shape,spin:0,passed:false,shattered:false});
test('fourth collision shatters; each gate only hits once',()=>{
 const r=createRound();r.phase='playing';
 for(let i=1;i<=4;i++){r.gates=[gate(3.01,r.angle),gate(180,0)];advance(r,.02);assert.equal(r.hits,i);assert.equal(r.phase,i===4?'over':'playing');assert.ok(r.gates[0].shattered);assert.equal(r.impacts.length,i);advance(r,.02);assert.equal(r.hits,i);}
});
test('safe arc, seeded generation, acceleration and pause',()=>{
 const a=createRound(42),b=createRound(42);a.phase=b.phase='playing';advance(a,.1,1);advance(b,.1,1);assert.deepEqual(a,b);assert.ok(speed(a)>18);assert.ok(a.angle> -Math.PI/2);
 a.phase='paused';const before=structuredClone(a);advance(a,.2,-1);assert.deepEqual(a,before);
 b.gates=[gate(3.01,b.angle+Math.PI,.8),gate(180,0)];advance(b,.1);assert.equal(b.hits,0);assert.equal(b.impacts.length,0);
});
test('all obstacle shapes hit their visible bands and preserve the gaps across angle wrapping',()=>{
 for(const shape of GATE_SHAPES){
  const g=gate(3.01,Math.PI-.03,1,shape);
  for(const band of gateBands(g)){
   assert.ok(collidesWithGate(g.angle+band.offset,g));
   const r=createRound();r.phase='playing';r.angle=g.angle+band.offset;r.gates=[structuredClone(g),gate(180,0)];
   advance(r,.02);assert.equal(r.hits,1);assert.equal(r.impacts[0].gate.shape,shape);
  }
 }
 assert.equal(collidesWithGate(0,gate(3,0,1,'diamonds')),false);
 assert.equal(collidesWithGate(.4,gate(3,0,1,'crown')),false);
 assert.equal(collidesWithGate(Math.PI/2,gate(3,0,1,'split')),false);
});
test('impact animation freezes on pause, expires after game over and clears on restart',()=>{
 const r=createRound();r.phase='playing';r.hits=3;r.gates=[gate(3.01,r.angle),gate(180,0)];advance(r,.02);
 assert.equal(r.phase,'over');assert.equal(r.impacts.length,1);
 r.phase='paused';const before=structuredClone(r);advance(r,.2);assert.deepEqual(r,before);
 r.phase='over';for(let i=0;i<Math.ceil(IMPACT_LIFETIME/.1)+1;i++)advance(r,.1);
 assert.equal(r.impacts.length,0);assert.ok(r.broken>0);assert.equal(r.flash,0);
 const fresh=createRound();assert.deepEqual(fresh.impacts,[]);assert.equal(fresh.broken,0);
});
test('leaderboard holds five descending finite survival times',()=>{assert.deepEqual(rank([10,9,8,7,6],12),[12,10,9,8,7]);assert.ok(isRecords({times:[12,10,9,8,7]}));for(const times of [[1,2],[NaN],[-1],Array(6).fill(2)])assert.equal(isRecords({times}),false);});
