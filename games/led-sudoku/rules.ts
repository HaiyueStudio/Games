import { baseUnits, boardWidth, boardLength, staircaseGap } from './topology';
import { littleKillerLocations, littleKillerPath, validLittleKillers, type LittleKillerClue } from './little-killer';
import { nonConsecutiveSolution } from './non-consecutive';
import { regionsForSolution, symmetricRegions, validExtraRegions, regionLetter } from './extra-regions';
import { buildHintSteps, type HintStep } from './hint-explanation';
import { t, ruleCopy, type Language } from './i18n';
import { extraAllows, extraContext, optionConflict, visibleBuildings, type ExtraContext, type FourSum, type SkyClues, type XVClue } from './extra-rules';
/** Pure, seeded LED Sudoku model. Bits a..g: top, upper-right, lower-right,
 * bottom, lower-left, upper-left, middle. Unlit clue segments are UNKNOWN. */
export const SEGMENTS = [0, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f] as const;
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface Options { difficulty: Difficulty; /** Omitted only in legacy saves. */ led?: boolean; staircase?: boolean; diagonal: boolean; missing: boolean; killer: boolean; renban: boolean; consecutive: boolean; inequality?: boolean; multiDiagonal?: boolean; exclusion?: boolean; parity?: boolean; thermometer?: boolean; skyscraper?: boolean; xv?: boolean; quadruple?: boolean; extraRegion?: boolean; nonConsecutive?: boolean; littleKiller?: boolean; antiKing?: boolean; }
export const DEFAULT_OPTIONS: Options = { difficulty: 'normal', led: true, staircase:false, diagonal: false, missing: false, killer: false, renban: false, consecutive: false, inequality: false, multiDiagonal: false, exclusion: false, parity: false, thermometer: false, skyscraper: false, xv: false, quadruple: false, extraRegion: false, nonConsecutive: false, littleKiller:false, antiKing:false };
export interface Cage { cells: number[]; sum: number; }
/** at is the upper-left cell of the four-cell intersection. mask > 0 means
 * exclude ALL matching LED digits; otherwise exclude exactly digit. */
export interface Exclusion { at: number; digit: number; mask: number; }
export interface Puzzle { version: 1; seed: number; options: Options; givens: number[]; lights: number[]; blocked: boolean[]; cages: Cage[]; /** Missing only in legacy unordered Renban saves. */ lineRule?: 'ordered'; lines: number[][]; dots: [number, number][]; inequalities?: [number, number][]; slants?: number[][]; exclusions?: Exclusion[]; parity?: number[]; thermometers?: number[][]; skyClues?: SkyClues; xvClues?: XVClue[]; fourSums?: FourSum[]; extraRegions?: number[][]; littleKillers?: LittleKillerClue[]; }
export interface Generated { puzzle: Puzzle; solution: number[]; }
export interface UndoMove { board: number[]; notes: number[]; crossed?: number[]; deductionSteps?: number; }
export interface SaveData extends Generated { undoHistory?: UndoMove[]; board: number[]; notes: number[]; /** Explicit crossed-out candidates; omitted in legacy saves. */ crossed?: number[]; elapsed: number; assisted: boolean; /** Number of verified logical eliminations replayed for this board. */ deductionSteps?: number; }
export function ledAllows(mask: number, digit: number): boolean { return digit >= 1 && digit <= 9 && ((SEGMENTS[digit]! & mask) === mask); }
export function neighbors(i: number): number[] { return [i % 9 > 0 ? i - 1 : -1, i % 9 < 8 ? i + 1 : -1, i - 9, i + 9].filter(j => j >= 0 && j < 81); }
/** Corner-touching cells only; never wraps across a board edge. */
export function diagonalNeighbors(i: number): number[] {
  const row=Math.floor(i/9),col=i%9,result:number[]=[];
  for(const dr of [-1,1])for(const dc of [-1,1])if(row+dr>=0&&row+dr<9&&col+dc>=0&&col+dc<9)result.push((row+dr)*9+col+dc);
  return result;
}
export function exclusionCells(at: number): number[] { return [at, at + 1, at + 9, at + 10]; }
export function exclusionDigits(clue: Exclusion): number[] { return clue.mask ? DIGITS.filter(d => ledAllows(clue.mask, d)) : [clue.digit]; }
export function units(p: Puzzle): number[][] {
  const list = baseUnits(p);
  if (p.options.diagonal) list.push(Array.from({ length: 9 }, (_, k) => k * 10), Array.from({ length: 9 }, (_, k) => 8 + k * 8));
  if (p.options.multiDiagonal) list.push(...p.slants ?? []);
  if (p.options.extraRegion) list.push(...p.extraRegions ?? []);
  // Two-cell all-different constraints are peers, never complete houses.
  // Same-box diagonals already have this restriction, so add only cross-box pairs.
  if(p.options.antiKing)for(let i=0;i<81;i++)for(const j of diagonalNeighbors(i))if(j>i && (Math.floor(i/27)!==Math.floor(j/27)||Math.floor(i%9/3)!==Math.floor(j%9/3)))list.push([i,j]);
  return list.map(u => u.filter(i => !p.blocked[i]));
}
const ALL_DIGITS = 0x1ff;
const LED_DIGITS = Array.from({ length: 128 }, (_, mask) => DIGITS.reduce((bits, d) => bits | (ledAllows(mask, d) ? 1 << (d - 1) : 0), 0));
const MASK_VALUES = Array.from({ length: 512 }, (_, mask) => DIGITS.filter(d => mask & (1 << (d - 1))));
interface Context { nonConsecutivePeers: number[][] | null; extra: ExtraContext; units: number[][]; memberships: number[][]; peers: number[][]; cages: Cage[][]; lines: number[][][]; dots: Set<string>; inequalities: [number, number][][]; excluded: number[]; variants: boolean; }
/** Structural data is immutable while a generator removes givens/LED clues.
 * Keep this context local to that operation: callers may edit saved puzzles. */
function context(p: Puzzle): Context {
  const us = units(p), memberships: number[][] = Array.from({ length: boardLength(p) }, () => []);
  us.forEach((u, n) => u.forEach(i => memberships[i]!.push(n)));
  return { nonConsecutivePeers:p.options.nonConsecutive?Array.from({length:boardLength(p)},(_,i)=>neighbors(i).filter(j=>!p.blocked[j])):null, extra: extraContext(p), units: us, memberships,
    peers: memberships.map((ms, i) => [...new Set(ms.flatMap(n => us[n]!))].filter(j => i !== j)),
    cages: Array.from({ length: boardLength(p) }, (_, i) => p.cages.filter(c => c.cells.includes(i))),
    lines: Array.from({ length: boardLength(p) }, (_, i) => p.lines.filter(l => l.includes(i))),
    dots: new Set(p.dots.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`)),
    inequalities: Array.from({ length: boardLength(p) }, (_, i) => p.options.inequality ? (p.inequalities ?? []).filter(pair => pair.includes(i)) : []),
    excluded: Array.from({ length: boardLength(p) }, (_, i) => p.options.exclusion ? (p.exclusions ?? []).filter(e => exclusionCells(e.at).includes(i)).flatMap(exclusionDigits).reduce((mask, d) => mask | (1 << (d - 1)), 0) : 0),
    variants: !!(p.cages.length || p.lines.length || p.options.inequality || p.options.consecutive || p.options.thermometer || p.options.skyscraper || p.options.xv || p.options.quadruple || p.options.littleKiller) };
}
function staticMask(p: Puzzle, i: number, ctx: Context, useLights = true): number {
  if (p.blocked[i]) return 0;
  let mask = p.givens[i] ? 1 << (p.givens[i]! - 1) : ALL_DIGITS;
  if (p.options.led !== false && useLights) mask &= LED_DIGITS[p.lights[i]!]!;
  if (p.options.parity && p.parity?.[i]) mask &= p.parity[i] === 1 ? 0x155 : 0x0aa;
  return mask & ~ctx.excluded[i]!;
}
/** Bitset pruning for the global non-consecutive rule, including the solver's
 * MRV scan. This avoids invoking every other variant predicate for each digit. */
function nonConsecutiveMask(board:number[],i:number,ctx:Context):number {
  let banned=0;
  if(ctx.nonConsecutivePeers)for(const j of ctx.nonConsecutivePeers[i]!)if(board[j]){const bit=1<<(board[j]!-1);banned|=(bit<<1)|(bit>>>1);}
  return banned;
}
function candidateValues(p: Puzzle, board: number[], i: number, ctx: Context, useLights = true): number[] {
  let mask = staticMask(p, i, ctx, useLights) & ~nonConsecutiveMask(board,i,ctx);
  for (const j of ctx.peers[i]!) if (board[j]) mask &= ~(1 << (board[j]! - 1));
  const values = MASK_VALUES[mask]!;
  return ctx.variants ? values.filter(v => variantsAllow(p, board, i, v, ctx)) : values;
}
function sumPossible(available: number[], count: number, target: number, start = 0): boolean {
  if (!count) return target === 0;
  if (target <= 0 || available.length - start < count) return false;
  for (let i = start; i <= available.length - count; i++) if (sumPossible(available, count - 1, target - available[i]!, i + 1)) return true;
  return false;
}
function allowed(p: Puzzle, board: number[], i: number, v: number, ctx: Context, useLights = true): boolean {
  return !!(staticMask(p, i, ctx, useLights) & ~nonConsecutiveMask(board,i,ctx) & (1 << (v - 1))) && !ctx.peers[i]!.some(j => board[j] === v) && (!ctx.variants || variantsAllow(p, board, i, v, ctx));
}
function variantsAllow(p: Puzzle, board: number[], i: number, v: number, ctx: Context): boolean {
  for (const [a, b] of ctx.inequalities[i]!) {
    // a < b, even when the other cell has not yet been filled.
    if (i === a ? v >= (board[b] || 9) : v <= (board[a] || 1)) return false;
  }
  for (const cage of ctx.cages[i]!) {
    const filled = cage.cells.filter(j => j !== i && board[j]).map(j => board[j]!);
    if (filled.includes(v)) return false;
    const used = [...filled, v];
    if (!sumPossible(DIGITS.filter(d => !used.includes(d)), cage.cells.length - used.length, cage.sum - used.reduce((a, b) => a + b, 0))) return false;
  }
  for (const line of ctx.lines[i]!) {
    if (p.lineRule === 'ordered') {
      const at = line.indexOf(i);
      // Both directions are possible until clues determine one. The whole path
      // has the same step; checking adjacent pairs alone would allow reversals.
      const fits = (step: number): boolean => {
        const first = v - step * at, last = first + step * (line.length - 1);
        return first >= 1 && first <= 9 && last >= 1 && last <= 9 &&
          line.every((j, n) => j === i || !board[j] || board[j] === first + step * n);
      };
      if (!fits(1) && !fits(-1)) return false;
    } else {
      const filled = line.filter(j => j !== i && board[j]).map(j => board[j]!);
      if (filled.includes(v) || Math.max(v, ...filled) - Math.min(v, ...filled) >= line.length) return false;
    }
  }
  if (p.options.consecutive) for (const j of neighbors(i)) {
    if (!p.blocked[j] && board[j] && (Math.abs(board[j]! - v) === 1) !== ctx.dots.has(`${Math.min(i, j)}:${Math.max(i, j)}`)) return false;
  }
  return extraAllows(p, board, i, v, ctx.extra, ctx.peers);
}
export function candidates(p: Puzzle, board: number[], i: number, useLights = true): number[] {
  if (i < 0 || i >= boardLength(p) || p.blocked[i]) return [];
  const ctx = context(p);
  return candidateValues(p, board, i, ctx, useLights).slice();
}
/** One structural context per display update, rather than 81 separate contexts. */
export function boardCandidateMasks(p: Puzzle, board: number[]): number[] {
  const ctx = context(p);
  return board.map((v,i) => v || p.blocked[i] ? 0 : candidateValues(p,board,i,ctx).reduce((mask,d) => mask | 1 << (d-1),0));
}
/** Old saves keep their original solution semantics; new games are ordered. */
export function lineRuleDescription(p: Puzzle, language: Language = 'zh'): string {
  if (language !== 'zh') return p.lineRule === 'ordered' ? ruleCopy(language, 'renban')[1] : t(language, 'legacy');
  return p.lineRule === 'ordered'
    ? '连续数：沿整条紫线每步差 1，全部升序或全部降序，不能乱序或中途转向。'
    : '旧版 Renban：紫线上不同数字组成连续整数，顺序不限；新开数独使用连续升序或降序规则。';
}
/** Visible, local rule descriptions, also used by screen readers and hints. */
export function cellRuleDetails(p: Puzzle, i: number, language: Language = 'zh'): string[] {
  if (language !== 'zh') {
    const keys: import('./i18n').RuleId[] = p.options.staircase?['staircase']:[];
    if (p.options.led !== false) keys.push('led');
    if (p.options.parity && p.parity?.[i]) keys.push('parity');
    if (p.cages.some(c => c.cells.includes(i))) keys.push('killer');
    if (p.lines.some(l => l.includes(i))) keys.push('renban');
    if (p.inequalities?.some(pair => pair.includes(i))) keys.push('inequality');
    if (p.options.extraRegion && p.extraRegions?.some(region=>region.includes(i))) keys.push('extraRegion');
    if (p.slants?.some(l => l.includes(i))) keys.push('multiDiagonal');
    if (p.exclusions?.some(e => exclusionCells(e.at).includes(i))) keys.push('exclusion');
    if (p.thermometers?.some(l => l.includes(i))) keys.push('thermometer');
    if (p.options.skyscraper) keys.push('skyscraper');
    if (p.options.littleKiller && p.littleKillers?.some(c=>littleKillerPath(c).includes(i))) keys.push('littleKiller');
    if (p.options.xv) keys.push('xv');
    if (p.options.consecutive) keys.push('consecutive');
    if (p.options.nonConsecutive) keys.push('nonConsecutive');
    if (p.options.antiKing) keys.push('antiKing');
    if (p.fourSums?.some(e => exclusionCells(e.at).includes(i))) keys.push('quadruple');
    return keys.map(key => key === 'renban' ? lineRuleDescription(p, language) : `${ruleCopy(language,key)[0]}: ${ruleCopy(language,key)[1]}`);
  }
  const name = (n: number) => `R${Math.floor(n / boardWidth(p)) + 1}C${n % boardWidth(p) + 1}`;
  const details: string[] = p.options.staircase?[ruleCopy(language,'staircase')[1]]:[];
  if(p.options.antiKing) details.push(ruleCopy(language,'antiKing')[1]);
  if(p.options.nonConsecutive) details.push('不连续：本格与上下左右的可填相邻格不能相差 1；斜角不限制。例如 3 旁不能填 2 或 4。');
  if (p.options.renban) p.lines.forEach((line, n) => {
    if (line.includes(i)) details.push(`${lineRuleDescription(p)} 第 ${n + 1} 条线：${line.map(name).join(' → ')}。`);
  });
  if (p.options.extraRegion) (p.extraRegions ?? []).forEach((region,n)=>{if(region.includes(i))details.push(`额外区域 ${regionLetter(n)}：这 9 个色块格像额外的宫一样，必须包含 1–9 且不重复。`);});
  if (p.options.parity && p.parity?.[i]) details.push(p.parity[i] === 1 ? '红底：只能填奇数 1、3、5、7、9。' : '蓝底：只能填偶数 2、4、6、8。');
  if (p.options.inequality) for (const [a, b] of p.inequalities ?? []) if (a === i || b === i) details.push(`数比：${name(a)} < ${name(b)}。`);
  if (p.options.multiDiagonal) (p.slants ?? []).forEach((line, n) => { if (line.includes(i)) details.push(`斜线 ${n + 1}：${name(line[0]!)} 至 ${name(line[line.length - 1]!)} 的可填格不重复。`); });
  if (p.options.exclusion) for (const e of p.exclusions ?? []) if (exclusionCells(e.at).includes(i)) details.push(`排除点（${name(e.at)} 右下交点）${e.mask ? '亮灯匹配' : '标注'} ${exclusionDigits(e).join('、')}，周围四格均不可填。`);
  if (p.options.thermometer) (p.thermometers ?? []).forEach((path,n) => { if(path.includes(i)) details.push(`温度计 ${n+1}：从圆灯泡 ${name(path[0]!)} 到平头 ${name(path[path.length-1]!)} 严格递增，本格是第 ${path.indexOf(i)+1} 格。`); });
  if (p.options.skyscraper && p.skyClues) { const r=Math.floor(i/9), c=i%9, sky=p.skyClues; const clues = [[`本行从左`, sky.left[r]], [`本行从右`, sky.right[r]], [`本列从上`, sky.top[c]], [`本列从下`, sky.bottom[c]]] as const; const shown = clues.filter(([,n]) => n).map(([side,n]) => `${side}可见 ${n} 栋`); details.push(`摩天大楼：${shown.length ? shown.join('；') : '本行、本列外侧没有可见楼数线索'}。高楼遮住后方较矮楼，空白方向不限制可见数。`); }
  if (p.options.xv) { for(const clue of p.xvClues ?? []) if(clue.cells.includes(i)) details.push(`XV：${name(clue.cells[0])} 与 ${name(clue.cells[1])} 的和为 ${clue.sum}（${clue.sum===5?'V':'X'}）。`); details.push('XV 全标记：无 X/V 的相邻两格之和不能是 5 或 10。'); }
  if (p.options.littleKiller) for(const clue of p.littleKillers??[]) {const path=littleKillerPath(clue);if(path.includes(i))details.push(`小杀手：${name(path[0]!)} → ${name(path[path.length-1]!)} 的斜线各格之和为 ${clue.sum}。数字可以重复，但仍须遵守行、列、宫及其他已启用规则。`);}
  if (p.options.quadruple) for(const clue of p.fourSums ?? []) if(exclusionCells(clue.at).includes(i)) details.push(`四数和：${name(clue.at)} 右下菱形 Σ${clue.sum} 表示周围四格之和为 ${clue.sum}。`);
  return details;
}
export function validBoard(p: Puzzle, board: number[], complete = false): boolean {
  return validWithContext(p, board, complete, context(p));
}
function validWithContext(p: Puzzle, board: number[], complete: boolean, ctx: Context): boolean {
  if (board.length !== boardLength(p)) return false;
  return board.every((v, i) => Number.isInteger(v) && v >= 0 && v <= 9 && (p.blocked[i] ? v === 0 : (!p.givens[i] || p.givens[i] === v) && (v ? allowed(p, board, i, v, ctx) : !complete)));
}
export interface SearchResult { count: number; solution: number[] | null; exhausted: boolean; nodes: number; }
export interface SinglesAnalysis { solved: boolean; contradiction: boolean; empty: number; remaining: number; naked: number; hidden: number; }
/** Simulate only player-visible naked and hidden singles, including LED/variant
 * filtering. Never reads the stored solution or uses search to rate a puzzle. */
export function analyzeSingles(p: Puzzle, initial = p.givens): SinglesAnalysis {
  return analyzeWithContext(p, initial, context(p));
}
function analyzeWithContext(p: Puzzle, initial: number[], ctx: Context): SinglesAnalysis {
  const board = initial.slice(), fullUnits = ctx.units.filter(u => u.length === 9);
  const empty = board.filter((v, i) => !v && !p.blocked[i]).length;
  const result: SinglesAnalysis = { solved: false, contradiction: !validWithContext(p, board, false, ctx), empty, remaining: empty, naked: 0, hidden: 0 };
  while (!result.contradiction && result.remaining) {
    const cs: number[][] = Array.from({ length: boardLength(p) }, () => []);
    let single = -1;
    for (let i = 0; i < boardLength(p); i++) if (!board[i] && !p.blocked[i]) {
      const vs = cs[i] = candidateValues(p, board, i, ctx);
      if (!vs.length) { result.contradiction = true; break; }
      if (vs.length === 1) { single = i; break; }
    }
    if (result.contradiction) break;
    if (single >= 0) { board[single] = cs[single]![0]!; result.naked++; result.remaining--; continue; }
    let found = false;
    for (const unit of fullUnits) {
      for (const digit of DIGITS) {
        if (unit.some(i => board[i] === digit)) continue;
        const places = unit.filter(i => cs[i]!.includes(digit));
        if (!places.length) { result.contradiction = true; break; }
        if (places.length === 1) { board[places[0]!] = digit; result.hidden++; result.remaining--; found = true; break; }
      }
      if (found || result.contradiction) break;
    }
    if (!found) break;
  }
  result.solved = !result.contradiction && result.remaining === 0 && validWithContext(p, board, true, ctx);
  if (result.remaining === 0 && !result.solved) result.contradiction = true;
  return result;
}
/** A budget exhaustion is never accepted as proof of uniqueness. */
export function search(p: Puzzle, initial = p.givens, limit = 2, budget = 150000, random?: () => number): SearchResult {
  return searchWithContext(p, initial, limit, budget, random, context(p));
}
function searchWithContext(p: Puzzle, initial: number[], limit: number, budget: number, random: (() => number) | undefined, ctx: Context, excluded?: { cell: number; mask: number }): SearchResult {
  const board = initial.slice();
  const result: SearchResult = { count: 0, solution: null, exhausted: false, nodes: 0 };
  if (!validWithContext(p, board, false, ctx)) return result;
  const masks = Array.from({ length: boardLength(p) }, (_, i) => staticMask(p, i, ctx));
  if (excluded) masks[excluded.cell] = masks[excluded.cell]! & ~excluded.mask;
  const used = ctx.units.map(u => u.reduce((mask, i) => mask | (board[i] ? 1 << (board[i]! - 1) : 0), 0));
  function visit(): void {
    if (++result.nodes > budget) { result.exhausted = true; return; }
    let best = -1, values: number[] = [];
    for (let i = 0; i < boardLength(p); i++) if (!p.blocked[i] && !board[i]) {
      let mask = masks[i]! & ~nonConsecutiveMask(board,i,ctx);
      for (const u of ctx.memberships[i]!) mask &= ~used[u]!;
      const vs = ctx.variants ? MASK_VALUES[mask]!.filter(v => variantsAllow(p, board, i, v, ctx)) : MASK_VALUES[mask]!;
      if (!vs.length) return;
      if (best < 0 || vs.length < values.length) { best = i; values = vs; if (vs.length === 1) break; }
    }
    if (best < 0) { result.count++; result.solution ??= board.slice(); return; }
    if (random) values = shuffle(values, random);
    for (const v of values) {
      const bit = 1 << (v - 1);
      board[best] = v;
      for (const u of ctx.memberships[best]!) used[u] = used[u]! | bit;
      visit();
      board[best] = 0;
      for (const u of ctx.memberships[best]!) used[u] = used[u]! & ~bit;
      if (result.count >= limit || result.exhausted) return;
    }
  }
  visit(); return result;
}
/** Incremental uniqueness proof: before a single clue is weakened the puzzle
 * has exactly one solution. Any NEW solution must violate that old clue, so
 * search only those digits instead of solving the known branch again. This is
 * not valid for arbitrary puzzles or batch removals; those still count to two.
 * The generator retains the known solution, and exhaustion always rejects. */
function removalIsUnique(p: Puzzle, cell: number, previousMask: number, budget: number, ctx: Context): boolean {
  if (candidateValues(p, p.givens, cell, ctx).every(v => previousMask & (1 << (v - 1)))) return true;
  const proof = searchWithContext(p, p.givens, 1, budget, undefined, ctx, { cell, mask: previousMask });
  return proof.count === 0 && !proof.exhausted;
}
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}
export function generate(options: Options, seed: number): Generated {
  options = { ...DEFAULT_OPTIONS, ...options };
  const conflict = optionConflict(options); if (conflict) throw new Error(conflict);
  const random = seeded(seed);
  for (let attempt = 0; attempt < (options.difficulty === 'hard' ? 8 : options.nonConsecutive ? 6 : 3); attempt++) {
    const generated = generateAttempt(options, seed, random);
    if(!generated)continue;
    if (options.difficulty === 'hard' && !refineChallenge(generated.puzzle, random)) continue;
    if (simplifyClues(generated.puzzle)) return generated;
  }
  // Never silently label an easy fallback as a challenge.
  throw new Error('当前规则组合未能在预算内生成符合难度的唯一解，请重试或减少附加规则。');
}
/** Spend variant information on fewer givens before reducing visual clutter. */
function givenTarget(options: Options): number {
  const weights = { diagonal: 2, killer: 7, renban: 3, consecutive: 6, inequality: 3, multiDiagonal: 2, exclusion: 2, parity: 2, thermometer: 3, skyscraper: 7, xv: 6, quadruple: 3, extraRegion: 6, nonConsecutive: 8, littleKiller:5, antiKing:4 } as const;
  const reduction = Object.entries(weights).reduce((n, [key, weight]) => n + (options[key as keyof typeof weights] ? weight : 0), 0);
  // Missing cells remove constraints; they do not earn a reduction.
  return Math.ceil((options.staircase?4/3:1)*Math.max(options.difficulty === 'easy' ? 12 : 0, {easy:35,normal:25,hard:17}[options.difficulty] - reduction));
}
/** Remove signs implied by the other visible clues, without solving the puzzle
 * or consulting its answer. Each proof excludes the sign being tested. Deletions
 * are sequential so duplicate/overlapping clues cannot justify one another. */
export function pruneImpliedInequalities(p: Puzzle): number {
  if (!p.options.inequality || !p.inequalities?.length) return 0;
  const original = p.inequalities.slice();
  let removed = 0;
  for (const clue of original) {
    const [a, b] = clue;
    const rest: Puzzle = { ...p, inequalities: p.inequalities.filter(pair => pair !== clue) };
    const ctx = context(rest), board = p.givens.slice();
    if (!validWithContext(rest, board, false, ctx)) continue;
    const left = candidateValues(rest, board, a, ctx), right = candidateValues(rest, board, b, ctx);
    if (!left.length || !right.length) continue;
    // Other inequalities and thermometers may already give an increasing path.
    const edges = rest.inequalities!.slice();
    if (p.options.thermometer) for (const path of p.thermometers ?? [])
      for (let n = 1; n < path.length; n++) edges.push([path[n - 1]!, path[n]!]);
    const reachable = new Set([a]);
    for (const i of reachable) for (const [from, to] of edges) if (from === i) reachable.add(to);
    let implied = reachable.has(b);
    if (!implied) {
      // Candidate ranges include row/column/box, LED and the enabled variants.
      // Check simultaneous pairs too: equal endpoints are already forbidden by
      // their shared unit, and sums/paths can rule out additional reversed pairs.
      implied = true;
      outer: for (const x of left) for (const y of right) if (x >= y) {
        board[a] = x; board[b] = y;
        if (allowed(rest, board, a, x, ctx) && allowed(rest, board, b, y, ctx)) { implied = false; break outer; }
      }
    }
    if (implied) { p.inequalities = rest.inequalities!; removed++; }
  }
  return removed;
}
/** Remove redundant positive clues. Never sparsify fully marked XV/white dots. */
function simplifyClues(p: Puzzle): boolean {
  const occupied = (cells: number[]) => cells.every(i => !!p.givens[i]);
  // No proof budget or protected first sign here: trivial visual clutter must
  // disappear even when the later global uniqueness minimization runs out.
  pruneImpliedInequalities(p);
  p.parity?.forEach((_,i) => { if (p.givens[i]) p.parity![i] = 0; });
  if (p.exclusions) p.exclusions = p.exclusions.filter(e => !occupied(exclusionCells(e.at)));
  if (p.fourSums) p.fourSums = p.fourSums.filter(e => !occupied(exclusionCells(e.at)));
  if (p.thermometers) p.thermometers = p.thermometers.filter(line => !occupied(line));
  p.lines = p.lines.filter(line => !occupied(line));
  if(p.littleKillers)p.littleKillers=p.littleKillers.filter(clue=>{const path=littleKillerPath(clue);return !occupied(path)&&!units(p).some(u=>u.length===9&&path.length===9&&u.every(i=>path.includes(i)));});
  // Retry the construction if an explicitly selected variant would disappear.
  if ((p.options.littleKiller && !p.littleKillers?.length) || (p.options.inequality && !p.inequalities?.length) || (p.options.parity && !p.parity?.some(Boolean)) ||
      (p.options.exclusion && !p.exclusions?.length) || (p.options.quadruple && !p.fourSums?.length) ||
      (p.options.thermometer && !p.thermometers?.length) || (p.options.renban && !p.lines.length)) return false;
  // Deterministic work budget: sparse hard puzzles must not spend seconds proving
  // cosmetic removals. Exhaustion keeps the clue rather than guessing uniqueness.
  let budget = (p.options.skyscraper || p.options.littleKiller) ? 1600 : 6000;
  const minimize = <T>(items: T[], remove: (group:T[])=>void, restore:(group:T[])=>void): void => {
    if (!items.length || budget < 100) return;
    remove(items);
    if (unique()) return;
    restore(items);
    if (items.length === 1) return;
    const middle=Math.floor(items.length/2);
    minimize(items.slice(0,middle),remove,restore);minimize(items.slice(middle),remove,restore);
  };
  const removable = <T>(items: T[] | undefined, minimum: number) => {
    if (!items) return;
    const order=items.slice();
    minimize(order.slice(minimum),group=>{for(const clue of group)items.splice(items.indexOf(clue),1);},group=>{
      items.push(...group);items.sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    });
  };
  function unique(): boolean {
    // Structural clues changed: build a fresh context, never use the digging cache.
    const ctx = context(p);
    const proof = searchWithContext(p, p.givens, 2, Math.min(budget,(p.options.skyscraper || p.options.littleKiller) ? 200 : 600), undefined, ctx);
    budget -= proof.nodes;
    return proof.count === 1 && !proof.exhausted;
  }
  removable(p.littleKillers, 1); removable(p.inequalities, 1); removable(p.exclusions, 1); removable(p.fourSums, 1);
  removable(p.thermometers, 1); removable(p.lines, 1); removable(p.slants, 2);
  if (p.parity) minimize(p.parity.map((value,i)=>({value,i})).filter(e=>e.value).slice(1),
    group=>group.forEach(e=>p.parity![e.i]=0),group=>group.forEach(e=>p.parity![e.i]=e.value));
  if (p.skyClues) {
    const clues=Object.values(p.skyClues).flatMap(side=>side.map((value:number,i:number)=>({side,value,i}))).filter(e=>e.value);
    minimize(clues.slice(1),group=>group.forEach(e=>e.side[e.i]=0),group=>group.forEach(e=>e.side[e.i]=e.value));
  }
  return p.options.difficulty !== 'hard' || meetsChallenge(analyzeSingles(p));
}
/** A substantial part of a challenge must survive BOTH forms of singles. */
export function meetsChallenge(analysis: SinglesAnalysis): boolean {
  return !analysis.contradiction && !analysis.solved && analysis.remaining >= Math.max(12, Math.ceil(analysis.empty / 4));
}
function refineChallenge(p: Puzzle, random: () => number): boolean {
  const ctx = context(p);
  if (meetsChallenge(analyzeWithContext(p, p.givens, ctx))) return true;
  const clues = shuffle(Array.from({ length: boardLength(p) }, (_, i) => i).filter(i => p.givens[i] || p.lights[i]), random);
  for (const i of clues) {
    const given = p.givens[i]!, light = p.lights[i]!;
    // Keep visible partial LEDs in LED mode; all-dark cells remain playable.
    if (light && p.lights.filter(Boolean).length <= 5) continue;
    p.givens[i] = 0; p.lights[i] = 0;
    const rating = analyzeWithContext(p, p.givens, ctx);
    // A complete sequence of forced moves is itself a uniqueness certificate.
    // Only the stalled positions need the more expensive branching proof.
    if (rating.solved) continue;
    const previousMask = given ? 1 << (given - 1) : LED_DIGITS[light]!;
    const unique = removalIsUnique(p, i, previousMask, (p.options.skyscraper || p.options.littleKiller) ? 1200 : 6000, ctx);
    if (!unique) { p.givens[i] = given; p.lights[i] = light; continue; }
    if (meetsChallenge(rating)) return true;
  }
  return false;
}
function generateAttempt(options: Options, seed: number, random: () => number): Generated | null {
  const hard = options.difficulty === 'hard', length=options.staircase?144:81;
  const p: Puzzle = { version: 1, seed, options: { ...options }, givens: Array(length).fill(0), lights: Array(length).fill(0), blocked: Array.from({length},(_,i)=>!!options.staircase&&staircaseGap(i)), cages: [], lines: [], dots: [], inequalities: [], slants: [], exclusions: [], parity: Array(length).fill(0), thermometers: [], xvClues: [], fourSums: [] };
  if (options.extraRegion && !options.nonConsecutive) p.extraRegions=symmetricRegions(random);
  if (options.multiDiagonal) {
    const paths: number[][] = [];
    for (const offset of [3, 4, 5]) for (const fromTop of [true, false]) for (const mirror of [true, false]) {
      paths.push(Array.from({ length: 9 - offset }, (_, n) => {
        const r = fromTop ? n : offset + n, col = fromTop ? offset + n : n;
        return r * 9 + (mirror ? 8 - col : col);
      }));
    }
    p.slants = shuffle(paths, random).slice(0, 3);
  }
  const solved = options.nonConsecutive ? nonConsecutiveSolution(units(p),random,60000,!!options.antiKing) : search({ ...p, options: { ...options, consecutive: false, xv: false, skyscraper: false } }, p.givens, 1, 500000, random);
  if (!solved.solution) return null;
  const solution = solved.solution;
  if(options.extraRegion && options.nonConsecutive){const regions=regionsForSolution(solution,random);if(!regions)return null;p.extraRegions=regions;}
  if (options.missing) {
    // A randomized transversal: exactly one black cell in each row/column/box.
    const bands = shuffle([0, 1, 2], random), stacks = shuffle([0, 1, 2], random);
    for (let b = 0; b < 3; b++) {
      const rows = shuffle([0, 1, 2], random);
      for (let s = 0; s < 3; s++) {
        const row = bands[b]! * 3 + rows[s]!, col = stacks[s]! * 3 + b;
        p.blocked[row * 9 + col] = true; solution[row * 9 + col] = 0;
      }
    }
  }
  const cells = shuffle(Array.from({ length }, (_, i) => i).filter(i => !p.blocked[i]), random);
  if (options.inequality) {
    const edges: [number, number][] = [];
    for (const i of cells) for (const j of neighbors(i)) if (i < j && !p.blocked[j]) edges.push(solution[i]! < solution[j]! ? [i, j] : [j, i]);
    p.inequalities = shuffle(edges, random).slice(0, hard ? 12 : 24);
  }
  if (options.parity) for (const i of cells.slice(0, hard ? 12 : 24)) p.parity![i] = solution[i]! % 2 ? 1 : 2;
  if (options.exclusion) {
    const intersections = shuffle(Array.from({ length: 64 }, (_, n) => Math.floor(n / 8) * 9 + n % 8), random);
    for (const at of intersections) {
      if (p.exclusions!.length >= (hard ? 5 : 10)) break;
      // Space circles apart and keep their four cells playable.
      if (exclusionCells(at).some(i => p.blocked[i]) || p.exclusions!.some(e => Math.abs(e.at % 9 - at % 9) <= 1 && Math.abs(Math.floor(e.at / 9) - Math.floor(at / 9)) <= 1)) continue;
      const present = exclusionCells(at).map(i => solution[i]!);
      const masks = options.led === false ? [] : shuffle(Array.from({ length: 127 }, (_, n) => n + 1).filter(mask => {
        const excluded = exclusionDigits({ at, digit: 0, mask });
        return excluded.length >= 2 && !excluded.some(d => present.includes(d));
      }), random);
      const mask = masks[0] ?? 0;
      p.exclusions!.push({ at, mask, digit: mask ? 0 : shuffle(DIGITS.filter(d => !present.includes(d)), random)[0]! });
    }
  }
  if (options.killer) {
    const remaining = new Set(cells);
    for (const first of cells) if (remaining.has(first)) {
      const group = [first]; remaining.delete(first);
      const size = (hard ? 3 : 2) + Math.floor(random() * 3);
      while (group.length < size) {
        const next = shuffle([...new Set(group.flatMap(neighbors))], random).find(i => remaining.has(i) && !group.some(j => solution[j] === solution[i]));
        if (next === undefined) break;
        group.push(next); remaining.delete(next);
      }
      p.cages.push({ cells: group.sort((a, b) => a - b), sum: group.reduce((sum, i) => sum + solution[i]!, 0) });
    }
  }
  if (options.renban) {
    p.lineRule = 'ordered';
    const used = new Set<number>();
    for (const first of cells) {
      if (used.has(first) || p.lines.length >= (hard ? 4 : 8)) continue;
      let best: number[] = [];
      function walk(path: number[]): void {
        if (path.length >= 2 && path.length > best.length) best = path.slice();
        if (path.length === 5) return;
        const last = path[path.length - 1]!, step = path.length > 1 ? solution[path[1]!]! - solution[path[0]!]! : 0;
        for (const i of neighbors(last)) {
          const delta = solution[i]! - solution[last]!;
          if (!p.blocked[i] && !used.has(i) && !path.includes(i) && (step ? delta === step : Math.abs(delta) === 1)) walk([...path, i]);
        }
      }
      walk([first]);
      if (best.length) { p.lines.push(best); best.forEach(i => used.add(i)); }
    }
  }
  if (options.consecutive) for (let i = 0; i < 81; i++) for (const j of neighbors(i)) if (i < j && !p.blocked[i] && !p.blocked[j] && Math.abs(solution[i]! - solution[j]!) === 1) p.dots.push([i, j]);
  if (options.thermometer) {
    const used = new Set<number>();
    for(const first of cells) {
      if(used.has(first) || p.thermometers!.length >= (hard ? 2 : 5)) continue;
      let best: number[]=[];
      function walk(path: number[]): void {
        if(path.length>best.length) best=path.slice();
        if(path.length >= (hard ? 4 : 6)) return;
        const last=path[path.length-1]!;
        for(const next of neighbors(last)) if(!p.blocked[next] && !used.has(next) && solution[next]!>solution[last]!) walk([...path,next]);
      }
      walk([first]); if(best.length>=3) { p.thermometers!.push(best); best.forEach(i=>used.add(i)); }
    }
  }
  if(options.skyscraper) {
    p.skyClues={top:[],right:[],bottom:[],left:[]};
    for(let n=0;n<9;n++) {
      const row=solution.slice(n*9,n*9+9), col=Array.from({length:9},(_,r)=>solution[r*9+n]!);
      p.skyClues.left.push(visibleBuildings(row)); p.skyClues.right.push(visibleBuildings(row.reverse()));
      p.skyClues.top.push(visibleBuildings(col)); p.skyClues.bottom.push(visibleBuildings(col.reverse()));
    }
    // Blank exterior positions are unknown, never a visible-building count of 0.
    // Four fully specified sides plus other variants can otherwise solve themselves.
    if (hard) for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      for (const n of shuffle(Array.from({length:9}, (_, i) => i), random).slice(0, 5)) p.skyClues[side][n] = 0;
    }
  }
  if(options.xv) for(const i of cells) for(const j of neighbors(i)) if(i<j && !p.blocked[j]) {
    const sum=solution[i]!+solution[j]!; if(sum===5 || sum===10) p.xvClues!.push({cells:[i,j],sum});
  }
  if(options.quadruple) for(const at of shuffle(Array.from({length:64},(_,n)=>Math.floor(n/8)*9+n%8),random)) {
    if(p.fourSums!.length >= (hard ? 4 : 9)) break;
    if(exclusionCells(at).some(i=>p.blocked[i]) || p.fourSums!.some(s=>Math.abs(s.at%9-at%9)<=1 && Math.abs(Math.floor(s.at/9)-Math.floor(at/9))<=1)) continue;
    p.fourSums!.push({at,sum:exclusionCells(at).reduce((sum,i)=>sum+solution[i]!,0)});
  }
  if(options.littleKiller) p.littleKillers=shuffle(littleKillerLocations(),random).slice(0,hard?10:14).map(clue=>({...clue,sum:littleKillerPath(clue).reduce((sum,i)=>sum+solution[i]!,0)}));
  p.givens = solution.slice();
  const target = givenTarget(options);
  const ctx = context(p);
  let remaining = cells.length;
  for (const i of cells) {
    if (remaining <= target) break;
    const digit = solution[i]!, full = SEGMENTS[digit]!;
    const bits = shuffle([1, 2, 4, 8, 16, 32, 64].filter(bit => full & bit), random);
    // Removed givens become partial LED clues or blanks; challenges use fewer LEDs.
    const count = random() < (hard ? 0.65 : 0.3) ? 0 : Math.min(bits.length - 1, options.difficulty === 'easy' ? 3 : options.difficulty === 'normal' ? 2 : 1);
    p.lights[i] = options.led === false ? 0 : bits.slice(0, count).reduce((mask, bit) => mask | bit, 0);
    p.givens[i] = 0;
    const unique = removalIsUnique(p, i, 1 << (digit - 1), (options.skyscraper || options.littleKiller) ? 1200 : hard ? 6000 : 18000, ctx);
    if (unique) remaining--;
    else { p.givens[i] = digit; p.lights[i] = 0; }
  }
  return { puzzle: p, solution };
}
export interface Hint { cell: number; value: number; explanation: string; steps: HintStep[]; }
export function findHint(p: Puzzle, board: number[], language: Language = 'zh'): Hint | null {
  if (!validBoard(p, board)) return null;
  const cs = Array.from({ length: boardLength(p) }, (_, i) => !board[i] && !p.blocked[i] ? candidates(p, board, i) : []);
  for (let i = 0; i < boardLength(p); i++) if (cs[i]!.length === 1) {
    const basic = candidates(p, board, i, false);
    return { cell: i, value: cs[i]![0]!, steps: buildHintSteps(p, board, i, cs[i]![0]!, undefined, language, {candidates,units,ledAllows,exclusionCells,exclusionDigits,neighbors}), explanation: t(language, 'nakedHint', { r: Math.floor(i / boardWidth(p)) + 1, c: i % boardWidth(p) + 1, v: cs[i]![0]! }) + t(language, basic.length > 1 ? 'ledHint' : 'ruleHint', { digits: basic.join('、') }) };
  }
  // A shortened unit in missing-cell Sudoku need not contain every digit.
  for (const u of units(p).filter(u => u.length === 9)) for (const v of DIGITS) {
    if (u.some(i => board[i] === v)) continue;
    const places = u.filter(i => cs[i]!.includes(v));
    if (places.length === 1) return { cell: places[0]!, value: v, steps: buildHintSteps(p, board, places[0]!, v, u, language, {candidates,units,ledAllows,exclusionCells,exclusionDigits,neighbors}), explanation: t(language, 'hiddenHint', { v, r: Math.floor(places[0]! / boardWidth(p)) + 1, c: places[0]! % boardWidth(p) + 1, diagonal: p.options.diagonal ? t(language, 'diagonalUnit') : '', slants: p.options.multiDiagonal ? t(language, 'slantUnit') : '', extra: p.options.extraRegion ? t(language, 'extraUnit') : '', led: t(language, p.options.led === false ? 'current' : 'ledAnd') }) };
  }
  return null;
}
export function isSaveData(value: unknown): value is SaveData {
  try {
    if (!value || typeof value !== 'object') return false;
    const s = value as SaveData, p = s.puzzle;
    if (s.deductionSteps !== undefined && (!Number.isInteger(s.deductionSteps) || s.deductionSteps < 0 || s.deductionSteps > boardLength(p)*9)) return false;
    const nums = (a: unknown, max: number): a is number[] => Array.isArray(a) && a.length === boardLength(p) && a.every(v => Number.isInteger(v) && v >= 0 && v <= max);
    if (!p || p.version !== 1 || !Number.isSafeInteger(p.seed) || !p.options || !['easy', 'normal', 'hard'].includes(p.options.difficulty) || !['diagonal', 'missing', 'killer', 'renban', 'consecutive'].every(k => typeof (p.options as unknown as Record<string, unknown>)[k] === 'boolean')) return false;
    if (p.options.led !== undefined && typeof p.options.led !== 'boolean') return false;
    for (const key of ['inequality', 'multiDiagonal', 'exclusion', 'parity', 'thermometer', 'skyscraper', 'xv', 'quadruple', 'extraRegion', 'nonConsecutive', 'littleKiller', 'antiKing', 'staircase'] as const) if (p.options[key] !== undefined && typeof p.options[key] !== 'boolean') return false;
    if (optionConflict(p.options)) return false;
    if (!nums(p.givens, 9) || !nums(p.lights, 127) || !nums(s.solution, 9) || !nums(s.board, 9) || !nums(s.notes, 511) || !Array.isArray(p.blocked) || p.blocked.length !== boardLength(p) || !p.blocked.every(v => typeof v === 'boolean') || !Number.isFinite(s.elapsed) || s.elapsed < 0 || typeof s.assisted !== 'boolean') return false;
    if (s.crossed !== undefined && (!nums(s.crossed, 511) || s.crossed.some((m,i)=>m && (p.blocked[i] || s.board[i])))) return false;
    if (s.undoHistory !== undefined && (!Array.isArray(s.undoHistory) || s.undoHistory.length > 200 || !s.undoHistory.every(m =>
      m && nums(m.board,9) && nums(m.notes,511) && (m.crossed === undefined || nums(m.crossed,511)) &&
      (m.deductionSteps === undefined || Number.isInteger(m.deductionSteps) && m.deductionSteps >= 0 && m.deductionSteps <= boardLength(p)*9) &&
      p.givens.every((v,i)=>(!v || m.board[i]===v) && (!p.blocked[i] || (!m.board[i] && !m.notes[i] && !m.crossed?.[i]))) &&
      (!m.crossed || m.crossed.every((v,i)=>!v || !m.board[i]))))) return false;
    if (p.options.led === false && p.lights.some(Boolean)) return false;
    const group = (a: unknown): a is number[] => Array.isArray(a) && a.length > 0 && a.length <= 9 && new Set(a).size === a.length && a.every(i => Number.isInteger(i) && i >= 0 && i < boardLength(p) && !p.blocked[i]);
    const little=p.littleKillers??[];
    if(!validLittleKillers(little,p.blocked) || (!!p.options.littleKiller !== (little.length>0)))return false;
    const regions=p.extraRegions ?? [];
    if(!validExtraRegions(regions,p.blocked) || (!!p.options.extraRegion !== (regions.length>0)))return false;
    const inequalities = p.inequalities ?? [], slants = p.slants ?? [], exclusions = p.exclusions ?? [], parity = p.parity ?? Array(boardLength(p)).fill(0);
    if (!Array.isArray(inequalities) || inequalities.length > 144 || !inequalities.every(pair => group(pair) && pair.length === 2 && neighbors(pair[0]!).includes(pair[1]!))) return false;
    const edge = (i: number) => i < 9 || i >= 72 || i % 9 === 0 || i % 9 === 8;
    if (!Array.isArray(slants) || slants.length > 32 || !slants.every(line => {
      if (!Array.isArray(line) || line.length < 3 || line.length > 9 || !line.every(i => Number.isInteger(i) && i >= 0 && i < boardLength(p)) || !edge(line[0]!) || !edge(line[line.length - 1]!)) return false;
      const dc = line[1]! % 9 - line[0]! % 9;
      return Math.abs(dc) === 1 && line.every((i, n) => !n || Math.floor(i / 9) - Math.floor(line[n - 1]! / 9) === 1 && i % 9 - line[n - 1]! % 9 === dc);
    })) return false;
    if (!Array.isArray(exclusions) || exclusions.length > 64 || new Set(exclusions.map(e => e.at)).size !== exclusions.length || !exclusions.every(e => e && Number.isInteger(e.at) && e.at >= 0 && e.at < 72 && e.at % 9 < 8 && exclusionCells(e.at).every(i => !p.blocked[i]) && Number.isInteger(e.mask) && e.mask >= 0 && e.mask <= 127 && (e.mask ? p.options.led !== false && e.digit === 0 && exclusionDigits(e).length > 0 : Number.isInteger(e.digit) && e.digit >= 1 && e.digit <= 9))) return false;
    if (!nums(parity, 2) || parity.some((v, i) => v && p.blocked[i])) return false;
    const thermos=p.thermometers ?? [], sums=p.fourSums ?? [], xv=p.xvClues ?? [];
    if(!Array.isArray(thermos) || thermos.length>27 || !thermos.every(t=>group(t) && t.length>=2 && t.every((i,n)=>!n || neighbors(t[n-1]!).includes(i))) || (!!p.options.thermometer !== (thermos.length>0))) return false;
    if(!Array.isArray(sums) || sums.length>64 || new Set(sums.map(s=>s.at)).size!==sums.length || !sums.every(s=>Number.isInteger(s.at) && s.at>=0 && s.at<72 && s.at%9<8 && exclusionCells(s.at).every(i=>!p.blocked[i]) && Number.isInteger(s.sum) && s.sum>=4 && s.sum<=36) || (!!p.options.quadruple !== (sums.length>0))) return false;
    if(!Array.isArray(xv) || xv.length>144 || !xv.every(c=>group(c.cells) && c.cells.length===2 && neighbors(c.cells[0]!).includes(c.cells[1]!) && (c.sum===5 || c.sum===10)) || (!p.options.xv && xv.length)) return false;
    if(new Set(xv.map(c=>c.cells.slice().sort((a,b)=>a-b).join(':'))).size!==xv.length) return false;
    if(p.options.skyscraper) { if(!p.skyClues || !['top','right','bottom','left'].every(k=>{const a=p.skyClues![k as keyof SkyClues]; return Array.isArray(a) && a.length===9 && a.every(v=>Number.isInteger(v) && v>=0 && v<=9);}) || !Object.values(p.skyClues).some(a=>a.some(Boolean))) return false; }
    else if(p.skyClues !== undefined) return false;
    if ((!p.options.inequality && inequalities.length) || (!p.options.multiDiagonal && slants.length) || (!p.options.exclusion && exclusions.length) || (!p.options.parity && parity.some(Boolean))) return false;
    if ((p.options.inequality && !inequalities.length) || (p.options.multiDiagonal && slants.length < 2) || (p.options.exclusion && !exclusions.length) || (p.options.parity && !parity.some(Boolean))) return false;
    if (!Array.isArray(p.cages) || p.cages.length > 81 || !p.cages.every(c => c && group(c.cells) && Number.isInteger(c.sum) && c.sum > 0 && c.sum <= 45) || !Array.isArray(p.lines) || p.lines.length > 81 || !p.lines.every(l => group(l) && l.length >= 2) || !Array.isArray(p.dots) || p.dots.length > 144 || !p.dots.every(d => group(d) && d.length === 2 && neighbors(d[0]!).includes(d[1]!))) return false;
    if (p.lineRule !== undefined && (p.lineRule !== 'ordered' || !p.options.renban || !p.lines.length || !p.lines.every(line => line.every((i, n) => !n || neighbors(line[n - 1]!).includes(i))))) return false;
    if ((!p.options.killer && p.cages.length) || (!p.options.renban && p.lines.length) || (!p.options.consecutive && p.dots.length)) return false;
    if (p.options.killer && Array.from({ length: 81 }, (_, i) => i).some(i => p.cages.filter(c => c.cells.includes(i)).length !== (p.blocked[i] ? 0 : 1))) return false;
    if(p.options.staircase){if(p.blocked.some((blocked,i)=>blocked!==staircaseGap(i)))return false;}
    else if (!p.options.missing && p.blocked.some(Boolean)) return false;
    if (p.options.missing && units({ ...p, options: { ...p.options, diagonal: false, multiDiagonal: false, extraRegion:false, antiKing:false } }).some(u => u.length !== 8)) return false;
    if (!p.givens.every((v, i) => (!v || v === s.board[i]) && (!p.blocked[i] || (!v && !p.lights[i] && !s.board[i] && !s.notes[i])) && ledAllows(p.lights[i]!, s.solution[i] || (p.blocked[i] ? 8 : 0)))) return false;
    return validBoard(p, s.solution, true);
  } catch { return false; }
}
