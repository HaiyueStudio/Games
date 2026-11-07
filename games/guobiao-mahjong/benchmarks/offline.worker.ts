import {createScorer} from '../rules/scorer';
import {actionKey,type Observation,type Scorer} from '../rules/types';
import {runTournament} from '../api/tournament';
import {BrowserModelRuntime,type ModelWorkerPort} from '../ai/browser/BrowserModelRuntime';
import type {BrowserReply} from '../ai/browser/protocol';
import type {BrowserBackend} from '../ai/browser/catalog';
import {valueObservation} from '../ai/value/observation';
import {prepareAction,visibleCounts,actionPublicCounts,forecastFlags} from '../ai/coaching/publicAnalysis';
import {handAnalysisCache} from '../ai/analysisCache';
import {loadOfflineModels,OfflineValuePolicy,OFFLINE_POLICIES,type OfflinePolicy,type OfflineModelAsset} from './offline-models';
import {OfflineInference} from './offline-inference';
import {adaptiveLabel,type AdaptiveBudget,type ValuePosition} from './adaptive-values';
import {loadBelief,loadJoint,type LearningAsset} from './learning-assets';
import type {BeliefModel} from '../ai/belief/model';
import type {JointModel} from '../ai/joint/model';
import {jointLabel} from './joint-labels';
import {leagueMatches,type LeagueJob} from './league-play';
interface MatchJob {suite:string;seed:number;rotation:number;policies:OfflinePolicy[]}
interface Job {id:number;kind:'prepare'|'matches'|'label'|'dispose'|'learning-assets'|'joint-label'|'league';backend?:BrowserBackend;assets?:OfflineModelAsset[];jobs?:MatchJob[];positionsUrl?:string;positionsSha256?:string;ids?:number[];budget?:AdaptiveBudget;belief?:LearningAsset;joints?:LearningAsset[];worlds?:number;leagueJobs?:LeagueJob[]}
const port:ModelWorkerPort={onmessage:null,onerror:null,postMessage(job){globalThis.postMessage({kind:'model-job',job})},terminate(){globalThis.postMessage({kind:'model-dispose'})}},models=new BrowserModelRuntime(()=>port),controller=new AbortController();
let rules:Scorer|null=null,heads:Awaited<ReturnType<typeof loadOfflineModels>>|null=null,inference:OfflineInference|null=null,active=false;
let positionCache:{url:string;sha256:string;groups:Map<number,ValuePosition>}|null=null,positionLoads=0;
let beliefModel:BeliefModel|null=null;const jointModels=new Map<string,JointModel>();
async function matches(jobs:MatchJob[]){
  if(jobs.length<1||jobs.length>8||jobs.some(j=>j.policies.length!==4||j.policies.some(p=>!OFFLINE_POLICIES.includes(p))))throw Error('Invalid offline match jobs');
  return Promise.all(jobs.map(async job=>{
    const stats=job.policies.map(policy=>({policy,latencyMs:[] as number[],missedHu:0,unqualifiedReady:0,enhancements:0,reasonCounts:{} as Record<string,number>})),audit:Array<{hand:number;seat:number;action:Observation['legalActions'][number];priorAction:Observation['legalActions'][number];offered:string[];changed:boolean;reason:string;predictedGainFan:number|null}>=[];
    const agents=job.policies.map((policy,who)=>{const ranker=new OfflineValuePolicy(heads!,rules!);return {name:policy+'#'+who,async decide(input:Observation){
      const o=valueObservation(input),start=performance.now(),r=await inference!.policy(o),selected=o.legalActions.findIndex(a=>actionKey(a)===actionKey(r.action)),d=ranker.decide(policy,o,r.probabilities,selected),s=stats[who]!;
      s.latencyMs.push(performance.now()-start);s.reasonCounts[d.reason]=(s.reasonCounts[d.reason]??0)+1;s.enhancements+=+d.changed;if(o.legalActions.some(a=>a.type==='hu')&&d.action.type!=='hu')s.missedHu++;
      if(d.action.type==='discard'){const after=prepareAction(o,d.action,rules!),a=handAnalysisCache(rules!).analyze(after.hand);if(a.shanten===0){const known=visibleCounts(o),exposed=actionPublicCounts(o,d.action,after.melds,null),wind=(o.seat-o.dealer+4)%4;
        if(!a.effective.some(t=>known[t]!<4&&[false,true].some(self=>(rules!.score(after.hand,after.melds,t,0,forecastFlags(o,t,self,false,exposed),o.roundWind,wind)?.fan??0)>=8)))s.unqualifiedReady++;}}
      audit.push({hand:o.handIndex,seat:o.seat,action:d.action,priorAction:r.action,offered:[...new Set(o.legalActions.map(a=>a.type))],changed:d.changed,reason:d.reason,predictedGainFan:d.quality===null||d.baselineQuality===null?null:d.quality-d.baselineQuality});return d.action;
    }}});
    const start=performance.now(),result=await runTournament(rules!,agents,[job.seed],{rotateSeats:false,skipForced:true,strict:true,timeoutMs:30000,signal:controller.signal}),match=result.matches[0]!;
    const seats=match.players.map((p,i)=>{const better=match.players.filter(q=>q.fan>p.fan||q.fan===p.fan&&q.score>p.score).length,tied=match.players.filter(q=>q.fan===p.fan&&q.score===p.score).length;return {...stats[i]!,...p,seat:i,hands:16,place:1+better+(tied-1)/2,dealIns:match.results.filter(r=>r.winner!==null&&!r.selfDrawn&&r.from===i).length,forced:match.replay.actions.filter(a=>a.seat===i).length-stats[i]!.latencyMs.length,faults:result.ranking.find(r=>r.name===p.name)!.faults};});
    return {...job,elapsedMs:performance.now()-start,seats,draws:match.results.filter(r=>r.winner===null).length,results:match.results,replay:match.replay,decisionAudit:audit,runtime:models.snapshot()};
  }));
}
globalThis.onmessage=async({data:job}:MessageEvent<Job|{kind:'model-reply';reply:BrowserReply}>)=>{
  if(job.kind==='model-reply'){port.onmessage?.({data:job.reply} as MessageEvent<BrowserReply>);return;}
  try{
    if(job.kind==='dispose'){controller.abort();models.dispose();globalThis.postMessage({id:job.id,result:{disposed:true}});globalThis.close();return;}
    if(active)throw Error('Offline job already running');active=true;
    if(job.kind==='prepare'){
      const backend=job.backend??'webgpu',response=await fetch(new URL('../assets/mcr.wasm',import.meta.url));if(!response.ok)throw Error('MCR rules HTTP '+response.status);rules=await createScorer(await response.arrayBuffer());heads=await loadOfflineModels(job.assets??[],controller.signal);
      await models.prepare(['browser-kd-s0'],backend,controller.signal);if(models.snapshot().actualBackend!==backend)throw Error('Offline backend unavailable');inference=new OfflineInference(models,backend,controller.signal);
      const fixture=await(await fetch(new URL('../../test/fixtures/mahjong-browser-models.json',import.meta.url))).json() as {cases:Array<{observation:Observation;indices:number[];best:number}>};
      const rows=await Promise.all(fixture.cases.map(f=>inference!.policy(f.observation)));rows.forEach((r,i)=>{const f=fixture.cases[i]!;if(actionKey(r.action)!==actionKey(f.observation.legalActions[f.indices.indexOf(f.best)]!))throw Error('Offline KD parity mismatch');});
      globalThis.postMessage({id:job.id,result:{runtime:models.snapshot(),loadedHeads:[...heads.keys()],referencePositions:fixture.cases.length}});return;
    }
    if(!rules||!heads||!inference)throw Error('Offline arena not prepared');
    if(job.kind==='learning-assets'){
      if(job.belief)beliefModel=await loadBelief(job.belief,controller.signal);for(const asset of job.joints??[])jointModels.set(asset.id,await loadJoint(asset,controller.signal));globalThis.postMessage({id:job.id,result:{beliefLoaded:!!beliefModel,joints:[...jointModels.keys()]}});return;
    }
    if(job.kind==='league'){if(!beliefModel)throw Error('Belief not loaded');const matches=await leagueMatches(job.leagueJobs!,rules,inference,beliefModel,jointModels,heads,controller.signal);globalThis.postMessage({id:job.id,result:{matches,inference:inference.snapshot(),runtime:models.snapshot()}});return;}
    if(job.kind==='matches'){globalThis.postMessage({id:job.id,result:{matches:await matches(job.jobs!),inference:inference.snapshot()}});return;}
    if(job.kind==='label'||job.kind==='joint-label'){
      if(!job.positionsUrl?.startsWith('/')||job.positionsUrl.startsWith('//')||!job.positionsSha256||!/^[a-f0-9]{64}$/.test(job.positionsSha256))throw Error('Invalid positions descriptor');
      if(positionCache?.url!==job.positionsUrl||positionCache.sha256!==job.positionsSha256){
        const response=await fetch(job.positionsUrl);if(!response.ok)throw Error('Positions HTTP '+response.status);const bytes=await response.arrayBuffer(),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(sha!==job.positionsSha256)throw Error('Positions checksum mismatch');
        const positions=JSON.parse(new TextDecoder().decode(bytes)) as ValuePosition[];if(!Array.isArray(positions)||!positions.length)throw Error('Empty positions');const groups=new Map(positions.map(g=>[g.id,g]));if(groups.size!==positions.length)throw Error('Duplicate position ids');positionCache={url:job.positionsUrl,sha256:sha,groups};positionLoads++;
      }
      if(!job.ids?.length||new Set(job.ids).size!==job.ids.length)throw Error('Invalid label ids');const groups=[];
      for(const id of job.ids){const group=positionCache.groups.get(id);if(!group)throw Error('Missing position '+id);
        const factory=(assignment:import('./offline-models').OfflinePolicy[])=>{
          const rankers=Array.from({length:4},()=>new OfflineValuePolicy(heads!,rules!));
          return async(input:Observation)=>{const o=valueObservation(input),hu=o.legalActions.find(a=>a.type==='hu');if(hu)return hu;const p=await inference!.policy(o),selected=o.legalActions.findIndex(a=>actionKey(a)===actionKey(p.action));return rankers[o.seat]!.decide(assignment[o.seat]!,o,p.probabilities,selected).action;};
        };
        if(job.kind==='joint-label'&&!beliefModel)throw Error('Belief not loaded');
        const row=job.kind==='joint-label'?await jointLabel(group,rules,beliefModel!,factory,job.worlds??8,controller.signal):await adaptiveLabel(group,rules,factory,job.budget,controller.signal);groups.push(row);globalThis.postMessage({kind:'progress',group:row.id,worlds:row.sampling.worlds,plans:row.rows.length,inference:inference.snapshot()});
      }
      globalThis.postMessage({id:job.id,result:{groups,inference:inference.snapshot(),runtime:models.snapshot(),positionLoads}});return;
    }
    throw Error('Unknown offline job');
  }catch(error){globalThis.postMessage({id:job.id,error:String(error)})}finally{active=false;}
};
