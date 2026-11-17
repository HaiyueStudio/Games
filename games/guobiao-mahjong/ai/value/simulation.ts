import {applyAction,legalActions,observe} from '../../rules/match';
import {actionKey,seat,type Action,type Match,type Meld,type Observation,type Scorer,type Seat} from '../../rules/types';
import {valueObservation} from './observation';
import type {ActionPlan} from './types';
export {valueObservation} from './observation';
export type {ActionPlan} from './types';
export function randomSource(seedValue:number):()=>number {
  let state=(seedValue>>>0)||0x9e3779b9;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296};
}
export function simulationSeed(seed:number,revision:number,sample:number):number {
  let n=(seed^Math.imul(revision+1,0x9e3779b1)^Math.imul(sample+1,0x85ebca6b))>>>0;n^=n>>>16;n=Math.imul(n,0x7feb352d);return(n^(n>>>15))>>>0;
}
/** Uniform tile-count-consistent determinizations, not a learned posterior over opponents' progress. */
export function sampleWorld(input:Observation,seedValue:number):Match {
  const o=valueObservation(input),random=randomSource(seedValue),counts=Array<number>(42).fill(4);for(let t=34;t<42;t++)counts[t]=1;
  if(o.players.length!==4||!['turn','response'].includes(o.phase)||!Number.isInteger(o.wallRemaining)||o.wallRemaining<0||o.wallRemaining>144)throw Error('Invalid simulation observation');
  const take=(t:number)=>{if(!Number.isInteger(t)||t<0||t>=42||counts[t]!--<=0)throw Error('Inconsistent public tile counts');};
  const players=o.players.map((p,i)=>({name:p.name,hand:i===o.seat?[...o.hand]:[],melds:p.melds.map(m=>({...m,tiles:[...m.tiles]})) as Meld[],flowers:[...p.flowers],river:[...p.river],fan:p.fan,score:p.score,wins:p.wins}));
  o.hand.forEach(take);
  o.players.forEach((p,i)=>{p.flowers.forEach(take);p.river.forEach(take);p.melds.forEach(m=>{if(i===o.seat||!m.concealed){if(m.tiles.some(t=>t===null))throw Error('Missing known meld');m.tiles.forEach(t=>take(t!));}});});
  // An announced added-kong tile is public but still belongs to the offerer's concealed hand.
  if(o.last?.robKong&&o.last.seat!==o.seat){take(o.last.tile);players[o.last.seat]!.hand.push(o.last.tile);}
  for(const [i,p] of players.entries())if(i!==o.seat)for(const m of p.melds)if(m.concealed){
    const choices=counts.slice(0,34).flatMap((n,t)=>n===4?[t]:[]);if(!choices.length)throw Error('Impossible concealed kong');
    const tile=choices[Math.floor(random()*choices.length)]!;m.tiles=Array<number>(4).fill(tile);m.tiles.forEach(take);
  }
  const pool=counts.slice(0,34).flatMap((n,t)=>Array<number>(n).fill(t));
  const pull=()=>{if(!pool.length)throw Error('Impossible concealed hand counts');const at=Math.floor(random()*pool.length),t=pool[at]!;pool[at]=pool[pool.length-1]!;pool.pop();return t;};
  players.forEach((p,i)=>{if(i!==o.seat){const size=o.players[i]!.handCount;if(!Number.isInteger(size)||size<p.hand.length||size>14)throw Error('Invalid concealed size');while(p.hand.length<size)p.hand.push(pull());}p.hand.sort((a,b)=>a-b);});
  const wall=[...pool,...counts.slice(34).flatMap((n,t)=>Array<number>(n).fill(t+34))];
  if(wall.length!==o.wallRemaining)throw Error('Public wall/hand counts do not conserve 144 tiles');
  for(let i=wall.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[wall[i],wall[j]]=[wall[j]!,wall[i]!];}
  return {seed:seedValue>>>0,rng:seedValue>>>0,revision:o.revision,handIndex:o.handIndex,dealer:o.dealer,turn:o.turn,phase:o.phase,wall,head:0,tail:wall.length-1,players,drawn:o.drawn,replacement:o.replacement,last:o.last?{...o.last}:null,responses:{},events:structuredClone(o.events),results:[],actions:[]};
}
export interface RolloutOutcome {fans:number[];scores:number[];winner:Seat|null;from:Seat|null;selfDrawn:boolean;actions:number;followUpApplied:boolean;claimApplied:boolean}
export type RolloutPolicy=(o:Observation)=>Action|Promise<Action>;
/** All four players see only observe(). Other response commitments are deliberately re-decided. */
export async function simulatePlan(world:Match,who:Seat,plan:ActionPlan,scorer:Scorer,policy:RolloutPolicy,signal?:AbortSignal):Promise<RolloutOutcome>{
  const s=structuredClone(world),fans=s.players.map(p=>p.fan),scores=s.players.map(p=>p.score);let steps=0,followUpApplied=false,claimApplied=false;
  const rootMelds=JSON.stringify(s.players[who]!.melds),isClaim=['chow','pung','kong'].includes(plan.action.type);let awaitingClaim=isClaim,followUpEligible=false;
  applyAction(s,who,plan.action,scorer);
  if(!isClaim&&plan.action.type.includes('kong'))claimApplied=JSON.stringify(s.players[who]!.melds)!==rootMelds;
  while(s.phase==='turn'||s.phase==='response'){
    signal?.throwIfAborted();if(++steps>1024)throw Error('Simulation did not terminate');
    const actor=s.phase==='turn'?s.turn:[1,2,3].map(n=>seat(s.last!.seat+n)).find(i=>!s.responses[i])!;
    const o=observe(s,actor,scorer);if(!o.legalActions.length)throw Error('No simulation legal action');
    if(awaitingClaim&&s.phase!=='response'){awaitingClaim=false;claimApplied=s.turn===who&&JSON.stringify(s.players[who]!.melds)!==rootMelds;followUpEligible=claimApplied&&s.drawn===null;}
    if(plan.action.type==='add-kong'&&s.phase==='turn')claimApplied=JSON.stringify(s.players[who]!.melds)!==rootMelds;
    let action:Action;
    if(!followUpApplied&&plan.followUpDiscard!==null&&followUpEligible&&actor===who&&s.phase==='turn'&&s.drawn===null){
      action={type:'discard',tile:plan.followUpDiscard};if(!legalActions(s,actor,scorer).some(a=>actionKey(a)===actionKey(action)))throw Error('Illegal planned follow-up');followUpApplied=true;
    }else action=o.legalActions.length===1?o.legalActions[0]!:await policy(valueObservation(o));
    applyAction(s,actor,action,scorer);
  }
  if(s.results.length!==1)throw Error('Simulation must finish exactly one hand');const result=s.results[0]!;
  if(awaitingClaim||plan.action.type==='add-kong')claimApplied=JSON.stringify(s.players[who]!.melds)!==rootMelds;
  return {fans:s.players.map((p,i)=>p.fan-fans[i]!),scores:s.players.map((p,i)=>p.score-scores[i]!),winner:result.winner,from:result.from,selfDrawn:result.selfDrawn,actions:steps+1,followUpApplied,claimApplied};
}
