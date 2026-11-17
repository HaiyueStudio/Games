import type {Observation,Scorer} from '../../rules/types';
import {STANDING_NAMES,standingFeatures} from './standings';
import {actionValueFeatures,VALUE_NAMES} from '../value/features';
import type {ActionPlan} from '../value/types';
import {BELIEF_PATTERNS} from '../belief/features';
import type {OpponentBelief} from '../belief/model';
export const JOINT_FEATURE_NAMES=[...VALUE_NAMES,...[1,2,3].flatMap(n=>['ready','risk','maximum-risk',...BELIEF_PATTERNS,'fan'].map(s=>'belief-'+n+'-'+s)),'own-fan','fan-lead','fan-spread','kd-entropy'] as const;
export const TOURNAMENT_FEATURE_NAMES=[...JOINT_FEATURE_NAMES,...STANDING_NAMES] as const;
export function jointFeatures(o:Observation,plan:ActionPlan,prior:readonly number[],scorer:Scorer,beliefs:readonly OpponentBelief[],version:1|2=1):number[]{
  if(beliefs.length!==3||beliefs.some((b,i)=>b.seat!==(o.seat+i+1)%4))throw Error('Invalid joint belief seats');const tile=plan.action.type==='discard'?plan.action.tile:plan.followUpDiscard,fan=o.players.map(p=>p.fan),own=fan[o.seat]!,mean=fan.reduce((a,b)=>a+b,0)/4;
  const f=[...actionValueFeatures(o,plan,prior,scorer),...beliefs.flatMap(b=>[b.ready,tile===null||tile===undefined?0:b.ron[tile]!,Math.max(...b.ron),...b.patterns.map(p=>p.probability),b.fanValue/88]),own/128,(own-Math.max(...fan.filter((_,i)=>i!==o.seat)))/128,Math.sqrt(fan.reduce((s,v)=>s+(v-mean)**2,0)/4)/128,-prior.reduce((s,p)=>s+(p>0?p*Math.log(p):0),0)/Math.log(Math.max(2,prior.length))];
  if(version===2)f.push(...standingFeatures(o,plan,beliefs,f[VALUE_NAMES.indexOf('best-fan')]!));
  if(f.length!==(version===2?TOURNAMENT_FEATURE_NAMES:JOINT_FEATURE_NAMES).length||f.some(v=>!Number.isFinite(v)))throw Error('Invalid joint features');return f;
}
