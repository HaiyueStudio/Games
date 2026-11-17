import type {Meld,Observation,Scorer,Seat} from '../rules/types';
import {handAnalysisCache} from '../ai/analysisCache';
/** Privileged labels exist only in this offline module; actor features never receive truth. */
export function beliefTargets(o:Observation,target:Seat,hand:readonly number[],melds:readonly Meld[],scorer:Scorer):number[]{
  const all=[...hand,...melds.flatMap(m=>m.tiles)],counts=Array<number>(34).fill(0);all.forEach(t=>counts[t]!++);const suits=[0,1,2].map(s=>counts.slice(s*9,s*9+9).reduce((a,b)=>a+b,0)),honors=counts.slice(27).reduce((a,b)=>a+b,0),pairs=counts.filter(n=>n>=2).length,terminal=all.filter(t=>t>=27||t%9===0||t%9===8).length,patterns=[...suits.map((n,i)=>+(n>=6&&suits.every((v,j)=>j===i||v===0))),+(!melds.some(m=>m.kind==='chow')&&pairs>=4),+(melds.length===0&&pairs>=4),+(terminal>=8),+(honors===0),+(suits.every(n=>n>0)&&counts.slice(27,31).some(n=>n>0)&&counts.slice(31).some(n=>n>0))];
  const ron=Array<number>(34).fill(0),visible=Array<number>(34).fill(0);o.players.forEach(p=>{p.river.forEach(t=>visible[t]!++);p.melds.filter(m=>!m.concealed).forEach(m=>m.tiles.forEach(t=>{if(t!==null)visible[t]!++}));});let maximum=0;
  const a=[1,4,7,10,13].includes(hand.length)?handAnalysisCache(scorer).analyze([...hand]):null;if(a?.shanten===0)for(const t of a.effective){if(visible[t]!>=4)continue;const flags=(visible[t]===3?2:0)|(o.wallRemaining===0?8:0),win=scorer.score([...hand],[...melds],t,o.players[target]!.flowers.length,flags,o.roundWind,(target-o.dealer+4)%4);if(win&&win.fan>=8){ron[t]=1;maximum=Math.max(maximum,win.fan);}}
  return [+ron.some(n=>n>0),...ron,...patterns,Math.log1p(maximum)/Math.log(89)];
}
