// Frozen built-in policy before the 2026-11-07 strength comparison. Do not tune this baseline.
import { seat, type Action, type Meld, type Observation, type Scorer, type Tile } from '../rules/types';
export interface Candidate { action: Action; value: number; shanten: number; ukeire: number; legalWaits: number; risk: number }
export interface Decision { action: Action; candidates: Candidate[]; explanation: string; elapsedMs: number }
const without = (hand: Tile[], tile: Tile): Tile[] => { const next = [...hand]; next.splice(next.indexOf(tile), 1); return next; };
/** Exact shanten for all MCR hand forms, live ukeire, score-gated waits, two-ply efficiency and public-information defense. */
export function decide(o: Observation, scorer: Scorer, depth = 2, candidateLimit = 8): Decision {
  const started = performance.now(), hu = o.legalActions.find(a => a.type === 'hu');
  if (hu) return { action: hu, candidates: [], explanation: '满足 8 番，立即和牌', elapsedMs: performance.now() - started };
  const mine = o.players[o.seat]!, melds = mine.melds as Meld[];
  const visible = Array(34).fill(0) as number[];
  for (const t of o.hand) visible[t]!++;
  for (const p of o.players) { for (const t of p.river) visible[t]!++; for (const m of p.melds) for (const t of m.tiles) if (t !== null) visible[t]!++; }
  const available = (t: Tile) => Math.max(0, 4 - visible[t]!);
  const cache = new Map<string, ReturnType<Scorer['analyze']>>();
  const analyze = (h: Tile[]) => { const key = h.join(','); let a = cache.get(key); if (!a) { a = scorer.analyze(h); cache.set(key, a); } return a; };
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
      danger *= (4 - Math.min(4, visible[tile]!)) / 4;
      if (p.river.includes(tile)) danger *= .55;
      const openSuits = p.melds.flatMap(m => m.tiles).filter((t): t is number => t !== null && t < 27).map(t => Math.floor(t / 9));
      if (openSuits.length && new Set(openSuits).size === 1 && (tile >= 27 || Math.floor(tile / 9) === openSuits[0])) danger *= 1.6;
      total += danger * pressure;
    });
    return total;
  }
  function metric(hand: Tile[], sets: Meld[], action: Action): Candidate {
    const a = analyze(hand), live = a.effective.filter(t => available(t) > 0);
    let ukeire = live.reduce((n, t) => n + available(t), 0), legalWaits = 0;
    if (a.shanten === 0) {
      ukeire = 0;
      for (const t of live) {
        const self = scorer.score(hand, sets, t, 0, 1, o.roundWind, seat(o.seat - o.dealer));
        const ron = scorer.score(hand, sets, t, 0, 0, o.roundWind, seat(o.seat - o.dealer));
        if (self && self.fan >= 8) { ukeire += available(t) * (ron && ron.fan >= 8 ? 1.5 : 1); legalWaits++; }
      }
    }
    const danger = action.type === 'discard' ? risk(action.tile!) : 0;
    const deadWait = a.shanten === 0 && legalWaits === 0;
    const value = -a.shanten * 24 + Math.log1p(ukeire) * 4 + potential(hand, sets) * 1.6 - danger * (a.shanten >= 2 ? 5 : 2) - (deadWait ? 30 : 0);
    return { action, value, shanten: a.shanten, ukeire, legalWaits, risk: danger };
  }
  const discards = (hand: Tile[], sets: Meld[]) => [...new Set(hand)].map(tile => metric(without(hand, tile), sets, { type: 'discard', tile })).sort((a, b) => b.value - a.value || a.action.tile! - b.action.tile!);
  let candidates: Candidate[];
  if (o.phase === 'turn') {
    candidates = discards(o.hand, melds);
    if (depth >= 2) for (const c of candidates.slice(0, 3)) {
      const hand = without(o.hand, c.action.tile!), a = analyze(hand);
      if (a.shanten <= 0) continue;
      let future = 0, weight = 0;
      for (const t of a.effective) {
        const n = available(t); if (!n) continue;
        const drawn = [...hand, t].sort((x, y) => x - y), best = discards(drawn, melds)[0]!;
        future += n * (best.value - c.value); weight += n;
      }
      if (weight) c.value += future / weight * .18;
    }
    for (const a of o.legalActions.filter(a => a.type === 'concealed-kong' || a.type === 'add-kong')) {
      const h = [...o.hand], sets = structuredClone(melds);
      const n = a.type === 'concealed-kong' ? 4 : 1; for (let i = 0; i < n; i++) h.splice(h.indexOf(a.tile!), 1);
      if (n === 4) sets.push({ kind: 'kong', tiles: Array(4).fill(a.tile!), from: o.seat, concealed: true, promoted: false });
      else { const m = sets.find(m => m.kind === 'pung' && m.tiles[0] === a.tile)!; m.kind = 'kong'; m.tiles.push(a.tile!); m.promoted = true; }
      const c = metric(h, sets, a); c.value += 2; candidates.push(c);
    }
  } else {
    const pass = metric(o.hand, melds, { type: 'pass' }); candidates = [pass];
    for (const a of o.legalActions.filter(a => ['chow', 'pung', 'kong'].includes(a.type))) {
      const h = [...o.hand], tiles = a.tiles ?? Array(a.type === 'kong' ? 4 : 3).fill(a.tile!) as Tile[];
      const need = without(tiles, a.tile!); for (const t of need) h.splice(h.indexOf(t), 1);
      const sets: Meld[] = [...melds, { kind: a.type as Meld['kind'], tiles, from: o.last!.seat, concealed: false, promoted: false }];
      const c = a.type === 'kong' ? metric(h, sets, a) : { ...discards(h, sets)[0]!, action: a };
      c.value -= melds.every(m => m.concealed) ? 2.8 : .4;
      if (c.shanten === 0 && c.legalWaits === 0) c.value -= 12;
      candidates.push(c);
    }
  }
  candidates.sort((a, b) => b.value - a.value || (a.action.tile ?? -1) - (b.action.tile ?? -1));
  const best = candidates[0];
  if (!best) throw new Error('No legal decision available');
  return { action: best.action, candidates: candidates.slice(0, Math.max(1, Math.min(128, candidateLimit))), explanation: `${best.shanten === 0 ? '听牌' : best.shanten + ' 向听'} · 有效进张 ${Math.round(best.ukeire)} · ${best.legalWaits ? '满足起胡' : '兼顾番型与安全'}`, elapsedMs: performance.now() - started };
}
