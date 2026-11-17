import {lastTileAlternative} from '../ai/lastTileDefense';
import {seat,type Scorer} from '../rules/types';
import type {BeliefModel} from '../ai/belief/model';
import {opponentBeliefs} from '../ai/belief/model';
import {jointPlans} from '../ai/joint/plans';
import {jointFeatures} from '../ai/joint/features';
import {simulatePlan,type RolloutOutcome,type RolloutPolicy} from '../ai/value/simulation';
import {beliefWorldPool,posteriorWeights} from './belief-worlds';
import type {ValuePosition,PolicyFactory,AdaptiveBudget} from './adaptive-values';
import {rolloutAssignment,validateAdaptiveBudget} from './adaptive-values';
import {jointSearchDecision,jointRolloutAssignment,type WeightedOutcome} from './joint-uncertainty';
import {predictDiscardRisk} from '../ai/candidates/learned';
import {continuationObservation} from '../ai/value/actions';
/** Expanded search labels retain importance weights and effective sample size for every root. */
export async function jointLabel(g:ValuePosition,scorer:Scorer,belief:BeliefModel,factory:PolicyFactory,worldCount:number|AdaptiveBudget,signal:AbortSignal){
  if(typeof worldCount!=='number')return adaptiveJointLabel(g,scorer,belief,factory,worldCount,signal);
  signal.throwIfAborted();const o=g.observation,plans=jointPlans(o),beliefs=opponentBeliefs(o,belief),pool=beliefWorldPool(o,g.seed,scorer,belief,worldCount),rows=plans.map(plan=>({plan,features:jointFeatures(o,plan,g.prior,scorer,beliefs,g.featureVersion??1),outcomes:[] as Array<RolloutOutcome&{weight:number}>}));let at=0;const tasks=plans.flatMap((plan,row)=>pool.worlds.map((world,sample)=>({plan,row,world,sample}))),results:Array<{row:number;sample:number;outcome:RolloutOutcome&{weight:number}}>=[];
  await Promise.all(Array.from({length:Math.min(32,tasks.length)},async()=>{while(at<tasks.length){signal.throwIfAborted();const t=tasks[at++]!,policy:RolloutPolicy=factory(rolloutAssignment(t.sample),t.sample,t.plan),r=await simulatePlan(t.world,o.seat,t.plan,scorer,policy,signal);results.push({row:t.row,sample:t.sample,outcome:{...r,weight:pool.weights[t.sample]!,fans:[0,1,2,3].map(n=>r.fans[seat(o.seat+n)]!),scores:[0,1,2,3].map(n=>r.scores[seat(o.seat+n)]!),winner:r.winner===null?null:seat(r.winner-o.seat),from:r.from===null?null:seat(r.from-o.seat)}});}}));
  results.sort((a,b)=>a.sample-b.sample||a.row-b.row).forEach(v=>rows[v.row]!.outcomes.push(v.outcome));
  return {...g,rows,sampling:{worlds:worldCount,ess:pool.ess,uniformMixture:pool.uniformMixture,method:'public-belief marginal likelihood-ratio importance weights',sharedWorlds:true},coverage:{discards:plans.filter(p=>p.action.type==='discard').length,claims:plans.filter(p=>['chow','pung'].includes(p.action.type)).length,total:plans.length}};
}
async function adaptiveJointLabel(g:ValuePosition,scorer:Scorer,belief:BeliefModel,factory:PolicyFactory,budget:AdaptiveBudget,signal:AbortSignal){
  validateAdaptiveBudget(budget);signal.throwIfAborted();const o=g.observation,plans=jointPlans(o),beliefs=opponentBeliefs(o,belief),pool=beliefWorldPool(o,g.seed,scorer,belief,budget.stages.at(-1)!),rows=plans.map(plan=>({plan,features:jointFeatures(o,plan,g.prior,scorer,beliefs,g.featureVersion??1),outcomes:[] as WeightedOutcome[]})),parent=g.prior.indexOf(Math.max(...g.prior)),baseline=plans.findIndex(p=>p.index===parent),tactical=plans.some(p=>['chow','pung','kong','concealed-kong','add-kong'].includes(p.action.type)),risky=plans.some(p=>p.action.type==='discard'&&predictDiscardRisk(o,p.action.tile!).maximum>=budget.dangerThreshold),minimum=tactical||risky?budget.tacticalMinimum:budget.ordinaryMinimum,stages=[];
  let baselinePlan=baseline;
  if(['chow','pung'].includes(plans[baseline]!.action.type)){
    const after=continuationObservation(o,plans[baseline]!),raw=await factory(Array(4).fill('kd-s0'),0,plans[baseline]!)(after),action=lastTileAlternative(after,raw)??raw;baselinePlan=plans.findIndex(p=>p.index===parent&&p.followUpDiscard===action.tile);if(baselinePlan<0)throw Error('KD continuation missing from complete plans');
  }
  let previous=0,posterior=posteriorWeights(pool.targets.slice(0,budget.stages[0]!),pool.predicted);
  for(const target of budget.stages){
    const tasks=Array.from({length:target-previous},(_,i)=>previous+i).flatMap(sample=>plans.map((plan,row)=>({sample,plan,row}))),results:Array<{sample:number;row:number;outcome:WeightedOutcome}>=[];let at=0;
    await Promise.all(Array.from({length:Math.min(budget.parallelTrials,tasks.length)},async()=>{while(at<tasks.length){signal.throwIfAborted();const t=tasks[at++]!,r=await simulatePlan(pool.worlds[t.sample]!,o.seat,t.plan,scorer,factory(jointRolloutAssignment(t.sample),t.sample,t.plan),signal);results.push({sample:t.sample,row:t.row,outcome:{...r,weight:1,fans:[0,1,2,3].map(n=>r.fans[seat(o.seat+n)]!),scores:[0,1,2,3].map(n=>r.scores[seat(o.seat+n)]!),winner:r.winner===null?null:seat(r.winner-o.seat),from:r.from===null?null:seat(r.from-o.seat)}});}}));
    results.sort((a,b)=>a.sample-b.sample||a.row-b.row).forEach(r=>rows[r.row]!.outcomes.push(r.outcome));posterior=posteriorWeights(pool.targets.slice(0,target),pool.predicted);rows.forEach(r=>r.outcomes.forEach((v,i)=>v.weight=posterior.weights[i]!));previous=target;
    const decision=jointSearchDecision(rows,baselinePlan,minimum,budget);stages.push(decision);if(decision.stop)break;
  }
  return {...g,rows,uncertainty:stages.at(-1)!.uncertainty,sampling:{worlds:previous,ess:posterior.ess,uniformMixture:posterior.uniformMixture,method:'adaptive paired public-belief importance search',sharedWorlds:true,tactical,risky,stages,continuations:'KD0, original-value, and two mixed strong table families, rotated every four worlds'},coverage:{discards:plans.filter(p=>p.action.type==='discard').length,claims:plans.filter(p=>['chow','pung'].includes(p.action.type)).length,total:plans.length}};
}
