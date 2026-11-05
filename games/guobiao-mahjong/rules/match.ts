import { actionKey, seat, TILE_NAMES, type Action, type Match, type Observation, type Scorer, type Seat, type Tile, type Win } from './types';

function log(s: Match, type: string, who: Seat, text: string, tile?: Tile, tiles?: Tile[]): void {
  s.events.push({ index: s.events.length, hand: s.handIndex, type, seat: who, text, ...(tile === undefined ? {} : { tile }), ...(tiles ? { tiles: [...tiles] } : {}) });
}
function random(s: Match): number { let x = s.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rng = x >>> 0; return s.rng / 4294967296; }
function remove(hand: Tile[], t: Tile): void { const i = hand.indexOf(t); if (i < 0) throw new Error('Tile is absent'); hand.splice(i, 1); }
export function remaining(s: Match): number { return Math.max(0, s.tail - s.head + 1); }
function draw(s: Match, who: Seat, back = false, kong = false): void {
  const p = s.players[who]!; s.turn = who; s.phase = 'turn'; s.drawn = null; s.replacement = kong;
  while (remaining(s)) {
    const t = s.wall[back ? s.tail-- : s.head++]!;
    if (t >= 34) { p.flowers.push(t); log(s, 'flower', who, `补花 ${TILE_NAMES[t]}`, t); back = true; s.replacement = false; continue; }
    p.hand.push(t); p.hand.sort((a, b) => a - b); s.drawn = t;
    log(s, 'draw', who, '摸牌'); return;
  }
  finish(s, null, null, null, false);
}
function startHand(s: Match): void {
  s.dealer = seat(s.handIndex % 4); s.turn = s.dealer; s.head = 0; s.tail = 143;
  s.last = null; s.responses = {}; s.drawn = null; s.replacement = false;
  s.wall = Array.from({ length: 144 }, (_, i) => i < 136 ? Math.floor(i / 4) : i - 102);
  for (let i = s.wall.length - 1; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [s.wall[i], s.wall[j]] = [s.wall[j]!, s.wall[i]!]; }
  s.players.forEach(p => { p.hand = []; p.melds = []; p.flowers = []; p.river = []; });
  log(s, 'start', s.dealer, `第 ${s.handIndex + 1} 局开始`);
  for (let n = 0; n < 13; n++) for (let k = 0; k < 4; k++) draw(s, seat(s.dealer + k));
  draw(s, s.dealer);
}
export function createMatch(seedValue = 20261105, names = ['玩家', '青竹 AI', '白露 AI', '玄玉 AI']): Match {
  const seed = seedValue >>> 0;
  const s: Match = { seed, rng: seed || 0x9e3779b9, revision: 0, handIndex: 0, dealer: 0, turn: 0, phase: 'turn', wall: [], head: 0, tail: -1,
    players: Array.from({ length: 4 }, (_, i) => ({ name: names[i] ?? `AI ${i + 1}`, hand: [], melds: [], flowers: [], river: [], score: 0, fan: 0, wins: 0 })),
    drawn: null, replacement: false, last: null, responses: {}, events: [], results: [], actions: [] };
  startHand(s); return s;
}
export function nextHand(s: Match): void {
  if (s.phase !== 'hand-over') throw new Error('The hand is not finished');
  s.handIndex++; s.revision++; startHand(s);
}
export function publicCopies(s: Match, tile: Tile): number {
  return s.players.reduce((n, p) => n + p.river.filter(t => t === tile).length + p.melds.filter(m => !m.concealed).reduce((a, m) => a + m.tiles.filter(t => t === tile).length, 0), 0);
}
export function evaluateWin(s: Match, who: Seat, scorer: Scorer): Win | null {
  const selfDrawn = s.phase === 'turn'; const p = s.players[who]!;
  const winTile = selfDrawn ? s.drawn : s.last?.tile;
  if (winTile === null || winTile === undefined || selfDrawn && s.turn !== who) return null;
  const hand = [...p.hand]; if (selfDrawn) remove(hand, winTile);
  const visible = publicCopies(s, winTile) - (!selfDrawn && !s.last?.robKong ? 1 : 0);
  const initial = selfDrawn && s.turn === s.dealer && s.players.every(p => !p.river.length && !p.melds.length);
  const flags = +selfDrawn | (visible === 3 ? 2 : 0) | ((selfDrawn ? s.replacement : s.last?.robKong) ? 4 : 0) | (remaining(s) === 0 ? 8 : 0) | (initial ? 16 : 0);
  const result = scorer.score(hand, p.melds, winTile, p.flowers.length, flags, Math.floor(s.handIndex / 4), seat(who - s.dealer));
  return result && result.fan >= 8 ? result : null;
}
export function legalActions(s: Match, who: Seat, scorer: Scorer): Action[] {
  if (s.phase === 'hand-over' || s.phase === 'match-over') return [];
  const p = s.players[who]!; const count = (t: Tile) => p.hand.filter(v => v === t).length;
  if (s.phase === 'turn') {
    if (s.turn !== who) return [];
    const actions: Action[] = [...new Set(p.hand)].map(tile => ({ type: 'discard', tile }));
    if (evaluateWin(s, who, scorer)) actions.unshift({ type: 'hu' });
    if (remaining(s) && s.drawn !== null) {
      for (const t of new Set(p.hand)) if (count(t) === 4) actions.push({ type: 'concealed-kong', tile: t });
      for (const m of p.melds) if (m.kind === 'pung' && count(m.tiles[0]!) > 0) actions.push({ type: 'add-kong', tile: m.tiles[0]! });
    }
    return actions;
  }
  if (!s.last || who === s.last.seat || s.responses[who]) return [];
  const t = s.last.tile, actions: Action[] = [{ type: 'pass' }];
  if (evaluateWin(s, who, scorer)) actions.push({ type: 'hu' });
  if (s.last.robKong || remaining(s) === 0) return actions;
  if (count(t) >= 2) actions.push({ type: 'pung', tile: t });
  if (count(t) >= 3) actions.push({ type: 'kong', tile: t });
  if (who === seat(s.last.seat + 1) && t < 27) {
    for (let start = t - 2; start <= t; start++) {
      if (start < 0 || Math.floor(start / 9) !== Math.floor(t / 9) || start % 9 > 6) continue;
      const tiles = [start, start + 1, start + 2], need = tiles.filter(v => v !== t);
      if (need.every(v => count(v))) actions.push({ type: 'chow', tile: t, tiles });
    }
  }
  return actions;
}
function finish(s: Match, winner: Seat | null, from: Seat | null, win: Win | null, selfDrawn: boolean): void {
  const deltas = [0, 0, 0, 0];
  if (winner !== null && win) {
    if (!selfDrawn && s.last) {
      if (!s.last.robKong) s.players[s.last.seat]!.river.pop();
      s.players[winner]!.hand.push(s.last.tile); s.players[winner]!.hand.sort((a, b) => a - b);
    }
    for (let i = 0; i < 4; i++) if (i !== winner) { const pay = 8 + (selfDrawn || i === from ? win.total : 0); deltas[i] = -pay; deltas[winner]! += pay; }
    s.players[winner]!.fan += win.total; s.players[winner]!.wins++;
    log(s, 'hu', winner, `${selfDrawn ? '自摸' : '和牌'} ${win.fan} 番 + ${win.flowers} 花`);
  } else log(s, 'drawn-hand', s.turn, '流局');
  s.players.forEach((p, i) => { p.score += deltas[i]!; });
  s.results.push({ hand: s.handIndex, winner, from, selfDrawn, win, deltas,
    hands: s.players.map(p => [...p.hand]),
    melds: structuredClone(s.players.map(p => p.melds)) });
  s.phase = s.handIndex === 15 ? 'match-over' : 'hand-over';
}
function resolveResponses(s: Match, scorer: Scorer): void {
  const last = s.last!;
  const order = [1, 2, 3].map(n => seat(last.seat + n));
  const winner = order.find(i => s.responses[i]?.type === 'hu');
  if (winner !== undefined) {
    const win = evaluateWin(s, winner, scorer)!;
    if (last.robKong) remove(s.players[last.seat]!.hand, last.tile);
    finish(s, winner, last.seat, win, false); return;
  }
  if (last.robKong) {
    const p = s.players[last.seat]!, meld = p.melds.find(m => m.kind === 'pung' && m.tiles[0] === last.tile)!;
    remove(p.hand, last.tile); meld.kind = 'kong'; meld.tiles.push(last.tile); meld.promoted = true;
    log(s, 'add-kong', last.seat, `加杠 ${TILE_NAMES[last.tile]}`, last.tile); s.last = null;
    draw(s, last.seat, true, true); return;
  }
  const claimant = order.find(i => ['pung', 'kong'].includes(s.responses[i]?.type ?? '')) ?? order.find(i => s.responses[i]?.type === 'chow');
  if (claimant === undefined) { s.last = null; draw(s, seat(last.seat + 1)); return; }
  const action = s.responses[claimant]!, p = s.players[claimant]!;
  const tiles = action.type === 'chow' ? action.tiles! : Array(action.type === 'kong' ? 4 : 3).fill(last.tile) as Tile[];
  const need = [...tiles]; remove(need, last.tile); need.forEach(t => remove(p.hand, t));
  s.players[last.seat]!.river.pop();
  p.melds.push({ kind: action.type as 'chow' | 'pung' | 'kong', tiles: [...tiles], from: last.seat, concealed: false, promoted: false });
  log(s, action.type, claimant, `${action.type === 'chow' ? '吃' : action.type === 'pung' ? '碰' : '明杠'} ${TILE_NAMES[last.tile]}`, last.tile, tiles);
  s.turn = claimant; s.drawn = null; s.replacement = false; s.last = null; s.phase = 'turn';
  if (action.type === 'kong') draw(s, claimant, true, true);
}
/** Validates before mutation, including stale decisions and exact chow composition. */
export function applyAction(s: Match, who: Seat, action: Action, scorer: Scorer, revision = s.revision): void {
  if (revision !== s.revision) throw new Error('Stale decision revision');
  if (!legalActions(s, who, scorer).some(a => actionKey(a) === actionKey(action))) throw new Error('Illegal action');
  s.actions.push({ hand: s.handIndex, seat: who, action: structuredClone(action), revision });
  if (s.phase === 'response') {
    s.responses[who] = structuredClone(action); s.revision++;
    if ([0, 1, 2, 3].every(i => i === s.last!.seat || s.responses[i as Seat])) resolveResponses(s, scorer);
    return;
  }
  const p = s.players[who]!;
  if (action.type === 'hu') { finish(s, who, null, evaluateWin(s, who, scorer), true); }
  else if (action.type === 'discard') {
    remove(p.hand, action.tile!); p.river.push(action.tile!);
    log(s, 'discard', who, `打出 ${TILE_NAMES[action.tile!]}`, action.tile);
    s.last = { seat: who, tile: action.tile!, robKong: false }; s.responses = {}; s.phase = 'response'; s.drawn = null;
  } else if (action.type === 'concealed-kong') {
    for (let i = 0; i < 4; i++) remove(p.hand, action.tile!);
    p.melds.push({ kind: 'kong', tiles: Array(4).fill(action.tile!), from: who, concealed: true, promoted: false });
    log(s, 'concealed-kong', who, '暗杠'); draw(s, who, true, true);
  } else if (action.type === 'add-kong') {
    s.last = { seat: who, tile: action.tile!, robKong: true }; s.responses = {}; s.phase = 'response'; s.drawn = null;
    log(s, 'kong-offer', who, `申请加杠 ${TILE_NAMES[action.tile!]}`, action.tile);
  }
  s.revision++;
}
/** The only data supplied to agents: no wall order, opponents' hands or response choices. */
export function observe(s: Match, who: Seat, scorer: Scorer): Observation {
  return structuredClone({ protocol: 'haiyue.mcr/1' as const, revision: s.revision, seat: who, handIndex: s.handIndex,
    roundWind: Math.floor(s.handIndex / 4), dealer: s.dealer, turn: s.turn, phase: s.phase, wallRemaining: remaining(s),
    hand: s.players[who]!.hand, drawn: s.turn === who && s.phase === 'turn' ? s.drawn : null, replacement: s.replacement,
    players: s.players.map((p, i) => ({ name: p.name, handCount: p.hand.length, flowers: p.flowers, river: p.river, score: p.score, fan: p.fan, wins: p.wins,
      melds: p.melds.map(m => ({ ...m, tiles: m.concealed && i !== who ? m.tiles.map(() => null) : m.tiles })) })),
    last: s.last, legalActions: legalActions(s, who, scorer), events: s.events.filter(e => e.hand === s.handIndex), results: s.results });
}
