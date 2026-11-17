import {seat,type Observation,type Scorer} from '../../rules/types';
import {handAnalysisCache} from '../analysisCache';
import {predictDiscardRisk} from '../candidates/learned';
import {projectPlan} from './actions';
import {valueObservation} from './observation';
import type {ActionPlan} from './types';

const ACTIONS=['discard','chow','pung','kong','concealed-kong','add-kong','pass'] as const;
const tiles=(prefix:string)=>Array.from({length:34},(_,t)=>prefix+'-'+t);
const OPPONENT_NAMES=['melds','chows','closed-kongs','hand-size','river-size','recent-honors','recent-terminals','recent-same-suit','fan-gap','score-gap','discard-risk'];
export const VALUE_FEATURE_VERSION=1;
export const VALUE_NAMES=[...ACTIONS.map(a=>'action-'+a),...tiles('hand'),...tiles('meld'),...tiles('discard'),...tiles('follow-up'),
  'shanten','ukeire','legal-self-waits','legal-ron-waits','best-fan','closed','pairs','honors','max-suit','kongs','flowers','prior','wall','round','rounds-left','own-rank','risk-max','risk-fan',
  ...[1,2,3].flatMap(n=>OPPONENT_NAMES.map(v=>'opponent-'+n+'-'+v))] as const;
/** Features are shared byte-for-byte by the offline labeler and Worker inference. */
export function actionValueFeatures(input:Observation,plan:ActionPlan,prior:readonly number[],scorer:Scorer):number[]{
  const o=valueObservation(input),after=projectPlan(o,plan),counts=Array<number>(34).fill(0),meldCounts=Array<number>(34).fill(0),known=Array<number>(34).fill(0),exposed=Array<number>(34).fill(0),mine=o.players[o.seat]!;
  after.hand.forEach(t=>counts[t]!++);after.melds.forEach(m=>m.tiles.forEach(t=>meldCounts[t]!++));o.hand.forEach(t=>known[t]!++);
  o.players.forEach((p,i)=>{p.river.forEach(t=>{known[t]!++;exposed[t]!++});p.melds.forEach(m=>{if(i===o.seat||!m.concealed)m.tiles.forEach(t=>{if(t!==null)known[t]!++});if(!m.concealed)m.tiles.forEach(t=>{if(t!==null)exposed[t]!++});});});
  for(const m of mine.melds)if(!m.concealed)for(const t of m.tiles)exposed[t!]!--;
  for(const m of after.melds)if(!m.concealed)for(const t of m.tiles)exposed[t]!++;
  if(['chow','pung','kong'].includes(plan.action.type))exposed[plan.action.tile!]!--;
  const discard=plan.action.type==='discard'?plan.action.tile!:plan.followUpDiscard;if(discard!==null)exposed[discard]!++;
  const analysis=handAnalysisCache(scorer).analyze(after.hand);let selfWait=0,ronWait=0,bestFan=0;
  if(analysis.shanten===0)for(const t of analysis.effective){const live=Math.max(0,4-known[t]!);if(!live)continue;
    for(const self of [false,true]){
      const win=scorer.score(after.hand,after.melds,t,mine.flowers.length,+self|(exposed[t]===3?2:0)|(o.wallRemaining===0?8:0),o.roundWind,seat(o.seat-o.dealer));
      if(win&&win.fan>=8){if(self)selfWait+=live;else ronWait+=live;bestFan=Math.max(bestFan,win.total);}
    }
  }
  const risk=discard===null?null:predictDiscardRisk(o,discard),all=counts.map((n,t)=>n+meldCounts[t]!),suits=[0,1,2].map(s=>all.slice(s*9,s*9+9).reduce((a,b)=>a+b,0));
  const features=[...ACTIONS.map(a=>+(a===plan.action.type)),...counts.map(n=>n/4),...meldCounts.map(n=>n/4),...Array.from({length:34},(_,t)=>+(plan.action.tile===t)),...Array.from({length:34},(_,t)=>+(plan.followUpDiscard===t)),
    analysis.shanten/6,analysis.effective.reduce((n,t)=>n+Math.max(0,4-known[t]!),0)/48,selfWait/16,ronWait/16,bestFan/64,+after.melds.every(m=>m.concealed),counts.filter(n=>n>=2).length/7,all.slice(27).reduce((a,b)=>a+b,0)/14,Math.max(...suits)/14,after.melds.filter(m=>m.kind==='kong').length/4,mine.flowers.length/8,prior[plan.index]!,o.wallRemaining/144,o.roundWind/3,(15-o.handIndex)/15,o.players.filter(p=>p.fan>mine.fan).length/3,risk?.maximum??0,(risk?.expectedFan??0)/32,
    ...[1,2,3].flatMap(n=>{const who=seat(o.seat+n),p=o.players[who]!,recent=o.events.filter(e=>e.seat===who&&e.type==='discard'&&e.tile!==undefined).slice(-5).map(e=>e.tile!),t=discard??plan.action.tile;
      return [p.melds.length/4,p.melds.filter(m=>m.kind==='chow').length/4,p.melds.filter(m=>m.concealed).length/4,p.handCount/13,p.river.length/24,recent.filter(v=>v>=27).length/5,recent.filter(v=>v<27&&(v%9===0||v%9===8)).length/5,t!==undefined&&t<27?recent.filter(v=>v<27&&Math.floor(v/9)===Math.floor(t/9)).length/5:0,Math.tanh((p.fan-mine.fan)/64),Math.tanh((p.score-mine.score)/128),risk?.opponents.find(v=>v.seat===who)?.probability??0];})];
  if(features.length!==VALUE_NAMES.length||features.some(v=>!Number.isFinite(v)))throw Error('Invalid action value features');return features;
}
