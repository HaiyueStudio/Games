import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{registerHooks}from'node:module';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const{createScorer}=await import('../guobiao-mahjong/rules/scorer.ts'),{createMatch,observe}=await import('../guobiao-mahjong/rules/match.ts'),{collectionChance,searchTargets,TARGET_SETTINGS}=await import('../guobiao-mahjong/ai/candidates/targets.ts'),{candidateFeatures,riskFeatures,RISK_NAMES,QUALITY_NAMES}=await import('../guobiao-mahjong/ai/candidates/features.ts');
const scorer=await createScorer(readFileSync(new URL('../guobiao-mahjong/assets/mcr.wasm',import.meta.url)));
const{candidateModel}=await import('../guobiao-mahjong/ai/candidates/weights.ts'),{densePredict,predictRiskVector,predictDiscardRisk,preferenceFeatures,rankCandidates,validateCandidateModel}=await import('../guobiao-mahjong/ai/candidates/learned.ts');
const{binaryMetrics,validateLearningSplit,assessPromotion}=await import('../guobiao-mahjong/benchmarks/learning-validation.mjs');
test('single-target collection chances match exhaustive draws, including repeated required copies',()=>{
  const counts=Array(34).fill(0);counts[0]=2;counts[1]=1;counts[2]=3;const pool=counts.flatMap((n,t)=>Array(n).fill(t));
  for(const needs of [[0],[0,1],[0,0]])for(let h=0;h<=6;h++){let total=0,hits=0;function draw(indices,start){if(indices.length===h){total++;const tiles=indices.map(i=>pool[i]);if([...new Set(needs)].every(t=>tiles.filter(v=>v===t).length>=needs.filter(v=>v===t).length))hits++;return}for(let i=start;i<pool.length;i++)draw([...indices,i],i+1)}draw([],0);assert.ok(Math.abs(collectionChance(6,counts,needs,h)-hits/total)<1e-12);}
  assert.throws(()=>collectionChance(5,counts,[0],2));assert.throws(()=>collectionChance(6,counts,[0,1,2],3));
});
function position(){const o=observe(createMatch(7),0,scorer);o.hand=[0,1,2,3,4,9,10,11,18,19,27,27,33,33];o.legalActions=[...new Set(o.hand)].map(tile=>({type:'discard',tile}));return o;}
test('bounded target search finds real two-draw eight-fan routes and preserves the observation',()=>{
  const o=position(),before=JSON.stringify(o),result=searchTargets(o,33,scorer);assert.equal(JSON.stringify(o),before);assert.ok(result.analyses<=TARGET_SETTINGS.maxAnalyses);assert.ok(result.routes.some(r=>r.needs.length===2));
  for(const route of result.routes){let hand=[...o.hand];for(const d of route.discards)hand.splice(hand.indexOf(d),1);hand.push(...route.needs.slice(0,-1));const t=route.needs.at(-1);assert.ok((scorer.score(hand,[],t,0,1,0,0)?.fan??0)>=8||(scorer.score(hand,[],t,0,0,0,0)?.fan??0)>=8);assert.ok(route.collectionChance>=0&&route.collectionChance<=1);}
});
test('target search distinguishes ron-only eight-fan hands and never counts flowers as the threshold',()=>{
  const o=position();o.hand=[31,32];o.players[0].handCount=2;o.players[0].melds=[[0,1,2],[3,4,5],[10,11,12],[19,20,21]].map(tiles=>({kind:'chow',tiles,concealed:false,promoted:false,from:1}));o.legalActions=o.hand.map(tile=>({type:'discard',tile}));o.players[0].flowers=[34,35,36,37];
  const result=searchTargets(o,32,scorer);assert.equal(result.selfLive,0);assert.equal(result.ronLive,3);assert.ok(result.routes.every(r=>r.selfFan===null&&r.ronFan>=8));
});
test('candidate features use public chronology, shape and ranking without hidden opponent identities',()=>{
  const o=position(),before=JSON.stringify(o),row=candidateFeatures(o,33,scorer);assert.equal(row.quality.length,QUALITY_NAMES.length);assert.ok(row.opponents.every(f=>f.length===RISK_NAMES.length));assert.equal(JSON.stringify(o),before);
  const hidden=structuredClone(o);hidden.players[1].hand=[0,0,0,0];hidden.players[1].melds=[{kind:'kong',tiles:[31,31,31,31],concealed:true}];const redacted=structuredClone(hidden);redacted.players[1].melds[0].tiles=[null,null,null,null];assert.deepEqual(candidateFeatures(hidden,33,scorer),candidateFeatures(redacted,33,scorer));
  const late=structuredClone(o);late.wallRemaining=4;late.players[1].fan=64;assert.notDeepEqual(candidateFeatures(late,33,scorer).quality,row.quality);
  o.events=[{hand:0,type:'discard',seat:1,tile:32},{hand:0,type:'discard',seat:1,tile:33}];const a=riskFeatures(o,33,1);o.events.reverse();assert.notDeepEqual(riskFeatures(o,33,1),a);assert.throws(()=>riskFeatures(o,33,0));
});
test('exported tiny models reproduce NumPy probabilities, conditional fans and preference residuals',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-candidate-model.json',import.meta.url)));
  for(const c of fixture.rows){const predictions=c.row.opponents.map(f=>predictRiskVector(f));predictions.forEach((p,i)=>{assert.ok(Math.abs(p.probability-c.probabilities[i])<1e-10);assert.ok(Math.abs(p.conditionalFan-c.fans[i])<1e-9)});assert.ok(Math.abs(densePredict(preferenceFeatures(c.row),candidateModel.preference)[0]-c.preference)<1e-10);}
  const invalid=structuredClone(candidateModel);invalid.risk.w1[0].pop();assert.throws(()=>validateCandidateModel(invalid));assert.throws(()=>densePredict([NaN],candidateModel.risk));
});
test('learned reranking preserves legality, immediate Hu and exact last-discard safety',()=>{
  const o=position(),p=o.legalActions.map(()=>1/o.legalActions.length),before=JSON.stringify(o),d=rankCandidates(o,p,0,scorer);assert.ok(o.legalActions.includes(d.action));assert.equal(JSON.stringify(o),before);assert.ok(d.analysisCalls<=195);
  const privateHand=structuredClone(o);privateHand.players[1].hand=[33,33,33,33];assert.deepEqual(predictDiscardRisk(o,33),predictDiscardRisk(privateHand,33));
  o.legalActions.unshift({type:'hu'});assert.equal(rankCandidates(o,[.01,...p.map(v=>v*.99)],1,scorer).action.type,'hu');
  const c=JSON.parse(readFileSync(new URL('./fixtures/mahjong-last-tile.json',import.meta.url))).cases[0],n=c.observation.legalActions.length,selected=c.observation.legalActions.findIndex(a=>a.tile===c.rawAction.tile),prior=Array(n).fill(.2/(n-1));prior[selected]=.8;assert.deepEqual(rankCandidates(c.observation,prior,selected,scorer).action,c.expectedAction);
});
test('risk metrics handle ties and promotion rejects seed leakage, uncertain improvements and worse ranking',()=>{
  assert.equal(binaryMetrics([.1,.9],[0,1]).auc,1);assert.equal(binaryMetrics([.5,.5],[0,1]).auc,.5);assert.throws(()=>binaryMetrics([NaN],[0]));
  const folds={train:[1],calibration:[2],test:[3]};assert.equal(validateLearningSplit(folds).size,3);assert.throws(()=>validateLearningSplit({...folds,test:[1]}));
  const config={schemaVersion:1,seeds:[100,101,102,103],rotateSeats:true,concurrency:1,baseline:'kd-safe',suites:[{id:'test',agents:['kd-learned','kd-safe','kd-safe','kd-safe']}]},report={schemaVersion:1,config,expected:16,completed:16,strict:true,summary:[{complete:true,rows:[{policy:'kd-learned',faults:0,averagePlace:2},{policy:'kd-safe',faults:0,averagePlace:3}],paired:[{policy:'kd-learned',baseline:'kd-safe',fanDelta95:{low:.1,high:.5}}]}]};assert.equal(assessPromotion(report,folds).promote,true);
  for(const change of [r=>r.config.seeds[0]=1,r=>r.summary[0].paired[0].fanDelta95.low=0,r=>r.summary[0].rows[0].averagePlace=4,r=>r.completed--,r=>r.summary=[]]){const bad=structuredClone(report);change(bad);assert.equal(assessPromotion(bad,folds).promote,false);}
});
