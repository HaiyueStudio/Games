import assert from 'node:assert/strict';
export function validateLeagueConfig(c){
  const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
  assert.equal(c.schemaVersion,1);assert.ok(uint(c.seed));assert.ok(Number.isInteger(c.generations)&&c.generations>=1&&c.generations<=32);assert.ok(Number.isInteger(c.capturePerHand)&&c.capturePerHand>=1&&c.capturePerHand<=16);assert.equal(c.trainingSeeds.length,c.generations);assert.equal(c.ppoClip,.2);assert.equal(c.maximumCalibrationKL,.03);
  assert.ok(c.captureMode===undefined||['uniform','critical-stratified','complete'].includes(c.captureMode));assert.ok(c.batchMatches===undefined||Number.isInteger(c.batchMatches)&&c.batchMatches>=1&&c.batchMatches<=8);
  assert.ok(c.anchorOriginal===undefined||typeof c.anchorOriginal==='boolean');
  assert.ok(c.roundValueEpisodes===undefined||Array.isArray(c.roundValueEpisodes)&&c.roundValueEpisodes.length>0&&c.roundValueEpisodes.every(p=>typeof p==='string'&&p.length>0));
  assert.ok(c.stateValueEpisodes===undefined||c.captureMode==='complete'&&Array.isArray(c.roundValueEpisodes)&&Array.isArray(c.stateValueEpisodes)&&c.stateValueEpisodes.length>0&&c.stateValueEpisodes.every(p=>typeof p==='string'&&p.length>0),'State credit requires complete trajectories and frozen round-value inputs');
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
      assert.ok(row.chosen>=0&&row.chosen<row.plans.length);assert.equal(row.features.length,row.plans.length);assert.equal(row.oldProbabilities.length,row.plans.length);assert.ok(Math.abs(row.oldProbabilities.reduce((a,b)=>a+b,0)-1)<1e-8);assert.ok(row.features.every(f=>f.length===(row.featureVersion===2?256:234)&&f.every(Number.isFinite)));
      const r=g.results[row.hand],who=row.seat,remaining=fan.map((v,i)=>v-row.fanSnapshot[i]),expected=[0,r.winner===who?r.win.total/32:0,r.winner!==null&&r.winner!==who?r.win.total/96:0,+(r.winner===who),+(r.winner!==null&&!r.selfDrawn&&r.from===who),remaining[who]/32,remaining.filter((_,i)=>i!==who).reduce((a,b)=>a+b,0)/96,winners.includes(who)?1/winners.length:0];assert.deepEqual(row.targets,expected);
      if(row.sampling){
        const m=row.sampling;assert.equal(m.version,2);assert.equal(g.capture?.version,2);assert.ok(['uniform','critical-stratified','complete'].includes(g.capture.mode));assert.ok(['critical','ordinary'].includes(m.stratum));
        const critical=g.capture.mode!=='uniform'&&row.observation.legalActions.some(a=>['chow','pung','kong','concealed-kong','add-kong'].includes(a.type));assert.equal(m.stratum,critical?'critical':'ordinary');
        const kept=g.trajectories.filter(t=>t.hand===row.hand&&t.sampling?.stratum===m.stratum).length,population=g.capture.populations[row.hand];assert.equal(m.eligible,population[m.stratum]);assert.equal(m.retained,kept);assert.equal(m.probability,kept/m.eligible);assert.equal(row.weight,1/m.probability);assert.equal(population.critical+population.ordinary,g.eligible[row.hand]);if(critical||g.capture.mode==='complete'){assert.equal(kept,m.eligible);assert.equal(row.weight,1);}else assert.equal(kept,Math.min(g.capture.ordinaryPerHand,m.eligible));
      }else{const kept=g.trajectories.filter(t=>t.hand===row.hand).length;assert.equal(row.weight,g.eligible[row.hand]/kept);}
      assert.ok(row.weight>=1&&Number.isFinite(row.weight));assert.ok(row.policyMode===undefined||row.policyMode==='explore');samples++;
      if(g.anchorOriginal)assert.ok(row.anchor,'Original-policy anchor missing');
      if(row.anchor){const a=row.anchor;assert.equal(a.version,1);assert.equal(a.policy,'kd-value-v1');assert.equal(a.smoothing,.02);assert.ok(Number.isInteger(a.index)&&row.observation.legalActions[a.index]);assert.equal(a.probabilities.length,row.prior.length);a.probabilities.forEach((p,i)=>{assert.ok(Number.isFinite(p)&&p>=0);assert.ok(Math.abs(p-(a.smoothing*row.prior[i]+(i===a.index?1-a.smoothing:0)))<1e-12)});}
    }
    if(g.capture?.mode==='complete'&&g.trajectories.length)validateCompleteTrajectory(g);
    if(training===false)assert.equal(g.trajectories.length,0);if(training===true)assert.ok(g.trajectories.length>0);
    if(['critical-stratified','complete'].includes(g.capture?.mode))for(let hand=0;hand<16;hand++){const counts=g.capture.populations[hand];assert.equal(g.trajectories.filter(r=>r.hand===hand&&r.sampling.stratum==='critical').length,counts.critical);assert.equal(g.trajectories.filter(r=>r.hand===hand&&r.sampling.stratum==='ordinary').length,g.capture.mode==='complete'?counts.ordinary:Math.min(g.capture.ordinaryPerHand,counts.ordinary));}
  }return {matches:records.length,hands,samples,actions,coverage};
}
export function independentEvaluationSeeds(config,used){assert.ok(config.evaluationSeeds.length>=4);assert.equal(new Set(config.evaluationSeeds).size,config.evaluationSeeds.length);for(const seed of config.evaluationSeeds)assert.ok(!used.has(seed),'Evaluation wall appears in training or model-selection data');}

/** Check every learner action and reward edge, independently of actor subsampling. */
export function validateCompleteTrajectory(g){
  assert.equal(g.trajectoryVersion,1);assert.equal(g.capture.mode,'complete');
  const learner=g.policies.findIndex(p=>p.learner),own=g.replay.actions.filter(a=>a.seat===learner),trace=g.learnerTrace;
  assert.equal(trace.length,own.length);assert.ok(trace.length);const rows=new Map(g.trajectories.map(r=>[r.revision,r]));assert.equal(rows.size,g.trajectories.length);
  const prefix=[Array(4).fill(0)];for(const r of g.results){const fan=[...prefix.at(-1)];if(r.winner!==null)fan[r.winner]+=r.win.total;prefix.push(fan);}
  const final=prefix.at(-1),top=Math.max(...final),score=Math.max(...g.seats.filter(p=>p.fan===top).map(p=>p.score)),winners=g.seats.flatMap((p,i)=>p.fan===top&&p.score===score?[i]:[]);
  trace.forEach((s,i)=>{const action=own[i],next=own[i+1];for(const k of ['revision','hand','seat','action'])assert.deepEqual(s[k],action[k]);assert.ok(['policy','forced','legal-win','last-tile-safe','joint-follow-up'].includes(s.kind));assert.equal(s.nextRevision,next?.revision??null);assert.equal(s.terminal,!next);assert.equal(s.nextPolicyRevision,trace.slice(i+1).find(a=>a.kind==='policy')?.revision??null);assert.equal(rows.has(s.revision),s.kind==='policy','Missing policy decision in complete trajectory');
    if(s.kind==='forced')assert.equal(s.priorAction,undefined);else assert.ok(s.priorAction);
    const delta=prefix[next?.hand??16].map((v,j)=>v-prefix[s.hand][j]),expected=[delta[learner]/32,delta.filter((_,j)=>j!==learner).reduce((a,b)=>a+b,0)/96,!next&&winners.includes(learner)?1/winners.length:0];assert.deepEqual(s.reward,expected);
  });assert.equal(trace.filter(s=>s.kind==='policy').length,rows.size);return {steps:trace.length,policySteps:rows.size,deterministicSteps:trace.length-rows.size};
}
