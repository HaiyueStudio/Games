import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {valueObservation} from '../ai/value/observation.ts';

export function atomicJson(path,data){
  mkdirSync(dirname(path),{recursive:true});const temporary=path+'.tmp-'+process.pid;writeFileSync(temporary,JSON.stringify(data,null,2)+'\n');renameSync(temporary,path);
}
/** A resumed run must never overwrite the inputs needed to interpret its existing shards. */
export function pinnedJson(path,data){
  const text=JSON.stringify(data,null,2)+'\n';if(existsSync(path)){assert.equal(readFileSync(path,'utf8'),text,'Existing offline input differs; use a fresh output directory: '+path);return;}atomicJson(path,data);
}
/** Stratify without looking at outcomes. Larger samples spread across original wall seeds. */
export function selectValuePositions(all,config){
  assert.ok(Array.isArray(all)&&all.length&&new Set(all.map(g=>g.id)).size===all.length,'Expected distinct source positions');assert.ok(config.selection===undefined||config.selection==='stratified'||config.selection==='all','Unknown position selection');let selected=[];
  if(config.selection==='all')selected=[...all];
  else for(const fold of ['train','calibration','test']){
    const quota=typeof config.positionsPerFold==='number'?config.positionsPerFold:config.positionsPerFold?.[fold];assert.ok(Number.isInteger(quota)&&quota>=3,'Expected at least three positions in '+fold);
    const chosen={};for(const [i,category] of ['discard','claim','kong'].entries()){
      const n=Math.floor(quota/3)+ +(i<quota%3),pool=all.filter(g=>g.fold===fold&&g.category===category);assert.ok(pool.length>=n,'Too few '+fold+'/'+category+' positions; reduce quota or use selection=all');chosen[category]=Array.from({length:n},(_,j)=>pool[Math.floor((j+.5)*pool.length/n)]);
    }
    for(let i=0;i<quota;i++){const category=['discard','claim','kong'][i%3];selected.push(chosen[category].shift());}
  }
  return selected.map(({id,seed,fold,category,observation,prior})=>({id,seed,fold,category,observation:valueObservation(observation),prior:[...prior]}));
}
export function valueDataPlan(positions,sourceGroups,budget){
  const counts=new Map(sourceGroups.map(g=>[g.id,g.rows.length])),plans=positions.reduce((n,g)=>n+counts.get(g.id),0);
  assert.ok(Number.isInteger(plans)&&plans>0&&Array.isArray(budget.stages)&&budget.stages.length);return {positions:positions.length,plans,folds:Object.fromEntries(['train','calibration','test'].map(f=>[f,{positions:positions.filter(g=>g.fold===f).length,seeds:[...new Set(positions.filter(g=>g.fold===f).map(g=>g.seed))]}])),maximumWorlds:budget.stages.at(-1),maximumHandSimulations:plans*budget.stages.at(-1),note:'Upper bound of complete current-hand counterfactual simulations, not a time estimate'};
}
