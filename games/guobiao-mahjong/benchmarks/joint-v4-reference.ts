/** Frozen credit-v4 execution contract; offline ablation only. */
import type {Observation,Scorer} from '../rules/types';
import type {ActionPlan} from '../ai/value/types';
import {ValueContinuations} from '../ai/value/model';
import {lastTileAlternative} from '../ai/lastTileDefense';
import {networkLogits,sigmoid,softplus,softmax,validateNetwork,type SmallNetwork} from '../ai/learning/network';
import {opponentBeliefs,validateBeliefModel,type BeliefModel} from '../ai/belief/model';
import {JOINT_FEATURE_NAMES,jointFeatures} from '../ai/joint/features';
import {jointPlans} from '../ai/joint/plans';
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
export type JointMode='guarded'|'explore';
/** Conservative decision margins, not calibrated confidence probabilities. Never tuned on final evaluation walls. */
export const JOINT_GUARD=Object.freeze({minimumPolicyMargin:.25,minimumFanGain:1});
const shapeIndex=JOINT_FEATURE_NAMES.indexOf('shanten'),selfWaitIndex=JOINT_FEATURE_NAMES.indexOf('legal-self-waits'),ronWaitIndex=JOINT_FEATURE_NAMES.indexOf('legal-ron-waits');
function residualScores(e:Pick<JointEvaluation,'outputs'|'features'>,style:JointStyle){
  return e.outputs.map((z,i)=>z[0]!+(style==='attack'?.5*z[1]!:style==='defense'?-4*Math.max(...[1,2,3].map(n=>e.features[i]![JOINT_FEATURE_NAMES.indexOf(`belief-${n}-risk`)]!)):0));
}
/** Move unsupported corrections back to the base action; retain a real executed-action distribution. */
export function guardedJointDistribution(e:JointEvaluation,prior:readonly number[],selected:number,style:JointStyle='balanced'){
  if(!Number.isInteger(selected)||selected<0||selected>=prior.length)throw Error('Invalid joint base action');
  const base=e.plans.flatMap((p,i)=>p.index===selected?[i]:[]);if(!base.length)throw Error('Missing joint base plans');
  const residual=residualScores(e,style),quality=(i:number)=>32*(e.outputs[i]![1]!-e.outputs[i]![2]!),baseScore=Math.max(...base.map(i=>residual[i]!))+Math.log(Math.max(1e-12,prior[selected]!)),baseValue=Math.max(...base.map(quality)),baseShape=Math.min(...base.map(i=>e.features[i]![shapeIndex]!));
  const probabilities=Array<number>(prior.length).fill(0),approved=e.plans.map((p,i)=>{
    if(p.index===selected)return true;const f=e.features[i]!,score=residual[i]!+Math.log(Math.max(1e-12,prior[p.index]!));
    return score-baseScore>=JOINT_GUARD.minimumPolicyMargin&&quality(i)-baseValue>=JOINT_GUARD.minimumFanGain&&f[shapeIndex]!<=baseShape+1e-12&&!(Math.abs(f[shapeIndex]!)<1e-12&&f[selfWaitIndex]===0&&f[ronWaitIndex]===0);
  });
  e.plans.forEach((p,i)=>probabilities[approved[i]?p.index:selected]!+=e.probabilities[i]!);
  const total=probabilities.reduce((a,b)=>a+b,0);if(!Number.isFinite(total)||total<=0)throw Error('Invalid guarded policy mass');probabilities.forEach((p,i)=>probabilities[i]=p/total);
  let greedy=selected;for(let i=0;i<probabilities.length;i++)if(probabilities[i]!>probabilities[greedy]!)greedy=i;
  return {probabilities,approved,greedy};
}
export class JointPolicy {
  private readonly continuations=new ValueContinuations();
  readonly mode:JointMode;
  constructor(mode:JointMode='guarded'){if(mode!=='guarded'&&mode!=='explore')throw Error('Invalid joint mode');this.mode=mode;}
  evaluate(o:Observation,prior:readonly number[],scorer:Scorer,bundle:JointBundle,temperature=1,style:JointStyle='balanced'):JointEvaluation {
    if(prior.length!==o.legalActions.length||prior.some(v=>!Number.isFinite(v)||v<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid joint prior');const beliefs=opponentBeliefs(o,bundle.belief),plans=jointPlans(o),features=plans.map(p=>jointFeatures(o,p,prior,scorer,beliefs)),outputs=features.map(f=>predictJoint(f,bundle.joint)),residual=residualScores({outputs,features},style),d=jointDistribution(plans,prior,residual,temperature),baseline=d.probabilities.reduce((s,p,i)=>s+p*(outputs[i]![5]!-outputs[i]![6]!+bundle.joint.settings.matchWinWeight*outputs[i]![7]!),0);
    return {plans,features,outputs,probabilities:d.probabilities,selectedPlan:d.greedyPlan,baseline};
  }
  decide(o:Observation,prior:readonly number[],selected:number,scorer:Scorer,bundle:JointBundle,random?:()=>number,temperature=1,style:JointStyle='balanced'){
    if(!o.legalActions[selected])throw Error('Invalid joint selected action');
    const result=(index:number,reason:string,evaluation:JointEvaluation|null=null,probabilities?:number[])=>({index,action:o.legalActions[index]!,changed:index!==selected,reason,analysisCalls:evaluation?.plans.length??0,quality:null,baselineQuality:null,evaluation,mode:this.mode,probabilities:probabilities??o.legalActions.map((_,i)=>+(i===index))});
    const hu=o.legalActions.findIndex(a=>a.type==='hu');if(hu>=0)return result(hu,'legal-win');const safe=lastTileAlternative(o,o.legalActions[selected]!);if(safe)return result(o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===safe.tile),'last-tile-safe');
    if(this.mode==='explore'&&o.phase==='turn'&&o.drawn===null){const t=this.continuations.peek(o),i=o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===t);if(i>=0)return result(i,'joint-follow-up');}
    const e=this.evaluate(o,prior,scorer,bundle,temperature,style),guard=this.mode==='guarded'?guardedJointDistribution(e,prior,selected,style):null;
    if(random){let draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)throw Error('Invalid joint random source');e.selectedPlan=e.plans.length-1;for(let i=0;i<e.probabilities.length;i++){draw-=e.probabilities[i]!;if(draw<0){e.selectedPlan=i;break;}}}
    let index=e.plans[e.selectedPlan]!.index;
    if(guard){index=random?(guard.approved[e.selectedPlan]?index:selected):guard.greedy;const choices=e.plans.flatMap((p,i)=>p.index===index?[i]:[]);e.selectedPlan=choices.reduce((a,b)=>e.probabilities[b]!>e.probabilities[a]!?b:a);return result(index,index===selected?(o.phase==='turn'&&o.drawn===null?'joint-baseline-follow-up':'joint-baseline'):'joint-correction',e,guard.probabilities);}
    const plan=e.plans[e.selectedPlan]!;this.continuations.remember(o,plan);const probabilities=o.legalActions.map(()=>0);e.plans.forEach((p,i)=>probabilities[p.index]!+=e.probabilities[i]!);return result(plan.index,'joint-policy',e,probabilities);
  }
}
