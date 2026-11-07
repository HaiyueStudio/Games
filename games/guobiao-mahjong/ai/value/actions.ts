import {actionKey,type Meld,type Observation,type Scorer} from '../../rules/types';
import {handAnalysisCache} from '../analysisCache';
import type {ActionPlan} from './types';

const remove=(h:number[],t:number)=>{const i=h.indexOf(t);if(i<0)throw Error('Missing planned tile');h.splice(i,1);};
export function projectPlan(o:Observation,plan:ActionPlan){
  const hand=[...o.hand],melds=structuredClone(o.players[o.seat]!.melds) as Meld[],a=plan.action;
  if(!o.legalActions.some(v=>actionKey(v)===actionKey(a)))throw Error('Illegal action plan');
  if(a.type==='discard')remove(hand,a.tile!);
  else if(['chow','pung','kong'].includes(a.type)){
    const tiles=a.tiles?[...a.tiles]:Array<number>(a.type==='kong'?4:3).fill(a.tile!),need=[...tiles];remove(need,a.tile!);need.forEach(t=>remove(hand,t));
    melds.push({kind:a.type as Meld['kind'],tiles,from:o.last!.seat,concealed:false,promoted:false});
  }else if(a.type==='concealed-kong'){
    for(let i=0;i<4;i++)remove(hand,a.tile!);melds.push({kind:'kong',tiles:Array<number>(4).fill(a.tile!),from:o.seat,concealed:true,promoted:false});
  }else if(a.type==='add-kong'){
    remove(hand,a.tile!);const m=melds.find(v=>v.kind==='pung'&&v.tiles[0]===a.tile);if(!m)throw Error('Missing promoted pung');m.kind='kong';m.tiles.push(a.tile!);m.promoted=true;
  }
  if(plan.followUpDiscard!==null){if(!['chow','pung'].includes(a.type))throw Error('Unexpected follow-up discard');remove(hand,plan.followUpDiscard);}
  return {hand:hand.sort((a,b)=>a-b),melds};
}
export const VALUE_PLAN_SETTINGS=Object.freeze({discards:3,followUps:2,maximumPlans:18});
/** Keep the prior's top discards plus every legal claim/kong/pass. Claims have explicit discard branches. */
export function actionPlans(o:Observation,prior:readonly number[],scorer:Scorer):ActionPlan[]{
  if(prior.length!==o.legalActions.length||prior.some(v=>!Number.isFinite(v)||v<0)||Math.abs(prior.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid value prior');
  const discards=o.legalActions.map((a,i)=>({a,i})).filter(v=>v.a.type==='discard').sort((a,b)=>prior[b.i]!-prior[a.i]!||a.i-b.i).slice(0,VALUE_PLAN_SETTINGS.discards),indices=new Set(discards.map(v=>v.i)),cache=handAnalysisCache(scorer);
  const plans:ActionPlan[]=[];
  o.legalActions.forEach((action,index)=>{
    if(action.type==='hu'||action.type==='discard'&&!indices.has(index))return;
    const p={index,action,followUpDiscard:null};
    if(action.type==='chow'||action.type==='pung'){
      const after=projectPlan(o,p),known=Array<number>(34).fill(0);o.hand.forEach(t=>known[t]!++);o.players.forEach((p,i)=>{p.river.forEach(t=>known[t]!++);p.melds.forEach(m=>{if(i===o.seat||!m.concealed)m.tiles.forEach(t=>{if(t!==null)known[t]!++});});});
      const choices=[...new Set(after.hand)].map(tile=>{const hand=[...after.hand];remove(hand,tile);const a=cache.analyze(hand);return {tile,shanten:a.shanten,ukeire:a.effective.reduce((n,t)=>n+Math.max(0,4-known[t]!),0)}}).sort((a,b)=>a.shanten-b.shanten||b.ukeire-a.ukeire||a.tile-b.tile);
      for(const c of choices.slice(0,VALUE_PLAN_SETTINGS.followUps))plans.push({...p,followUpDiscard:c.tile});
    }else plans.push(p);
  });
  if(plans.length>VALUE_PLAN_SETTINGS.maximumPlans)throw Error('Value plan bound exceeded');return plans;
}
/** Exact public state after a winning chow/pung, before its immediate discard. */
export function continuationObservation(o:Observation,plan:ActionPlan):Observation {
  if(plan.followUpDiscard===null)throw Error('No continuation');const after=projectPlan(o,{...plan,followUpDiscard:null}),c=structuredClone(o);
  c.hand=after.hand;c.players[o.seat]!.melds=after.melds;c.players[o.seat]!.handCount=after.hand.length;c.players[o.last!.seat]!.river.pop();
  c.turn=o.seat;c.phase='turn';c.drawn=null;c.replacement=false;c.last=null;c.legalActions=[...new Set(after.hand)].map(tile=>({type:'discard',tile}));return c;
}
export function continuationKey(o:Observation):string {
  return JSON.stringify([o.seat,o.handIndex,o.phase,o.turn,o.drawn,o.replacement,o.wallRemaining,o.hand,o.players.map((p,i)=>[p.handCount,p.river,p.flowers,p.fan,p.score,p.melds.map(m=>[m.kind,m.from,m.concealed,m.promoted,m.concealed&&i!==o.seat?null:m.tiles])])]);
}
