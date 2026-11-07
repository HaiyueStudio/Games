import {actionKey,type Action,type Observation} from '../../rules/types';
import type {AgentContext,MahjongAgent} from '../../api/agents';
import {browserModel,validBackend,validateParameters,type BrowserBackend,type BrowserParameters} from './catalog';
import {initialBrowserInfo,type BrowserInfo,type BrowserJob,type BrowserReply} from './protocol';
import type {HybridProfile} from '../hybrid';
export interface ModelWorkerPort {onmessage:((e:MessageEvent<BrowserReply>)=>void)|null;onerror:((e:ErrorEvent)=>void)|null;postMessage(data:unknown):void;terminate():void}
type Pending={resolve(value:BrowserReply):void;reject(error:Error):void;removeAbort():void};
const abortError=()=>new DOMException('模型任务已取消','AbortError');
/** One capability-specific Worker owns all selected checkpoints; seats never duplicate tensor caches. */
export class BrowserModelRuntime {
  private readonly factory:()=>ModelWorkerPort;
  private worker:ModelWorkerPort|null=null;
  private readonly pending=new Map<number,Pending>();
  private serial=0;
  private disposed=false;
  private starts=0;
  private info:BrowserInfo=initialBrowserInfo('webgpu');
  constructor(factory:()=>ModelWorkerPort=()=>new Worker(new URL('./ai/tfjs.worker.js',location.href),{name:'mcr-tfjs'})){this.factory=factory;}
  get busy(){return this.pending.size>0;}
  get message(){return this.info.message;}
  get backend(){return this.info.requestedBackend;}
  snapshot(){return {...this.info,loadedModels:[...this.info.loadedModels],busy:this.busy,workerStarts:this.starts,liveWorkers:this.worker?1:0};}
  setBackend(backend:BrowserBackend){
    if(!validBackend(backend))throw new Error('无效的推理后端');
    if(this.disposed)throw new Error('Browser model runtime disposed');
    if(backend===this.info.requestedBackend)return;
    this.release();this.info=initialBrowserInfo(backend);
  }
  release(){
    const worker=this.worker;this.worker=null;if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}
    for(const p of this.pending.values()){p.removeAbort();p.reject(abortError());}this.pending.clear();
    this.info=initialBrowserInfo(this.info.requestedBackend);
  }
  private ensureWorker(){
    if(this.disposed)throw new Error('Browser model runtime disposed');if(this.worker)return this.worker;
    const worker=this.worker=this.factory();this.starts++;
    worker.onmessage=({data})=>{
      if(this.worker!==worker)return;const p=this.pending.get(data.id);if(!p)return;
      this.info={...data.info,loadedModels:[...data.info.loadedModels]};
      if(data.kind==='progress')return;
      this.pending.delete(data.id);p.removeAbort();
      if(data.kind==='error')p.reject(new Error(data.error??'浏览器模型失败'));else p.resolve(data);
    };
    worker.onerror=e=>{
      if(this.worker!==worker)return;
      const error=new Error('浏览器模型异常：'+e.message);
      for(const p of this.pending.values()){p.removeAbort();p.reject(error);}this.pending.clear();
      this.release();this.info={...this.info,state:'failed',message:error.message};
    };
    return worker;
  }
  private request(job:Omit<BrowserJob,'id'|'backend'>,signal:AbortSignal):Promise<BrowserReply>{
    if(signal.aborted)return Promise.reject(abortError());
    return new Promise((resolve,reject)=>{
      let worker:ModelWorkerPort;try{worker=this.ensureWorker();}catch(e){reject(e);return;}
      const id=++this.serial,onAbort=()=>{const p=this.pending.get(id);if(!p)return;this.pending.delete(id);p.removeAbort();worker.postMessage({id,kind:'cancel'});reject(abortError());if(!this.busy)this.info={...this.info,state:this.info.loadedModels.length?'ready':'idle',message:'模型任务已取消'};};
      const removeAbort=()=>signal.removeEventListener('abort',onAbort);signal.addEventListener('abort',onAbort,{once:true});
      this.pending.set(id,{resolve,reject,removeAbort});
      try{worker.postMessage({...job,id,backend:this.backend});}catch(e){this.pending.delete(id);removeAbort();reject(e);}
    });
  }
  async prepare(models:readonly string[],backend:BrowserBackend,signal:AbortSignal,enhancement?:HybridProfile){
    models.forEach(id=>{if(!browserModel(id))throw new Error('未知浏览器模型');});this.setBackend(backend);
    if(models.length)await this.request({kind:'prepare',models:[...new Set(models)],...(enhancement?{enhancement}:{})},signal);
  }
  /** Same real Worker inference as an agent, with legal-action probabilities for training/tools. */
  async policy(id:string,o:Observation,parameters:BrowserParameters,backend:BrowserBackend,signal:AbortSignal){
    if(!browserModel(id))throw Error('未知浏览器模型');validateParameters(parameters);this.setBackend(backend);
    const reply=await this.request({kind:'decide',models:[id],observation:o,parameters:{...parameters},includePolicy:true},signal);
    if(reply.revision!==o.revision||!reply.action||!o.legalActions.some(a=>actionKey(a)===actionKey(reply.action!))||reply.policy?.length!==o.legalActions.length||reply.policy.some(p=>!Number.isFinite(p)||p<0)||Math.abs(reply.policy.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid policy reply');
    const prior=reply.priorPolicy===undefined?reply.policy:reply.priorPolicy;if(!Array.isArray(prior)||prior.length!==o.legalActions.length||prior.some(p=>!Number.isFinite(p)||p<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid policy prior');
    return {action:reply.action,probabilities:[...reply.policy],priorProbabilities:[...prior],info:this.snapshot()};
  }
  /** Bounded batches for independent arena games; live decisions still use the ordinary agent path. */
  async policies(id:string,observations:readonly Observation[],parameters:BrowserParameters,backend:BrowserBackend,signal:AbortSignal){
    if(!browserModel(id)||observations.length<1||observations.length>16)throw Error('Invalid policy batch');validateParameters(parameters);this.setBackend(backend);
    const reply=await this.request({kind:'policies',models:[id],observations:[...observations],parameters:{...parameters}},signal);
    if(reply.rows?.length!==observations.length)throw Error('Invalid policy batch response');
    reply.rows.forEach((r,i)=>{const o=observations[i]!;if(r.revision!==o.revision||!o.legalActions.some(a=>actionKey(a)===actionKey(r.action))||r.probabilities.length!==o.legalActions.length||r.probabilities.some(p=>!Number.isFinite(p)||p<0)||Math.abs(r.probabilities.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid policy batch row');});
    return {rows:reply.rows,info:this.snapshot()};
  }
  agent(id:string,parameters:()=>BrowserParameters,backend:()=>BrowserBackend,enhancement?:HybridProfile):MahjongAgent{
    const model=browserModel(id);if(!model)throw new Error('未知浏览器模型');
    return {name:model.name,decide:async(o:Observation,context:AgentContext):Promise<Action>=>{
      const p={...parameters()};validateParameters(p);this.setBackend(backend());
      const reply=await this.request({kind:'decide',models:[id],observation:o,parameters:p,...(enhancement?{enhancement}:{})},context.signal);
      if(context.signal.aborted)throw abortError();
      if(reply.revision!==o.revision||!reply.action||!o.legalActions.some(a=>actionKey(a)===actionKey(reply.action!)))throw new Error('浏览器模型返回了过期或非法动作');
      return reply.action;
    }};
  }
  dispose(){if(this.disposed)return;this.release();this.disposed=true;}
}
