import assert from 'node:assert/strict';
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff;
/** Plan settings are fixed before generating outcomes; model qualification never lowers safety gates. */
export function tournamentPlan(c){
  assert.equal(c.schemaVersion,1);assert.equal(c.featureVersion,2);assert.equal(c.labelWorlds,64);assert.deepEqual(c.labelCounts,{train:32,calibration:8,test:8});
  for(const [key,minimum]of [['positionSeeds',32],['trainingSeeds',20],['evaluationSeeds',8]])assert.ok(Array.isArray(c[key])&&c[key].length>=minimum&&c[key].every(uint));
  const all=[...c.positionSeeds,...c.trainingSeeds,...c.evaluationSeeds];assert.equal(new Set(all).size,all.length,'Campaign walls overlap');assert.ok(Number.isInteger(c.batchMatches)&&c.batchMatches>=1&&c.batchMatches<=8);
  assert.deepEqual(c.objective,{relativeFanWeight:.2,matchWinWeight:1,objective:'tournament-v1'});assert.equal(c.minimumPolicyMargin,.25);assert.equal(c.minimumFanGain,1);assert.equal(c.ppoClip,.2);assert.equal(c.maximumCalibrationKL,.03);
  const pool=[{key:'kd',id:'kd-s0'},{key:'original',id:'kd-value-v1'},...['history-old','history-credit'].flatMap(id=>['balanced','attack','defense'].map(style=>({key:id+'-'+style,id,style,temperature:.5,mode:'guarded'})))];
  const trainingPool=[...pool,...['balanced','attack','defense'].map(style=>({key:'current-'+style,id:'teacher-g0',style,temperature:.5,mode:'guarded'}))];
  function capture(seeds,id,positions){const members=positions?pool:trainingPool;return seeds.map((seed,i)=>{const opponents=[0,1,2].map(n=>members[(i*3+n)%members.length]),base=[{key:'learner',id,learner:true,temperature:1,style:'balanced',mode:'explore'},...opponents],rotation=i%4;return {suite:positions?'position-league':'tournament-league',seed,rotation,policies:base.map((_,n)=>base[(n+rotation)%4]),training:true,capturePerHand:2,captureMode:'complete',anchorOriginal:true,fold:positions?(i<seeds.length-8?'train':i<seeds.length-4?'calibration':'test'):(i<seeds.length-4?'train':'calibration')};});}
  const opponentPools=[{id:'original',seats:Array.from({length:3},(_,i)=>({key:'original-'+i,id:'kd-value-v1'}))},{id:'mixed',seats:[{key:'original',id:'kd-value-v1'},{key:'historical-attack',id:'history-old',style:'attack',temperature:0,mode:'guarded'},{key:'historical-defense',id:'history-credit',style:'defense',temperature:0,mode:'guarded'}]}];
  const evaluate=arms=>arms.flatMap(arm=>opponentPools.flatMap(p=>c.evaluationSeeds.flatMap(seed=>Array.from({length:4},(_,rotation)=>{const base=[{key:'learner',id:arm.id,learner:true,mode:'guarded',execution:arm.execution??'aligned',temperature:0,style:'balanced'},...p.seats];return {suite:arm.id+'-'+p.id,pool:p.id,seed,rotation,policies:base.map((_,i)=>base[(i+rotation)%4]),training:false,capturePerHand:2,fold:'test'};}))));
  return {positions:capture(c.positionSeeds,'warm',true),training:capture(c.trainingSeeds,'teacher-g0',false),evaluate,pool,trainingPool,opponentPools};
}
/** One public decision per hand; spread across walls before adding second roots. No result-based selection. */
export function selectTournamentPositions(games,counts){
  const selected=[],summary={};let id=10000000;
  for(const fold of ['train','calibration','test']){
    const group=games.filter(g=>g.fold===fold),wallIds=[...new Set(group.map(g=>g.seed))];assert.equal(wallIds.length,group.length);assert.ok(group.length&&counts[fold]>=group.length);
    const pool=group.flatMap(g=>g.trajectories.filter(r=>r.observation.wallRemaining<=60).map(r=>({seed:g.seed,fold,category:r.observation.legalActions.some(a=>a.type.includes('kong'))?'kong':r.observation.legalActions.some(a=>['chow','pung'].includes(a.type))?'claim':'discard',observation:r.observation,prior:r.prior,revision:r.revision}))).sort((a,b)=>a.seed-b.seed||a.revision-b.revision);
    const used=new Set(),perWall=new Map(),take=r=>{assert.ok(r);selected.push({id:id++,seed:r.seed,fold,category:r.category,observation:r.observation,prior:r.prior,featureVersion:2});used.add(r.seed+'/'+r.observation.handIndex);perWall.set(r.seed,(perWall.get(r.seed)??0)+1);};
    // Ensure the rare tactical category is represented, then cover every independent wall.
    take(pool.find(r=>r.category==='kong'));
    for(const seed of wallIds)if(!perWall.has(seed)){const category=perWall.size%3===0?'claim':'discard';take(pool.find(r=>r.seed===seed&&r.category===category)??pool.find(r=>r.seed===seed));}
    while(selected.filter(r=>r.fold===fold).length<counts[fold]){const available=pool.filter(r=>!used.has(r.seed+'/'+r.observation.handIndex));available.sort((a,b)=>(perWall.get(a.seed)??0)-(perWall.get(b.seed)??0)||(['kong','claim','discard'].indexOf(a.category)-['kong','claim','discard'].indexOf(b.category))||a.revision-b.revision);take(available[0]);}
    const roots=selected.filter(r=>r.fold===fold);summary[fold]={roots:roots.length,walls:[...perWall.keys()],categories:Object.fromEntries(['discard','claim','kong'].map(k=>[k,roots.filter(r=>r.category===k).length]))};
  }return {positions:selected,summary};
}
/** Qualification is deliberately stricter than a positive point estimate or unchanged guard frequency. */
export function qualifyTeacher(comparisons,errors){
  assert.ok(comparisons.length>=2);return {qualified:errors===0&&comparisons.every(c=>c.firstPlace95?.low>0&&c.fan95?.low>0&&c.averagePlaceDelta<=0),comparisons,errors,rule:'each matched opponent pool: first-place and fan lower 95% seed-block bounds > 0, average place nonworse, zero faults/missed hu'};
}
