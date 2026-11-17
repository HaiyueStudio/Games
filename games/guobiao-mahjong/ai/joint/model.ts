import type {Observation,Scorer} from '../../rules/types';
import type {ActionPlan} from '../value/types';
import {continuationObservation} from '../value/actions';
import {ValueContinuations} from '../value/model';
import {lastTileAlternative} from '../lastTileDefense';
import {networkLogits,sigmoid,softplus,softmax,validateNetwork,type SmallNetwork} from '../learning/network';
import {opponentBeliefs,validateBeliefModel,type BeliefModel} from '../belief/model';
import {JOINT_FEATURE_NAMES,TOURNAMENT_FEATURE_NAMES,jointFeatures} from './features';
import {jointPlans} from './plans';
export const JOINT_OUTPUT_NAMES=['policy-residual','own-hand-fan','opponents-hand-fan','win','deal-in','remaining-own-fan','remaining-opponents-fan','match-win'] as const;
export interface JointModel {schemaVersion:1|2;featureNames:readonly string[];outputNames:readonly string[];network:SmallNetwork;settings:{fanScale:32;matchWinWeight:number;relativeFanWeight?:number;objective?:'tournament-v1'}}
export interface JointBundle {schemaVersion:1;belief:BeliefModel;joint:JointModel}
export function validateJointModel(m:JointModel,maxHidden=32){const names=m.schemaVersion===2?TOURNAMENT_FEATURE_NAMES:JOINT_FEATURE_NAMES;if(![1,2].includes(m.schemaVersion)||JSON.stringify(m.featureNames)!==JSON.stringify(names)||JSON.stringify(m.outputNames)!==JSON.stringify(JOINT_OUTPUT_NAMES)||m.settings.fanScale!==32||!Number.isFinite(m.settings.matchWinWeight)||m.settings.matchWinWeight<0||m.settings.matchWinWeight>1||m.settings.relativeFanWeight!==undefined&&(!Number.isFinite(m.settings.relativeFanWeight)||m.settings.relativeFanWeight<0||m.settings.relativeFanWeight>1)||m.schemaVersion===2&&(m.settings.objective!=='tournament-v1'||m.settings.relativeFanWeight!==.2||m.settings.matchWinWeight!==1))throw Error('Invalid joint schema');validateNetwork(m.network,names.length,JOINT_OUTPUT_NAMES.length,maxHidden);}
export const jointUtility=(z:readonly number[],m:JointModel)=>(m.settings.relativeFanWeight??1)*(z[5]!-z[6]!)+m.settings.matchWinWeight*z[7]!;
export function validateJointBundle(b:JointBundle,maxHidden=32){if(b.schemaVersion!==1)throw Error('Invalid joint bundle');validateBeliefModel(b.belief);validateJointModel(b.joint,maxHidden);}
export function predictJoint(f:readonly number[],m:JointModel){return networkLogits(f,m.network).map((v,i)=>i===0?v:[3,4,7].includes(i)?sigmoid(v):softplus(v));}
/** Parent probabilities use max-plan logits; claims do not gain mass merely by having more continuations. */
export function jointDistribution(plans:readonly ActionPlan[],prior:readonly number[],residual:readonly number[],temperature=1){
  if(plans.length!==residual.length||!plans.length||residual.some(v=>!Number.isFinite(v))||prior.some(v=>!Number.isFinite(v)||v<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6||plans.some(p=>!Number.isInteger(p.index)||p.index<0||p.index>=prior.length)||!Number.isFinite(temperature)||temperature<=0)throw Error('Invalid joint distribution');const parents=[...new Set(plans.map(p=>p.index))],scores=parents.map(parent=>Math.max(...plans.flatMap((p,i)=>p.index===parent?[residual[i]!]:[]))+Math.log(Math.max(1e-12,prior[parent]!))),pp=softmax(scores.map(v=>v/temperature)),probabilities=Array<number>(plans.length).fill(0);let greedyPlan=0;
  parents.forEach((parent,j)=>{const ids=plans.flatMap((p,i)=>p.index===parent?[i]:[]),conditional=softmax(ids.map(i=>residual[i]!/temperature));ids.forEach((i,k)=>probabilities[i]=pp[j]!*conditional[k]!);if(j===pp.indexOf(Math.max(...pp)))greedyPlan=ids[conditional.indexOf(Math.max(...conditional))]!;});return {parents,parentProbabilities:pp,probabilities,greedyPlan};
}
export interface JointEvaluation {plans:ActionPlan[];features:number[][];outputs:number[][];probabilities:number[];selectedPlan:number;baseline:number;guard?:JointGuardDiagnostic}
export type JointStyle='balanced'|'attack'|'defense';
export type JointMode='guarded'|'explore';
/** Conservative decision margins, not calibrated confidence probabilities. Never tuned on final evaluation walls. */
export const JOINT_GUARD=Object.freeze({minimumPolicyMargin:.25,minimumFanGain:1});
const shapeIndex=JOINT_FEATURE_NAMES.indexOf('shanten'),selfWaitIndex=JOINT_FEATURE_NAMES.indexOf('legal-self-waits'),ronWaitIndex=JOINT_FEATURE_NAMES.indexOf('legal-ron-waits');
function residualScores(e:Pick<JointEvaluation,'outputs'|'features'>,style:JointStyle){
  return e.outputs.map((z,i)=>z[0]!+(style==='attack'?.5*z[1]!:style==='defense'?-4*Math.max(...[1,2,3].map(n=>e.features[i]![JOINT_FEATURE_NAMES.indexOf(`belief-${n}-risk`)]!)):0));
}
export interface GuardPlanDiagnostic {plan:number;parent:number;policyMargin:number;fanGain:number;shapeDelta:number;policyPass:boolean;fanPass:boolean;shapePass:boolean;waitPass:boolean;approved:boolean;continuationPass:boolean;actorMass:number;rawMass:number;returnedMass:number}
export interface JointGuardDiagnostic {version:1;baselinePlan:number|null;baselineResolved:boolean;baselineFan:number|null;plans:GuardPlanDiagnostic[];returnedMass:number[];rejectedMass:number;continuation:'commit-approved-plan/fresh-kd-baseline'}
/** One attainable baseline plan supplies score, fan and shape; unsupported mass returns to that exact plan. */
export function guardedJointDistribution(e:JointEvaluation,prior:readonly number[],selected:number,style:JointStyle='balanced',baselinePlan?:number,temperature=1,attainable?:readonly boolean[]){
  if(!Number.isInteger(selected)||selected<0||selected>=prior.length)throw Error('Invalid joint base action');
  const base=e.plans.flatMap((p,i)=>p.index===selected?[i]:[]);if(!base.length)throw Error('Missing joint base plans');
  const resolved=baselinePlan??(base.length===1?base[0]:undefined);if(resolved!==undefined&&!base.includes(resolved))throw Error('Invalid attainable baseline');
  const residual=residualScores(e,style),quality=(i:number)=>32*(e.outputs[i]![1]!-e.outputs[i]![2]!),baseScore=resolved===undefined?0:residual[resolved]!+Math.log(Math.max(1e-12,prior[selected]!)),baseValue=resolved===undefined?null:quality(resolved),baseShape=resolved===undefined?0:e.features[resolved]![shapeIndex]!;
  const proposal=resolved===undefined||base.length===1?e.probabilities:jointDistribution(e.plans,prior,residual.map((v,i)=>e.plans[i]!.index===selected?residual[resolved]!:v),temperature).probabilities;
  const probabilities=Array<number>(prior.length).fill(0),planMass=Array<number>(e.plans.length).fill(0);let rejectedMass=0;
  const details=e.plans.map((p,i)=>{const f=e.features[i]!,policyMargin=residual[i]!+Math.log(Math.max(1e-12,prior[p.index]!))-baseScore,fanGain=baseValue===null?0:quality(i)-baseValue,shapeDelta=f[shapeIndex]!-baseShape,policyPass=resolved!==undefined&&policyMargin>=JOINT_GUARD.minimumPolicyMargin,fanPass=resolved!==undefined&&fanGain>=JOINT_GUARD.minimumFanGain,shapePass=resolved!==undefined&&shapeDelta<=1e-12,waitPass=!(Math.abs(f[shapeIndex]!)<1e-12&&f[selfWaitIndex]===0&&f[ronWaitIndex]===0),continuationPass=attainable?.[i]??true,approved=p.index===selected||policyPass&&fanPass&&shapePass&&waitPass&&continuationPass;
    const keep=approved&&p.index!==selected;probabilities[keep?p.index:selected]!+=proposal[i]!;if(resolved!==undefined)planMass[keep?i:resolved]!+=proposal[i]!;if(!approved)rejectedMass+=proposal[i]!;
    return {plan:i,parent:p.index,policyMargin,fanGain,shapeDelta,policyPass,fanPass,shapePass,waitPass,continuationPass,approved,actorMass:e.probabilities[i]!,rawMass:proposal[i]!,returnedMass:0};});
  const total=probabilities.reduce((a,b)=>a+b,0);if(!Number.isFinite(total)||total<=0)throw Error('Invalid guarded policy mass');probabilities.forEach((p,i)=>probabilities[i]=p/total);details.forEach((p,i)=>p.returnedMass=planMass[i]!/total);
  let greedy=selected;for(let i=0;i<probabilities.length;i++)if(probabilities[i]!>probabilities[greedy]!)greedy=i;
  const diagnostic:JointGuardDiagnostic={version:1,baselinePlan:resolved??null,baselineResolved:resolved!==undefined,baselineFan:baseValue,plans:details,returnedMass:probabilities,rejectedMass:rejectedMass/total,continuation:'commit-approved-plan/fresh-kd-baseline'};
  return {probabilities,proposalProbabilities:proposal,planProbabilities:planMass.map(p=>p/total),approved:details.map(p=>p.approved),greedy,diagnostic};
}
export class JointPolicy {
  private readonly continuations=new ValueContinuations();
  readonly mode:JointMode;
  constructor(mode:JointMode='guarded'){if(mode!=='guarded'&&mode!=='explore')throw Error('Invalid joint mode');this.mode=mode;}
  evaluate(o:Observation,prior:readonly number[],scorer:Scorer,bundle:JointBundle,temperature=1,style:JointStyle='balanced'):JointEvaluation {
    if(prior.length!==o.legalActions.length||prior.some(v=>!Number.isFinite(v)||v<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid joint prior');const beliefs=opponentBeliefs(o,bundle.belief),plans=jointPlans(o),features=plans.map(p=>jointFeatures(o,p,prior,scorer,beliefs,bundle.joint.schemaVersion)),outputs=features.map(f=>predictJoint(f,bundle.joint)),residual=residualScores({outputs,features},style),d=jointDistribution(plans,prior,residual,temperature),baseline=d.probabilities.reduce((s,p,i)=>s+p*jointUtility(outputs[i]!,bundle.joint),0);
    return {plans,features,outputs,probabilities:d.probabilities,selectedPlan:d.greedyPlan,baseline};
  }
  async decideAsync(o:Observation,prior:readonly number[],selected:number,scorer:Scorer,bundle:JointBundle,infer:(o:Observation)=>Promise<{action:Observation['legalActions'][number];probabilities:number[]}>,random?:()=>number,temperature=1,style:JointStyle='balanced'){
    let baselinePlan:number|undefined,resolvedContinuation:{action:Observation['legalActions'][number];probabilities:number[]}|undefined;
    if(this.mode==='guarded'&&['chow','pung'].includes(o.legalActions[selected]?.type??'')&&!o.legalActions.some(a=>a.type==='hu')){
      const plans=jointPlans(o),first=plans.find(p=>p.index===selected)!;const after=continuationObservation(o,first),raw=await infer(after),tile=(lastTileAlternative(after,raw.action)??raw.action).tile;
      resolvedContinuation=raw;baselinePlan=plans.findIndex(p=>p.index===selected&&p.followUpDiscard===tile);if(raw.action.type!=='discard'||baselinePlan<0)throw Error('Missing KD claim continuation');
    }
    return {...this.decide(o,prior,selected,scorer,bundle,random,temperature,style,baselinePlan),...(resolvedContinuation?{resolvedContinuation}:{})};
  }
  decide(o:Observation,prior:readonly number[],selected:number,scorer:Scorer,bundle:JointBundle,random?:()=>number,temperature=1,style:JointStyle='balanced',baselinePlan?:number){
    if(!o.legalActions[selected])throw Error('Invalid joint selected action');
    const result=(index:number,reason:string,evaluation:JointEvaluation|null=null,probabilities?:number[])=>({index,action:o.legalActions[index]!,changed:index!==selected,reason,analysisCalls:evaluation?.plans.length??0,quality:evaluation?.guard&&evaluation.guard.baselineResolved?32*(evaluation.outputs[evaluation.selectedPlan]![1]!-evaluation.outputs[evaluation.selectedPlan]![2]!):null,baselineQuality:evaluation?.guard?.baselineFan??null,guard:evaluation?.guard??null,evaluation,mode:this.mode,probabilities:probabilities??o.legalActions.map((_,i)=>+(i===index))});
    const hu=o.legalActions.findIndex(a=>a.type==='hu');if(hu>=0)return result(hu,'legal-win');
    // An accepted compound action already selected its continuation. Guarded plans passed public safety;
    // exploration retains its actual sampled action rather than mapping distinct children onto a new discard.
    if(o.phase==='turn'&&o.drawn===null){const t=this.continuations.peek(o),i=o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===t);if(i>=0)return result(i,'joint-follow-up');}
    const safe=lastTileAlternative(o,o.legalActions[selected]!);if(safe)return result(o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===safe.tile),'last-tile-safe');
    // The baseline claim value was evaluated under fresh KD, so do not replace that continuation again.
    if(this.mode==='guarded'&&o.phase==='turn'&&o.drawn===null)return result(selected,'joint-baseline-follow-up');
    const e=this.evaluate(o,prior,scorer,bundle,temperature,style),guard=this.mode==='guarded'?guardedJointDistribution(e,prior,selected,style,baselinePlan,temperature,o.wallRemaining===0?e.plans.map(p=>p.followUpDiscard===null||!lastTileAlternative(continuationObservation(o,p),{type:'discard',tile:p.followUpDiscard})):undefined):null;
    if(random){let draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)throw Error('Invalid joint random source');e.selectedPlan=e.plans.length-1;for(let i=0;i<e.probabilities.length;i++){draw-=(guard?.proposalProbabilities??e.probabilities)[i]!;if(draw<0){e.selectedPlan=i;break;}}}
    let index=e.plans[e.selectedPlan]!.index;
    if(guard){const sampled=e.selectedPlan;index=random?(guard.approved[sampled]?index:selected):guard.greedy;
      if(index===selected)e.selectedPlan=guard.diagnostic.baselinePlan??e.plans.findIndex(p=>p.index===selected);
      else{const choices=e.plans.flatMap((p,i)=>p.index===index&&guard.approved[i]?[i]:[]);e.selectedPlan=random?sampled:choices.reduce((a,b)=>guard.planProbabilities[b]!>guard.planProbabilities[a]!?b:a);this.continuations.remember(o,e.plans[e.selectedPlan]!);}
      e.guard=guard.diagnostic;return result(index,index===selected?(o.phase==='turn'&&o.drawn===null?'joint-baseline-follow-up':'joint-baseline'):'joint-correction',e,guard.probabilities);}
    const plan=e.plans[e.selectedPlan]!;this.continuations.remember(o,plan);const probabilities=o.legalActions.map(()=>0);e.plans.forEach((p,i)=>probabilities[p.index]!+=e.probabilities[i]!);return result(plan.index,'joint-policy',e,probabilities);
  }
}
