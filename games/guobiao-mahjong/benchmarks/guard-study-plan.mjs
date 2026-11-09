import assert from 'node:assert/strict';
export function guardStudyPlan(c){
  assert.ok(c.anchorOriginal===undefined||typeof c.anchorOriginal==='boolean');assert.ok(c.roundValue===undefined||c.roundValue==='round-value/model.json');assert.ok(c.historicalEvaluationReports===undefined||Array.isArray(c.historicalEvaluationReports)&&c.historicalEvaluationReports.every(p=>typeof p==='string'&&p.length>0));
  const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;assert.equal(c.schemaVersion,1);assert.ok(Array.isArray(c.seeds)&&c.seeds.length>=4&&c.seeds.every(uint));assert.ok(Array.isArray(c.captureSeeds)&&c.captureSeeds.length===2&&c.captureSeeds.every(uint));assert.equal(new Set([...c.seeds,...c.captureSeeds]).size,c.seeds.length+2);assert.ok(Number.isInteger(c.batchMatches)&&c.batchMatches>=1&&c.batchMatches<=8);
  const expected=['joint-previous','joint-guarded','joint-balanced-teacher','joint-balanced-student'];assert.deepEqual(c.arms.map(a=>a.id),expected);c.arms.forEach((a,i)=>assert.equal(a.mode,i?'guarded':'explore'));
  const seats=(id,mode)=>[{key:'learner',id,mode,learner:true,temperature:0,style:'balanced'},...Array.from({length:3},(_,i)=>({key:'original-'+i,id:'kd-value-v1',temperature:0}))];
  const jobs=c.arms.flatMap(a=>c.seeds.flatMap(seed=>Array.from({length:4},(_,rotation)=>{const base=seats(a.id,a.mode);return {suite:a.id,seed,rotation,policies:base.map((_,i)=>base[(i+rotation)%4]),training:false,capturePerHand:2,fold:'test'};})));
  const captures=c.captureSeeds.map((seed,i)=>({suite:'critical-capture',seed,rotation:0,policies:seats('joint-training','explore').map(p=>p.learner?{...p,temperature:1}:p),training:true,capturePerHand:2,captureMode:'critical-stratified',anchorOriginal:c.anchorOriginal??false,fold:i?'calibration':'train'}));
  return {jobs,captures};
}
