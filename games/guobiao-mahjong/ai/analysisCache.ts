import type {Scorer,Tile} from '../rules/types';
type Analysis=ReturnType<Scorer['analyze']>;
/** Only hand-shape results are reusable. Visible counts, fan, risk and action values are never cached. */
export class HandAnalysisCache{
  private readonly scorer:Scorer;private readonly capacity:number;private method:Scorer['analyze'];
  private readonly entries=new Map<string,Analysis>();private hits=0;private misses=0;private evictions=0;
  constructor(scorer:Scorer,capacity=10000){if(!Number.isInteger(capacity)||capacity<1)throw Error('Invalid hand-analysis cache capacity');this.scorer=scorer;this.capacity=capacity;this.method=scorer.analyze;}
  analyze(hand:Tile[]):Analysis{
    if(this.method!==this.scorer.analyze){this.entries.clear();this.method=this.scorer.analyze;}
    const key=hand.join(','),cached=this.entries.get(key);
    if(cached){this.hits++;this.entries.delete(key);this.entries.set(key,cached);return {shanten:cached.shanten,effective:[...cached.effective]};}
    this.misses++;const result=this.scorer.analyze(hand),stored={shanten:result.shanten,effective:[...result.effective]};
    if(this.entries.size>=this.capacity){this.entries.delete(this.entries.keys().next().value!);this.evictions++;}
    this.entries.set(key,stored);return result;
  }
  snapshot(){return {entries:this.entries.size,capacity:this.capacity,hits:this.hits,misses:this.misses,evictions:this.evictions}}
}
const caches=new WeakMap<Scorer,HandAnalysisCache>();
export function handAnalysisCache(scorer:Scorer){let cache=caches.get(scorer);if(!cache){cache=new HandAnalysisCache(scorer);caches.set(scorer,cache)}return cache;}
