import {createScorer} from '../rules/scorer';
import type {Scorer} from '../rules/types';
import {analyzePosition} from './coaching/forecast';
import type {CoachJob,CoachReply} from './coaching/types';
let scorer:Scorer|null=null,current:{id:number;cancelled:boolean}|null=null;
const reply=(message:CoachReply)=>globalThis.postMessage(message);
globalThis.onmessage=async({data}:MessageEvent<CoachJob>)=>{
  if(data.kind==='cancel'){if(current?.id===data.id)current.cancelled=true;return}
  if(data.kind==='init'){try{scorer=await createScorer(data.bytes);reply({id:data.id,kind:'ready'})}catch(e){reply({id:data.id,kind:'error',error:String(e)})}return}
  if(current)current.cancelled=true;const task=current={id:data.id,cancelled:false};
  try{if(!scorer)throw Error('分析模块尚未就绪');const check=()=>{if(task.cancelled)throw new DOMException('分析已取消','AbortError')};
    const report=await analyzePosition(data.observation,scorer,data.options,{check,yield:()=>new Promise(r=>setTimeout(r,0)),report:r=>{if(!task.cancelled)reply({id:data.id,kind:'report',report:r})},progress:(done,total)=>{if(!task.cancelled)reply({id:data.id,kind:'progress',done,total})}});
    check();reply({id:data.id,kind:'report',report});
  }catch(e){if(!task.cancelled)reply({id:data.id,kind:'error',error:String(e)})}finally{if(current===task)current=null}
};
