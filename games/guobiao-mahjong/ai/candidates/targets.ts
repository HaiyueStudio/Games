import {seat,type Meld,type Observation,type Scorer,type Tile} from '../../rules/types';
import {handAnalysisCache} from '../analysisCache';
import {unseenCopies} from '../lastTileDefense';

export const TARGET_SETTINGS=Object.freeze({maxAnalyses:64,maxTargets:24,maxDraws:2});
export interface TargetRoute {needs:Tile[];discards:Tile[];selfFan:number|null;ronFan:number|null;fans:string[];collectionChance:number}
export interface TargetSearch {routes:TargetRoute[];analyses:number;truncated:boolean;selfLive:number;ronLive:number;bestValue:number}
function choose(n:number,k:number){if(k<0||k>n)return 0;let result=1;for(let i=1;i<=k;i++)result=result*(n-i+1)/i;return result;}
/** Chance of collecting this one target's missing copies in uniform draws. Not a game win probability. */
export function collectionChance(pool:number,counts:readonly number[],needs:readonly Tile[],draws:number):number{
  if(!Number.isInteger(pool)||pool<0||!Number.isInteger(draws)||draws<0||needs.length<1||needs.length>2||counts.length!==34||counts.some(c=>!Number.isInteger(c)||c<0||c>4)||counts.reduce((a,b)=>a+b,0)!==pool||needs.some(t=>!Number.isInteger(t)||t<0||t>=34))throw Error('Invalid target pool');
  const h=Math.min(draws,pool),den=choose(pool,h);if(!den||h<needs.length)return 0;
  const a=counts[needs[0]!]!;if(needs.length===1)return Math.max(0,Math.min(1,1-choose(pool-a,h)/den));
  const value=needs[0]===needs[1]?1-(choose(pool-a,h)+a*choose(pool-a,h-1))/den:1-(choose(pool-a,h)+choose(pool-counts[needs[1]!]!,h)-choose(pool-a-counts[needs[1]!]!,h))/den;
  return Math.max(0,Math.min(1,value));
}
/** Bounded improving-path target search. All completed targets pass the actual eight-fan referee. */
export function searchTargets(o:Observation,discard:Tile,scorer:Scorer):TargetSearch{
  const hand=[...o.hand],at=hand.indexOf(discard);if(at<0||o.phase!=='turn'||o.turn!==o.seat)throw Error('Target search requires an own discard');hand.splice(at,1);hand.sort((a,b)=>a-b);
  const result:TargetSearch={routes:[],analyses:0,truncated:false,selfLive:0,ronLive:0,bestValue:0},cache=handAnalysisCache(scorer),unknown=unseenCopies(o),pool=unknown.reduce((a,b)=>a+b,0),melds=o.players[o.seat]!.melds as Meld[],wind=seat(o.seat-o.dealer),seen=new Set<string>();
  const exposed=Array<number>(34).fill(0);for(const p of o.players)for(const m of p.melds)if(!m.concealed)for(const t of m.tiles)if(t!==null)exposed[t]!++;for(const p of o.players)for(const t of p.river)exposed[t]!++;exposed[discard]!++;
  const queue=[{hand,needs:[] as Tile[],discards:[discard],used:Array<number>(34).fill(0)}],horizon=Math.min(8,Math.floor(o.wallRemaining/4));
  for(let q=0;q<queue.length;q++){
    const node=queue[q]!;if(result.analyses>=TARGET_SETTINGS.maxAnalyses){result.truncated=true;break;}
    result.analyses++;const shape=cache.analyze(node.hand);if(shape.shanten>1)continue;
    for(const t of shape.effective){if(unknown[t]!-node.used[t]!<=0)continue;
      const flags=(exposed[t]!+node.discards.slice(1).filter(d=>d===t).length===3?2:0),self=scorer.score(node.hand,melds,t,0,flags|1,o.roundWind,wind),ron=scorer.score(node.hand,melds,t,0,flags,o.roundWind,wind),canSelf=!!self&&self.fan>=8,canRon=!!ron&&ron.fan>=8;
      if(!node.needs.length){if(canSelf)result.selfLive+=unknown[t]!;if(canRon)result.ronLive+=unknown[t]!;}
      if(canSelf||canRon){
        const needs=[...node.needs,t].sort((a,b)=>a-b),key=[...node.hand,t].sort((a,b)=>a-b).join(',');
        if(!seen.has(key)){seen.add(key);const chance=collectionChance(pool,unknown,needs,horizon),route={needs,discards:[...node.discards],selfFan:canSelf?self!.fan:null,ronFan:canRon?ron!.fan:null,fans:[...new Set([...(canSelf?self!.items:[]),...(canRon?ron!.items:[])].map(f=>f.name))],collectionChance:chance};result.routes.push(route);result.bestValue=Math.max(result.bestValue,chance*(route.selfFan??0));}
        if(result.routes.length>=TARGET_SETTINGS.maxTargets){result.truncated=true;break;}
      }
      if(shape.shanten<=0||node.needs.length+1>=TARGET_SETTINGS.maxDraws)continue;
      const drawn=[...node.hand,t].sort((a,b)=>a-b),used=[...node.used];used[t]!++;
      for(const d of new Set(drawn)){
        if(result.analyses>=TARGET_SETTINGS.maxAnalyses){result.truncated=true;break;}
        const next=[...drawn];next.splice(next.indexOf(d),1);result.analyses++;if(cache.analyze(next).shanten>=shape.shanten)continue;
        queue.push({hand:next,needs:[...node.needs,t],discards:[...node.discards,d],used});
      }
    }
    if(result.routes.length>=TARGET_SETTINGS.maxTargets)break;
  }
  result.routes.sort((a,b)=>b.collectionChance*(b.selfFan??0)-a.collectionChance*(a.selfFan??0)||a.needs.join(',').localeCompare(b.needs.join(',')));return result;
}
