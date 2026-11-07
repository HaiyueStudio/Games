import {seat,type Action,type Meld,type Observation,type Scorer,type Tile} from '../rules/types';
import {handAnalysisCache} from './analysisCache';
import {actionPublicCounts,forecastFlags,readOpponents,tileDanger,visibleCounts} from './coaching/publicAnalysis';
import {lastTileAlternative} from './lastTileDefense';
import {rankCandidates} from './candidates/learned';
import {rankActionValues,validateActionValueModel,ValueContinuations,type ActionValueModel} from './value/model';
import {distilledValueModel} from './value/distilledWeights';
export type HybridProfile='safe'|'ready'|'search'|'learned'|'value'|'distilled'|'joint';
validateActionValueModel(distilledValueModel);
const originalContinuations=new WeakMap<ActionValueModel,ValueContinuations>(),distilledContinuations=new ValueContinuations();
export interface HybridDecision{index:number;action:Action;changed:boolean;reason:string;analysisCalls:number;quality:number|null;baselineQuality:number|null}
/** Frozen development settings. Quality is a conditional hand-efficiency feature, not a win probability. */
export const HYBRID_SETTINGS=Object.freeze({candidates:3,minimumPrior:.05,priorRatio:.2,qualityRatio:1.35,ronWeight:.8,maxAnalysisCalls:900} as const);
export function enhancePolicy(o:Observation,probabilities:readonly number[],selected:number,scorer:Scorer,profile:Exclude<HybridProfile,'joint'>='safe',originalModel?:ActionValueModel):HybridDecision{
  if(profile==='learned')return rankCandidates(o,probabilities,selected,scorer);
  if(profile==='value'){if(!originalModel)throw Error('Original value model must be loaded before inference');let state=originalContinuations.get(originalModel);if(!state){state=new ValueContinuations();originalContinuations.set(originalModel,state);}return rankActionValues(o,probabilities,selected,scorer,originalModel,state);}
  if(profile==='distilled')return rankActionValues(o,probabilities,selected,scorer,distilledValueModel,distilledContinuations);
  if(!['safe','ready','search'].includes(profile))throw Error('Unknown hybrid profile');
  if(probabilities.length!==o.legalActions.length||!o.legalActions[selected]||Array.from(probabilities).some(p=>!Number.isFinite(p)||p<0)||Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid hybrid policy');
  const preferred=o.legalActions[selected]!,order=o.legalActions.map((action,index)=>({action,index,p:probabilities[index]!})).sort((a,b)=>b.p-a.p||a.index-b.index);
  const result=(index:number,reason:string,calls=0,q:number|null=null,b:number|null=null):HybridDecision=>({index,action:o.legalActions[index]!,changed:index!==selected,reason,analysisCalls:calls,quality:q,baselineQuality:b});
  const hu=o.legalActions.findIndex(a=>a.type==='hu');if(hu>=0)return result(hu,'legal-win');
  const safe=lastTileAlternative(o,preferred,profile==='safe'?o.legalActions:order.map(v=>v.action));
  if(safe)return result(o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===safe.tile),'last-tile-safe');
  if(profile==='safe'||o.wallRemaining===0||o.phase!=='turn'||o.turn!==o.seat||preferred.type!=='discard')return result(selected,'model');
  const cache=handAnalysisCache(scorer),known=visibleCounts(o),unknown=known.map(n=>4-n),pool=unknown.reduce((a,b)=>a+b,0),melds=o.players[o.seat]!.melds as Meld[],wind=seat(o.seat-o.dealer),flowers=o.players[o.seat]!.flowers.length;
  let calls=0;const budget=Symbol('budget'),analyze=(hand:Tile[])=>{if(calls>=HYBRID_SETTINGS.maxAnalysisCalls)throw budget;calls++;return cache.analyze(hand)};
  const remove=(hand:Tile[],tile:Tile)=>{const h=[...hand],i=h.indexOf(tile);if(i<0)throw Error('Missing hybrid discard');h.splice(i,1);return h};
  const ready=(hand:Tile[],exposed:number[],drawn:Tile|null)=>{
    let value=0,live=0;
    for(const tile of analyze(hand).effective){const copies=unknown[tile]!-+(drawn===tile);if(copies<=0)continue;
      const self=scorer.score(hand,melds,tile,flowers,forecastFlags(o,tile,true,false,exposed),o.roundWind,wind),ron=scorer.score(hand,melds,tile,flowers,forecastFlags(o,tile,false,false,exposed),o.roundWind,wind);
      const selfValue=self&&self.fan>=8?self.total:0,ronValue=ron&&ron.fan>=8?ron.total:0;
      if(selfValue||ronValue){live+=copies;value+=copies*(selfValue+HYBRID_SETTINGS.ronWeight*ronValue)}
    }return {value,live};
  };
  try{
    const baseHand=remove(o.hand,preferred.tile!),baseShape=analyze(baseHand).shanten;
    if(baseShape>1||baseShape<0||baseShape===1&&o.wallRemaining<8||profile==='ready'&&baseShape!==0)return result(selected,'outside-search',calls);
    const opponents=readOpponents(o,known),risk=(tile:Tile)=>tileDanger(o,tile,opponents,known).score,baseRisk=risk(preferred.tile!);
    const quality=(action:Action)=>{
      const hand=remove(o.hand,action.tile!),shape=analyze(hand).shanten;
      if(shape!==baseShape)return null;
      const exposed=actionPublicCounts(o,action,melds,null);
      if(shape===0)return ready(hand,exposed,null);
      if(!pool)return {value:0,live:0};let value=0,live=0;
      for(const tile of analyze(hand).effective){const copies=unknown[tile]!;if(!copies)continue;const drawn=[...hand,tile].sort((a,b)=>a-b);let best=0;
        for(const discard of new Set(drawn)){const next=remove(drawn,discard);if(analyze(next).shanten!==0)continue;const publicAfter=[...exposed];publicAfter[discard]!++;best=Math.max(best,ready(next,publicAfter,tile).value);}
        if(best>0){live+=copies;value+=copies*best/pool;}
      }return {value,live};
    };
    const baseline=quality(preferred)!;let best={index:selected,...baseline};
    const candidates=order.filter(v=>v.action.type==='discard'&&v.index!==selected&&v.p>=HYBRID_SETTINGS.minimumPrior&&v.p>=probabilities[selected]!*HYBRID_SETTINGS.priorRatio).slice(0,HYBRID_SETTINGS.candidates-1);
    for(const c of candidates){if(risk(c.action.tile!)>baseRisk)continue;const q=quality(c.action);if(q&&q.live>=baseline.live&&q.value>best.value)best={index:c.index,...q};}
    const floor=baseShape===0?8:1;
    if(best.index!==selected&&best.value>=baseline.value*HYBRID_SETTINGS.qualityRatio+floor)return result(best.index,baseShape===0?'qualified-waits':'one-draw-search',calls,best.value,baseline.value);
    return result(selected,'model-margin',calls,baseline.value,baseline.value);
  }catch(e){if(e===budget)return result(selected,'search-budget',calls);throw e;}
}
