import type {Observation} from '../rules/types';
import type {BrowserModelRuntime} from '../ai/browser/BrowserModelRuntime';
import type {BrowserBackend} from '../ai/browser/catalog';
interface PolicyRow {action:Observation['legalActions'][number];probabilities:number[]}
interface Pending {o:Observation;resolve:(r:PolicyRow)=>void;reject:(e:unknown)=>void}
/** Only public observations cross into the existing TFJS Worker. Independent rollouts share batches. */
export class OfflineInference {
  private queue:Pending[]=[];private scheduled=false;private running=false;private failure:unknown=null;
  private readonly models:BrowserModelRuntime;private readonly backend:BrowserBackend;private readonly signal:AbortSignal;
  batches=0;rows=0;maximumBatch=0;
  constructor(models:BrowserModelRuntime,backend:BrowserBackend,signal:AbortSignal){this.models=models;this.backend=backend;this.signal=signal;signal.addEventListener('abort',()=>this.fail(signal.reason??new DOMException('Cancelled','AbortError')),{once:true});}
  private fail(error:unknown){this.failure=error;this.queue.splice(0).forEach(p=>p.reject(error));}
  policy(o:Observation):Promise<PolicyRow>{
    if(this.signal.aborted)return Promise.reject(this.signal.reason);if(this.failure)return Promise.reject(this.failure);
    return new Promise((resolve,reject)=>{this.queue.push({o,resolve,reject});this.schedule();});
  }
  private schedule(){if(this.scheduled||this.running||!this.queue.length)return;this.scheduled=true;setTimeout(()=>{void this.flush()},0);}
  private async flush(){
    this.scheduled=false;if(this.running||this.failure||!this.queue.length)return;this.running=true;const batch=this.queue.splice(0,16);
    try{const reply=await this.models.policies('browser-kd-s0',batch.map(p=>p.o),{temperature:0,seed:20261105},this.backend,this.signal);this.batches++;this.rows+=batch.length;this.maximumBatch=Math.max(this.maximumBatch,batch.length);batch.forEach((p,i)=>p.resolve(reply.rows[i]!));}
    catch(error){batch.forEach(p=>p.reject(error));this.fail(error);}
    finally{this.running=false;this.schedule();}
  }
  snapshot(){return {batches:this.batches,rows:this.rows,maximumBatch:this.maximumBatch};}
}
