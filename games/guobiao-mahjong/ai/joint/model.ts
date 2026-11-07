import type {Observation,Scorer} from '../../rules/types';
import type {ActionPlan} from '../value/types';
import {ValueContinuations} from '../value/model';
import {lastTileAlternative} from '../lastTileDefense';
import {networkLogits,sigmoid,softplus,softmax,validateNetwork,type SmallNetwork} from '../learning/network';
import {opponentBeliefs,validateBeliefModel,type BeliefModel} from '../belief/model';
import {JOINT_FEATURE_NAMES,jointFeatures} from './features';
import {jointPlans} from './plans';
export const JOINT_OUTPUT_NAMES=['policy-residual','own-hand-fan','opponents-hand-fan','win','deal-in','remaining-own-fan','remaining-opponents-fan','match-win'] as const;
export interface JointModel {schemaVersion:1;featureNames:readonly string[];outputNames:readonly string[];network:SmallNetwork;settings:{fanScale:32;matchWinWeight:number}}
export interface JointBundle {schemaVersion:1;belief:BeliefModel;joint:JointModel}
export function validateJointModel(m:JointModel,maxHidden=32){if(m.schemaVersion!==1||JSON.stringify(m.featureNames)!==JSON.stringify(JOINT_FEATURE_NAMES)||JSON.stringify(m.outputNames)!==JSON.stringify(JOINT_OUTPUT_NAMES)||m.settings.fanScale!==32||!Number.isFinite(m.settings.matchWinWeight)||m.settings.matchWinWeight<0||m.settings.matchWinWeight>1)throw Error('Invalid joint schema');validateNetwork(m.network,JOINT_FEATURE_NAMES.length,JOINT_OUTPUT_NAMES.length,maxHidden);}
export function validateJointBundle(b:JointBundle,maxHidden=32){if(b.schemaVersion!==1)throw Error('Invalid joint bundle');validateBeliefModel(b.belief);validateJointModel(b.joint,maxHidden);}
export function predictJoint(f:readonly number[],m:JointModel){return networkLogits(f,m.network).map((v,i)=>i===0?v:[3,4,7].includes(i)?sigmoid(v):softplus(v));}
/** Parent probabilities use max-plan logits; claims do not gain mass merely by having more continuations. */
export function jointDistribution(plans:readonly ActionPlan[],prior:readonly number[],residual:readonly number[],temperature=1){
  if(plans.length!==residual.length||!plans.length||residual.some(v=>!Number.isFinite(v))||prior.some(v=>!Number.isFinite(v)||v<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6||plans.some(p=>!Number.isInteger(p.index)||p.index<0||p.index>=prior.length)||!Number.isFinite(temperature)||temperature<=0)throw Error('Invalid joint distribution');const parents=[...new Set(plans.map(p=>p.index))],scores=parents.map(parent=>Math.max(...plans.flatMap((p,i)=>p.index===parent?[residual[i]!]:[]))+Math.log(Math.max(1e-12,prior[parent]!))),pp=softmax(scores.map(v=>v/temperature)),probabilities=Array<number>(plans.length).fill(0);let greedyPlan=0;
  parents.forEach((parent,j)=>{const ids=plans.flatMap((p,i)=>p.index===parent?[i]:[]),conditional=softmax(ids.map(i=>residual[i]!/temperature));ids.forEach((i,k)=>probabilities[i]=pp[j]!*conditional[k]!);if(j===pp.indexOf(Math.max(...pp)))greedyPlan=ids[conditional.indexOf(Math.max(...conditional))]!;});return {parents,parentProbabilities:pp,probabilities,greedyPlan};
}
export interface JointEvaluation {plans:ActionPlan[];features:number[][];outputs:number[][];probabilities:number[];selectedPlan:number;baseline:number}
export type JointStyle='balanced'|'attack'|'defense';
export class JointPolicy {
  private readonly continuations=new ValueContinuations();
  evaluate(o:Observation,prior:readonly number[],scorer:Scorer,bundle:JointBundle,temperature=1,style:JointStyle='balanced'):JointEvaluation {
    if(prior.length!==o.legalActions.length||prior.some(v=>!Number.isFinite(v)||v<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid joint prior');const beliefs=opponentBeliefs(o,bundle.belief),plans=jointPlans(o),features=plans.map(p=>jointFeatures(o,p,prior,scorer,beliefs)),outputs=features.map(f=>predictJoint(f,bundle.joint)),residual=outputs.map((z,i)=>{const p=plans[i]!,tile=p.action.type==='discard'?p.action.tile:p.followUpDiscard,risk=tile===null||tile===undefined?0:Math.max(...beliefs.map(b=>b.ron[tile]!));return z[0]!+(style==='attack'?.5*z[1]!:style==='defense'?-4*risk:0)}),d=jointDistribution(plans,prior,residual,temperature),baseline=d.probabilities.reduce((s,p,i)=>s+p*(outputs[i]![5]!-outputs[i]![6]!+bundle.joint.settings.matchWinWeight*outputs[i]![7]!),0);
    return {plans,features,outputs,probabilities:d.probabilities,selectedPlan:d.greedyPlan,baseline};
  }
  decide(o:Observation,prior:readonly number[],selected:number,scorer:Scorer,bundle:JointBundle,random?:()=>number,temperature=1,style:JointStyle='balanced'){
    const result=(index:number,reason:string,evaluation:JointEvaluation|null=null)=>({index,action:o.legalActions[index]!,changed:index!==selected,reason,analysisCalls:evaluation?.plans.length??0,quality:null,baselineQuality:null,evaluation});
    const hu=o.legalActions.findIndex(a=>a.type==='hu');if(hu>=0)return result(hu,'legal-win');const safe=lastTileAlternative(o,o.legalActions[selected]!);if(safe)return result(o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===safe.tile),'last-tile-safe');
    if(o.phase==='turn'&&o.drawn===null){const t=this.continuations.peek(o),i=o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===t);if(i>=0)return result(i,'joint-follow-up');}
    const e=this.evaluate(o,prior,scorer,bundle,temperature,style);if(random){let draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)throw Error('Invalid joint random source');e.selectedPlan=e.plans.length-1;for(let i=0;i<e.probabilities.length;i++){draw-=e.probabilities[i]!;if(draw<0){e.selectedPlan=i;break;}}}const plan=e.plans[e.selectedPlan]!;this.continuations.remember(o,plan);return result(plan.index,'joint-policy',e);
  }
}
