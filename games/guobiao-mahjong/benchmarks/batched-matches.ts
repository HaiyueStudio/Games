import {runTournament} from '../api/tournament';
import {actionKey,type Observation,type Scorer} from '../rules/types';
import {BrowserModelRuntime} from '../ai/browser/BrowserModelRuntime';
import type {BrowserBackend} from '../ai/browser/catalog';
import {enhancePolicy,type HybridProfile} from '../ai/hybrid';
import {prepareAction,visibleCounts,actionPublicCounts,forecastFlags} from '../ai/coaching/publicAnalysis';
import {handAnalysisCache} from '../ai/analysisCache';
import {referenceValue} from './reference-value';
export interface ArenaMatchJob {suite:string;seed:number;rotation:number;policies:string[]}
type ArenaProfile=Exclude<HybridProfile,'joint'>|'value-v1';
const profile=(policy:string):ArenaProfile|undefined=>policy==='kd-s0'?undefined:policy==='kd-value'?'value-v1':policy.slice(3) as ArenaProfile;
/** Independent referees rendezvous only for neural inference. No hidden state crosses that boundary. */
export async function batchedMatches(jobs:ArenaMatchJob[],rules:Scorer,models:BrowserModelRuntime,backend:BrowserBackend,signal:AbortSignal){
  if(jobs.length<1||jobs.length>8||jobs.some(j=>j.policies.length!==4||j.policies.some(p=>!['kd-s0','kd-safe','kd-learned','kd-value','kd-value-v1','kd-distilled'].includes(p))))throw Error('Invalid batched arena jobs');
  type InferenceResult={action:Observation['legalActions'][number];neural:number;amortized:number;search:number;changed:boolean;reason:string};
  type Inference={o:Observation;mode:ArenaProfile|undefined;resolve:(r:InferenceResult)=>void;reject:(e:unknown)=>void};
  const pending:Inference[]=[];let scheduled=false,running=false;
  const flush=async()=>{
    scheduled=false;if(running||!pending.length)return;running=true;const batch=pending.splice(0,16);
    try{const result=await models.policies('browser-kd-s0',batch.map(v=>v.o),{temperature:0,seed:20261105},backend,signal),neural=result.info.inferenceMs!;
      batch.forEach((p,i)=>{const r=result.rows[i]!,selected=p.o.legalActions.findIndex(a=>actionKey(a)===actionKey(r.action)),start=performance.now(),d=p.mode==='value-v1'?referenceValue(p.o,r.probabilities,selected,rules):p.mode?enhancePolicy(p.o,r.probabilities,selected,rules,p.mode):null;p.resolve({action:d?.action??r.action,neural,amortized:neural/batch.length,search:performance.now()-start,changed:d?.changed??false,reason:d?.reason??'model'});});
    }catch(e){batch.forEach(p=>p.reject(e));pending.splice(0).forEach(p=>p.reject(e));throw e;}
    finally{running=false;if(pending.length&&!scheduled){scheduled=true;setTimeout(()=>{void flush().catch(()=>{})},0)}}
  };
  const infer=(o:Observation,mode:ArenaProfile|undefined)=>new Promise<InferenceResult>((resolve,reject)=>{pending.push({o,mode,resolve,reject});if(!scheduled&&!running){scheduled=true;setTimeout(()=>{void flush().catch(()=>{})},0)}});
  return Promise.all(jobs.map(async job=>{
    const stats=job.policies.map(policy=>({policy,latencyMs:[] as number[],neuralWallMs:[] as number[],neuralAmortizedMs:[] as number[],searchWallMs:[] as number[],missedHu:0,unqualifiedReady:0,enhancements:0,reasonCounts:{} as Record<string,number>}));
    const agents=job.policies.map((policy,who)=>({name:policy+'#'+who,async decide(o:Observation){
      const started=performance.now(),reply=await infer(o,profile(policy)),st=stats[who]!,action=reply.action;st.latencyMs.push(performance.now()-started);st.neuralWallMs.push(reply.neural);st.neuralAmortizedMs.push(reply.amortized);st.searchWallMs.push(reply.search);st.reasonCounts[reply.reason]=(st.reasonCounts[reply.reason]??0)+1;if(reply.changed)st.enhancements++;
      if(o.legalActions.some(a=>a.type==='hu')&&action.type!=='hu')st.missedHu++;
      if(action.type==='discard'){const after=prepareAction(o,action,rules),a=handAnalysisCache(rules).analyze(after.hand);if(a.shanten===0){const known=visibleCounts(o),exposed=actionPublicCounts(o,action,after.melds,null),wind=(o.seat-o.dealer+4)%4;
        if(!a.effective.some(t=>known[t]!<4&&[false,true].some(self=>(rules.score(after.hand,after.melds,t,0,forecastFlags(o,t,self,false,exposed),o.roundWind,wind)?.fan??0)>=8)))st.unqualifiedReady++;}}
      return action;
    }}));
    const started=performance.now(),result=await runTournament(rules,agents,[job.seed],{rotateSeats:false,skipForced:true,strict:true,timeoutMs:30000,signal}),match=result.matches[0]!;
    const seats=match.players.map((p,i)=>{const better=match.players.filter(q=>q.fan>p.fan||q.fan===p.fan&&q.score>p.score).length,tied=match.players.filter(q=>q.fan===p.fan&&q.score===p.score).length;return{...stats[i]!,...p,seat:i,hands:16,place:1+better+(tied-1)/2,dealIns:match.results.filter(r=>r.winner!==null&&!r.selfDrawn&&r.from===i).length,forced:match.replay.actions.filter(a=>a.seat===i).length-stats[i]!.latencyMs.length,faults:result.ranking.find(r=>r.name===p.name)!.faults}});
    return{suite:job.suite,seed:job.seed,rotation:job.rotation,elapsedMs:performance.now()-started,seats,draws:match.results.filter(r=>r.winner===null).length,results:match.results,replay:match.replay,runtime:models.snapshot()};
  }));
}
