import {runTournament} from '../api/tournament';
import {actionKey,type Observation,type Scorer} from '../rules/types';
import {valueObservation} from '../ai/value/observation';
import {randomSource} from '../ai/value/simulation';
import {JointPolicy,type JointModel,type JointStyle,type JointEvaluation} from '../ai/joint/model';
import type {BeliefModel} from '../ai/belief/model';
import type {ActionValueModel} from '../ai/value/model';
import {OfflineValuePolicy,type OfflinePolicy} from './offline-models';
import type {OfflineInference} from './offline-inference';
export interface LeagueSeat {key:string;id:string;learner?:boolean;temperature?:number;style?:JointStyle}
export interface LeagueJob {suite:string;seed:number;rotation:number;policies:LeagueSeat[];training:boolean;capturePerHand:number;fold:'train'|'calibration'|'test'}
interface Captured {key:number;hand:number;seat:number;revision:number;observation:Observation;prior:number[];plans:JointEvaluation['plans'];features:number[][];chosen:number;oldProbabilities:number[];oldLogProbability:number;baseline:number;temperature:number;fanSnapshot:number[]}
/** Complete sixteen-hand episodes. Sampling streams and trajectory subsampling streams are separate. */
export async function leagueMatches(jobs:LeagueJob[],scorer:Scorer,inference:OfflineInference,belief:BeliefModel,joints:ReadonlyMap<string,JointModel>,values:ReadonlyMap<OfflinePolicy,ActionValueModel>,signal:AbortSignal){
  if(jobs.length<1||jobs.length>8||jobs.some(j=>j.policies.length!==4||j.capturePerHand<1||j.capturePerHand>16||j.policies.filter(p=>p.learner).length!==1||j.policies.some(p=>!p.key||p.style&&!['balanced','attack','defense'].includes(p.style)||p.temperature!==undefined&&(!Number.isFinite(p.temperature)||p.temperature<0||p.temperature>2)||j.training&&p.learner&&(!(p.temperature!>0)||p.style&&p.style!=='balanced')||!joints.has(p.id)&&!['kd-s0','kd-value-v1','kd-teacher','kd-student-fp32','kd-student-fp16'].includes(p.id))))throw Error('Invalid league jobs');
  return Promise.all(jobs.map(async job=>{
    const stats=job.policies.map(p=>({policy:p.id,style:p.style??'balanced',latencyMs:[] as number[],missedHu:0,faults:0,changes:0,reasons:{} as Record<string,number>})),captures:Array<Captured[]>=Array.from({length:16},()=>[]),eligible=Array<number>(16).fill(0);
    const agents=job.policies.map((p,who)=>{const ranker=new JointPolicy(),original=new OfflineValuePolicy(values,scorer),actionRandom=randomSource(job.seed^Math.imul(who+1,0x9e3779b9)),sampleRandom=randomSource(job.seed^Math.imul(who+1,0x85ebca6b)^0xa5c31d91);return {name:p.id+'#'+who,async decide(input:Observation){
      const o=valueObservation(input),started=performance.now(),raw=await inference.policy(o),selected=o.legalActions.findIndex(a=>actionKey(a)===actionKey(raw.action)),model=joints.get(p.id),d=model?ranker.decide(o,raw.probabilities,selected,scorer,{schemaVersion:1,belief,joint:model},job.training&&(p.temperature??0)>0?actionRandom:undefined,p.temperature&&p.temperature>0?p.temperature:1,p.style??'balanced'):{...original.decide(p.id as OfflinePolicy,o,raw.probabilities,selected),evaluation:null},st=stats[who]!;
      st.latencyMs.push(performance.now()-started);st.changes+=+d.changed;st.reasons[d.reason]=(st.reasons[d.reason]??0)+1;if(o.legalActions.some(a=>a.type==='hu')&&d.action.type!=='hu')st.missedHu++;
      if(job.training&&p.learner&&d.evaluation){const e=d.evaluation;eligible[o.handIndex]!++;const row:Captured={key:sampleRandom(),hand:o.handIndex,seat:o.seat,revision:o.revision,observation:o,prior:raw.probabilities,plans:e.plans,features:e.features,chosen:e.selectedPlan,oldProbabilities:e.probabilities,oldLogProbability:Math.log(Math.max(1e-300,e.probabilities[e.selectedPlan]!)),baseline:e.baseline,temperature:p.temperature??1,fanSnapshot:o.players.map(p=>p.fan)};captures[o.handIndex]!.push(row);captures[o.handIndex]!.sort((a,b)=>a.key-b.key);captures[o.handIndex]!.splice(job.capturePerHand);}
      return d.action;
    }}});
    const result=await runTournament(scorer,agents,[job.seed],{rotateSeats:false,skipForced:true,strict:true,timeoutMs:30000,signal}),match=result.matches[0]!,fan=match.players.map(p=>p.fan),bestFan=Math.max(...fan),bestScore=Math.max(...match.players.filter(p=>p.fan===bestFan).map(p=>p.score)),winners=match.players.flatMap((p,i)=>p.fan===bestFan&&p.score===bestScore?[i]:[]);
    const trajectories=captures.flatMap((rows,hand)=>rows.map(row=>{const r=match.results[hand]!,who=row.seat,handFan=r.winner===who?r.win!.total:0,otherFan=r.winner!==null&&r.winner!==who?r.win!.total:0,remaining=fan.map((v,i)=>v-row.fanSnapshot[i]!);return {...row,seed:job.seed,fold:job.fold,weight:eligible[hand]!/rows.length,targets:[0,handFan/32,otherFan/96,+(r.winner===who),+(r.winner!==null&&!r.selfDrawn&&r.from===who),remaining[who]!/32,remaining.filter((_,i)=>i!==who).reduce((a,b)=>a+b,0)/96,winners.includes(who)?1/winners.length:0]};}));
    return {suite:job.suite,seed:job.seed,rotation:job.rotation,fold:job.fold,policies:job.policies,seats:match.players.map((p,i)=>({...p,...stats[i]!,seat:i,place:1+match.players.filter(q=>q.fan>p.fan||q.fan===p.fan&&q.score>p.score).length+(match.players.filter(q=>q.fan===p.fan&&q.score===p.score).length-1)/2,dealIns:match.results.filter(r=>r.winner!==null&&!r.selfDrawn&&r.from===i).length})),results:match.results,replay:match.replay,trajectories,eligible};
  }));
}
