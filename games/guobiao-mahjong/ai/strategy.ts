import { seat, type Action, type Meld, type Observation, type Scorer, type Tile } from '../rules/types';
import {formedFans} from '../rules/handAnalysis';
import {handAnalysisCache} from './analysisCache';
import {lastTileAlternative} from './lastTileDefense';
import {eightFanReachability,kongReplacement,robKongHazard,type FanReachability,type ReplacementValue,fanRouteAdjustment,fanRoutePrior} from './tactics';
export interface Candidate { action: Action; value: number; shanten: number; ukeire: number; legalWaits: number; risk: number;followUpDiscard?:Tile;fanReachability?:FanReachability;kong?:ReplacementValue;robKong?:ReturnType<typeof robKongHazard> }
export interface Decision { action: Action; candidates: Candidate[]; explanation: string; elapsedMs: number }
const without = (hand: Tile[], tile: Tile): Tile[] => { const next = [...hand]; next.splice(next.indexOf(tile), 1); return next; };
export interface TacticOptions {replacement:boolean;robKong:boolean;fanRoute:boolean}
export const DEFAULT_TACTICS:Readonly<TacticOptions>=Object.freeze({replacement:true,robKong:true,fanRoute:true});
/** Offline ablations change exactly one component; the ordinary game uses all three. */
export function decideWithTactics(o:Observation,scorer:Scorer,options:TacticOptions,depth=2,candidateLimit=8){if(Object.keys(options).length!==3||!['replacement','robKong','fanRoute'].every(k=>typeof options[k as keyof TacticOptions]==='boolean'))throw Error('Invalid tactics');return decidePolicy(o,scorer,depth,candidateLimit,false,options);}
/** Exact shanten for all MCR hand forms, live ukeire, score-gated waits, two-ply efficiency and public-information defense. */
export function decide(o: Observation, scorer: Scorer, depth = 2, candidateLimit = 8): Decision {return decidePolicy(o,scorer,depth,candidateLimit,false);}
/** Research candidate only: its fan-route and lookahead weights need independent strength evidence. */
export function decideExperimental(o: Observation, scorer: Scorer, depth = 2, candidateLimit = 8): Decision {return decidePolicy(o,scorer,depth,candidateLimit,true);}
function decidePolicy(o:Observation,scorer:Scorer,depth:number,candidateLimit:number,experimental:boolean,tactics:Readonly<TacticOptions>=DEFAULT_TACTICS):Decision {
  const started = performance.now(), hu = o.legalActions.find(a => a.type === 'hu');
  if (hu) return { action: hu, candidates: [], explanation: '满足 8 番，立即和牌', elapsedMs: performance.now() - started };
  const mine = o.players[o.seat]!, melds = mine.melds as Meld[];
  const visible = Array(34).fill(0) as number[];
  for (const t of o.hand) visible[t]!++;
  for (const p of o.players) { for (const t of p.river) visible[t]!++; for (const m of p.melds) for (const t of m.tiles) if (t !== null) visible[t]!++; }
  const available = (t: Tile, drawn:Tile|null=null) => Math.max(0, 4 - visible[t]! - +(drawn===t));
  const publicVisible=Array<number>(34).fill(0);
  for(const p of o.players){for(const t of p.river)publicVisible[t]!++;for(const m of p.melds)if(!m.concealed)for(const t of m.tiles)if(t!==null)publicVisible[t]!++;}
  function flags(tile:Tile,self:boolean,sets:Meld[],discards:Tile[],kong=false){
    let exposed=publicVisible[tile]!;
    for(const m of melds)if(!m.concealed)exposed-=m.tiles.filter(t=>t===tile).length;
    for(const m of sets)if(!m.concealed)exposed+=m.tiles.filter(t=>t===tile).length;
    if(o.phase==='response'&&sets.length>melds.length&&o.last?.tile===tile)exposed--;
    exposed+=discards.filter(t=>t===tile).length;
    return +self|(exposed===3?2:0)|(kong&&self?4:0);
  }
  const shared=handAnalysisCache(scorer),cache = new Map<string, ReturnType<Scorer['analyze']>>();
  const analyze = (h: Tile[]) => { const key = h.join(','); let a = cache.get(key); if (!a) { a = shared.analyze(h); cache.set(key, a); } return a; };
  function potential(hand: Tile[], sets: Meld[]): number {
    const tiles = [...hand, ...sets.flatMap(m => m.tiles)], suits = [0, 0, 0], counts = Array(34).fill(0) as number[];
    let honors = 0;
    for (const t of tiles) { counts[t]!++; if (t < 27) suits[Math.floor(t / 9)]!++; else honors++; }
    const maxSuit = Math.max(...suits), groups = counts.filter(n => n >= 2).length;
    let p = Math.max(0, maxSuit + honors - 8) * .55 + groups * .18;
    for (const t of [31, 32, 33, 27 + o.roundWind, 27 + seat(o.seat - o.dealer)]) p += Math.max(0, counts[t]! - 1) * .55;
    for (let rank = 0; rank < 7; rank++) {
      let mixed = 0;
      for (let suit = 0; suit < 3; suit++) for (let d = 0; d < 3; d++) mixed += Math.min(1, counts[suit * 9 + rank + d]!);
      p = Math.max(p, mixed * .35);
    }
    for (let suit = 0; suit < 3; suit++) p = Math.max(p, counts.slice(suit * 9, suit * 9 + 9).filter(Boolean).length * .4);
    if (sets.every(m => m.concealed)) p += 1.1;
    return p;
  }
  function risk(tile: Tile): number {
    let total = 0;
    o.players.forEach((p, i) => {
      if (i === o.seat) return;
      const pressure = Math.max(0, p.melds.filter(m => !m.concealed).length - 1) * .75 + Math.max(0, p.river.length - 8) * .08;
      if (!pressure) return;
      // Discarded tiles are a soft signal only: MCR has no riichi-style furiten.
      let danger = tile >= 27 ? .45 : tile % 9 === 0 || tile % 9 === 8 ? .7 : 1;
      const unseen=available(tile);
      // Keep the original weights by default; fix only the zero-copy sequence oversight.
      let sequences=0,capacity=experimental?(unseen>=2?.75:unseen===1?.35:.08):unseen/4;
      if(tile<27&&(experimental||unseen===0))for(let start=Math.max(0,tile%9-2);start<=Math.min(6,tile%9);start++){
        const others=[0,1,2].map(d=>Math.floor(tile/9)*9+start+d).filter(t=>t!==tile);
        if(others.every(t=>available(t)>0)){sequences++;if(experimental)capacity+=.22;}
      }
      if(experimental)capacity=Math.min(1.2,capacity);else if(!capacity&&sequences)capacity=.25;
      danger *= capacity;
      if (p.river.includes(tile)) danger *= .55;
      const openSuits = p.melds.flatMap(m => m.tiles).filter((t): t is number => t !== null && t < 27).map(t => Math.floor(t / 9));
      if (openSuits.length && new Set(openSuits).size === 1 && (tile >= 27 || Math.floor(tile / 9) === openSuits[0])) danger *= 1.6;
      total += danger * pressure;
    });
    return total;
  }
  function metric(hand: Tile[], sets: Meld[], action: Action,discards:Tile[]=[],drawn:Tile|null=null): Candidate {
    const a = analyze(hand), live = a.effective.filter(t => available(t,drawn) > 0);
    let ukeire = live.reduce((n, t) => n + available(t,drawn), 0), legalWaits = 0,fanValue=0;
    if (a.shanten === 0) {
      ukeire = 0;
      for (const t of live) {
        const self = scorer.score(hand, sets, t, 0, flags(t,true,sets,discards,action.type.includes('kong')), o.roundWind, seat(o.seat - o.dealer));
        const ron = scorer.score(hand, sets, t, 0, flags(t,false,sets,discards), o.roundWind, seat(o.seat - o.dealer));
        const canSelf=!!self&&self.fan>=8,canRon=!!ron&&ron.fan>=8;
        if(canSelf||canRon){const weight=available(t,drawn)*(+canSelf+.5*+canRon);ukeire+=weight;fanValue+=weight*Math.max(canSelf?self!.fan:0,canRon?ron!.fan:0);legalWaits++;}
      }
    }
    const danger = action.type === 'discard' ? risk(action.tile!) : 0;
    const deadWait = a.shanten === 0 && legalWaits === 0;
    // Reference structure helps preserve a route to eight fan; it is never used as official scoring.
    const reference=experimental&&drawn===null?formedFans(hand,sets,o.roundWind,seat(o.seat-o.dealer),scorer.catalog).reduce((n,f)=>n+f.value*f.count,0):0;
    const fanBonus=experimental&&ukeire&&a.shanten===0?Math.log1p(fanValue/ukeire/8)*.7:0;
    const value = -a.shanten * 24 + Math.log1p(ukeire) * 4 + potential(hand, sets) * 1.6 - danger * (a.shanten >= 2 ? 5 : 2) - (deadWait ? 30 : 0)+Math.min(8,reference)*.35+(reference>=8?1:0)+fanBonus;
    return { action, value, shanten: a.shanten, ukeire, legalWaits, risk: danger };
  }
  const discards = (hand: Tile[], sets: Meld[],previous:Tile[]=[],drawn:Tile|null=null) => [...new Set(hand)].map(tile => metric(without(hand, tile), sets, { type: 'discard', tile },[...previous,tile],drawn)).sort((a, b) => b.value - a.value || a.action.tile! - b.action.tile!);
  let candidates: Candidate[];
  if (o.phase === 'turn') {
    candidates = discards(o.hand, melds);
    if (depth >= 2) for (const c of candidates.slice(0, 3)) {
      const hand = without(o.hand, c.action.tile!), a = analyze(hand);
      if (a.shanten <= 0) continue;
      let future = 0, weight = 0;
      for (const t of a.effective) {
        const n = available(t); if (!n) continue;
        const drawn = [...hand, t].sort((x, y) => x - y), best = discards(drawn, melds,[c.action.tile!],t)[0]!;
        future += n * (best.value - c.value); weight += n;
      }
      const pool=visible.reduce((n,count)=>n+4-count,0);
      if (weight&&pool) c.value += experimental?future / pool * .75:future / weight * .18;
    }
    for (const a of o.legalActions.filter(a => a.type === 'concealed-kong' || a.type === 'add-kong')) {
      const h = [...o.hand], sets = structuredClone(melds);
      const n = a.type === 'concealed-kong' ? 4 : 1; for (let i = 0; i < n; i++) h.splice(h.indexOf(a.tile!), 1);
      if (n === 4) sets.push({ kind: 'kong', tiles: Array(4).fill(a.tile!), from: o.seat, concealed: true, promoted: false });
      else { const m = sets.find(m => m.kind === 'pung' && m.tiles[0] === a.tile)!; m.kind = 'kong'; m.tiles.push(a.tile!); m.promoted = true; }
      const c = metric(h, sets, a);
      if(experimental)c.value+=2;
      else{if(tactics.replacement){c.kong=kongReplacement(o,h,sets,scorer,(t,self,river,kong)=>flags(t,self,sets,river,kong),(hand,drawn)=>discards(hand,sets,[],drawn)[0]!);c.value=c.kong.value;}else c.value+=2;if(tactics.robKong&&a.type==='add-kong'){c.robKong=robKongHazard(o,a.tile!);c.risk=c.robKong.probability;c.value-=c.robKong.penalty;}}
      candidates.push(c);
    }
  } else {
    const pass = metric(o.hand, melds, { type: 'pass' }); candidates = [pass];
    for (const a of o.legalActions.filter(a => ['chow', 'pung', 'kong'].includes(a.type))) {
      const h = [...o.hand], tiles = a.tiles ?? Array(a.type === 'kong' ? 4 : 3).fill(a.tile!) as Tile[];
      const need = without(tiles, a.tile!); for (const t of need) h.splice(h.indexOf(t), 1);
      const sets: Meld[] = [...melds, { kind: a.type as Meld['kind'], tiles, from: o.last!.seat, concealed: false, promoted: false }];
      const best=a.type==='kong'?null:discards(h,sets)[0]!,c:Candidate=a.type==='kong'?metric(h,sets,a):{...best!,action:a,followUpDiscard:best!.action.tile!};
      if(!experimental&&tactics.replacement&&a.type==='kong'){c.kong=kongReplacement(o,h,sets,scorer,(t,self,river,kong)=>flags(t,self,sets,river,kong),(hand,drawn)=>discards(hand,sets,[],drawn)[0]!);c.value=c.kong.value;}
      c.value -= melds.every(m => m.concealed) ? 2.8 : .4;
      if (c.shanten === 0 && c.legalWaits === 0) c.value -= 12;
      candidates.push(c);
    }
  }
  candidates.sort((a, b) => b.value - a.value || (a.action.tile ?? -1) - (b.action.tile ?? -1));
  if(!experimental&&tactics.fanRoute&&o.wallRemaining>0){
    const eligible=(c:Candidate)=>c.shanten>=1&&c.shanten<=Math.min(depth,2)&&!['kong','concealed-kong','add-kong'].includes(c.action.type);
    // Apply the same reference prior before pruning; budget state never changes it.
    for(const c of candidates)if(eligible(c))c.value+=fanRoutePrior(c.shanten);
    candidates.sort((a,b)=>b.value-a.value||(a.action.tile??-1)-(b.action.tile??-1));
    const review=(c:Candidate)=>{
      let hand=[...o.hand],sets=melds;
      if(c.action.type==='discard')hand=without(hand,c.action.tile!);
      else if(c.action.type==='chow'||c.action.type==='pung'){const tiles=c.action.tiles??Array<Tile>(3).fill(c.action.tile!),need=without(tiles,c.action.tile!);need.forEach(t=>hand=without(hand,t));sets=[...melds,{kind:c.action.type,tiles,from:o.last!.seat,concealed:false,promoted:false}];hand=without(hand,c.followUpDiscard!);}
      const river=c.action.type==='discard'?[c.action.tile!]:c.followUpDiscard===undefined?[]:[c.followUpDiscard];
      c.fanReachability=eightFanReachability(o,hand,sets,scorer,(t,self,discards)=>flags(t,self,sets,discards),river,Math.min(depth,2));
      c.value+=fanRouteAdjustment(c.fanReachability,c.shanten);
    };
    for(const c of candidates.filter(eligible).slice(0,3))review(c);
    candidates.sort((a,b)=>b.value-a.value||(a.action.tile??-1)-(b.action.tile??-1));
    // Positive-only route bonuses make this final review bounded to one extra candidate.
    const top=candidates[0];if(top&&eligible(top)&&!top.fanReachability)review(top);
  }
  const safe = !experimental && candidates[0] ? lastTileAlternative(o, candidates[0].action, candidates.map(c => c.action)) : null;
  if (safe) { const index = candidates.findIndex(c => c.action.type === 'discard' && c.action.tile === safe.tile); candidates.unshift(...candidates.splice(index, 1)); }
  const best = candidates[0];
  if (!best) throw new Error('No legal decision available');
  return { action: best.action, candidates: candidates.slice(0, Math.max(1, Math.min(128, candidateLimit))), explanation: safe ? '末张防守 · 牌墙已空且不能胡牌，改打可确认不会放铳的牌' : best.kong?`杠后补牌参考 · 可胡补牌比例 ${Math.round(best.kong.winProbability*100)}%${best.robKong?.possible?' · 已计入抢杠风险':''}`:`${best.shanten === 0 ? '听牌' : best.shanten + ' 向听'} · 有效进张 ${Math.round(best.ukeire)} · ${best.fanReachability?'八番路径参考 '+Math.round(best.fanReachability.support*100)+'%':best.legalWaits ? '满足起胡' : '兼顾番型与安全'}`, elapsedMs: performance.now() - started };
}
