import type {Observation} from '../../rules/types';
import type {OpponentBelief} from '../belief/model';
import type {ActionPlan} from '../value/types';
export const STANDING_NAMES=['hands-remaining','current-first-credit',...[0,1,2,3].map(n=>`leader-${n}`),...[1,2,3].map(n=>`leading-opponent-${n}`),...[1,2,3].map(n=>`standing-fan-gap-${n}`),...[1,2,3].map(n=>`standing-score-gap-${n}`),'leader-risk','leader-fan','leader-melds','late-leader-risk','catchup-fan','protect-risk','remaining-gap'] as const;
/** Relative-seat public standings. Score breaks a cumulative-fan tie, including shared first place. */
export function standingFeatures(o:Observation,plan:ActionPlan,beliefs:readonly OpponentBelief[],bestFan:number){
  const ids=[0,1,2,3].map(n=>(o.seat+n)%4),players=ids.map(i=>o.players[i]!),me=players[0]!,compare=(a:number,b:number)=>players[a]!.fan-players[b]!.fan||players[a]!.score-players[b]!.score;
  const best=[0,1,2,3].reduce((a,b)=>compare(b,a)>0?b:a),leader=[0,1,2,3].filter(i=>compare(i,best)===0),opponent=[1,2,3].reduce((a,b)=>compare(b,a)>0?b:a),leading=[1,2,3].filter(i=>compare(i,opponent)===0),tile=plan.action.type==='discard'?plan.action.tile:plan.followUpDiscard;
  const average=(fn:(i:number)=>number)=>leading.reduce((s,i)=>s+fn(i),0)/leading.length,leaderRisk=average(i=>tile===null||tile===undefined?0:beliefs[i-1]!.ron[tile]!),gap=(me.fan-players[opponent]!.fan)/128,left=(16-o.handIndex)/16,late=1-left;
  return [left,leader.includes(0)?1/leader.length:0,...[0,1,2,3].map(i=>leader.includes(i)?1/leader.length:0),...[1,2,3].map(i=>leading.includes(i)?1/leading.length:0),...[1,2,3].map(i=>(me.fan-players[i]!.fan)/128),...[1,2,3].map(i=>(me.score-players[i]!.score)/256),leaderRisk,average(i=>beliefs[i-1]!.fanValue/88),average(i=>players[i]!.melds.length/4),late*leaderRisk,Math.max(0,-gap)*bestFan,Math.max(0,gap)*leaderRisk,left*gap];
}
