import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const game=resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex');
const {createScorer}=await import('../rules/scorer.ts'),{createMatch,observe,applyAction,nextHand}=await import('../rules/match.ts'),{seat,actionKey}=await import('../rules/types.ts'),{decide}=await import('../ai/strategy.ts');
const {actionPlans}=await import('../ai/value/actions.ts'),{actionValueFeatures,VALUE_NAMES,VALUE_FEATURE_VERSION}=await import('../ai/value/features.ts'),{sampleWorld,simulatePlan,simulationSeed,valueObservation}=await import('../ai/value/simulation.ts');
const scorer=await createScorer(readFileSync(resolve(game,'assets/mcr.wasm'))),policy=o=>decide(o,scorer,1).action;
const SOURCES=['benchmarks/value-data.mjs','ai/value/actions.ts','ai/value/features.ts','ai/value/simulation.ts','ai/value/observation.ts','ai/value/types.ts','ai/candidates/learned.ts','ai/candidates/features.ts','ai/candidates/weights.ts','ai/candidates/targets.ts','ai/strategy.ts','ai/analysisCache.ts','ai/lastTileDefense.ts','rules/match.ts','rules/types.ts','rules/scorer.ts','rules/handAnalysis.ts','assets/mcr.wasm'];
async function label(group,worlds){
  const o=group.observation,prior=group.prior,plans=actionPlans(o,prior,scorer),rows=plans.map(plan=>({plan,features:actionValueFeatures(o,plan,prior,scorer),outcomes:[]}));
  for(let sample=0;sample<worlds;sample++){
    const world=sampleWorld(o,simulationSeed(group.seed,o.revision,sample));
    for(const row of rows){const r=await simulatePlan(world,o.seat,row.plan,scorer,policy);row.outcomes.push({...r,fans:[0,1,2,3].map(n=>r.fans[seat(o.seat+n)]),scores:[0,1,2,3].map(n=>r.scores[seat(o.seat+n)]),winner:r.winner===null?null:seat(r.winner-o.seat),from:r.from===null?null:seat(r.from-o.seat)});}
  }
  return {...group,rows};
}
if(!isMainThread){
  for(const group of workerData.groups){const begin=performance.now(),row=await label(group,workerData.worlds);parentPort.postMessage({row,ms:performance.now()-begin});}parentPort.close();
}else{
  const mode=process.argv[2]??'positions',configPath=resolve(process.argv[3]??resolve(import.meta.dirname,'value-config.json')),out=resolve(process.argv[4]??'artifacts/guobiao-mahjong/value/data-v1'),config=JSON.parse(readFileSync(configPath));mkdirSync(out,{recursive:true});
  const seeds=Object.values(config.folds).flat();assert.equal(new Set(seeds).size,seeds.length);assert.ok(seeds.every(s=>Number.isInteger(s)&&s>0&&s<=0xffffffff));assert.ok(config.worlds>=2&&config.worlds<=64&&Number.isInteger(config.worlds));assert.ok(config.positionsPerSeed>=4&&Number.isInteger(config.positionsPerSeed));assert.ok(config.concurrency>=1&&config.concurrency<=4);assert.equal(config.collectionHands,16);assert.equal(config.rolloutPolicy,'builtin-depth-1');
  const fingerprints=Object.fromEntries(SOURCES.map(p=>[p,hash(readFileSync(resolve(game,p)))])),stamp=hash(JSON.stringify({config,fingerprints})),write=(name,data)=>writeFileSync(resolve(out,name),JSON.stringify(data)+'\n');
  if(mode==='positions'){
    assert.ok(!existsSync(resolve(out,'positions.json')),'Choose a new directory for fresh positions');const groups=[];
    for(const [fold,wallSeeds] of Object.entries(config.folds))for(const seed of wallSeeds){
      const s=createMatch(seed),buckets={discard:[],claim:[],kong:[]};let inspected=0;
      // Gather from real legal games, without choosing positions according to their eventual outcome.
      while(s.phase!=='match-over'){
        if(s.phase==='hand-over'){nextHand(s);continue;}
        const actor=s.phase==='turn'?s.turn:[1,2,3].map(n=>seat(s.last.seat+n)).find(i=>!s.responses[i]);
        const o=observe(s,actor,scorer),decision=o.legalActions.length===1?{action:o.legalActions[0],candidates:[]}:decide(o,scorer,1,128);
        if(o.legalActions.length>1&&!o.legalActions.some(a=>a.type==='hu')){
          const category=o.legalActions.some(a=>a.type.includes('kong'))?'kong':o.phase==='response'?'claim':'discard';
          buckets[category].push({seed,fold,category,observation:valueObservation(o)});
        }
        applyAction(s,actor,decision.action,scorer);if(++inspected>24000)throw Error('Collection did not finish');
      }
      // Ensure claim and kong opportunities survive sampling; all samples of a wall stay in one fold.
      const quota=config.positionsPerSeed,chosen=[],pick=(list,n)=>{if(!list.length)return;for(let i=0;i<Math.min(n,list.length);i++)chosen.push(list[Math.floor((i+.5)*list.length/Math.min(n,list.length))]);};
      pick(buckets.kong,Math.ceil(quota*.2));pick(buckets.claim,Math.ceil(quota*.4));pick(buckets.discard,quota-chosen.length);
      for(const g of chosen)groups.push({...g,id:groups.length});
      console.log(JSON.stringify({fold,seed,groups:groups.length,available:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length]))}));
    }
    write('positions.json',groups);write('positions-report.json',{schemaVersion:1,config,stamp,fingerprints,groups:groups.length,inputSha256:hash(readFileSync(resolve(out,'positions.json'))),status:'passed'});
  }else if(mode==='label'){
    const positions=JSON.parse(readFileSync(resolve(out,'positions-report.json')));assert.equal(positions.stamp,stamp,'Sources/config changed after position collection');assert.equal(hash(readFileSync(resolve(out,'positions.json'))),positions.inputSha256);
    const policies=JSON.parse(readFileSync(resolve(out,'policies.json'))),policyReport=JSON.parse(readFileSync(resolve(out,'policy-report.json')));assert.equal(hash(readFileSync(resolve(out,'policies.json'))),policyReport.policySha256);assert.equal(policyReport.inputSha256,positions.inputSha256);
    const byId=new Map(policies.map(p=>[p.id,p.probabilities])),groups=JSON.parse(readFileSync(resolve(out,'positions.json'))).map(g=>({...g,prior:byId.get(g.id)}));assert.equal(byId.size,groups.length);assert.ok(groups.every(g=>g.prior?.length===g.observation.legalActions.length));
    const complete=[],started=Date.now();mkdirSync(resolve(out,'shards'),{recursive:true});const cached=groups.filter(g=>existsSync(resolve(out,'shards',g.id+'.json'))),pending=groups.filter(g=>!existsSync(resolve(out,'shards',g.id+'.json')));
    for(const g of cached){const row=JSON.parse(readFileSync(resolve(out,'shards',g.id+'.json')));assert.equal(row.stamp,stamp);assert.equal(row.policySha256,policyReport.policySha256);complete.push(row.group);}
    const workers=[];let failed=false;
    try{await Promise.all(Array.from({length:config.concurrency},(_,lane)=>new Promise((resolve,reject)=>{
      const worker=new Worker(new URL(import.meta.url),{workerData:{groups:pending.filter((_,i)=>i%config.concurrency===lane),worlds:config.worlds}});workers.push(worker);
      worker.on('message',({row,ms})=>{write('shards/'+row.id+'.json',{stamp,policySha256:policyReport.policySha256,group:row});complete.push(row);if(complete.length%24===0)console.log(JSON.stringify({complete:complete.length,total:groups.length,elapsedSeconds:Math.round((Date.now()-started)/1000),lastGroupMs:Math.round(ms)}));});worker.on('error',e=>{failed=true;reject(e)});worker.on('exit',code=>code===0?resolve():reject(Error('Label worker failed '+code)));
    })));}finally{if(failed)for(const worker of workers)await worker.terminate();}
    assert.equal(complete.length,groups.length);for(const p of SOURCES)assert.equal(hash(readFileSync(resolve(game,p))),fingerprints[p],p+' changed');complete.sort((a,b)=>a.id-b.id);write('groups.json',complete);
    const counts=Object.fromEntries(Object.keys(config.folds).map(f=>[f,{groups:complete.filter(g=>g.fold===f).length,plans:complete.filter(g=>g.fold===f).reduce((n,g)=>n+g.rows.length,0)}]));
    write('report.json',{schemaVersion:1,featureVersion:VALUE_FEATURE_VERSION,featureNames:VALUE_NAMES,config,stamp,fingerprints,counts,groups:complete.length,worlds:config.worlds,groupsSha256:hash(readFileSync(resolve(out,'groups.json'))),policySha256:policyReport.policySha256,generatedAt:new Date().toISOString(),elapsedMs:Date.now()-started,status:'passed',limitations:['Uniform public-count-consistent unknown hands; no learned opponent posterior','Full current hand rollouts, not a simulation of all remaining rounds','Frozen builtin-depth-1 rollout policy; labels are conditional on this policy','Common sampled worlds for every action and immediate follow-up; no privileged actor inputs']});console.log(JSON.stringify({status:'passed',counts,elapsedSeconds:Math.round((Date.now()-started)/1000)}));
  }else throw Error('Expected positions or label');
}
