/** Offline comparison only. The original unpacked heads are excluded from the game import graph. */
import {actionValueModel} from '../ai/value/weights';
import {rankActionValues,validateActionValueModel,ValueContinuations} from '../ai/value/model';
import type {Observation,Scorer} from '../rules/types';
validateActionValueModel(actionValueModel);
const continuations=new ValueContinuations();
export function referenceValue(o:Observation,p:readonly number[],selected:number,scorer:Scorer){return rankActionValues(o,p,selected,scorer,actionValueModel,continuations);}
