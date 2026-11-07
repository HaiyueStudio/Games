import {seat,type Scorer} from '../rules/types';
import type {BeliefModel} from '../ai/belief/model';
import {opponentBeliefs} from '../ai/belief/model';
import {jointPlans} from '../ai/joint/plans';
import {jointFeatures} from '../ai/joint/features';
import {simulatePlan,type RolloutOutcome,type RolloutPolicy} from '../ai/value/simulation';
import {beliefWorldPool} from './belief-worlds';
import type {ValuePosition,PolicyFactory} from './adaptive-values';
import {rolloutAssignment} from './adaptive-values';
/** Expanded search labels retain importance weights and effective sample size for every root. */
export async function jointLabel(g:ValuePosition,scorer:Scorer,belief:BeliefModel,factory:PolicyFactory,worldCount:number,signal:AbortSignal){
  signal.throwIfAborted();const o=g.observation,plans=jointPlans(o),beliefs=opponentBeliefs(o,belief),pool=beliefWorldPool(o,g.seed,scorer,belief,worldCount),rows=plans.map(plan=>({plan,features:jointFeatures(o,plan,g.prior,scorer,beliefs),outcomes:[] as Array<RolloutOutcome&{weight:number}>}));let at=0;const tasks=plans.flatMap((plan,row)=>pool.worlds.map((world,sample)=>({plan,row,world,sample}))),results:Array<{row:number;sample:number;outcome:RolloutOutcome&{weight:number}}>=[];
  await Promise.all(Array.from({length:Math.min(32,tasks.length)},async()=>{while(at<tasks.length){signal.throwIfAborted();const t=tasks[at++]!,policy:RolloutPolicy=factory(rolloutAssignment(t.sample),t.sample,t.plan),r=await simulatePlan(t.world,o.seat,t.plan,scorer,policy,signal);results.push({row:t.row,sample:t.sample,outcome:{...r,weight:pool.weights[t.sample]!,fans:[0,1,2,3].map(n=>r.fans[seat(o.seat+n)]!),scores:[0,1,2,3].map(n=>r.scores[seat(o.seat+n)]!),winner:r.winner===null?null:seat(r.winner-o.seat),from:r.from===null?null:seat(r.from-o.seat)}});}}));
  results.sort((a,b)=>a.sample-b.sample||a.row-b.row).forEach(v=>rows[v.row]!.outcomes.push(v.outcome));
  return {...g,rows,sampling:{worlds:worldCount,ess:pool.ess,uniformMixture:pool.uniformMixture,method:'public-belief marginal likelihood-ratio importance weights',sharedWorlds:true},coverage:{discards:plans.filter(p=>p.action.type==='discard').length,claims:plans.filter(p=>['chow','pung'].includes(p.action.type)).length,total:plans.length}};
}
