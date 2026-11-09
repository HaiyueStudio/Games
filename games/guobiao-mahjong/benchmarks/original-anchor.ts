import type {Observation,Scorer} from '../rules/types';
import {rankActionValues,ValueContinuations,type ActionValueModel} from '../ai/value/model';
export interface OriginalAnchor {version:1;policy:'kd-value-v1';index:number;smoothing:number;probabilities:number[]}
/** Frozen original value policy, evaluated on this public state with fresh continuation memory. */
export function originalAnchor(o:Observation,prior:readonly number[],selected:number,scorer:Scorer,model:ActionValueModel):OriginalAnchor{
  const d=rankActionValues(o,prior,selected,scorer,model,new ValueContinuations()),smoothing=.02;
  return {version:1,policy:'kd-value-v1',index:d.index,smoothing,probabilities:prior.map((p,i)=>smoothing*p+(i===d.index?1-smoothing:0))};
}
