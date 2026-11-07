import type {Observation,Scorer} from '../rules/types';
import {seat,actionKey} from '../rules/types';
import {actionPlans} from '../ai/value/actions';
import {actionValueFeatures} from '../ai/value/features';
import {sampleWorld,simulatePlan,simulationSeed,type RolloutOutcome,type RolloutPolicy} from '../ai/value/simulation';
import type {ActionPlan} from '../ai/value/types';
import {predictDiscardRisk} from '../ai/candidates/learned';
import type {OfflinePolicy} from './offline-models';

export interface AdaptiveBudget {stages:number[];ordinaryMinimum:number;tacticalMinimum:number;closeFan:number;confidenceZ:number;dangerThreshold:number;parallelTrials:number}
export interface ValuePosition {id:number;seed:number;fold:string;category:string;observation:Observation;prior:number[]}
export const DEFAULT_ADAPTIVE_BUDGET:AdaptiveBudget={stages:[8,32,64,128],ordinaryMinimum:8,tacticalMinimum:32,closeFan:.5,confidenceZ:1.96,dangerThreshold:.2,parallelTrials:32};
export function validateAdaptiveBudget(b:AdaptiveBudget){
  if(!Array.isArray(b.stages)||b.stages.length<2||b.stages.some((v,i)=>!Number.isInteger(v)||v<2||v>128||i>0&&v<=b.stages[i-1]!)||!b.stages.includes(b.ordinaryMinimum)||!b.stages.includes(b.tacticalMinimum)||b.tacticalMinimum<b.ordinaryMinimum||!Number.isInteger(b.parallelTrials)||b.parallelTrials<1||b.parallelTrials>64||![b.closeFan,b.confidenceZ,b.dangerThreshold].every(Number.isFinite)||b.closeFan<0||b.confidenceZ<0||b.dangerThreshold<0||b.dangerThreshold>1)throw Error('Invalid adaptive simulation budget');
}
const utility=(r:RolloutOutcome)=>r.fans[0]!-r.fans.slice(1).reduce((a,b)=>a+b,0)/3;
/** Descriptive paired Monte Carlo SE, not a confidence guarantee after adaptive stopping. */
export function budgetDecision(rows:readonly {outcomes:RolloutOutcome[]}[],minimum:number,budget:AdaptiveBudget){
  const n=rows[0]?.outcomes.length??0;if(!rows.length||n<2||rows.some(r=>r.outcomes.length!==n))throw Error('Unpaired adaptive outcomes');
  const means=rows.map(r=>r.outcomes.reduce((s,v)=>s+utility(v),0)/n),order=means.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v||a.i-b.i),best=order[0]!;
  const comparisons=order.slice(1).map(other=>{const d=rows[best.i]!.outcomes.map((r,i)=>utility(r)-utility(rows[other.i]!.outcomes[i]!)),mean=best.v-other.v,se=Math.sqrt(d.reduce((s,v)=>s+(v-mean)**2,0)/(n-1)/n);return {plan:other.i,gapFan:mean,pairedSE:se,separated:mean>budget.closeFan+budget.confidenceZ*se};});
  const max=budget.stages.at(-1)!;
  return {worlds:n,bestPlan:best.i,minimum,means,comparisons,stop:n>=max||n>=minimum&&comparisons.every(c=>c.separated),reason:n>=max?'maximum-budget':n<minimum?'tactical-minimum':comparisons.every(c=>c.separated)?'separated':'close-or-uncertain'};
}
export function rolloutAssignment(sample:number):OfflinePolicy[]{return Array.from({length:4},(_,i)=>(i+sample)%2===0?'kd-s0':'kd-value-v1');}
export type PolicyFactory=(assignment:OfflinePolicy[],sample:number,plan:ActionPlan)=>RolloutPolicy;
/** All plans receive identical world seeds and seat policies at every expansion stage. */
export async function adaptiveLabel(group:ValuePosition,scorer:Scorer,factory:PolicyFactory,budget:AdaptiveBudget=DEFAULT_ADAPTIVE_BUDGET,signal?:AbortSignal){
  validateAdaptiveBudget(budget);signal?.throwIfAborted();const o=group.observation,plans=actionPlans(o,group.prior,scorer),rows=plans.map(plan=>({plan,features:actionValueFeatures(o,plan,group.prior,scorer),outcomes:[] as RolloutOutcome[]}));
  if(rows.length<2)throw Error('Adaptive label needs alternative plans');
  const tactical=plans.some(p=>['chow','pung','kong','concealed-kong','add-kong'].includes(p.action.type)),risky=plans.some(p=>p.action.type==='discard'&&predictDiscardRisk(o,p.action.tile!).maximum>=budget.dangerThreshold),minimum=tactical||risky?budget.tacticalMinimum:budget.ordinaryMinimum,stages=[];
  let previous=0;
  for(const target of budget.stages){
    const trials=Array.from({length:target-previous},(_,j)=>previous+j).flatMap(sample=>plans.map((plan,row)=>({sample,plan,row}))),results:Array<{row:number;sample:number;outcome:RolloutOutcome}>=[];let at=0;
    await Promise.all(Array.from({length:Math.min(budget.parallelTrials,trials.length)},async()=>{
      while(at<trials.length){signal?.throwIfAborted();const trial=trials[at++]!,world=sampleWorld(o,simulationSeed(group.seed,o.revision,trial.sample)),r=await simulatePlan(world,o.seat,trial.plan,scorer,factory(rolloutAssignment(trial.sample),trial.sample,trial.plan),signal);
        results.push({row:trial.row,sample:trial.sample,outcome:{...r,fans:[0,1,2,3].map(n=>r.fans[seat(o.seat+n)]!),scores:[0,1,2,3].map(n=>r.scores[seat(o.seat+n)]!),winner:r.winner===null?null:seat(r.winner-o.seat),from:r.from===null?null:seat(r.from-o.seat)}});
      }
    }));
    results.sort((a,b)=>a.sample-b.sample||a.row-b.row).forEach(r=>rows[r.row]!.outcomes.push(r.outcome));previous=target;const decision=budgetDecision(rows,minimum,budget);stages.push(decision);if(decision.stop)break;
  }
  return {...group,rows,sampling:{worlds:previous,tactical,risky,stages,assignment:'alternating KD0/original-value seats per world',pairedPlans:plans.map(p=>actionKey(p.action)+':'+p.followUpDiscard)}};
}
