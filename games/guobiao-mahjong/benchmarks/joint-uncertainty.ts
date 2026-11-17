import type {RolloutOutcome} from '../ai/value/simulation';
import type {AdaptiveBudget} from './adaptive-values';
import {validateAdaptiveBudget} from './adaptive-values';
import type {OfflinePolicy} from './offline-models';
export type WeightedOutcome=RolloutOutcome&{weight:number};
const utility=(r:RolloutOutcome)=>r.fans[0]!-r.fans.slice(1).reduce((a,b)=>a+b,0)/3;
/** Self-normalized importance estimate. SE is descriptive, including after adaptive stopping. */
export function pairedEstimate(values:readonly number[],weights:readonly number[]){
  if(values.length<2||values.length!==weights.length||values.some(v=>!Number.isFinite(v))||weights.some(w=>!Number.isFinite(w)||w<=0))throw Error('Invalid paired estimates');
  const total=weights.reduce((a,b)=>a+b,0),w=weights.map(v=>v/total),mean=values.reduce((s,v,i)=>s+v*w[i]!,0),squared=w.reduce((s,v)=>s+v*v,0),se=Math.sqrt(values.reduce((s,v,i)=>s+w[i]!**2*(v-mean)**2,0)/Math.max(1e-12,1-squared));
  return {mean,se,ess:1/squared};
}
export function jointSearchDecision(rows:readonly {outcomes:WeightedOutcome[]}[],baseline:number,minimum:number,budget:AdaptiveBudget){
  validateAdaptiveBudget(budget);const n=rows[0]?.outcomes.length??0;
  if(!rows.length||!Number.isInteger(baseline)||!rows[baseline]||n<2||rows.some(r=>r.outcomes.length!==n))throw Error('Unpaired joint outcomes');
  const weights=rows[0]!.outcomes.map(r=>r.weight);
  if(rows.some(r=>r.outcomes.some((v,i)=>v.weight!==weights[i])))throw Error('Joint candidates do not share posterior weights');
  const values=rows.map(r=>r.outcomes.map(utility)),estimates=values.map(v=>pairedEstimate(v,weights)),best=estimates.reduce((a,b,i)=>b.mean>estimates[a]!.mean?i:a,0),compare=(a:number,b:number)=>pairedEstimate(values[a]!.map((v,i)=>v-values[b]![i]!),weights),comparisons=rows.flatMap((_,i)=>i===best?[]:[{plan:i,...compare(best,i)}]),separated=comparisons.every(c=>c.mean>budget.closeFan+budget.confidenceZ*c.se),maximum=budget.stages.at(-1)!;
  // A zero empirical variance from very few worlds must not receive full training weight.
  const support=Math.min(1,estimates[0]!.ess/32),advantages=rows.map((_,i)=>compare(i,baseline)),precision=(se:number)=>Math.max(.1,support/(1+(se/4)**2));
  return {worlds:n,bestPlan:best,baseline,minimum,ess:estimates[0]!.ess,means:estimates.map(e=>e.mean),comparisons,stop:n>=maximum||n>=minimum&&separated,reason:n>=maximum?'maximum-budget':n<minimum?'tactical-minimum':separated?'separated':'close-or-uncertain',uncertainty:{version:1 as const,baselinePlan:baseline,weight:precision(Math.max(0,...advantages.map(e=>e.se))),valueWeights:estimates.map(e=>precision(e.se)),pairedSE:advantages.map(e=>e.se),policyAdvantageFan:advantages.map(e=>Math.sign(e.mean)*Math.max(0,Math.abs(e.mean)-budget.confidenceZ*e.se)),interpretation:'descriptive paired SE and conservative advantage shrinkage; not a post-selection confidence guarantee'}};
}
/** Each family receives shared worlds across ALL plans; include homogeneous and mixed strong tables. */
export function jointRolloutAssignment(sample:number):OfflinePolicy[]{
  const family=sample%4,rotation=Math.floor(sample/4)%4;
  return Array.from({length:4},(_,i)=>family===0?'kd-s0':family===1?'kd-value-v1':((i+rotation)%4<(family===2?2:1)?'kd-s0':'kd-value-v1'));
}
