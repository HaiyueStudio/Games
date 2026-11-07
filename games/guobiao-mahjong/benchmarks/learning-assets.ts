import {validateBeliefModel,type BeliefModel} from '../ai/belief/model';
import {validateJointModel,type JointModel} from '../ai/joint/model';
export interface LearningAsset {id:string;url:string;sha256:string}
export async function learningJSON(asset:LearningAsset,signal:AbortSignal):Promise<unknown>{
  if(!/^[a-z0-9-]+$/.test(asset.id)||!asset.url.startsWith('/')||asset.url.startsWith('//')||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Invalid learning asset');const r=await fetch(asset.url,{signal});if(!r.ok)throw Error('Learning asset HTTP '+r.status);const bytes=await r.arrayBuffer(),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(sha!==asset.sha256)throw Error('Learning asset checksum mismatch');return JSON.parse(new TextDecoder().decode(bytes));
}
export async function loadBelief(asset:LearningAsset,signal:AbortSignal){const m=await learningJSON(asset,signal) as BeliefModel;validateBeliefModel(m);return m;}
export async function loadJoint(asset:LearningAsset,signal:AbortSignal){const m=await learningJSON(asset,signal) as JointModel;validateJointModel(m,128);return m;}
