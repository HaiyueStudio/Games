import {createScorer} from '../rules/scorer';
import {createMatch,observe} from '../rules/match';
import {actionKey,type Observation,type Scorer} from '../rules/types';
import {runTournament} from '../api/tournament';
import {BrowserModelRuntime,type ModelWorkerPort} from '../ai/browser/BrowserModelRuntime';
import type {BrowserReply} from '../ai/browser/protocol';
import type {BrowserBackend} from '../ai/browser/catalog';
import type {HybridProfile} from '../ai/hybrid';
import {prepareAction,visibleCounts,actionPublicCounts,forecastFlags} from '../ai/coaching/publicAnalysis';
import {handAnalysisCache} from '../ai/analysisCache';
import {batchedMatches,type ArenaMatchJob} from './batched-matches';
interface Job{id:number;kind:'prepare'|'match'|'matches'|'dispose'|'collect';backend?:BrowserBackend;policies?:string[];seed?:number;rotation?:number;suite?:string;url?:string;jobs?:ArenaMatchJob[]}
const port:ModelWorkerPort={onmessage:null,onerror:null,postMessage(job){globalThis.postMessage({kind:'model-job',job})},terminate(){globalThis.postMessage({kind:'model-dispose'})}};
const models=new BrowserModelRuntime(()=>port);
let scorer:Scorer|null=null,backend:BrowserBackend='webgpu',active=false;
const request=new AbortController();
const mode=(policy:string):HybridProfile|undefined=>policy==='kd-value-v1'?'value':['kd-safe','kd-ready','kd-search','kd-learned','kd-value','kd-distilled'].includes(policy)?policy.slice(3) as HybridProfile:undefined;
const idFor=(policy:string)=>'browser-'+(mode(policy)?'kd-s0':policy);
const params=()=>({temperature:0,seed:20261105});
globalThis.onmessage=async({data:job}:MessageEvent<Job|{kind:'model-reply';reply:BrowserReply}>)=>{
  if(job.kind==='model-reply'){port.onmessage?.({data:job.reply} as MessageEvent<BrowserReply>);return;}
  try{
    if(job.kind==='dispose'){request.abort();models.dispose();globalThis.postMessage({id:job.id,result:{disposed:true}});globalThis.close();return;}
    if(active)throw Error('Arena already running');active=true;
    if(job.kind==='prepare'){
      backend=job.backend??'webgpu';const response=await fetch(new URL('../assets/mcr.wasm',import.meta.url));if(!response.ok)throw Error('MCR rules HTTP '+response.status);scorer=await createScorer(await response.arrayBuffer());
      const policies=job.policies!,enhancement=policies.map(mode).find(p=>p!==undefined);await models.prepare([...new Set(policies.map(idFor))],backend,request.signal,enhancement);
      if(models.snapshot().actualBackend!==backend)throw Error('Requested inference backend unavailable');
      const fixtures=await(await fetch(new URL('../../test/fixtures/mahjong-browser-models.json',import.meta.url))).json() as {cases:Array<{observation:Observation;indices:number[];best:number}>};
      for(const f of fixtures.cases){const action=await models.agent('browser-kd-s0',params,()=>backend).decide(f.observation,{signal:request.signal,requestId:'parity'});if(actionKey(action)!==actionKey(f.observation.legalActions[f.indices.indexOf(f.best)]!))throw Error('NumPy reference action mismatch');}
      const batch=await models.policies('browser-kd-s0',fixtures.cases.map(f=>f.observation),params(),backend,request.signal);
      batch.rows.forEach((r,i)=>{const f=fixtures.cases[i]!;if(actionKey(r.action)!==actionKey(f.observation.legalActions[f.indices.indexOf(f.best)]!))throw Error('Batched NumPy action mismatch');});
      const warm=observe(createMatch(9931),0,scorer);for(const policy of new Set(policies))await models.agent(idFor(policy),params,()=>backend,mode(policy)).decide(warm,{signal:request.signal,requestId:'warm'});
      globalThis.postMessage({id:job.id,result:{runtime:models.snapshot(),referencePositions:fixtures.cases.length}});return;
    }
    if(!scorer)throw Error('Arena not prepared');
    if(job.kind==='matches'){const matches=await batchedMatches(job.jobs!,scorer,models,backend,request.signal);globalThis.postMessage({id:job.id,result:{matches}});return;}
    if(job.kind==='match'&&job.policies!.some(p=>p==='kd-value-v1'||p==='kd-value')){const matches=await batchedMatches([{suite:job.suite!,seed:job.seed!,rotation:job.rotation!,policies:job.policies!}],scorer,models,backend,request.signal);globalThis.postMessage({id:job.id,result:matches[0]});return;}
    if(job.kind==='collect'){
      const response=await fetch(job.url!);if(!response.ok)throw Error('Training observations HTTP '+response.status);
      const groups=await response.json() as Array<{id:number;observation:Observation}>,policies:Array<{id:number;probabilities:number[]}>=[];
      for(let start=0;start<groups.length;start+=16){const batch=groups.slice(start,start+16),reply=await models.policies('browser-kd-s0',batch.map(g=>g.observation),params(),backend,request.signal);reply.rows.forEach((r,i)=>policies.push({id:batch[i]!.id,probabilities:r.probabilities}));}
      globalThis.postMessage({id:job.id,result:{policies,runtime:models.snapshot()}});return;
    }
    const rules=scorer,policies=job.policies!,stats=policies.map(policy=>({policy,latencyMs:[] as number[],neuralWallMs:[] as number[],searchWallMs:[] as number[],missedHu:0,unqualifiedReady:0,enhancements:0,reasonCounts:{} as Record<string,number>}));
    const agents=policies.map((policy,who)=>{const agent=models.agent(idFor(policy),params,()=>backend,mode(policy));return{name:policy+'#'+who,async decide(o:Observation,context:{signal:AbortSignal;requestId:string}){
      const begin=performance.now(),action=await agent.decide(o,context),st=stats[who]!,info=models.snapshot();st.latencyMs.push(performance.now()-begin);if(info.inferenceMs!==null)st.neuralWallMs.push(info.inferenceMs);if(info.searchMs!==null)st.searchWallMs.push(info.searchMs);
      if(mode(policy)){const reason=info.decisionReason??'unknown';st.reasonCounts[reason]=(st.reasonCounts[reason]??0)+1;if(info.enhancementChanged)st.enhancements++;}
      if(o.legalActions.some(a=>a.type==='hu')&&action.type!=='hu')st.missedHu++;
      if(action.type==='discard'){const after=prepareAction(o,action,rules),a=handAnalysisCache(rules).analyze(after.hand);if(a.shanten===0){const known=visibleCounts(o),exposed=actionPublicCounts(o,action,after.melds,null),wind=(o.seat-o.dealer+4)%4;
        if(!a.effective.some(t=>known[t]!<4&&[false,true].some(self=>(rules.score(after.hand,after.melds,t,0,forecastFlags(o,t,self,false,exposed),o.roundWind,wind)?.fan??0)>=8)))st.unqualifiedReady++;}}
      return action;
    }}});
    const begin=performance.now(),result=await runTournament(rules,agents,[job.seed!],{rotateSeats:false,skipForced:true,strict:true,timeoutMs:30000,signal:request.signal}),match=result.matches[0]!;
    const seats=match.players.map((p,i)=>{const better=match.players.filter(q=>q.fan>p.fan||q.fan===p.fan&&q.score>p.score).length,tied=match.players.filter(q=>q.fan===p.fan&&q.score===p.score).length;return{...stats[i]!,...p,seat:i,hands:16,place:1+better+(tied-1)/2,dealIns:match.results.filter(r=>r.winner!==null&&!r.selfDrawn&&r.from===i).length,forced:match.replay.actions.filter(a=>a.seat===i).length-stats[i]!.latencyMs.length,faults:result.ranking.find(r=>r.name===p.name)!.faults}});
    globalThis.postMessage({id:job.id,result:{suite:job.suite,seed:job.seed,rotation:job.rotation,elapsedMs:performance.now()-begin,seats,draws:match.results.filter(r=>r.winner===null).length,results:match.results,replay:match.replay,runtime:models.snapshot()}});
  }catch(e){globalThis.postMessage({id:job.id,error:String(e)})}finally{active=false;}
};
