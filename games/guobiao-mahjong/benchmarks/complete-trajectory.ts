import type {Action,HandResult} from '../rules/types';
export type TraceKind='policy'|'forced'|'legal-win'|'last-tile-safe'|'joint-follow-up';
export interface DecisionTrace {kind:TraceKind;priorAction:Action}
export interface LearnerStep {revision:number;hand:number;seat:number;action:Action;kind:TraceKind;priorAction?:Action;nextRevision:number|null;nextPolicyRevision:number|null;reward:number[];terminal:boolean}
/** Judge-only index of every learner action, including deterministic actions with no actor gradient. */
export function completeLearnerTrace(actions:readonly {revision:number;hand:number;seat:number;action:Action}[],results:readonly HandResult[],seat:number,decisions:ReadonlyMap<number,DecisionTrace>):LearnerStep[]{
  const states=[Array<number>(4).fill(0)];
  for(const r of results){const next=[...states[states.length-1]!];if(r.winner!==null)next[r.winner]!+=r.win!.total;states.push(next);}
  const final=states[16]!,score=results.reduce((sum,r)=>sum.map((v,i)=>v+r.deltas[i]!),Array<number>(4).fill(0)),bestFan=Math.max(...final),bestScore=Math.max(...score.filter((_,i)=>final[i]===bestFan)),winners=final.flatMap((v,i)=>v===bestFan&&score[i]===bestScore?[i]:[]),own=actions.filter(a=>a.seat===seat);
  return own.map((a,i)=>{const next=own[i+1],before=states[a.hand]!,after=states[next?.hand??16]!,delta=after.map((v,j)=>v-before[j]!),meta=decisions.get(a.revision),nextPolicy=own.slice(i+1).find(r=>decisions.get(r.revision)?.kind==='policy');return {...a,kind:meta?.kind??'forced',...(meta?{priorAction:meta.priorAction}:{}),nextRevision:next?.revision??null,nextPolicyRevision:nextPolicy?.revision??null,reward:[delta[seat]!/32,delta.filter((_,j)=>j!==seat).reduce((x,y)=>x+y,0)/96,!next&&winners.includes(seat)?1/winners.length:0],terminal:!next};});
}
