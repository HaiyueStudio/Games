import assert from 'node:assert/strict';
export function validateLeagueConfig(c){
  const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
  assert.equal(c.schemaVersion,1);assert.ok(uint(c.seed));assert.ok(Number.isInteger(c.generations)&&c.generations>=1&&c.generations<=32);assert.ok(Number.isInteger(c.capturePerHand)&&c.capturePerHand>=1&&c.capturePerHand<=16);assert.equal(c.trainingSeeds.length,c.generations);assert.equal(c.ppoClip,.2);assert.equal(c.maximumCalibrationKL,.03);
  const all=[];for(const [i,group]of [...c.trainingSeeds,c.evaluationSeeds].entries()){assert.ok(Array.isArray(group)&&group.length>=4&&group.every(uint));if(i<c.generations)assert.ok(group.length*3>=2+3*(i+1),'Not enough wall blocks for historical pool coverage');all.push(...group);}assert.equal(new Set(all).size,all.length,'League wall blocks overlap');return c;
}
/** Terminal labels are checked against complete matches, never another model's predictions. */
export function validateLeagueEpisodes(records,{training}={}){
  assert.ok(records.length);let hands=0,samples=0,actions=0;const coverage={};
  for(const g of records){
    assert.equal(g.results.length,16);assert.equal(g.seats.length,4);assert.equal(g.policies.filter(p=>p.learner).length,1);assert.equal(g.seats.reduce((n,p)=>n+p.score,0),0);
    const fan=Array(4).fill(0),score=Array(4).fill(0);for(const [hand,r]of g.results.entries()){assert.equal(r.hand,hand);assert.equal(r.deltas.reduce((a,b)=>a+b,0),0);if(r.winner!==null){assert.ok(r.win.fan>=8);fan[r.winner]+=r.win.total;}r.deltas.forEach((v,i)=>score[i]+=v);hands++;}
    g.seats.forEach((p,i)=>{assert.equal(p.fan,fan[i]);assert.equal(p.score,score[i]);assert.equal(p.faults,0);assert.equal(p.missedHu,0);});actions+=g.replay.actions.length;
    const top=Math.max(...fan),topScore=Math.max(...g.seats.filter(p=>p.fan===top).map(p=>p.score)),winners=g.seats.flatMap((p,i)=>p.fan===top&&p.score===topScore?[i]:[]),learner=g.policies.findIndex(p=>p.learner);
    for(const [i,p]of g.policies.entries())if(i!==learner)coverage[p.key]=(coverage[p.key]??0)+1;
    for(const row of g.trajectories){
      assert.equal(row.seat,learner);assert.equal(row.seed,g.seed);assert.equal(row.fold,g.fold);assert.equal(row.observation.handIndex,row.hand);assert.equal(row.observation.seat,learner);assert.ok(!('wall'in row.observation)&&!('responses'in row.observation));assert.ok(row.observation.players.every(p=>!('hand'in p)));assert.deepEqual(row.fanSnapshot,row.observation.players.map(p=>p.fan));assert.ok(Number.isFinite(row.oldLogProbability));assert.ok(Math.abs(Math.log(Math.max(1e-300,row.oldProbabilities[row.chosen]))-row.oldLogProbability)<1e-10);
      assert.ok(row.chosen>=0&&row.chosen<row.plans.length);assert.equal(row.features.length,row.plans.length);assert.equal(row.oldProbabilities.length,row.plans.length);assert.ok(Math.abs(row.oldProbabilities.reduce((a,b)=>a+b,0)-1)<1e-8);assert.ok(row.features.every(f=>f.length===234&&f.every(Number.isFinite)));
      const r=g.results[row.hand],who=row.seat,remaining=fan.map((v,i)=>v-row.fanSnapshot[i]),expected=[0,r.winner===who?r.win.total/32:0,r.winner!==null&&r.winner!==who?r.win.total/96:0,+(r.winner===who),+(r.winner!==null&&!r.selfDrawn&&r.from===who),remaining[who]/32,remaining.filter((_,i)=>i!==who).reduce((a,b)=>a+b,0)/96,winners.includes(who)?1/winners.length:0];assert.deepEqual(row.targets,expected);
      const kept=g.trajectories.filter(t=>t.hand===row.hand).length;assert.equal(row.weight,g.eligible[row.hand]/kept);assert.ok(row.weight>=1);samples++;
    }
    if(training===false)assert.equal(g.trajectories.length,0);if(training===true)assert.ok(g.trajectories.length>0);
  }return {matches:records.length,hands,samples,actions,coverage};
}
export function independentEvaluationSeeds(config,used){assert.ok(config.evaluationSeeds.length>=4);assert.equal(new Set(config.evaluationSeeds).size,config.evaluationSeeds.length);for(const seed of config.evaluationSeeds)assert.ok(!used.has(seed),'Evaluation wall appears in training or model-selection data');}
