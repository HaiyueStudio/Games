import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {createScorer}=await import('../guobiao-mahjong/rules/scorer.ts'),{createMatch,legalActions,observe,applyAction}=await import('../guobiao-mahjong/rules/match.ts'),{actionKey,seat}=await import('../guobiao-mahjong/rules/types.ts'),{decide}=await import('../guobiao-mahjong/ai/strategy.ts');
const {sampleWorld,simulatePlan,valueObservation}=await import('../guobiao-mahjong/ai/value/simulation.ts'),{actionPlans,projectPlan,continuationObservation}=await import('../guobiao-mahjong/ai/value/actions.ts'),{actionValueFeatures,VALUE_NAMES}=await import('../guobiao-mahjong/ai/value/features.ts'),{ValueContinuations,rankActionValues,validateActionValueModel}=await import('../guobiao-mahjong/ai/value/model.ts');
const scorer=await createScorer(readFileSync(new URL('../guobiao-mahjong/assets/mcr.wasm',import.meta.url))),cases=JSON.parse(readFileSync(new URL('./fixtures/mahjong-value-actions.json',import.meta.url))).cases;
const uniform=o=>o.legalActions.map(()=>1/o.legalActions.length),refereePolicy=o=>o.legalActions.find(a=>a.type==='hu')??(o.phase==='response'?{type:'pass'}:decide(o,scorer,1).action);
test('sampled worlds conserve all 144 tiles, public hands, concealed-kong constraints and announced tiles',()=>{
  for(const c of cases)for(let seedValue=1;seedValue<=4;seedValue++){
    const o=c.observation,before=JSON.stringify(o),s=sampleWorld(o,seedValue);assert.deepEqual(sampleWorld(o,seedValue),s);assert.equal(JSON.stringify(o),before);
    const counts=Array(42).fill(0);s.wall.forEach(t=>counts[t]++);for(const p of s.players){p.hand.forEach(t=>counts[t]++);p.river.forEach(t=>counts[t]++);p.flowers.forEach(t=>counts[t]++);p.melds.forEach(m=>m.tiles.forEach(t=>counts[t]++));}assert.deepEqual(counts,Array.from({length:42},(_,t)=>t<34?4:1));
    assert.deepEqual(s.players[o.seat].hand,o.hand);assert.deepEqual(legalActions(s,o.seat,scorer),o.legalActions);assert.equal(s.wall.length,o.wallRemaining);
  }
  const c=cases.find(c=>c.name==='add-kong'),world=sampleWorld(c.observation,9);applyAction(world,c.observation.seat,c.action,scorer);const who=seat(c.observation.seat+1),o=observe(world,who,scorer),sample=sampleWorld(o,11);assert.ok(sample.players[o.last.seat].hand.includes(o.last.tile));
  const hidden=cases.find(c=>c.name==='concealed-kong'),s=sampleWorld(hidden.observation,5);applyAction(s,hidden.observation.seat,hidden.action,scorer);const view=observe(s,seat(hidden.observation.seat+1),scorer),sampled=sampleWorld(view,6),quad=sampled.players[hidden.observation.seat].melds.at(-1);assert.equal(quad.concealed,true);assert.equal(new Set(quad.tiles).size,1);assert.equal(quad.tiles.length,4);
  const invalid=structuredClone(cases[0].observation);invalid.wallRemaining--;assert.throws(()=>sampleWorld(invalid,1));
});
test('hidden data and spectator faces cannot affect features or sampled worlds',()=>{
  const o=cases.find(c=>c.name==='concealed-kong').observation,privateInput=structuredClone(o);privateInput.wall=[0,0,0,0];privateInput.responses={1:{type:'hu'}};
  privateInput.players.forEach((p,i)=>{if(i!==o.seat){p.hand=[33,33];p.melds.forEach(m=>{if(m.concealed)m.tiles=[33,33,33,33]});}});
  assert.deepEqual(valueObservation(privateInput),valueObservation(o));assert.deepEqual(sampleWorld(privateInput,2),sampleWorld(o,2));
  for(const plan of actionPlans(o,uniform(o),scorer)){const f=actionValueFeatures(o,plan,uniform(o),scorer);assert.equal(f.length,VALUE_NAMES.length);assert.deepEqual(actionValueFeatures(privateInput,plan,uniform(o),scorer),f);}
});
test('candidate coverage includes pass, every chow combination, pung and all three kong types',()=>{
  const found=new Set();for(const c of cases){const o=c.observation,before=JSON.stringify(o),plans=actionPlans(o,uniform(o),scorer);assert.ok(plans.length<=18);for(const a of o.legalActions.filter(a=>a.type!=='discard'&&a.type!=='hu')){assert.ok(plans.some(p=>actionKey(p.action)===actionKey(a)));found.add(a.type);}
    for(const p of plans){const after=projectPlan(o,p);assert.equal(after.hand.length%3,1);if(p.action.type==='chow'||p.action.type==='pung')assert.notEqual(p.followUpDiscard,null);const f=actionValueFeatures(o,p,uniform(o),scorer);assert.ok(f.every(Number.isFinite));}assert.equal(JSON.stringify(o),before);}
  for(const type of ['pass','chow','pung','kong','concealed-kong','add-kong'])assert.ok(found.has(type));
});
test('paired rollouts use identical sampled worlds, complete real legal hands, and supply only public observations',async()=>{
  const c=cases.find(c=>c.name==='chow'),o=c.observation,plan=actionPlans(o,uniform(o),scorer).find(p=>p.action.type==='chow'),world=sampleWorld(o,71),before=JSON.stringify(world);let calls=0;
  const policy=o=>{calls++;assert.ok(!('wall' in o));assert.ok(o.players.every(p=>!('hand' in p)));assert.ok(o.players.every((p,i)=>i===o.seat||p.melds.every(m=>!m.concealed||m.tiles.every(t=>t===null))));return refereePolicy(o)};
  const a=await simulatePlan(world,o.seat,plan,scorer,policy),b=await simulatePlan(world,o.seat,plan,scorer,policy);assert.deepEqual(a,b);assert.equal(JSON.stringify(world),before);assert.ok(calls>0);assert.ok(a.actions>1&&a.actions<1024);assert.equal(a.claimApplied,true);assert.equal(a.followUpApplied,true);assert.equal(a.scores.reduce((a,b)=>a+b,0),0);assert.ok(a.winner===null||a.fans[a.winner]>=8);
  const controller=new AbortController();controller.abort();await assert.rejects(simulatePlan(world,o.seat,plan,scorer,policy,controller.signal),{name:'AbortError'});
});
test('an earlier pung preempts chow and never executes the losing plan follow-up',async()=>{
  const c=cases.find(c=>c.name==='chow'),o=c.observation,plan=actionPlans(o,uniform(o),scorer).find(p=>p.action.type==='chow');let world;
  for(let seedValue=1;seedValue<2000;seedValue++){const s=sampleWorld(o,seedValue);if([0,1,2,3].some(i=>i!==o.seat&&i!==o.last.seat&&legalActions(s,i,scorer).some(a=>a.type==='pung'))){world=s;break;}}
  assert.ok(world);const result=await simulatePlan(world,o.seat,plan,scorer,q=>q.seat!==o.seat&&q.phase==='response'?q.legalActions.find(a=>a.type==='hu')??q.legalActions.find(a=>a.type==='pung')??{type:'pass'}:refereePolicy(q));assert.equal(result.claimApplied,false);assert.equal(result.followUpApplied,false);
});
test('follow-up memory matches the exact claim result and remains bounded across abandoned claims',()=>{
  const c=cases.find(c=>c.name==='chow'),o=c.observation,plan=actionPlans(o,uniform(o),scorer).find(p=>p.action.type==='chow'),store=new ValueContinuations(),after=continuationObservation(o,plan);store.remember(o,plan);
  const unrelated=structuredClone(after);unrelated.handIndex++;assert.equal(store.take(unrelated),null);assert.equal(store.take(after),plan.followUpDiscard);assert.equal(store.take(after),null);
  for(let i=0;i<100;i++)store.remember({...o,handIndex:i},plan);assert.equal(store.size,64);store.clear();assert.equal(store.size,0);
});
test('planned continuations match the real referee after response revisions and claim resolution',()=>{
  for(const type of ['chow','pung']){const o=cases.find(c=>c.name===type).observation,plan=actionPlans(o,uniform(o),scorer).find(p=>p.action.type===type),s=sampleWorld(o,43),store=new ValueContinuations();store.remember(o,plan);applyAction(s,o.seat,plan.action,scorer);
    while(s.phase==='response'){const actor=[1,2,3].map(n=>seat(s.last.seat+n)).find(i=>!s.responses[i]);applyAction(s,actor,{type:'pass'},scorer);}
    const real=observe(s,o.seat,scorer);assert.equal(s.turn,o.seat);assert.equal(store.peek(real),plan.followUpDiscard);const changed=structuredClone(real);changed.events.push({hand:o.handIndex,type:'discard',seat:seat(o.seat+1),tile:0});assert.equal(store.peek(changed),null);
  }
});
function controlledModel(actionType){
  const width=VALUE_NAMES.length,n={mean:Array(width).fill(0),scale:Array(width).fill(1),w1:Array.from({length:width},()=>[0]),b1:[0],w2:[[4,0,0,0]],b2:[-2,-3,-2,-2]};n.w1[VALUE_NAMES.indexOf('action-'+actionType)]=[1];
  return {schemaVersion:1,featureVersion:1,featureNames:VALUE_NAMES,networks:[n,structuredClone(n),structuredClone(n)],fanScale:32,objective:'test',settings:{minimumPrior:.01,minimumGain:.03,priorWeight:.02,uncertaintyWeight:2,maximumPlans:18}};
}
test('value selection covers claims and kongs, honors the selected follow-up, and guards Hu/last discard',()=>{
  for(const type of ['chow','pung','kong','concealed-kong','add-kong']){
    const o=cases.find(c=>c.name===type).observation,model=controlledModel(type),prior=uniform(o),selected=o.legalActions.findIndex(a=>a.type!==type),store=new ValueContinuations();validateActionValueModel(model);
    const d=rankActionValues(o,prior,selected,scorer,model,store);assert.equal(d.action.type,type);assert.equal(d.reason,'action-value');assert.ok(d.analysisCalls>0&&d.analysisCalls<=1024);
    if(type==='chow'||type==='pung'){const plan=actionPlans(o,prior,scorer).find(p=>actionKey(p.action)===actionKey(d.action)),after=continuationObservation(o,plan),next=rankActionValues(after,uniform(after),0,scorer,model,store);assert.equal(next.action.tile,plan.followUpDiscard);assert.equal(next.reason,'value-follow-up');assert.deepEqual(rankActionValues(after,uniform(after),0,scorer,model,store),next,'repeated reads and cancelled requests retain the same continuation');}
    const hu=structuredClone(o);hu.legalActions.unshift({type:'hu'});assert.equal(rankActionValues(hu,uniform(hu),1,scorer,model,store).action.type,'hu');
  }
  const c=JSON.parse(readFileSync(new URL('./fixtures/mahjong-last-tile.json',import.meta.url))).cases[0],o=c.observation,selected=o.legalActions.findIndex(a=>a.tile===c.rawAction.tile);assert.deepEqual(rankActionValues(o,uniform(o),selected,scorer,controlledModel('discard'),new ValueContinuations()).action,c.expectedAction);
  const invalid=controlledModel('pung');invalid.networks[0].w1[0].push(0);assert.throws(()=>validateActionValueModel(invalid));
});
test('unsupported claims and ensemble disagreement keep the original policy action',()=>{
  const o=cases.find(c=>c.name==='pung').observation,index=o.legalActions.findIndex(a=>a.type==='pung'),selected=o.legalActions.findIndex(a=>a.type==='pass'),prior=uniform(o),model=controlledModel('pung');
  model.networks[1].w2[0][0]=0;model.networks[2].w2[0][0]=-4;assert.equal(rankActionValues(o,prior,selected,scorer,model,new ValueContinuations()).index,selected);
  const low=o.legalActions.map((_,i)=>i===index?.001:.999/(o.legalActions.length-1));assert.equal(rankActionValues(o,low,selected,scorer,controlledModel('pung'),new ValueContinuations()).index,selected);
});
test('unambiguous priors skip redundant value features and all mathematical hand queries',()=>{
  for(const type of ['discard','pung']){const o=cases.find(c=>c.name===type).observation,selected=o.legalActions.findIndex(a=>a.type===(o.phase==='response'?'pass':'discard')),prior=o.legalActions.map((_,i)=>i===selected?.9999:.0001/(o.legalActions.length-1)),unexpected=()=>{throw Error('Redundant hand analysis')},noMath={catalog:scorer.catalog,score:unexpected,shanten:unexpected,analyze:unexpected},d=rankActionValues(o,prior,selected,noMath,controlledModel('pung'),new ValueContinuations());assert.equal(d.index,selected);assert.equal(d.analysisCalls,0);}
});
test('uncertain claim values do not replace a later KD discard with a heuristic follow-up',()=>{
  for(const type of ['chow','pung']){const o=cases.find(c=>c.name===type).observation,selected=o.legalActions.findIndex(a=>a.type===type),model=controlledModel(type);model.networks.forEach(n=>{n.w2[0][0]=0});const prior=o.legalActions.map((_,i)=>i===selected?.8:.2/(o.legalActions.length-1)),store=new ValueContinuations(),d=rankActionValues(o,prior,selected,scorer,model,store);assert.equal(d.index,selected);assert.equal(d.reason,'value-prior');assert.equal(store.size,0);
    const plan=actionPlans(o,prior,scorer).find(p=>p.index===selected),after=continuationObservation(o,plan),raw=after.legalActions.length-1,p=after.legalActions.map((_,i)=>i===raw?.9:.1/(after.legalActions.length-1)),next=rankActionValues(after,p,raw,scorer,model,store);assert.equal(next.index,raw);assert.notEqual(next.reason,'value-follow-up');
  }
});
test('a robbed added kong settles the real eight-fan hand and leaves the attempted kong unapplied',async()=>{
  const world=createMatch(1),pool=Array.from({length:144},(_,i)=>i<136?Math.floor(i/4):i-102),take=t=>pool.splice(pool.indexOf(t),1);
  world.players.forEach(p=>{p.hand=[];p.melds=[];p.flowers=[];p.river=[];});world.players[0].hand=[1,2,3,4,5,6,10,11,12,14,32];world.players[0].melds=[{kind:'pung',tiles:[32,32,32],from:3,concealed:false,promoted:false}];world.players[1].hand=[0,0,8,9,17,18,26,27,28,29,30,31,33];
  for(const p of world.players){p.hand.forEach(take);p.melds.forEach(m=>m.tiles.forEach(take));}for(const who of [2,3])for(let n=0;n<13;n++)world.players[who].hand.push(pool.shift());
  Object.assign(world,{wall:pool,head:0,tail:pool.length-1,turn:0,phase:'turn',drawn:32,replacement:false,last:null,responses:{},events:[],results:[],actions:[]});
  const action={type:'add-kong',tile:32};assert.ok(legalActions(world,0,scorer).some(a=>actionKey(a)===actionKey(action)));
  const r=await simulatePlan(world,0,{index:0,action,followUpDiscard:null},scorer,refereePolicy);assert.equal(r.winner,1);assert.equal(r.from,0);assert.equal(r.selfDrawn,false);assert.ok(r.fans[1]>=88);assert.equal(r.claimApplied,false);assert.equal(r.scores.reduce((a,b)=>a+b,0),0);
});
test('kong replacement flowers follow the same draw and scoring flags as the live referee',async()=>{
  const c=cases.find(c=>c.name==='concealed-kong'),world=sampleWorld(c.observation,22),flower=world.wall.findIndex(t=>t>=34);assert.ok(flower>=0);const last=world.wall.length-1;[world.wall[flower],world.wall[last]]=[world.wall[last],world.wall[flower]];
  const normal=world.wall.findIndex((t,i)=>t<34&&i<last-1);[world.wall[normal],world.wall[last-1]]=[world.wall[last-1],world.wall[normal]];let first=null;
  await simulatePlan(world,c.observation.seat,{index:0,action:c.action,followUpDiscard:null},scorer,o=>{if(first===null&&o.seat===c.observation.seat)first=o;return refereePolicy(o)});
  assert.ok(first);assert.equal(first.players[first.seat].flowers.length,c.observation.players[first.seat].flowers.length+1);assert.equal(first.replacement,false);assert.equal(first.hand.length,c.observation.hand.length-3);
});
test('the exported trained ensemble matches NumPy and its recorded model fingerprint',async()=>{
  const {actionValueModel}=await import('../guobiao-mahjong/ai/value/weights.ts'),{predictActionValue}=await import('../guobiao-mahjong/ai/value/model.ts'),fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-value-model.json',import.meta.url))),training=JSON.parse(readFileSync(new URL('../guobiao-mahjong/ai/value/training.json',import.meta.url)));
  validateActionValueModel(actionValueModel);assert.equal(createHash('sha256').update(JSON.stringify(actionValueModel)).digest('hex'),training.exportedModelSha256);assert.ok(fixture.rows.length>=12);
  for(const row of fixture.rows){const actual=predictActionValue(row.features,actionValueModel);for(let j=0;j<3;j++)for(let k=0;k<4;k++)assert.ok(Math.abs(actual[j][k]-row.predictions[j][k])<1e-10);}
});
test('the original offline reference reproduces recorded decisions and claim continuations',async()=>{
  const {actionValueModel}=await import('../guobiao-mahjong/ai/value/weights.ts'),{enhancePolicy}=await import('../guobiao-mahjong/ai/hybrid.ts'),fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-value-decisions.json',import.meta.url)));assert.ok(fixture.cases.length>0);
  const store=new ValueContinuations();for(const c of fixture.cases){const selected=c.prior.indexOf(Math.max(...c.prior)),d=rankActionValues(c.observation,c.prior,selected,scorer,actionValueModel,store);assert.deepEqual(d.action,c.expectedAction);assert.equal(d.reason,c.expectedReason);assert.deepEqual(enhancePolicy(c.observation,c.prior,selected,scorer,'value',actionValueModel).action,c.expectedAction);
    if(c.followUp){const o=c.followUp.observation,d=rankActionValues(o,uniform(o),0,scorer,actionValueModel,store);assert.deepEqual(d.action,c.followUp.expectedAction);assert.equal(d.reason,'value-follow-up');}
  }
});
test('the packed student reproduces quantized NumPy outputs across all action families',async()=>{
  const {distilledValueAsset:asset,distilledValueModel:model}=await import('../guobiao-mahjong/ai/value/distilledWeights.ts'),{predictActionValue}=await import('../guobiao-mahjong/ai/value/model.ts'),fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-distilled-model.json',import.meta.url))),metadata=JSON.parse(readFileSync(new URL('../guobiao-mahjong/ai/value/distillation.json',import.meta.url)));
  assert.equal(createHash('sha256').update(Buffer.from(asset.payload,'base64')).digest('hex'),metadata.payloadSha256);assert.equal(createHash('sha256').update(JSON.stringify(model)).digest('hex'),metadata.exportedModelSha256);assert.ok(asset.byteLength<32768);assert.ok(metadata.exportedSourceBytes<65536);assert.equal(new Set(fixture.rows.map(r=>r.actionType)).size,7);
  for(const row of fixture.rows){const actual=predictActionValue(row.features,model);for(let j=0;j<3;j++)for(let k=0;k<4;k++)assert.ok(Math.abs(actual[j][k]-row.predictions[j][k])<1e-10);}
});
test('compact decoding rejects corrupt, oversized and nonfinite weights and handles IEEE half values',async()=>{
  const {distilledValueAsset:asset}=await import('../guobiao-mahjong/ai/value/distilledWeights.ts'),{decodePackedActionValueModel:decode,packedChecksum}=await import('../guobiao-mahjong/ai/value/packed.ts');
  const mutate=edit=>{const copy=structuredClone(asset),bytes=Buffer.from(copy.payload,'base64');edit(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength));copy.payload=bytes.toString('base64');copy.checksum=packedChecksum(bytes);copy.payloadSha256=createHash('sha256').update(bytes).digest('hex');return copy;};
  assert.throws(()=>decode({...asset,hidden:128}));assert.throws(()=>decode({...asset,payload:asset.payload.slice(4)}));assert.throws(()=>decode({...asset,checksum:(asset.checksum+1)>>>0}));assert.throws(()=>decode(mutate(v=>v.setUint16(VALUE_NAMES.length*8,0x7c00,true))));
  const bits=[0x0001,0x8000,0x3c00,0xbc00,0x3800],copy=mutate(v=>bits.forEach((n,i)=>v.setUint16(VALUE_NAMES.length*8+i*2,n,true))),decoded=decode(copy);assert.deepEqual(decoded.networks[0].w1[0].slice(0,5),[2**-24,-0,1,-1,.5]);
});
test('the deployed student profile preserves legal actions and confirmed claim continuations',async()=>{
  const {enhancePolicy}=await import('../guobiao-mahjong/ai/hybrid.ts'),fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-distilled-decisions.json',import.meta.url)));
  for(const c of fixture.cases){const selected=c.prior.indexOf(Math.max(...c.prior)),d=enhancePolicy(c.observation,c.prior,selected,scorer,'distilled');assert.deepEqual(d.action,c.expectedAction);assert.equal(d.reason,c.expectedReason);
    if(c.followUp){const o=c.followUp.observation,next=enhancePolicy(o,uniform(o),0,scorer,'distilled');assert.deepEqual(next.action,c.followUp.expectedAction);assert.equal(next.reason,'value-follow-up');}
  }
});
test('game entry points never import teacher weights, optimizers or full-hand simulation',async()=>{
  const {runtimeBoundary}=await import('../guobiao-mahjong/benchmarks/runtime-boundary.mjs');const result=runtimeBoundary();assert.equal(result.status,'passed');assert.equal(result.entries.length,4);assert.ok(result.modules>0);
});
test('larger teacher models are validated only by the offline loader',async()=>{
  const {validateOfflineModel}=await import('../guobiao-mahjong/benchmarks/offline-models.ts'),m=controlledModel('pung');
  for(const n of m.networks){n.b1=Array(128).fill(0);n.w1=n.w1.map(()=>Array(128).fill(0));n.w2=Array.from({length:128},()=>[0,0,0,0]);}
  validateOfflineModel(m,128);assert.throws(()=>validateActionValueModel(m));assert.throws(()=>validateOfflineModel(m,16));m.networks[2].w1[20][127]=NaN;assert.throws(()=>validateOfflineModel(m,128));
});
test('adaptive budgets use paired differences, tactical floors, and bounded expansion',async()=>{
  const {budgetDecision,validateAdaptiveBudget,DEFAULT_ADAPTIVE_BUDGET:b,rolloutAssignment}=await import('../guobiao-mahjong/benchmarks/adaptive-values.ts'),row=values=>({outcomes:values.map(f=>({fans:[f,0,0,0]}))});
  assert.equal(budgetDecision([row(Array(8).fill(10)),row(Array(8).fill(0))],8,b).stop,true);
  assert.equal(budgetDecision([row(Array(8).fill(10)),row(Array(8).fill(0))],32,b).reason,'tactical-minimum');
  const common=Array.from({length:8},(_,i)=>i*20);const paired=budgetDecision([row(common.map(v=>v+2)),row(common)],8,b);assert.equal(paired.comparisons[0].pairedSE,0);assert.equal(paired.stop,true);
  assert.equal(budgetDecision([row(Array(8).fill(0)),row(Array(8).fill(0))],8,b).reason,'close-or-uncertain');
  assert.equal(budgetDecision([row(Array(128).fill(0)),row(Array(128).fill(0))],32,b).reason,'maximum-budget');
  assert.throws(()=>budgetDecision([row([1,2]),row([1])],8,b));for(const bad of [{stages:[8,128,32]},{parallelTrials:0},{stages:[8,256]},{confidenceZ:NaN}])assert.throws(()=>validateAdaptiveBudget({...b,...bad}));
  for(const i of [0,1])assert.deepEqual(rolloutAssignment(i),rolloutAssignment(i+2));assert.notDeepEqual(rolloutAssignment(0),rolloutAssignment(1));
});
test('adaptive strong-policy labeling preserves paired worlds, public inputs and deterministic ordering',async()=>{
  const {adaptiveLabel}=await import('../guobiao-mahjong/benchmarks/adaptive-values.ts'),o=cases.find(c=>c.name==='chow').observation,g={id:0,seed:71,fold:'train',category:'claim',observation:o,prior:uniform(o)},b={stages:[2,4],ordinaryMinimum:2,tacticalMinimum:4,closeFan:.5,confidenceZ:1.96,dangerThreshold:.2,parallelTrials:4};let policies=0,calls=0;
  const factory=assignment=>{policies++;assert.equal(assignment.length,4);return q=>{calls++;assert.ok(!('wall' in q));assert.ok(q.players.every(p=>!('hand' in p)));return refereePolicy(q)}};
  const a=await adaptiveLabel(g,scorer,factory,b),d=await adaptiveLabel(g,scorer,factory,{...b,parallelTrials:1});assert.deepEqual(a,d);assert.ok(calls>0);assert.equal(policies,a.rows.length*8);assert.equal(a.sampling.worlds,4);assert.equal(a.sampling.tactical,true);for(const r of a.rows){assert.equal(r.outcomes.length,4);assert.ok(r.outcomes.every(v=>v.scores.reduce((a,b)=>a+b,0)===0));}
  const controller=new AbortController();controller.abort();await assert.rejects(adaptiveLabel(g,scorer,factory,b,controller.signal),{name:'AbortError'});
});
test('offline KD inference batches independent observations, propagates failures and cancels pending work',async()=>{
  const {OfflineInference}=await import('../guobiao-mahjong/benchmarks/offline-inference.ts'),o=cases[0].observation,sizes=[],runtime={async policies(_id,observations){sizes.push(observations.length);return {rows:observations.map(q=>({action:q.legalActions[0],probabilities:uniform(q)}))}}},q=new OfflineInference(runtime,'webgpu',new AbortController().signal);
  const rows=await Promise.all(Array.from({length:33},()=>q.policy(o)));assert.equal(rows.length,33);assert.deepEqual(sizes,[16,16,1]);assert.equal(q.snapshot().rows,33);
  const failure=new OfflineInference({policies:async()=>{throw Error('Fixture inference failure')}},'webgpu',new AbortController().signal);await assert.rejects(failure.policy(o),/Fixture inference failure/);await assert.rejects(failure.policy(o),/Fixture inference failure/);
  const controller=new AbortController(),cancelled=new OfflineInference(runtime,'webgpu',controller.signal),pending=cancelled.policy(o);controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('offline input planning spreads samples across walls and keeps full-corpus selection public',async()=>{
  const {selectValuePositions,valueDataPlan}=await import('../guobiao-mahjong/benchmarks/offline-inputs.mjs'),all=[];let id=0;
  for(const fold of ['train','calibration','test'])for(let seedValue=0;seedValue<9;seedValue++)for(const category of ['discard','claim','kong'])all.push({id:id++,seed:seedValue,fold,category,observation:{...cases[0].observation,wall:[1,2,3]},prior:uniform(cases[0].observation),rows:[{},{}]});
  const positions=selectValuePositions(all,{positionsPerFold:9});assert.equal(positions.length,27);assert.equal(new Set(positions.filter(g=>g.fold==='train').map(g=>g.seed)).size,3);assert.ok(positions.every(g=>!('wall' in g.observation)));
  assert.equal(selectValuePositions(all,{selection:'all'}).length,81);assert.equal(valueDataPlan(positions,all,{stages:[8,32,64,128]}).maximumHandSimulations,27*2*128);assert.throws(()=>selectValuePositions(all,{positionsPerFold:99}));
  const small=selectValuePositions(all,{positionsPerFold:3});for(const g of small)assert.equal(g.seed,4);
});
test('offline pinned inputs reject a stale resume without replacing the original data',async()=>{
  const {mkdtempSync,readFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{pinnedJson,atomicJson}=await import('../guobiao-mahjong/benchmarks/offline-inputs.mjs'),dir=mkdtempSync(join(tmpdir(),'mahjong-offline-input-')),path=join(dir,'input.json');
  try{pinnedJson(path,{seed:1});const original=readFileSync(path,'utf8');pinnedJson(path,{seed:1});assert.throws(()=>pinnedJson(path,{seed:2}),/fresh output directory/);assert.equal(readFileSync(path,'utf8'),original);atomicJson(join(dir,'shards','0.json'),{complete:true});assert.equal(JSON.parse(readFileSync(join(dir,'shards','0.json'))).complete,true);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('cross-runtime feature parity allows rounding noise but rejects structural or material changes',async()=>{
  const {valueFeatureError}=await import('../guobiao-mahjong/benchmarks/value-parity.mjs');assert.ok(valueFeatureError([.1+Number.EPSILON],[.1])<1e-12);assert.equal(valueFeatureError([1,0],[1,0]),0);
  assert.throws(()=>valueFeatureError([1],[1,0]));assert.throws(()=>valueFeatureError([NaN],[0]));assert.throws(()=>valueFeatureError([.10001],[.1]));
});
test('opponent belief features use ordered public history and cannot read hidden hands',async()=>{
  const {beliefFeatures,BELIEF_FEATURE_NAMES}=await import('../guobiao-mahjong/ai/belief/features.ts'),o=cases[0].observation,target=seat(o.seat+1),f=beliefFeatures(o,target),poisoned=structuredClone(o);poisoned.wall=[0,0,0];poisoned.players[target].hand=[33,33,33];poisoned.players[target].melds.forEach(m=>{if(m.concealed)m.tiles=[33,33,33,33]});
  assert.equal(f.length,BELIEF_FEATURE_NAMES.length);assert.deepEqual(beliefFeatures(poisoned,target),f);const {jointFeatures}=await import('../guobiao-mahjong/ai/joint/features.ts'),{jointPlans}=await import('../guobiao-mahjong/ai/joint/plans.ts'),{opponentBeliefs}=await import('../guobiao-mahjong/ai/belief/model.ts'),bundle=await jointFixture(),b=opponentBeliefs(o,bundle.belief),bp=opponentBeliefs(poisoned,bundle.belief);for(const plan of jointPlans(o))assert.deepEqual(jointFeatures(o,plan,uniform(o),scorer,b),jointFeatures(poisoned,plan,uniform(o),scorer,bp));assert.throws(()=>beliefFeatures(o,o.seat));const changed=structuredClone(o);changed.events.push({hand:o.handIndex,type:'discard',seat:target,tile:0});assert.notDeepEqual(beliefFeatures(changed,target),f);
});
test('expanded joint plans include low-prior discards and all legal claim continuations',async()=>{
  const {jointPlans}=await import('../guobiao-mahjong/ai/joint/plans.ts');for(const c of cases){const o=c.observation,plans=jointPlans(o);assert.ok(plans.length<=64);for(const [i,a] of o.legalActions.entries()){if(a.type==='hu')continue;assert.ok(plans.some(p=>p.index===i));if(a.type==='chow'||a.type==='pung'){const hand=projectPlan(o,{index:i,action:a,followUpDiscard:null}).hand;assert.deepEqual(plans.filter(p=>p.index===i).map(p=>p.followUpDiscard),[...new Set(hand)].sort((a,b)=>a-b));}}}
  const o=cases.find(c=>c.name==='discard').observation;assert.equal(jointPlans(o).filter(p=>p.action.type==='discard').length,o.legalActions.filter(a=>a.type==='discard').length);
});
test('hierarchical joint probabilities do not reward an action for having extra continuations',async()=>{
  const {jointDistribution}=await import('../guobiao-mahjong/ai/joint/model.ts'),plans=[{index:0},{index:0},{index:1}],d=jointDistribution(plans,[.5,.5],[0,0,0]);assert.deepEqual(d.parentProbabilities,[.5,.5]);assert.deepEqual(d.probabilities,[.25,.25,.5]);assert.equal(d.greedyPlan,0);assert.throws(()=>jointDistribution(plans,[NaN,.5],[0,0,0]));
  const outside=jointDistribution([{index:0},{index:1}],[.999,.001],[0,10]);assert.equal(outside.greedyPlan,1);
});
test('belief posterior weights preserve support, normalize and respect an ESS floor',async()=>{
  const {posteriorWeights}=await import('../guobiao-mahjong/benchmarks/belief-worlds.ts'),targets=Array.from({length:16},(_,i)=>[+(i===0),...Array(42).fill(0)]),p=[.9,...Array(42).fill(.05)],r=posteriorWeights(targets,p);assert.ok(r.weights[0]>r.weights[1]);assert.ok(r.weights.every(v=>v>0));assert.ok(Math.abs(r.weights.reduce((a,b)=>a+b,0)-1)<1e-12);assert.ok(r.ess>=8);
  const equal=posteriorWeights(targets,targets[0].map((_,j)=>(1+targets.reduce((s,t)=>s+t[j],0))/18));assert.ok(equal.weights.every(v=>Math.abs(v-1/16)<1e-12));assert.throws(()=>posteriorWeights([[1],[0]],[NaN]));
});
async function jointFixture(kind='chow'){
  const {BELIEF_FEATURE_NAMES,BELIEF_OUTPUT_NAMES}=await import('../guobiao-mahjong/ai/belief/features.ts'),{JOINT_FEATURE_NAMES}=await import('../guobiao-mahjong/ai/joint/features.ts'),{JOINT_OUTPUT_NAMES}=await import('../guobiao-mahjong/ai/joint/model.ts'),network=(width,output)=>({mean:Array(width).fill(0),scale:Array(width).fill(1),w1:Array.from({length:width},()=>[0]),b1:[0],w2:[Array(output).fill(0)],b2:Array(output).fill(-3)}),belief={schemaVersion:1,featureNames:BELIEF_FEATURE_NAMES,outputNames:BELIEF_OUTPUT_NAMES,network:network(BELIEF_FEATURE_NAMES.length,BELIEF_OUTPUT_NAMES.length),calibration:{temperature:Array(BELIEF_OUTPUT_NAMES.length).fill(1),bias:Array(BELIEF_OUTPUT_NAMES.length).fill(0)}},joint={schemaVersion:1,featureNames:JOINT_FEATURE_NAMES,outputNames:JOINT_OUTPUT_NAMES,network:network(JOINT_FEATURE_NAMES.length,8),settings:{fanScale:32,matchWinWeight:.2}};
  joint.network.w1[JOINT_FEATURE_NAMES.indexOf('action-'+kind)][0]=1;joint.network.w2[0][0]=10;return {schemaVersion:1,belief,joint};
}
test('exploration joint policy chooses low-prior plans, preserves sampled continuations, and prioritizes legal Hu',async()=>{
  const {JointPolicy,validateJointBundle}=await import('../guobiao-mahjong/ai/joint/model.ts'),{jointPlans}=await import('../guobiao-mahjong/ai/joint/plans.ts'),bundle=await jointFixture();validateJointBundle(bundle);
  const o=cases.find(c=>c.name==='chow').observation,selected=o.legalActions.findIndex(a=>a.type==='pass'),prior=o.legalActions.map((_,i)=>i===selected?.999:.001/(o.legalActions.length-1)),a=new JointPolicy('explore'),b=new JointPolicy('explore'),d=a.decide(o,prior,selected,scorer,bundle);assert.equal(d.action.type,'chow');assert.ok(d.evaluation.plans.length>2);const plan=d.evaluation.plans[d.evaluation.selectedPlan],after=continuationObservation(o,plan),raw=after.legalActions.findIndex(v=>v.tile!==plan.followUpDiscard),p=after.legalActions.map((_,i)=>i===raw?1:0);
  assert.equal(a.decide(after,p,raw,scorer,bundle).reason,'joint-follow-up');assert.equal(a.decide(after,p,raw,scorer,bundle).action.tile,plan.followUpDiscard);assert.notEqual(b.decide(after,p,raw,scorer,bundle).reason,'joint-follow-up');
  const hu=structuredClone(o);hu.legalActions.unshift({type:'hu'});assert.equal(a.decide(hu,uniform(hu),1,scorer,bundle).action.type,'hu');assert.equal(jointPlans(o).length,d.evaluation.plans.length);
});
test('league scheduling retains all historical styles and prioritizes harder opponents',async()=>{
  const {scheduleLeague,leagueWeight,updateLeagueStatistics}=await import('../guobiao-mahjong/benchmarks/league-schedule.mjs'),config={seed:9,capturePerHand:2,trainingSeeds:[[301,302,303,304],[401,402,403,404]]},r=scheduleLeague(config,1),seen=new Set(r.jobs.flatMap(j=>j.policies.filter(p=>!p.learner).map(p=>p.key)));
  assert.ok(r.pool.every(p=>seen.has(p.key)));assert.equal(r.jobs.length,16);for(const j of r.jobs)assert.equal(j.policies.filter(p=>p.learner).length,1);assert.deepEqual(scheduleLeague(config,1),r);
  assert.ok(leagueWeight({key:'hard'},{hard:{games:10,wins:0}})>leagueWeight({key:'easy'},{easy:{games:10,wins:10}}));const g={policies:[{learner:true},{key:'x'},{key:'y'},{key:'z'}],seats:[{fan:20,score:0},{fan:10,score:0},{fan:20,score:0},{fan:30,score:0}]},s=updateLeagueStatistics({},[g]);assert.equal(s.x.wins,1);assert.equal(s.y.wins,.5);assert.equal(s.z.wins,0);
});
test('league trajectories use complete-match remaining fan and exclude forced policy decisions',async()=>{
  const {leagueMatches}=await import('../guobiao-mahjong/benchmarks/league-play.ts'),bundle=await jointFixture('discard'),model=bundle.joint;model.network.w2[0][0]=0;const inference={async policy(o){const action=o.legalActions.find(a=>a.type==='hu')??o.legalActions.find(a=>a.type==='pass')??o.legalActions.find(a=>a.type==='discard')??o.legalActions[0];return {action,probabilities:o.legalActions.map(a=>+(actionKey(a)===actionKey(action)))}}},policies=[{key:'learner',id:'joint-test',learner:true,style:'balanced',temperature:1},...Array.from({length:3},(_,i)=>({key:'kd-'+i,id:'kd-s0'}))],jobs=[{suite:'unit',seed:3123,rotation:0,policies,training:true,capturePerHand:2,fold:'train'}],result=await leagueMatches(jobs,scorer,inference,bundle.belief,new Map([['joint-test',model]]),new Map(),new AbortController().signal),g=result[0];
  const {validateLeagueEpisodes,independentEvaluationSeeds}=await import('../guobiao-mahjong/benchmarks/league-validation.mjs');assert.equal(validateLeagueEpisodes(result,{training:true}).hands,16);const bad=structuredClone(result);bad[0].trajectories[0].targets[5]++;assert.throws(()=>validateLeagueEpisodes(bad,{training:true}));independentEvaluationSeeds({evaluationSeeds:[800,801,802,803]},new Set([1,2]));assert.throws(()=>independentEvaluationSeeds({evaluationSeeds:[800,801,802,803]},new Set([802])));
  assert.equal(g.results.length,16);assert.ok(g.trajectories.length>0);assert.ok(g.trajectories.length<=32);for(const r of g.trajectories){assert.equal(r.seat,0);assert.equal(r.targets[5],(g.seats[0].fan-r.fanSnapshot[0])/32);assert.equal(r.targets[6],g.seats.slice(1).reduce((s,p,i)=>s+p.fan-r.fanSnapshot[i+1],0)/96);assert.ok(r.weight>=1);assert.ok(!('wall' in r.observation));assert.ok(r.observation.players.every(p=>!('hand' in p)));assert.ok(Math.abs(r.oldProbabilities.reduce((a,b)=>a+b,0)-1)<1e-9);}
});
test('large offline trajectories transfer in bounded chunks and clean up after errors',async()=>{
  const vm=await import('node:vm'),{readOfflineResult}=await import('../guobiao-mahjong/benchmarks/offline-transfer.mjs'),data={rows:Array.from({length:120},(_,i)=>({i,text:'东南西北\n"\\'.repeat(200)}))},ctx=vm.createContext({__offlinePending:{result:data}});let largest=0;
  const evaluate=async code=>{const value=vm.runInContext(code,ctx);if(typeof value==='string')largest=Math.max(largest,value.length);return value};assert.deepEqual(await readOfflineResult(evaluate,{chunkChars:1024,maximumChars:1000000}),data);assert.ok(largest<=1024);assert.equal(vm.runInContext('typeof __offlineText',ctx),'undefined');
  await assert.rejects(readOfflineResult(evaluate,{chunkChars:10,maximumChars:100}),/too large/);assert.equal(vm.runInContext('typeof __offlineText',ctx),'undefined');
});
test('the original model is explicit and its optional asset preserves exact reference weights',async()=>{
  const {actionValueModel}=await import('../guobiao-mahjong/ai/value/weights.ts'),{ORIGINAL_VALUE_ASSET:asset}=await import('../guobiao-mahjong/ai/value/legacyAsset.ts'),{enhancePolicy}=await import('../guobiao-mahjong/ai/hybrid.ts'),bytes=JSON.stringify(actionValueModel),o=cases[0].observation;
  assert.equal(Buffer.byteLength(bytes),asset.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.throws(()=>enhancePolicy(o,uniform(o),0,scorer,'value'),/must be loaded/);
});
test('injected value models never share pending claim plans',async()=>{
  const {enhancePolicy}=await import('../guobiao-mahjong/ai/hybrid.ts'),o=cases.find(c=>c.name==='chow').observation,prior=uniform(o),base=o.legalActions.findIndex(a=>a.type==='pass'),first=controlledModel('chow'),choice=enhancePolicy(o,prior,base,scorer,'value',first),plan=actionPlans(o,prior,scorer).find(p=>actionKey(p.action)===actionKey(choice.action)),after=continuationObservation(o,plan),raw=after.legalActions.findIndex(a=>a.tile!==plan.followUpDiscard),nextPrior=after.legalActions.map((_,i)=>i===raw?.95:.05/(after.legalActions.length-1)),second=controlledModel('chow');second.networks.forEach(n=>{n.w2[0][0]=0});assert.equal(enhancePolicy(after,nextPrior,raw,scorer,'value',second).index,raw);
});
test('the joint FP16 bundle matches independent NumPy belief, policy and value references',async()=>{
  const {decodeJointBundle}=await import('../guobiao-mahjong/ai/joint/packed.ts'),{JOINT_ASSET}=await import('../guobiao-mahjong/ai/joint/asset.ts'),{predictJoint,jointDistribution}=await import('../guobiao-mahjong/ai/joint/model.ts'),{predictBelief}=await import('../guobiao-mahjong/ai/belief/model.ts'),{beliefFeatures}=await import('../guobiao-mahjong/ai/belief/features.ts'),bytes=readFileSync(new URL('../guobiao-mahjong/ai/joint/candidate.json',import.meta.url)),fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-joint-model.json',import.meta.url))),bundle=decodeJointBundle(JSON.parse(bytes));
  assert.equal(bytes.length,JOINT_ASSET.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),JOINT_ASSET.sha256);assert.equal(fixture.assetSha256,JOINT_ASSET.sha256);assert.ok(bundle.joint.network.b1.length<=32);assert.ok(bytes.length<100000);
  for(const row of fixture.joint){const outputs=row.features.map(f=>predictJoint(f,bundle.joint));outputs.forEach((z,i)=>z.forEach((v,k)=>assert.ok(Math.abs(v-row.predictions[i][k])<1e-10)));const plans=row.parents.map(index=>({index,action:{type:'pass'},followUpDiscard:null})),p=jointDistribution(plans,row.prior,outputs.map(z=>z[0]),row.temperature).probabilities;p.forEach((v,i)=>assert.ok(Math.abs(v-row.probabilities[i])<1e-10));}
  for(const row of fixture.belief){assert.deepEqual(beliefFeatures(row.observation,row.target),row.features);const b=predictBelief(row.observation,row.target,bundle.belief),p=[b.ready,...b.ron,...b.patterns.map(p=>p.probability),Math.log1p(b.fanValue)/Math.log(89)];p.forEach((v,i)=>assert.ok(Math.abs(v-row.probabilities[i])<1e-10));}
});
test('joint network loading rejects oversized, corrupt and nonfinite inference assets',async()=>{
  const {decodeJointBundle}=await import('../guobiao-mahjong/ai/joint/packed.ts'),{networkChecksum}=await import('../guobiao-mahjong/ai/learning/packed.ts'),asset=JSON.parse(readFileSync(new URL('../guobiao-mahjong/ai/joint/candidate.json',import.meta.url)));
  const change=fn=>{const a=structuredClone(asset);fn(a);return a};assert.throws(()=>decodeJointBundle(change(a=>a.joint.network.hidden=64)));assert.throws(()=>decodeJointBundle(change(a=>a.belief.network.payload=a.belief.network.payload.slice(4))));assert.throws(()=>decodeJointBundle(change(a=>a.joint.network.checksum=(a.joint.network.checksum+1)>>>0)));
  assert.throws(()=>decodeJointBundle(change(a=>{const n=a.joint.network,b=Buffer.from(n.payload,'base64');b.writeUInt16LE(0x7c00,n.input*8);n.payload=b.toString('base64');n.checksum=networkChecksum(b);})));assert.throws(()=>decodeJointBundle(change(a=>a.belief.calibration.temperature[0]=0)));assert.throws(()=>decodeJointBundle(change(a=>a.joint.outputNames=[])));
});
test('league configuration rejects shared wall blocks and unsupported training settings',async()=>{
  const {validateLeagueConfig}=await import('../guobiao-mahjong/benchmarks/league-validation.mjs'),config=JSON.parse(readFileSync(new URL('../guobiao-mahjong/benchmarks/league-config.json',import.meta.url)));assert.equal(validateLeagueConfig(config),config);
  for(const change of [c=>c.trainingSeeds[1][0]=c.trainingSeeds[0][0],c=>c.evaluationSeeds[0]=c.trainingSeeds[0][0],c=>c.capturePerHand=2.5,c=>c.ppoClip=.5,c=>c.maximumCalibrationKL=.5,c=>c.seed=-1,c=>c.generations=0]){const c=structuredClone(config);change(c);assert.throws(()=>validateLeagueConfig(c));}
});
test('zero-residual guarded policy preserves fresh KD decisions after chow and pung',async()=>{
  const {JointPolicy}=await import('../guobiao-mahjong/ai/joint/model.ts'),{jointPlans}=await import('../guobiao-mahjong/ai/joint/plans.ts'),bundle=await jointFixture();bundle.joint.network.w2[0][0]=0;
  for(const kind of ['chow','pung']){const o=cases.find(c=>c.name===kind).observation,index=o.legalActions.findIndex(a=>a.type===kind),prior=o.legalActions.map((_,i)=>+(i===index)),p=new JointPolicy(),d=p.decide(o,prior,index,scorer,bundle),plan=jointPlans(o).find(q=>q.index===index),after=continuationObservation(o,plan),raw=after.legalActions.findIndex(a=>a.tile!==plan.followUpDiscard),nextPrior=after.legalActions.map((_,i)=>+(i===raw)),next=p.decide(after,nextPrior,raw,scorer,bundle);assert.deepEqual(d.action,o.legalActions[index]);assert.deepEqual(next.action,after.legalActions[raw]);assert.equal(next.reason,'joint-baseline-follow-up');assert.deepEqual(next.probabilities,nextPrior);}
  const c=cases.find(c=>c.name==='chow'),o=c.observation,index=o.legalActions.findIndex(a=>a.type==='chow'),plan=jointPlans(o).find(p=>p.index===index),after=continuationObservation(o,plan),firstShape=scorer.analyze(projectPlan(o,plan).hand).shanten,better=after.legalActions.findIndex(a=>scorer.analyze(after.hand.filter((_,i)=>i!==after.hand.indexOf(a.tile))).shanten<firstShape);assert.ok(better>=0);const p=new JointPolicy();p.decide(o,o.legalActions.map((_,i)=>+(i===index)),index,scorer,bundle);const result=p.decide(after,after.legalActions.map((_,i)=>+(i===better)),better,scorer,bundle);assert.deepEqual(result.action,after.legalActions[better]);
});
test('guarded corrections require policy margin, value gain, viable waits and nonworsening shanten',async()=>{
  const {guardedJointDistribution,jointDistribution}=await import('../guobiao-mahjong/ai/joint/model.ts'),{JOINT_FEATURE_NAMES:N}=await import('../guobiao-mahjong/ai/joint/features.ts'),plans=[{index:0,action:{type:'discard',tile:0},followUpDiscard:null},{index:1,action:{type:'discard',tile:1},followUpDiscard:null}],prior=[.9,.1],features=plans.map(()=>Array(N.length).fill(0));features.forEach(f=>f[N.indexOf('shanten')]=1/6);const e={plans,features,outputs:[[0,1,0,0,0,0,0,0],[6,1.1,0,0,0,0,0,0]],probabilities:jointDistribution(plans,prior,[0,6]).probabilities,selectedPlan:1,baseline:0},ok=guardedJointDistribution(e,prior,0);assert.equal(ok.greedy,1);assert.ok(ok.approved[1]);assert.ok(Math.abs(ok.probabilities.reduce((a,b)=>a+b,0)-1)<1e-12);
  for(const change of [x=>x.outputs[1][0]=0,x=>x.outputs[1][1]=1.01,x=>x.features[1][N.indexOf('shanten')]=2/6,x=>x.features[1][N.indexOf('shanten')]=0]){const bad=structuredClone(e);change(bad);const g=guardedJointDistribution(bad,prior,0);assert.equal(g.approved[1],false);assert.equal(g.greedy,0);assert.deepEqual(g.probabilities,[1,0]);}
  const ready=structuredClone(e);ready.features[1][N.indexOf('shanten')]=0;ready.features[1][N.indexOf('legal-self-waits')]=1/16;assert.equal(guardedJointDistribution(ready,prior,0).approved[1],true);
});
test('critical capture keeps declined opportunities and every kong type with correct ordinary weights',async()=>{
  const {HandCapture,criticalDecision}=await import('../guobiao-mahjong/benchmarks/trajectory-sampling.ts'),capture=new HandCapture('critical-stratified',2),ordinary={legalActions:[{type:'discard',tile:0}]};
  for(let i=0;i<8;i++)capture.add(ordinary,{key:(8-i)/10,revision:i});for(const [j,kind]of ['chow','pung','kong','concealed-kong','add-kong'].entries()){const o={legalActions:[{type:'pass'},{type:kind,tile:0}]};assert.equal(criticalDecision(o),true);capture.add(o,{key:.5,revision:10+j,selected:{type:'pass'}});}
  const rows=capture.rows(),critical=rows.filter(r=>r.sampling.stratum==='critical'),sample=rows.filter(r=>r.sampling.stratum==='ordinary');assert.equal(critical.length,5);assert.ok(critical.every(r=>r.weight===1&&r.sampling.probability===1));assert.equal(sample.length,2);assert.ok(sample.every(r=>r.weight===4&&r.sampling.probability===.25));assert.deepEqual(sample.map(r=>r.revision),[6,7]);assert.throws(()=>new HandCapture('invalid',2));assert.throws(()=>capture.add(ordinary,{key:NaN,revision:99}));
});
test('full-action data preview uses actual expanded plans and rejects unsupported sample settings',async()=>{
  const {jointDataPlan}=await import('../guobiao-mahjong/benchmarks/joint-data-plan.mjs'),source=['train','calibration','test'].flatMap((fold,j)=>['discard','claim','kong'].map((category,i)=>({id:j*3+i,seed:j+1,fold,category,observation:cases[i].observation,prior:uniform(cases[i].observation)}))),plan=jointDataPlan(source,{schemaVersion:1,selection:'stratified',positionsPerFold:3,worlds:8});assert.equal(plan.summary.positions,9);assert.ok(plan.summary.plans>9);assert.equal(plan.summary.handSimulations,plan.summary.plans*8);assert.ok(plan.positions.every(g=>!('wall' in g.observation)));assert.throws(()=>jointDataPlan(source,{schemaVersion:1,selection:'all',worlds:1}));assert.throws(()=>jointDataPlan(source,{schemaVersion:1,selection:'stratified',positionsPerFold:99,worlds:8}));
});
test('stratified full-match capture retains every offered claim even when the learner passes',async()=>{
  const {leagueMatches}=await import('../guobiao-mahjong/benchmarks/league-play.ts'),{validateLeagueEpisodes}=await import('../guobiao-mahjong/benchmarks/league-validation.mjs'),bundle=await jointFixture();bundle.joint.network.w2[0][0]=0;
  const inference={async policy(o){const action=o.legalActions.find(a=>a.type==='hu')??o.legalActions.find(a=>a.type==='pass')??o.legalActions[0];return {action,probabilities:o.legalActions.map(a=>+(actionKey(a)===actionKey(action)))}}},policies=[{key:'learner',id:'test',learner:true,temperature:1,mode:'explore'},...Array.from({length:3},(_,i)=>({key:'kd-'+i,id:'kd-s0'}))],records=await leagueMatches([{suite:'capture',seed:3124,rotation:0,policies,training:true,capturePerHand:2,captureMode:'critical-stratified',fold:'train'}],scorer,inference,bundle.belief,new Map([['test',bundle.joint]]),new Map(),new AbortController().signal),g=records[0];validateLeagueEpisodes(records,{training:true});const {auditLeagueReplay}=await import('../guobiao-mahjong/benchmarks/league-audit.mjs');const audit=await auditLeagueReplay(records,scorer,new Map([['test',bundle]]));assert.ok(audit.criticalRetained>0);assert.equal(audit.recomputedTrajectories,g.trajectories.length);assert.ok(g.trajectories.some(r=>r.sampling.stratum==='critical'&&r.plans[r.chosen].action.type==='pass'));assert.ok(g.trajectories.filter(r=>r.sampling.stratum==='critical').every(r=>r.weight===1));const corrupt=structuredClone(records);corrupt[0].trajectories.find(r=>r.sampling.stratum==='critical').sampling.probability=.5;assert.throws(()=>validateLeagueEpisodes(corrupt,{training:true}));
});
test('guard study separates fresh capture walls and all four rotated comparison arms',async()=>{
  const {guardStudyPlan}=await import('../guobiao-mahjong/benchmarks/guard-study-plan.mjs'),c=JSON.parse(readFileSync(new URL('../guobiao-mahjong/benchmarks/guard-study.json',import.meta.url))),p=guardStudyPlan(c);assert.equal(p.jobs.length,64);assert.equal(p.captures.length,2);assert.ok(p.captures.every(j=>j.captureMode==='critical-stratified'&&j.policies[0].mode==='explore'));for(const arm of c.arms)for(const seed of c.seeds){const jobs=p.jobs.filter(j=>j.suite===arm.id&&j.seed===seed);assert.equal(new Set(jobs.map(j=>j.policies.findIndex(p=>p.learner))).size,4);assert.ok(jobs.every(j=>j.policies.find(p=>p.learner).mode===arm.mode));}const bad=structuredClone(c);bad.seeds[0]=bad.captureSeeds[0];assert.throws(()=>guardStudyPlan(bad));const mode=structuredClone(c);mode.arms[0].mode='guarded';assert.throws(()=>guardStudyPlan(mode));
});
