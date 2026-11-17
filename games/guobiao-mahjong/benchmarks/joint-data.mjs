import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {registerHooks} from 'node:module';
import {game,hash,json,write,assetURL,runOffline} from './offline-runner.mjs';
import {pinnedJson} from './offline-inputs.mjs';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {jointDataPlan}=await import('./joint-data-plan.mjs'),args=process.argv.slice(2).filter(a=>a!=='--plan-only');if(args.some(a=>a.startsWith('--')))throw Error('Unknown joint data option');
const output=resolve(args[0]??'artifacts/guobiao-mahjong/league/joint-data-v1'),data=resolve('artifacts/guobiao-mahjong/value/data-v2'),belief=resolve(args[1]??'artifacts/guobiao-mahjong/league/belief-v1/belief.json'),original=json(resolve(data,'groups.json')),config=json(resolve(args[2]??resolve(import.meta.dirname,'joint-data-config.json'))),plan=jointDataPlan(original,config),positions=plan.positions,worlds=config.worlds;
if(process.argv.includes('--plan-only')){console.log(JSON.stringify(plan.summary,null,2));process.exit(0);}
pinnedJson(resolve(output,'config.json'),config);pinnedJson(resolve(output,'positions.json'),positions);const positionSha=hash(readFileSync(resolve(output,'positions.json'))),beliefSha=hash(readFileSync(belief)),groups=[];let runKey;
const result=await runOffline(output,[],async({call,fingerprints})=>{
  await call({kind:'learning-assets',belief:{id:'belief-v1',url:assetURL(belief),sha256:beliefSha}});runKey=hash(JSON.stringify({fingerprints,positionSha,beliefSha,config}));
  for(const p of positions){const path=resolve(output,'shards',p.id+'.json');if(!existsSync(path)){const r=await call({kind:'joint-label',positionsUrl:assetURL(resolve(output,'positions.json')),positionsSha256:positionSha,ids:[p.id],...(config.budget?{budget:config.budget}:{worlds})});assert.equal(r.positionLoads,1);write(path,{runKey,group:r.groups[0]});}
    const shard=json(path);assert.equal(shard.runKey,runKey,'Stale joint labels');groups.push(shard.group);console.log(`[${groups.length}/${positions.length}] expanded plans=${shard.group.rows.length}, ESS=${shard.group.sampling.ess.toFixed(1)}/${shard.group.sampling.worlds}`);
  }return {groups:groups.length};
});
mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'groups.json'),JSON.stringify(groups)+'\n');write(resolve(output,'report.json'),{schemaVersion:1,status:'passed',runKey,config,...(worlds===undefined?{}:{worlds}),groups:groups.length,plans:groups.reduce((n,g)=>n+g.rows.length,0),simulations:groups.reduce((n,g)=>n+g.rows.length*g.sampling.worlds,0),beliefSha256:beliefSha,positionSha256:positionSha,groupsSha256:hash(readFileSync(resolve(output,'groups.json'))),fingerprints:result.fingerprints,preparation:result.preparation,browser:result.browser.browserEvidence,folds:Object.fromEntries(['train','calibration','test'].map(f=>[f,[...new Set(groups.filter(g=>g.fold===f).map(g=>g.seed))]])),limitations:['Initial expanded-search pilot, not a full strength-training corpus','Self-normalized importance estimates use an approximate marginal posterior with an ESS floor','All legal parent actions and claim continuations are retained, including low KD prior actions','Public model inputs only; simulated hidden hands are judge-only data']});
console.log(JSON.stringify({groups:groups.length,plans:groups.reduce((n,g)=>n+g.rows.length,0),simulations:groups.reduce((n,g)=>n+g.rows.length*g.sampling.worlds,0)}));
