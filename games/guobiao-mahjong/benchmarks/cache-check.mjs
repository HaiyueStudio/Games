import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {mean,percentile} from './statistics.mjs';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {createScorer}=await import('../rules/scorer.ts'),{createMatch,observe,applyAction,nextHand}=await import('../rules/match.ts'),{decide}=await import('./strategy-experimental-v2.ts'),{decideExperimental}=await import('../ai/strategy.ts'),{handAnalysisCache}=await import('../ai/analysisCache.ts');
const root=resolve(import.meta.dirname,'../../..'),game=resolve(import.meta.dirname,'..'),output=resolve(process.argv[2]??resolve(root,'artifacts/guobiao-mahjong/strength/optimization')),wasm=readFileSync(resolve(game,'assets/mcr.wasm'));
const a=await createScorer(wasm),b=await createScorer(wasm),cache=handAnalysisCache(b),observations=[];
for(const file of readdirSync(resolve(output,'matches')).filter(f=>f.endsWith('.json')).sort()){
  const g=JSON.parse(readFileSync(resolve(output,'matches',file))),s=createMatch(g.replay.seed,g.replay.players);
  for(const r of g.replay.actions){if(r.hand>s.handIndex)nextHand(s);const o=observe(s,r.seat,a);if(o.legalActions.length>1&&!o.legalActions.some(a=>a.type==='hu'))observations.push(o);applyAction(s,r.seat,r.action,a,r.revision);if(observations.length>=160)break;}
  if(observations.length>=160)break;
}
assert.equal(observations.length,160);const uncached=[],memoized=[];
for(const [i,o] of observations.entries()){
  // Alternate timing order to reduce drift; the same deterministic policy and input are compared.
  let x,y;const run=(fn,sc,times)=>{const t=performance.now(),r=fn(o,sc,2);times.push(performance.now()-t);return {...r,elapsedMs:0}};
  if(i%2){y=run(decideExperimental,b,memoized);x=run(decide,a,uncached)}else{x=run(decide,a,uncached);y=run(decideExperimental,b,memoized)}assert.deepEqual(y,x);
}
const files=['benchmarks/cache-check.mjs','benchmarks/strategy-experimental-v2.ts','ai/strategy.ts','ai/analysisCache.ts','rules/scorer.ts','rules/match.ts','rules/handAnalysis.ts','assets/mcr.wasm'],fingerprints=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(resolve(game,p))).digest('hex')]));
const result={generatedAt:new Date().toISOString(),workload:'160 consecutive real choice observations; alternating order; same policy; CPU diagnostics under concurrent tournament load',decisions:160,identical:true,capacity:cache.snapshot(),uncached:{meanMs:mean(uncached),p50:percentile(uncached,.5),p95:percentile(uncached,.95)},cached:{meanMs:mean(memoized),p50:percentile(memoized,.5),p95:percentile(memoized,.95)},fingerprints};
writeFileSync(resolve(output,'cache-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
