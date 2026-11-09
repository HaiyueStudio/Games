import type {Meld,Observation,Scorer,Tile} from '../rules/types';
import {seat} from '../rules/types';
import {unseenCopies,cannotComplete} from './lastTileDefense';
import {predictDiscardRisk} from './candidates/learned';
import {handAnalysisCache} from './analysisCache';
export interface FanReachability {support:number;bestFan:number;states:number;scoreCalls:number;truncated:boolean;depth:number}
type WinFlags=(tile:Tile,self:boolean,discards:Tile[],kong?:boolean)=>number;
/** Bounded own-draw route coverage. This is not a win probability or an incomplete-hand score. */
export function eightFanReachability(o:Observation,hand:Tile[],melds:Meld[],scorer:Scorer,flags:WinFlags,discards:Tile[],depth=1,maximumStates=48,maximumScores=384):FanReachability{
  if(!Number.isInteger(depth)||depth<0||depth>2||!Number.isInteger(maximumStates)||maximumStates<1||maximumStates>256||!Number.isInteger(maximumScores)||maximumScores<2||maximumScores>4096)throw Error('Invalid bounded fan search');
  const unseen=unseenCopies(o),cache=handAnalysisCache(scorer),consumed=Array<number>(34).fill(0);let states=0,scoreCalls=0,truncated=false,bestFan=0;
  const live=(t:Tile)=>Math.max(0,unseen[t]!-consumed[t]!);
  function visit(h:Tile[],left:number,river:Tile[]):number{
    if(states>=maximumStates){truncated=true;return 0;}states++;const a=cache.analyze(h);
    if(a.shanten===0){let total=0,qualified=0;
      for(const t of a.effective){const n=live(t);if(!n)continue;total+=n;
        if(scoreCalls+2>maximumScores){truncated=true;continue;}
        scoreCalls+=2;const self=scorer.score(h,melds,t,0,flags(t,true,river),o.roundWind,seat(o.seat-o.dealer)),ron=scorer.score(h,melds,t,0,flags(t,false,river),o.roundWind,seat(o.seat-o.dealer)),fan=Math.max(self?.fan??0,ron?.fan??0);bestFan=Math.max(bestFan,fan);if(fan>=8)qualified+=n;
      }return total?qualified/total:0;
    }
    if(left<=0||a.shanten>left)return 0;
    const draws=a.effective.filter(t=>live(t)>0),total=draws.reduce((n,t)=>n+live(t),0);let support=0;
    for(const t of draws){const n=live(t);consumed[t]!++;const drawn=[...h,t].sort((a,b)=>a-b),choices=[...new Set(drawn)].map(discard=>{const next=[...drawn];next.splice(next.indexOf(discard),1);const analysis=cache.analyze(next);return {discard,hand:next,shanten:analysis.shanten,ukeire:analysis.effective.reduce((s,t)=>s+live(t),0)}}).filter(c=>c.shanten<a.shanten).sort((a,b)=>a.shanten-b.shanten||b.ukeire-a.ukeire||a.discard-b.discard);
      // One-shanten leaves are all examined; deeper paths use a deterministic four-state beam.
      const limit=left>1?4:choices.length;let best=0;for(const c of choices.slice(0,limit)){best=Math.max(best,visit(c.hand,left-1,[...river,c.discard]));if(best===1)break;}support+=n*best;consumed[t]!--;
      if(states>=maximumStates||scoreCalls>=maximumScores){truncated=true;break;}
    }return total?support/total:0;
  }
  const support=visit([...hand],Math.max(0,Math.min(2,depth)),discards);return {support,bestFan,states,scoreCalls,truncated,depth};
}
export interface ReplacementValue {value:number;shanten:number;ukeire:number;legalWaits:number;winProbability:number;winFan:number;branches:number;exhausted:boolean}
/** Exact marginal expectation over available nonflower supplements; flowers trigger another supplement. */
export function kongReplacement(o:Observation,hand:Tile[],melds:Meld[],scorer:Scorer,flags:WinFlags,bestDiscard:(hand:Tile[],drawn:Tile)=>{value:number;shanten:number;ukeire:number;legalWaits:number}):ReplacementValue{
  const unseen=unseenCopies(o),total=unseen.reduce((a,b)=>a+b,0),result:ReplacementValue={value:0,shanten:0,ukeire:0,legalWaits:0,winProbability:0,winFan:0,branches:0,exhausted:false};
  if(!total||o.wallRemaining<=0)throw Error('Kong has no possible supplement');
  if(o.wallRemaining<=8-o.players.reduce((n,p)=>n+p.flowers.length,0)){result.exhausted=true;result.shanten=handAnalysisCache(scorer).analyze(hand).shanten;return result;}
  unseen.forEach((count,tile)=>{if(!count)return;result.branches++;const weight=count/total,win=scorer.score(hand,melds,tile,0,flags(tile,true,[],true),o.roundWind,seat(o.seat-o.dealer));
    if(win&&win.fan>=8){result.winProbability+=weight;result.winFan+=weight*win.fan;result.value+=weight*(40+4*Math.log1p(win.fan/8));result.shanten-=weight;result.legalWaits+=weight;return;}
    const c=bestDiscard([...hand,tile].sort((a,b)=>a-b),tile);result.value+=weight*c.value;result.shanten+=weight*c.shanten;result.ukeire+=weight*c.ukeire;result.legalWaits+=weight*c.legalWaits;
  });return result;
}
/** Added kongs can be robbed. Public impossibility is exact; the remaining hazard is a heuristic estimate. */
export function robKongHazard(o:Observation,tile:Tile){
  const unseen=unseenCopies(o),possible=o.players.map((p,i)=>i!==o.seat&&!cannotComplete(tile,p.melds.length,unseen)),risk=predictDiscardRisk(o,tile);let probability=0,expectedFan=0;
  for(const r of risk.opponents){if(!possible[r.seat])continue;const p=o.players[r.seat]!,floor=Math.min(.2,.01+.015*p.melds.length+.002*Math.max(0,p.river.length-6)),hazard=Math.max(r.probability,floor);probability+=hazard;expectedFan+=hazard*(Math.max(8,r.conditionalFan)+8);}
  return {possible:possible.some(Boolean),probability:Math.min(1,probability),expectedFan,penalty:.5*expectedFan,interpretation:'public structural bound plus conservative rob-kong hazard; not calibrated rob probability'};
}

/** Retain the established near-ready shape prior for every candidate, including unsearched ones. */
export function fanRoutePrior(shanten:number){return shanten===1?-6:shanten===2?-2:0;}
/** Partial search only earns found support. Truncation cannot erase the common shape prior. */
export function fanRouteAdjustment(route:Pick<FanReachability,'support'>,shanten=0){if(!Number.isFinite(route.support)||route.support<0||route.support>1)throw Error('Invalid route support');return (4-fanRoutePrior(shanten))*route.support;}
