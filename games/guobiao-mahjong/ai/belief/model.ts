import type {Observation,Seat} from '../../rules/types';
import {seat} from '../../rules/types';
import {networkLogits,sigmoid,validateNetwork,type SmallNetwork} from '../learning/network';
import {beliefFeatures,BELIEF_FEATURE_NAMES,BELIEF_OUTPUT_NAMES,BELIEF_PATTERNS} from './features';
export interface BeliefModel {schemaVersion:1;featureNames:readonly string[];outputNames:readonly string[];network:SmallNetwork;calibration:{temperature:number[];bias:number[]}}
export interface OpponentBelief {seat:Seat;ready:number;ron:number[];patterns:Array<{name:string;probability:number}>;fanValue:number}
export function validateBeliefModel(m:BeliefModel,maxHidden=32){
  if(m.schemaVersion!==1||JSON.stringify(m.featureNames)!==JSON.stringify(BELIEF_FEATURE_NAMES)||JSON.stringify(m.outputNames)!==JSON.stringify(BELIEF_OUTPUT_NAMES))throw Error('Belief schema mismatch');validateNetwork(m.network,BELIEF_FEATURE_NAMES.length,BELIEF_OUTPUT_NAMES.length,maxHidden);
  if(m.calibration.temperature.length!==BELIEF_OUTPUT_NAMES.length||m.calibration.bias.length!==BELIEF_OUTPUT_NAMES.length||m.calibration.temperature.some(v=>!Number.isFinite(v)||v<.1||v>10)||m.calibration.bias.some(v=>!Number.isFinite(v)||Math.abs(v)>20))throw Error('Invalid belief calibration');
}
export function predictBelief(input:Observation,target:Seat,model:BeliefModel):OpponentBelief {
  const z=networkLogits(beliefFeatures(input,target),model.network),p=z.map((v,i)=>sigmoid(v/model.calibration.temperature[i]!+model.calibration.bias[i]!));
  return {seat:target,ready:p[0]!,ron:p.slice(1,35),patterns:BELIEF_PATTERNS.map((name,i)=>({name,probability:p[35+i]!})),fanValue:Math.expm1(p.at(-1)!*Math.log(89))};
}
export function opponentBeliefs(o:Observation,m:BeliefModel){return [1,2,3].map(n=>predictBelief(o,seat(o.seat+n),m));}
