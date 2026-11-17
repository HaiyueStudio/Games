import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {createScorer}=await import('../rules/scorer.ts'),{actionValueFeatures}=await import('../ai/value/features.ts'),{sampleWorld,simulatePlan,simulationSeed}=await import('../ai/value/simulation.ts'),{predictActionValue,validateActionValueModel}=await import('../ai/value/model.ts'),{actionValueModel}=await import('../ai/value/weights.ts'),{decide}=await import('../ai/strategy.ts'),{validateLearningSplit}=await import('./learning-validation.mjs');
const game=resolve(import.meta.dirname,'..'),out=resolve(process.argv[2]??'artifacts/guobiao-mahjong/value/data-v2'),modelOut=resolve(process.argv[3]??'artifacts/guobiao-mahjong/value/model-v1'),hash=b=>createHash('sha256').update(b).digest('hex'),report=JSON.parse(readFileSync(resolve(out,'report.json'))),training=JSON.parse(readFileSync(resolve(modelOut,'training-report.json'))),groups=JSON.parse(readFileSync(resolve(out,'groups.json')));
assert.equal(hash(readFileSync(resolve(out,'report.json'))),training.dataReportSha256);assert.equal(hash(readFileSync(resolve(out,'groups.json'))),report.groupsSha256);assert.equal(hash(readFileSync(resolve(modelOut,'model.json'))),training.modelSha256);assert.deepEqual(actionValueModel,JSON.parse(readFileSync(resolve(modelOut,'model.json'))));validateActionValueModel(actionValueModel);validateLearningSplit(training.folds);
// Historical data retains its original generator; runtime features are independently recomputed below.
const {existsSync}=await import('node:fs');
for(const [p,sha] of Object.entries(report.fingerprints)){const archived=resolve(out,'source',p);assert.equal(hash(readFileSync(existsSync(archived)?archived:resolve(game,p))),sha,p+' source mismatch');}
const scorer=await createScorer(readFileSync(resolve(game,'assets/mcr.wasm'))),sum=v=>v.reduce((a,b)=>a+b,0),mean=v=>sum(v)/v.length;
const metrics={},categories={};let recomputed=0,plans=0,simulations=0,actions=0;
for(const fold of ['train','calibration','test']){
  const positions=groups.filter(g=>g.fold===fold),mse=[],pair=[],mae=[];
  for(const g of positions){const predictions=[],targets=[];categories[g.category]=(categories[g.category]??0)+1;
    for(const row of g.rows){
      const f=actionValueFeatures(g.observation,row.plan,g.prior,scorer);assert.deepEqual(f,row.features);recomputed++;plans++;
      const p=predictActionValue(f,actionValueModel),pred=[0,1,2,3].map(k=>mean(p.map(v=>v[k]))),target=[mean(row.outcomes.map(r=>r.fans[0]/32)),mean(row.outcomes.map(r=>sum(r.fans.slice(1))/96))];predictions.push(pred[0]-pred[1]);targets.push(target[0]-target[1]);
      for(let k=0;k<2;k++)mse.push((pred[k]-target[k])**2);mae.push(Math.abs(pred[0]-target[0])*32);
      assert.equal(row.outcomes.length,report.worlds);for(const r of row.outcomes){assert.equal(sum(r.scores),0);assert.ok(r.fans.every(v=>v>=0));assert.ok(r.winner===null||r.fans[r.winner]>=8);assert.ok(r.actions<=1024);simulations++;actions+=r.actions;}
    }
    if(predictions.length>1){const pm=mean(predictions),tm=mean(targets);pair.push(...predictions.map((v,i)=>((v-pm)-(targets[i]-tm))**2));}
  }
  metrics[fold]={groups:positions.length,loss:mean(mse)+mean(pair),ownFanMAE:mean(mae)};assert.ok(Math.abs(metrics[fold].loss-training.metrics[fold].loss)<1e-10);assert.ok(Math.abs(metrics[fold].ownFanMAE-training.metrics[fold].ownFanMAE)<1e-9);
}
// Replay one common sampled world for representative branches from all action families.
let replayed=0;const seen=new Set();for(const g of groups)for(const row of g.rows){const key=row.plan.action.type;if(seen.has(key))continue;seen.add(key);const r=await simulatePlan(sampleWorld(g.observation,simulationSeed(g.seed,g.observation.revision,0)),g.observation.seat,row.plan,scorer,o=>decide(o,scorer,1).action),relative=i=>(i-g.observation.seat+4)%4;
  assert.deepEqual({...r,fans:[0,1,2,3].map(n=>r.fans[(g.observation.seat+n)%4]),scores:[0,1,2,3].map(n=>r.scores[(g.observation.seat+n)%4]),winner:r.winner===null?null:relative(r.winner),from:r.from===null?null:relative(r.from)},row.outcomes[0]);replayed++;
}
for(const key of ['discard','pass','chow','pung','kong','concealed-kong','add-kong'])assert.ok(seen.has(key));
const validation={schemaVersion:1,status:'passed',generatedAt:new Date().toISOString(),modelSha256:training.modelSha256,dataReportSha256:training.dataReportSha256,groups:groups.length,plans,simulations,simulatedLegalActions:actions,recomputedFeatures:recomputed,replayedActionFamilies:replayed,categories,metrics,checks:['whole-wall-seed-splits','source-data-model-hashes','public-feature-recomputation','numpy-typescript-test-metrics','full-hand-outcome-invariants','common-world-branch-replays']};writeFileSync(resolve(modelOut,'validation.json'),JSON.stringify(validation,null,2)+'\n');console.log(JSON.stringify(validation,null,2));
