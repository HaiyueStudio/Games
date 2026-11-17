import {seat,type Meld,type Observation,type Scorer,type Tile,type Win} from '../../rules/types';
import {actionPublicCounts,baseReport,coachingObservation,forecastFlags,forecastHorizon,prepareAction,visibleCounts} from './publicAnalysis';
import {DEFAULT_COACH_OPTIONS,type CoachOptions,type CoachReport,type Forecast,type Interval} from './types';
export function validateCoachOptions(options:CoachOptions){if(!Number.isInteger(options.samples)||options.samples<16||options.samples>256||!Number.isInteger(options.horizon)||options.horizon<1||options.horizon>8)throw Error('分析参数无效')}
export function wilson(successes:number,trials:number):Interval{
  if(trials<=0)return {low:0,high:1};const z=1.96,p=successes/trials,d=1+z*z/trials,center=(p+z*z/(2*trials))/d,half=z*Math.sqrt((p*(1-p)+z*z/(4*trials))/trials)/d;return {low:Math.max(0,center-half),high:Math.min(1,center+half)};
}
/** Exact conditional chance of drawing at least one of W live tiles in H uniform draws, without replacement. */
export function drawChance(pool:number,winning:number,horizon:number):number{
  if(!Number.isInteger(pool)||!Number.isInteger(winning)||!Number.isInteger(horizon)||horizon<0||pool<0||winning<0||winning>pool)throw Error('试算盘面无效');let miss=1;for(let i=0;i<Math.min(horizon,pool);i++)miss*=Math.max(0,pool-winning-i)/(pool-i);return Math.max(0,Math.min(1,1-miss));
}
function choose(n:number,k:number){if(k<0||k>n)return 0;let result=1;for(let i=1;i<=k;i++)result=result*(n-i+1)/i;return result}
/** Multivariate hypergeometric occupancy: at least K of the required tile types appear in H draws. */
export function keyTileChance(pool:number,copies:readonly number[],required:number,horizon:number):number{
  if(!Number.isInteger(pool)||pool<0||!Number.isInteger(horizon)||horizon<0||copies.some(n=>!Number.isInteger(n)||n<0)||copies.reduce((a,b)=>a+b,0)>pool||!Number.isInteger(required)||required<0)throw Error('关键牌试算参数无效');
  if(required===0)return 1;if(required>copies.length||horizon<required)return 0;const h=Math.min(horizon,pool),width=copies.length+1;
  let dp=Array.from({length:h+1},()=>Array<number>(width).fill(0));dp[0]![0]=1;
  for(const count of copies){const next=Array.from({length:h+1},()=>Array<number>(width).fill(0));for(let drawn=0;drawn<=h;drawn++)for(let hits=0;hits<width;hits++)if(dp[drawn]![hits])for(let take=0;take<=Math.min(count,h-drawn);take++)if(hits+(take>0?1:0)<width)next[drawn+take]![hits+(take>0?1:0)]!+=dp[drawn]![hits]!*choose(count,take);dp=next;}
  const other=pool-copies.reduce((a,b)=>a+b,0),total=choose(pool,h);let ways=0;for(let drawn=0;drawn<=h;drawn++)for(let hits=required;hits<width;hits++)ways+=dp[drawn]![hits]!*choose(other,h-drawn);return total?Math.max(0,Math.min(1,ways/total)):0;
}
const fanItems=(win:Win)=>win.items.filter(f=>!['花牌','自摸'].includes(f.name));
function exactWaits(o:Observation,hand:Tile[],melds:Meld[],known:number[],exposed:number[],horizon:number,scorer:Scorer):Forecast{
  const waits=Array.from({length:34},(_,tile)=>({tile,copies:4-known[tile]!,win:scorer.score(hand,melds,tile,0,forecastFlags(o,tile,true,false,exposed),o.roundWind,seat(o.seat-o.dealer))})).filter(v=>v.copies>0&&v.win&&v.win.fan>=8),total=known.reduce((n,c)=>n+4-c,0),live=waits.reduce((n,w)=>n+w.copies,0),probability=drawChance(total,live,horizon);
  const facts=new Map<string,{name:string;fan:number;hits:number;probability:number}>();for(const w of waits)for(const f of fanItems(w.win!)){const item=facts.get(f.name)??{name:f.name,fan:f.value,hits:0,probability:0};item.hits+=w.copies;item.probability+=live?probability*w.copies/live:0;facts.set(f.name,item)}
  return {method:'exact-waits',samples:0,wins:0,probability,interval:null,horizon,improved:0,improvementProbability:probability,fans:[...facts.values()].sort((a,b)=>b.probability-a.probability||b.fan-a.fan).slice(0,4)};
}
function hash(text:string){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0}
function random(seed:number){return ()=>{seed+=0x6d2b79f5;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296}}
function futureTiles(known:number[],horizon:number,seed:number){const pool=known.map(c=>4-c),rng=random(seed),result:Tile[]=[];let total=pool.reduce((a,b)=>a+b,0);for(let i=0;i<horizon&&total;i++){let n=Math.floor(rng()*total),chosen=0;for(;chosen<34;chosen++){n-=pool[chosen]!;if(n<0)break}pool[chosen]!--;total--;result.push(chosen)}return result}
export interface CoachWork {check():void;yield():Promise<void>;report?(report:CoachReport):void;progress?(done:number,total:number):void}
/** Independent from the referee RNG and model providers; only the supplied redacted observation is read. */
export async function analyzePosition(input:Observation,scorer:Scorer,options:CoachOptions=DEFAULT_COACH_OPTIONS,work:CoachWork={check(){},yield:async()=>{}}):Promise<CoachReport>{
  validateCoachOptions(options);const started=performance.now(),o=coachingObservation(input);work.check();const report=baseReport(o,scorer,options),routeKnown=visibleCounts(o),pool=routeKnown.reduce((n,c)=>n+4-c,0);
  for(const route of report.routes)route.keyProbability=route.keyRequired>0?keyTileChance(pool,route.needs.map(t=>4-routeKnown[t]!),route.keyRequired,report.horizon):['清龙','三色三同顺'].includes(route.name)?1:null;
  work.check();work.report?.(structuredClone(report));
  if(report.stage==='完成'||!report.candidates.length)return {...report,stage:'完成',elapsedMs:performance.now()-started};
  const known=visibleCounts(o),wind=seat(o.seat-o.dealer),cache=new Map<string,ReturnType<Scorer['analyze']>>();
  const analyze=(hand:Tile[])=>{const key=hand.join(',');let a=cache.get(key);if(!a){a=scorer.analyze(hand);if(cache.size>=12000)cache.clear();cache.set(key,a)}return a};
  const states=report.candidates.map(c=>prepareAction(o,c.action,scorer)),exposed=report.candidates.map((c,i)=>actionPublicCounts(o,c.action,states[i]!.melds,states[i]!.followUpDiscard)),horizons=report.candidates.map(c=>forecastHorizon(o,c.action,options.horizon));
  const accumulators=states.map(()=>({wins:0,improved:0,fans:new Map<string,{name:string;fan:number;hits:number;probability:number}>()}));
  report.candidates.forEach((c,i)=>{if(c.shanten===0&&!c.action.type.includes('kong'))c.forecast=exactWaits(o,states[i]!.hand,states[i]!.melds,known,exposed[i]!,horizons[i]!,scorer)});
  const active=report.candidates.map((c,i)=>c.forecast===null?i:-1).filter(i=>i>=0),seed=hash(report.key),maxHorizon=Math.max(0,...horizons);
  if(active.length&&maxHorizon>0)for(let trial=0;trial<options.samples;trial++){
    work.check();const future=futureTiles(known,maxHorizon,(seed^Math.imul(trial+1,0x9e3779b1))>>>0);
    for(const index of active){const state=states[index]!,candidate=report.candidates[index]!,acc=accumulators[index]!,initial=analyze(state.hand).shanten,publicTiles=[...exposed[index]!];let hand=[...state.hand],bestShanten=initial;
      for(let step=0;step<Math.min(future.length,horizons[index]!);step++){
        work.check();const tile=future[step]!,win=scorer.score(hand,state.melds,tile,0,forecastFlags(o,tile,true,step===0&&candidate.action.type.includes('kong'),publicTiles),o.roundWind,wind);
        if(win&&win.fan>=8){acc.wins++;bestShanten=-1;for(const f of fanItems(win)){const item=acc.fans.get(f.name)??{name:f.name,fan:f.value,hits:0,probability:0};item.hits++;acc.fans.set(f.name,item)}break}
        const current=analyze(hand);if(current.shanten>0&&!current.effective.includes(tile)){publicTiles[tile]!++;continue;}
        const drawn=[...hand,tile].sort((a,b)=>a-b),counts=Array<number>(34).fill(0);drawn.forEach(t=>counts[t]!++);
        const keep=(t:Tile)=>counts[t]!*3+(t<27?([1,-1].reduce((n,d)=>n+(t+d>=0&&t+d<27&&Math.floor((t+d)/9)===Math.floor(t/9)?counts[t+d]!*1.1:0),0)):(t>=31||t===27+o.roundWind||t===27+wind?.7:0));
        const discards=[...new Set(drawn)].sort((a,b)=>keep(a)-keep(b)||a-b);let next=hand,nextShanten=current.shanten,discarded=tile;
        for(const discard of discards){const proposed=[...drawn];proposed.splice(proposed.indexOf(discard),1);const a=analyze(proposed);if(a.shanten<nextShanten){next=proposed;nextShanten=a.shanten;discarded=discard;if(nextShanten<current.shanten)break}}
        publicTiles[discarded]!++;hand=next;bestShanten=Math.min(bestShanten,nextShanten);
      }
      if(bestShanten<initial)acc.improved++;
    }
    if((trial+1)%4===0){work.progress?.(trial+1,options.samples);await work.yield();work.check();}
  }
  report.candidates.forEach((c,i)=>{if(c.forecast)return;const a=accumulators[i]!,samples=horizons[i]!>0?options.samples:0;c.forecast={method:'sampling',samples,wins:a.wins,probability:samples?a.wins/samples:0,interval:wilson(a.wins,samples),horizon:horizons[i]!,improved:a.improved,improvementProbability:samples?a.improved/samples:0,fans:[...a.fans.values()].map(f=>({...f,probability:samples?f.hits/samples:0})).sort((a,b)=>b.hits-a.hits||b.fan-a.fan).slice(0,4)}});
  return {...report,stage:'完成',elapsedMs:performance.now()-started};
}
