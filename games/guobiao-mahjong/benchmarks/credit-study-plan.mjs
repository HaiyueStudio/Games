import assert from 'node:assert/strict';
export function creditStudyPlan(c){
  const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
  assert.equal(c.schemaVersion,1);assert.ok(Array.isArray(c.seeds)&&c.seeds.length>=4&&c.seeds.every(uint));assert.ok(Array.isArray(c.captureSeeds)&&c.captureSeeds.length>=4&&c.captureSeeds.every(uint));assert.equal(new Set([...c.seeds,...c.captureSeeds]).size,c.seeds.length+c.captureSeeds.length);
  for(const k of ['batchMatches','captureBatchMatches'])assert.ok(Number.isInteger(c[k])&&c[k]>=1&&c[k]<=8);
  assert.deepEqual(c.arms,[{id:'joint-reference',mode:'guarded'},{id:'joint-round',mode:'guarded'},{id:'joint-gae-teacher',mode:'guarded'},{id:'joint-gae-student',mode:'guarded'}]);
  const seats=id=>[{key:'learner',id,mode:'guarded',learner:true,temperature:0,style:'balanced'},...Array.from({length:3},(_,i)=>({key:'original-'+i,id:'kd-value-v1',temperature:0}))];
  return {jobs:c.arms.flatMap(a=>c.seeds.flatMap(seed=>Array.from({length:4},(_,rotation)=>{const base=seats(a.id);return {suite:a.id,seed,rotation,policies:base.map((_,i)=>base[(i+rotation)%4]),training:false,capturePerHand:2,fold:'test'};}))),captures:c.captureSeeds.map((seed,i)=>({suite:'complete-capture',seed,rotation:0,policies:seats('joint-training').map(p=>p.learner?{...p,mode:'explore',temperature:1}:p),training:true,capturePerHand:2,captureMode:'complete',anchorOriginal:true,fold:i===c.captureSeeds.length-1?'calibration':'train'}))};
}
