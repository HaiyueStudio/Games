import {actionValueModel} from '../ai/value/weights';
import {VALUE_NAMES,VALUE_FEATURE_VERSION} from '../ai/value/features';
import {rankActionValues,ValueContinuations,type ActionValueModel} from '../ai/value/model';
import type {Observation,Scorer} from '../rules/types';

export const OFFLINE_POLICIES=['kd-s0','kd-value-v1','kd-teacher','kd-student-fp32','kd-student-fp16'] as const;
export type OfflinePolicy=typeof OFFLINE_POLICIES[number];
export interface OfflineModelAsset {policy:OfflinePolicy;url:string;sha256:string;hidden:number}
/** The larger critic is admitted only by this offline entry; the game's validator stays bounded. */
export function validateOfflineModel(m:ActionValueModel,hidden:number):void {
  if(!Number.isInteger(hidden)||hidden<1||hidden>512||m.schemaVersion!==1||m.featureVersion!==VALUE_FEATURE_VERSION||m.fanScale!==32||JSON.stringify(m.featureNames)!==JSON.stringify(VALUE_NAMES)||m.networks.length!==3)throw Error('Invalid offline value schema');
  const finite=(a:readonly number[])=>a.every(n=>Number.isFinite(n)&&Math.abs(n)<10000);
  for(const n of m.networks)if(n.mean.length!==VALUE_NAMES.length||n.scale.length!==VALUE_NAMES.length||n.w1.length!==VALUE_NAMES.length||n.b1.length!==hidden||n.w2.length!==hidden||n.b2.length!==4||!finite(n.mean)||!finite(n.b1)||!finite(n.b2)||n.scale.some(v=>!Number.isFinite(v)||v<1e-6)||n.w1.some(v=>v.length!==hidden||!finite(v))||n.w2.some(v=>v.length!==4||!finite(v)))throw Error('Invalid offline value network');
  const s=m.settings;if(![s.minimumPrior,s.minimumGain,s.priorWeight,s.uncertaintyWeight].every(v=>Number.isFinite(v)&&v>=0)||s.minimumPrior>1||s.minimumGain>1||s.priorWeight>1||s.uncertaintyWeight>4||s.maximumPlans!==18)throw Error('Invalid offline value settings');
}
export async function loadOfflineModels(assets:readonly OfflineModelAsset[],signal:AbortSignal){
  const models=new Map<OfflinePolicy,ActionValueModel>([['kd-value-v1',actionValueModel]]);
  for(const asset of assets){
    if(!['kd-teacher','kd-student-fp32','kd-student-fp16'].includes(asset.policy)||models.has(asset.policy)||!asset.url.startsWith('/')||asset.url.startsWith('//')||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Invalid offline model descriptor');
    const response=await fetch(asset.url,{signal});if(!response.ok)throw Error('Offline model HTTP '+response.status);const bytes=await response.arrayBuffer();
    const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(sha!==asset.sha256)throw Error('Offline model checksum mismatch');
    const model=JSON.parse(new TextDecoder().decode(bytes)) as ActionValueModel;validateOfflineModel(model,asset.hidden);models.set(asset.policy,model);
  }return models;
}
/** A fresh instance for each match or counterfactual branch, including its claim continuations. */
export class OfflineValuePolicy {
  private readonly continuations=new ValueContinuations();
  private readonly models:ReadonlyMap<OfflinePolicy,ActionValueModel>;private readonly scorer:Scorer;
  constructor(models:ReadonlyMap<OfflinePolicy,ActionValueModel>,scorer:Scorer){this.models=models;this.scorer=scorer;}
  decide(policy:OfflinePolicy,o:Observation,prior:readonly number[],selected:number){
    if(policy==='kd-s0')return {index:selected,action:o.legalActions[selected]!,changed:false,reason:'model',analysisCalls:0,quality:null,baselineQuality:null};
    const model=this.models.get(policy);if(!model)throw Error('Offline model not loaded: '+policy);
    return rankActionValues(o,prior,selected,this.scorer,model,this.continuations);
  }
}
