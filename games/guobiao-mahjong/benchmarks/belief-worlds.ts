import type {Observation,Scorer} from '../rules/types';
import {seat} from '../rules/types';
import {sampleWorld,simulationSeed} from '../ai/value/simulation';
import {opponentBeliefs,type BeliefModel} from '../ai/belief/model';
import {beliefTargets} from './belief-targets';
/** A bounded marginal likelihood-ratio tilt of legal uniform proposals, not an exact joint posterior. */
export function posteriorWeights(targets:readonly number[][],predicted:readonly number[],minimumESS=.5,uniformMixture=.25){
  if(targets.length<2||!predicted.length||targets.some(r=>r.length!==predicted.length)||predicted.some(v=>!Number.isFinite(v)||v<0||v>1)||minimumESS<=0||minimumESS>1||uniformMixture<0||uniformMixture>1)throw Error('Invalid posterior pool');
  const n=targets.length,base=predicted.map((_,j)=>(1+targets.reduce((s,r)=>s+r[j]!,0))/(n+2)),scores=targets.map(row=>row.reduce((s,v,j)=>{const p=Math.max(.01,Math.min(.99,predicted[j]!)),b=base[j]!,head=j%43,weight=head===0?1:head<35?.5/34:.25/8;return s+weight*(v*Math.log(p/b)+(1-v)*Math.log((1-p)/(1-b)))},0));
  const maximum=Math.max(...scores),raw=scores.map(v=>Math.exp(Math.max(-8,v-maximum))),total=raw.reduce((a,b)=>a+b,0),normalized=raw.map(v=>v/total);let mix=uniformMixture,weights=normalized.map(v=>(1-mix)*v+mix/n),ess=1/weights.reduce((s,v)=>s+v*v,0);
  while(ess<minimumESS*n&&mix<1){mix=Math.min(1,mix+.1);weights=normalized.map(v=>(1-mix)*v+mix/n);ess=1/weights.reduce((s,v)=>s+v*v,0);}
  return {weights,ess,uniformMixture:mix,base};
}
export function beliefWorldPool(o:Observation,seed:number,scorer:Scorer,model:BeliefModel,count:number){
  if(!Number.isInteger(count)||count<2||count>256)throw Error('Invalid belief world count');const predictions=opponentBeliefs(o,model),worlds=Array.from({length:count},(_,i)=>sampleWorld(o,simulationSeed(seed,o.revision,i))),targets=worlds.map(w=>[1,2,3].flatMap(n=>{const target=seat(o.seat+n),p=w.players[target]!;return beliefTargets(o,target,p.hand,p.melds,scorer).slice(0,43)})),p=predictions.flatMap(v=>[v.ready,...v.ron,...v.patterns.map(v=>v.probability)]);
  return {worlds,...posteriorWeights(targets,p),predictions,targets,predicted:p};
}
