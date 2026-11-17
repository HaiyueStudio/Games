import { seat, type Fan, type Meld, type Observation, type Scorer, type Tile, type Win } from './types';
export interface HandAnalysis {
  revision: number; seat: number; kind: 'forming' | 'waiting' | 'complete'; fan: number; flowers: number;
  items: Fan[]; minFan: number; maxFan: number; discard: Tile | null; waits: Array<{ tile: Tile; fan: number }>;
}
/** Incomplete hands have no official score. This preview counts recognized existing features only. */
export function formedFans(hand: readonly Tile[], melds: readonly Meld[], round: number, wind: number, catalog: readonly Fan[]): Fan[] {
  const byName = new Map(catalog.map(f => [f.name, f]));
  const all = [...hand, ...melds.flatMap(m => m.tiles)], suit = new Set(all.filter(t => t < 27).map(t => Math.floor(t / 9)));
  if (!all.length) return [];
  const honors = all.some(t => t >= 27), terminal = (t: number) => t >= 27 || t % 9 === 0 || t % 9 === 8;
  const composition: string[] = [];
  const pureHonors = all.every(t => t >= 27), pureTerminals = all.every(t => t < 27 && terminal(t)), mixedTerminals = all.every(terminal);
  if (pureHonors) composition.push('字一色'); else if (pureTerminals) composition.push('清幺九'); else if (mixedTerminals) composition.push('混幺九');
  if (all.every(t => [10, 11, 12, 14, 16, 32].includes(t))) composition.push('绿一色');
  if (suit.size === 1) { if (!honors) composition.push('清一色'); else if (!composition.includes('绿一色')) composition.push('混一色'); }
  if (!honors) {
    const ranks = all.map(t => t % 9 + 1);
    if (ranks.every(n => n >= 7)) composition.push('全大');
    else if (ranks.every(n => n >= 4 && n <= 6)) composition.push('全中');
    else if (ranks.every(n => n <= 3)) composition.push('全小');
    else if (ranks.every(n => n >= 6)) composition.push('大于五');
    else if (ranks.every(n => n <= 4)) composition.push('小于五');
    if (ranks.every(n => n > 1 && n < 9) && !composition.includes('全中')) composition.push('断幺');
    if (!composition.some(n => ['清一色', '清幺九', '全大', '全中', '全小', '大于五', '小于五'].includes(n))) composition.push('无字');
  }
  if (suit.size === 2) composition.push('缺一门');
  if (suit.size === 3 && all.some(t => t >= 27 && t <= 30) && all.some(t => t >= 31 && t <= 33)) composition.push('五门齐');
  function scoreGroups(groups: readonly Meld[]): Fan[] {
    const items = new Map<string, number>();
    const add = (name: string, count = 1) => { if (byName.has(name)) items.set(name, (items.get(name) ?? 0) + count); };
    composition.forEach(n => add(n));
    const pungs = groups.filter(m => m.kind !== 'chow'), chows = groups.filter(m => m.kind === 'chow');
    const windPungs = pungs.filter(m => m.tiles[0]! >= 27 && m.tiles[0]! <= 30), dragons = pungs.filter(m => m.tiles[0]! >= 31);
    const bigWinds = windPungs.length === 4, bigDragons = dragons.length === 3;
    if (bigWinds) add('大四喜'); else {
      if (windPungs.length === 3) add('三风刻');
      if (windPungs.some(m => m.tiles[0] === 27 + round)) add('圈风刻');
      if (windPungs.some(m => m.tiles[0] === 27 + wind)) add('门风刻');
    }
    if (bigDragons) add('大三元'); else if (dragons.length === 2) add('双箭刻'); else if (dragons.length) add('箭刻');
    const concealed = pungs.filter(m => m.concealed).length, kongs = pungs.filter(m => m.kind === 'kong');
    // A closed hand is a discard-win reference; self-draw and exclusions use the complete scorer.
    if (melds.every(m => m.concealed) && concealed < 4) add('门前清');
    if (concealed === 4) add('四暗刻'); else if (concealed === 3) add('三暗刻'); else if (concealed === 2) add('双暗刻');
    if (kongs.length === 4) add('四杠'); else if (kongs.length === 3) add('三杠'); else if (kongs.length === 2) add(kongs.every(m => m.concealed) ? '双暗杠' : kongs.every(m => !m.concealed) ? '双明杠' : '明暗杠');
    else if (kongs.length) add(kongs[0]!.concealed ? '暗杠' : '明杠');
    if (pungs.length === 4 && !bigWinds && concealed < 4 && kongs.length < 4 && !mixedTerminals) add('碰碰和');
    if (!mixedTerminals && !bigWinds && windPungs.length < 3) for (const m of pungs) {
      const t = m.tiles[0]!;
      if (t < 27 && terminal(t) || t >= 27 && t <= 30 && t !== 27 + round && t !== 27 + wind) add('幺九刻');
    }
    for (let rank = 0; rank < 9; rank++) {
      const n = pungs.filter(m => m.tiles[0]! < 27 && m.tiles[0]! % 9 === rank).length;
      if (n === 3) add('三同刻'); else if (n === 2) add('双同刻');
    }
    const usedChows = new Set<Meld>();
    for (let color = 0; color < 3; color++) {
      const sameSuit = chows.filter(m => Math.floor(m.tiles[0]! / 9) === color);
      if ([0, 3, 6].every(rank => sameSuit.some(m => m.tiles[0]! % 9 === rank))) { add('清龙'); sameSuit.forEach(m => usedChows.add(m)); }
      for (let rank = 0; rank < 7; rank++) {
        const same = sameSuit.filter(m => m.tiles[0]! % 9 === rank);
        if (same.length >= 3) { add(same.length === 4 ? '一色四同顺' : '一色三同顺'); same.forEach(m => usedChows.add(m)); }
      }
    }
    for (let rank = 0; rank < 7; rank++) {
      const sameRank = chows.filter(m => m.tiles[0]! % 9 === rank);
      if (new Set(sameRank.map(m => Math.floor(m.tiles[0]! / 9))).size === 3) { add('三色三同顺'); sameRank.forEach(m => usedChows.add(m)); }
    }
    // At most three partial chows remain; using two already-used sets again is excluded.
    const consumed = new Set<Meld>();
    for (let i = 0; i < chows.length; i++) for (let j = i + 1; j < chows.length; j++) {
      const a = chows[i]!, b = chows[j]!; if (usedChows.has(a) && usedChows.has(b) || consumed.has(a) && consumed.has(b)) continue;
      const x = a.tiles[0]!, y = b.tiles[0]!, sameSuit = Math.floor(x / 9) === Math.floor(y / 9);
      const name = x === y ? '一般高' : !sameSuit && x % 9 === y % 9 ? '喜相逢' : sameSuit && Math.abs(x - y) === 3 ? '连六' : sameSuit && Math.min(x, y) % 9 === 0 && Math.abs(x - y) === 6 ? '老少副' : null;
      if (name) { add(name); consumed.add(a); consumed.add(b); }
    }
    return [...items].map(([name, count]) => ({ ...byName.get(name)!, count }));
  }
  const counts = Array(34).fill(0) as number[]; hand.forEach(t => counts[t]!++);
  let best = scoreGroups(melds), bestScore = best.reduce((s, f) => s + f.value * f.count, 0);
  const groups = [...melds];
  function visit(start: number): void {
    while (start < 34 && counts[start] === 0) start++;
    if (start >= 34 || groups.length === 4) {
      const items = scoreGroups(groups), total = items.reduce((s, f) => s + f.value * f.count, 0);
      if (total > bestScore) { best = items; bestScore = total; } return;
    }
    if (counts[start]! >= 3) { counts[start]! -= 3; groups.push({ kind: 'pung', tiles: [start, start, start], from: 0, concealed: true, promoted: false }); visit(start); groups.pop(); counts[start]! += 3; }
    if (start < 27 && start % 9 <= 6 && counts[start + 1] && counts[start + 2]) {
      counts[start]!--; counts[start + 1]!--; counts[start + 2]!--; groups.push({ kind: 'chow', tiles: [start, start + 1, start + 2], from: 0, concealed: true, promoted: false }); visit(start); groups.pop(); counts[start]!++; counts[start + 1]!++; counts[start + 2]!++;
    }
    const saved = counts[start]!; counts[start] = 0; visit(start + 1); counts[start] = saved;
  }
  visit(0); return best.sort((a, b) => b.value * b.count - a.value * a.count || a.id - b.id);
}
export function analyzeHand(o: Observation, scorer: Scorer): HandAnalysis {
  const mine = o.players[o.seat]!, melds = mine.melds as Meld[], wind = seat(o.seat - o.dealer);
  const base = { revision: o.revision, seat: o.seat, flowers: mine.flowers.length, discard: null, waits: [] };
  const complete = (win: Win): HandAnalysis => ({ ...base, kind: 'complete', fan: win.fan, minFan: win.fan, maxFan: win.fan, items: win.items.filter(f => f.name !== '花牌') });
  const lastResult = o.results.at(-1);
  if (o.phase.endsWith('over') && lastResult?.hand === o.handIndex && lastResult.winner === o.seat && lastResult.win) return complete(lastResult.win);
  const self = o.phase === 'turn' && o.turn === o.seat, winningTile = self ? o.drawn : o.phase === 'response' && o.last?.seat !== o.seat ? o.last?.tile : null;
  if (winningTile !== null && winningTile !== undefined) {
    const hand = [...o.hand]; if (self) hand.splice(hand.lastIndexOf(winningTile), 1);
    const visible = o.players.reduce((s, p) => s + p.river.filter(t => t === winningTile).length + p.melds.filter(m => !m.concealed).flatMap(m => m.tiles).filter(t => t === winningTile).length, 0) - (!self && !o.last?.robKong ? 1 : 0);
    const initial = self && o.turn === o.dealer && o.players.every(p => !p.river.length && !p.melds.length);
    const flags = +self | (visible === 3 ? 2 : 0) | ((self ? o.replacement : o.last?.robKong) ? 4 : 0) | (o.wallRemaining === 0 ? 8 : 0) | (initial ? 16 : 0);
    const win = scorer.score(hand, melds, winningTile, mine.flowers.length, flags, o.roundWind, wind); if (win) return complete(win);
  }
  const alternatives: Array<{ hand: Tile[]; discard: Tile | null }> = o.hand.length % 3 === 1 ? [{ hand: o.hand, discard: null }] : [...new Set(o.hand)].map(discard => { const hand = [...o.hand]; hand.splice(hand.indexOf(discard), 1); return { hand, discard }; });
  const known = Array(34).fill(0) as number[];
  o.hand.forEach(t => known[t]!++); o.players.forEach(p => { p.river.forEach(t => known[t]!++); p.melds.forEach(m => m.tiles.forEach(t => { if (t !== null) known[t]!++; })); });
  const waiting: HandAnalysis[] = [];
  for (const a of alternatives) {
    if (scorer.analyze(a.hand).shanten !== 0) continue;
    const wins: Array<{ tile: Tile; win: Win }> = [];
    for (let tile = 0; tile < 34; tile++) if (known[tile]! < 4) { const win = scorer.score(a.hand, melds, tile, 0, 0, o.roundWind, wind); if (win) wins.push({ tile, win }); }
    if (!wins.length) continue;
    const minFan = Math.min(...wins.map(w => w.win.fan)), maxFan = Math.max(...wins.map(w => w.win.fan));
    const common = wins[0]!.win.items.map(f => ({ ...f, count: Math.min(...wins.map(w => w.win.items.find(g => g.id === f.id)?.count ?? 0)) })).filter(f => f.count > 0);
    waiting.push({ ...base, kind: 'waiting', fan: minFan, minFan, maxFan, items: common, discard: a.discard, waits: wins.map(w => ({ tile: w.tile, fan: w.win.fan })) });
  }
  if (waiting.length) return waiting.sort((a, b) => b.waits.length - a.waits.length || b.minFan - a.minFan)[0]!;
  const items = formedFans(o.hand, melds, o.roundWind, wind, scorer.catalog), fan = items.reduce((s, f) => s + f.count * f.value, 0);
  return { ...base, kind: 'forming', fan, minFan: fan, maxFan: fan, items };
}
