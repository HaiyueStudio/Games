import type {Observation,Scorer} from '../../rules/types';
import {lastTileAlternative} from '../lastTileDefense';
import {handAnalysisCache} from '../analysisCache';
import type {DenseNetwork} from '../candidates/schema';
import type {HybridDecision} from '../hybrid';
import {actionPlans,continuationKey,continuationObservation} from './actions';
import {actionValueFeatures,VALUE_FEATURE_VERSION,VALUE_NAMES} from './features';
import type {ActionPlan} from './types';

export interface ActionValueModel {
  schemaVersion:1;featureVersion:1;featureNames:readonly string[];networks:readonly DenseNetwork[];fanScale:32;objective:string;
  settings:{minimumPrior:number;minimumGain:number;priorWeight:number;uncertaintyWeight:number;maximumPlans:number};
}
export function validateActionValueModel(m:ActionValueModel):void {
  if(m.schemaVersion!==1||m.featureVersion!==VALUE_FEATURE_VERSION||m.fanScale!==32||JSON.stringify(m.featureNames)!==JSON.stringify(VALUE_NAMES)||m.networks.length!==3)throw Error('Action value schema mismatch');
  const finite=(v:readonly number[])=>v.every(x=>Number.isFinite(x)&&Math.abs(x)<10000);
  for(const n of m.networks){const h=n.b1.length;if(h<1||h>64||n.mean.length!==VALUE_NAMES.length||n.scale.length!==n.mean.length||n.w1.length!==n.mean.length||n.w2.length!==h||n.b2.length!==4||!finite(n.mean)||!finite(n.b1)||!finite(n.b2)||n.scale.some(v=>!Number.isFinite(v)||v<1e-6)||n.w1.some(v=>v.length!==h||!finite(v))||n.w2.some(v=>v.length!==4||!finite(v)))throw Error('Invalid action value network');}
  const s=m.settings;if(![s.minimumPrior,s.minimumGain,s.priorWeight,s.uncertaintyWeight].every(v=>Number.isFinite(v)&&v>=0)||s.minimumPrior>1||s.minimumGain>1||s.priorWeight>1||s.uncertaintyWeight>4||s.maximumPlans!==18)throw Error('Invalid action value settings');
}
/** Four heads: own fan/32, mean opponents fan/32, win chance, current-hand deal-in chance. */
export function predictActionValue(features:readonly number[],model:ActionValueModel):number[][] {
  if(features.length!==VALUE_NAMES.length||features.some(v=>!Number.isFinite(v)))throw Error('Invalid action value input');
  return model.networks.map(n=>{
    const h=[...n.b1];for(let i=0;i<features.length;i++){const x=Math.max(-5,Math.min(5,(features[i]!-n.mean[i]!)/n.scale[i]!));for(let j=0;j<h.length;j++)h[j]!+=x*n.w1[i]![j]!;}
    const z=[...n.b2];for(let j=0;j<h.length;j++)for(let k=0;k<4;k++)z[k]!+=Math.max(0,h[j]!)*n.w2[j]![k]!;
    return z.map((v,k)=>k<2?Math.max(v,0)+Math.log1p(Math.exp(-Math.abs(v))):1/(1+Math.exp(-Math.max(-40,Math.min(40,v)))));
  });
}
const mean=(v:readonly number[])=>v.reduce((a,b)=>a+b,0)/v.length;
const planKey=(o:Observation)=>continuationKey(o)+'|'+JSON.stringify(o.events.filter(e=>e.hand===o.handIndex&&e.type==='discard').map(e=>[e.seat,e.tile]));
/** Bounded, exact-state continuations. Preempted claims can never apply a discard to a later unrelated call. */
export class ValueContinuations {
  private readonly plans=new Map<string,number>();
  get size(){return this.plans.size;}
  clear(){this.plans.clear();}
  remember(o:Observation,plan:ActionPlan){
    if(plan.followUpDiscard===null)return;const key=planKey(continuationObservation(o,plan));this.plans.delete(key);this.plans.set(key,plan.followUpDiscard);
    while(this.plans.size>64)this.plans.delete(this.plans.keys().next().value!);
  }
  peek(o:Observation):number|null {return this.plans.get(planKey(o))??null;}
  take(o:Observation):number|null {const key=planKey(o),tile=this.plans.get(key);this.plans.delete(key);return tile??null;}
}
export function rankActionValues(o:Observation,prior:readonly number[],selected:number,scorer:Scorer,model:ActionValueModel,continuations:ValueContinuations):HybridDecision {
  if(!o.legalActions[selected]||prior.length!==o.legalActions.length||prior.some(v=>!Number.isFinite(v)||v<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid action value prior');
  const result=(index:number,reason:string,calls=0,q:number|null=null,b:number|null=null):HybridDecision=>({index,action:o.legalActions[index]!,changed:index!==selected,reason,analysisCalls:calls,quality:q,baselineQuality:b});
  const hu=o.legalActions.findIndex(a=>a.type==='hu');if(hu>=0)return result(hu,'legal-win');
  const safe=lastTileAlternative(o,o.legalActions[selected]!);if(safe)return result(o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===safe.tile),'last-tile-safe');
  if(o.phase==='turn'&&o.turn===o.seat&&o.drawn===null){const tile=continuations.peek(o),i=o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===tile);if(i>=0)return result(i,'value-follow-up');}
  if(o.wallRemaining===0||!['turn','response'].includes(o.phase))return result(selected,'model');
  const s=model.settings,needsFollowUp=['chow','pung'].includes(o.legalActions[selected]!.type);
  if(!needsFollowUp&&!prior.some((p,i)=>i!==selected&&p>=s.minimumPrior))return result(selected,'value-prior');
  let calls=0;const shared=handAnalysisCache(scorer),counted:Scorer={catalog:scorer.catalog,analyze(hand){calls++;return shared.analyze(hand)},shanten(hand){calls++;return scorer.shanten(hand)},score(...args){calls++;return scorer.score(...args)}};
  const plans=actionPlans(o,prior,counted).filter(p=>p.index===selected||prior[p.index]!>=s.minimumPrior);if(plans.length<2)return result(selected,'value-prior',calls);
  const rows=plans.map(plan=>{const f=actionValueFeatures(o,plan,prior,counted),predictions=predictActionValue(f,model),q=predictions.map(v=>v[0]!-v[1]!);return {plan,q,mean:mean(q)}}),base=rows.find(r=>r.plan.index===selected);
  if(!base)return result(selected,'value-outside-candidates',calls);
  let best=base;
  for(const row of rows){
    if(row===base||prior[row.plan.index]!<s.minimumPrior&&row.plan.index!==selected)continue;
    const differences=row.q.map((v,i)=>v-base.q[i]!),gain=mean(differences),disagreement=Math.sqrt(mean(differences.map(v=>(v-gain)**2))),anchoredGain=gain+s.priorWeight*Math.log(Math.max(1e-12,prior[row.plan.index]!)/Math.max(1e-12,prior[selected]!));
    if(anchoredGain>Math.max(s.minimumGain,s.uncertaintyWeight*disagreement)&&row.mean+s.priorWeight*Math.log(Math.max(1e-12,prior[row.plan.index]!))>best.mean+s.priorWeight*Math.log(Math.max(1e-12,prior[best.plan.index]!)))best=row;
  }
  // A low-confidence parent fallback must not force a heuristic discard over the next KD decision.
  if(best!==base)continuations.remember(o,best.plan);
  return result(best.plan.index,best!==base?'action-value':'value-prior',calls,best.mean*32,base.mean*32);
}
