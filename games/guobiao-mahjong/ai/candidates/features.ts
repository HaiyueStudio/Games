import {seat,type Observation,type Scorer,type Tile} from '../../rules/types';
import {handAnalysisCache} from '../analysisCache';
import {unseenCopies} from '../lastTileDefense';
import {searchTargets,type TargetSearch} from './targets';

export const CANDIDATE_FEATURE_VERSION=1;
export const RISK_NAMES=['honor','terminal','dragon','round-wind','seat-wind','unseen','own-copies','public-copies','open-melds','all-melds','chows','pungs','concealed-size','river-size','river-copy','river-age','recent-same-suit','recent-neighbor','exposed-same-suit','exposed-honors','single-suit','wall','late','turn','flowers','suit-neighbors','round','fan-gap'] as const;
export const QUALITY_NAMES=['shanten','ukeire','self-live','ron-live','target-value','target-fan','target-count','target-truncated','pair-count','honor-count','max-suit','closed','wall','turn','round','rounds-left','fan-gap','own-rank','target-two-draw','discard-drawn','discard-honor','discard-terminal','unseen-discard','risk-max','risk-sum','risk-fan'] as const;
const normGap=(gap:number)=>Math.tanh(gap/64);
/** Every feature is a deterministic function of one seat's public observation. */
export function riskFeatures(o:Observation,t:Tile,opponent:number,unknown=unseenCopies(o)):number[]{
  if(opponent===o.seat||!o.players[opponent]||!Number.isInteger(t)||t<0||t>=34)throw Error('Invalid risk query');
  const p=o.players[opponent]!,open=p.melds.filter(m=>!m.concealed),tiles=open.flatMap(m=>m.tiles.filter((v):v is number=>v!==null)),suits=tiles.filter(v=>v<27).map(v=>Math.floor(v/9)),history=o.events.filter(e=>e.type==='discard'&&e.seat===opponent&&e.hand===o.handIndex&&e.tile!==undefined).map(e=>e.tile!),recent=(history.length?history:p.river).slice(-5),same=(v:number)=>t<27&&v<27&&Math.floor(v/9)===Math.floor(t/9),last=(history.length?history:p.river).lastIndexOf(t),own=o.hand.filter(v=>v===t).length,publicCount=4-unknown[t]!-own-o.players[o.seat]!.melds.filter(m=>m.concealed).flatMap(m=>m.tiles).filter(v=>v===t).length;
  return [+ (t>=27),+(t<27&&(t%9===0||t%9===8)),+(t>=31),+(t===27+o.roundWind),+(t===27+seat(opponent-o.dealer)),unknown[t]!/4,own/4,publicCount/4,open.length/4,p.melds.length/4,open.filter(m=>m.kind==='chow').length/4,open.filter(m=>m.kind!=='chow').length/4,p.handCount/13,p.river.length/24,p.river.filter(v=>v===t).length/4,last<0?1:Math.min(1,((history.length||p.river.length)-last-1)/12),recent.filter(same).length/5,recent.filter(v=>same(v)&&Math.abs(v-t)<=2).length/5,tiles.filter(same).length/12,tiles.filter(v=>v>=27).length/12,+(suits.length>0&&new Set(suits).size===1),o.wallRemaining/144,+(o.wallRemaining<=16),o.players[o.seat]!.river.length/24,p.flowers.length/8,t<27?[-2,-1,1,2].reduce((n,d)=>n+(t+d>=0&&t+d<27&&Math.floor((t+d)/9)===Math.floor(t/9)?unknown[t+d]!:0),0)/16:0,o.roundWind/3,normGap(p.fan-o.players[o.seat]!.fan)];
}
export interface CandidateFeatures {tile:Tile;quality:number[];opponents:number[][];targets:TargetSearch}
export function candidateFeatures(o:Observation,tile:Tile,scorer:Scorer):CandidateFeatures{
  if(!o.legalActions.some(a=>a.type==='discard'&&a.tile===tile))throw Error('Illegal candidate discard');
  const hand=[...o.hand];hand.splice(hand.indexOf(tile),1);hand.sort((a,b)=>a-b);
  const unknown=unseenCopies(o),a=handAnalysisCache(scorer).analyze(hand),targets=searchTargets(o,tile,scorer),counts=Array<number>(34).fill(0);hand.forEach(t=>counts[t]!++);
  const mine=o.players[o.seat]!,all=[...hand,...mine.melds.flatMap(m=>m.tiles.filter((t):t is number=>t!==null))],suits=[0,1,2].map(s=>all.filter(t=>t<27&&Math.floor(t/9)===s).length),opponents=[1,2,3].map(n=>riskFeatures(o,tile,seat(o.seat+n),unknown));
  const quality=[a.shanten/6,a.effective.reduce((n,t)=>n+unknown[t]!,0)/48,targets.selfLive/16,targets.ronLive/16,Math.min(2,targets.bestValue/16),Math.max(0,...targets.routes.map(r=>r.selfFan??r.ronFan??0))/64,targets.routes.length/24,+targets.truncated,counts.filter(n=>n>=2).length/7,all.filter(t=>t>=27).length/14,Math.max(...suits)/14,+mine.melds.every(m=>m.concealed),o.wallRemaining/144,mine.river.length/24,o.roundWind/3,(15-o.handIndex)/15,normGap(mine.fan-Math.max(...o.players.filter((_,i)=>i!==o.seat).map(p=>p.fan))),o.players.filter(p=>p.fan>mine.fan).length/3,+targets.routes.some(r=>r.needs.length===2),+(tile===o.drawn),+(tile>=27),+(tile<27&&(tile%9===0||tile%9===8)),unknown[tile]!/4,0,0,0];
  if(quality.length!==QUALITY_NAMES.length||opponents.some(f=>f.length!==RISK_NAMES.length)||quality.some(v=>!Number.isFinite(v)))throw Error('Candidate feature schema mismatch');
  return {tile,quality,opponents,targets};
}
