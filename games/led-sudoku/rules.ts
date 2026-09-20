/** Pure, seeded LED Sudoku model. Bits a..g: top, upper-right, lower-right,
 * bottom, lower-left, upper-left, middle. Unlit clue segments are UNKNOWN. */
export const SEGMENTS = [0, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f] as const;
export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface Options { difficulty: Difficulty; /** Omitted only in legacy saves. */ led?: boolean; diagonal: boolean; missing: boolean; killer: boolean; renban: boolean; consecutive: boolean; inequality?: boolean; multiDiagonal?: boolean; exclusion?: boolean; parity?: boolean; }
export const DEFAULT_OPTIONS: Options = { difficulty: 'normal', led: true, diagonal: false, missing: false, killer: false, renban: false, consecutive: false, inequality: false, multiDiagonal: false, exclusion: false, parity: false };
export interface Cage { cells: number[]; sum: number; }
/** at is the upper-left cell of the four-cell intersection. mask > 0 means
 * exclude ALL matching LED digits; otherwise exclude exactly digit. */
export interface Exclusion { at: number; digit: number; mask: number; }
export interface Puzzle { version: 1; seed: number; options: Options; givens: number[]; lights: number[]; blocked: boolean[]; cages: Cage[]; lines: number[][]; dots: [number, number][]; inequalities?: [number, number][]; slants?: number[][]; exclusions?: Exclusion[]; parity?: number[]; }
export interface Generated { puzzle: Puzzle; solution: number[]; }
export interface SaveData extends Generated { board: number[]; notes: number[]; elapsed: number; assisted: boolean; }
export function ledAllows(mask: number, digit: number): boolean { return digit >= 1 && digit <= 9 && ((SEGMENTS[digit]! & mask) === mask); }
export function neighbors(i: number): number[] { return [i % 9 > 0 ? i - 1 : -1, i % 9 < 8 ? i + 1 : -1, i - 9, i + 9].filter(j => j >= 0 && j < 81); }
export function exclusionCells(at: number): number[] { return [at, at + 1, at + 9, at + 10]; }
export function exclusionDigits(clue: Exclusion): number[] { return clue.mask ? DIGITS.filter(d => ledAllows(clue.mask, d)) : [clue.digit]; }
export function units(p: Puzzle): number[][] {
  const list: number[][] = [];
  for (let n = 0; n < 9; n++) {
    list.push(Array.from({ length: 9 }, (_, k) => n * 9 + k), Array.from({ length: 9 }, (_, k) => k * 9 + n));
    list.push(Array.from({ length: 9 }, (_, k) => (Math.floor(n / 3) * 3 + Math.floor(k / 3)) * 9 + n % 3 * 3 + k % 3));
  }
  if (p.options.diagonal) list.push(Array.from({ length: 9 }, (_, k) => k * 10), Array.from({ length: 9 }, (_, k) => 8 + k * 8));
  if (p.options.multiDiagonal) list.push(...p.slants ?? []);
  return list.map(u => u.filter(i => !p.blocked[i]));
}
interface Context { peers: number[][]; cages: Cage[][]; lines: number[][][]; dots: Set<string>; inequalities: [number, number][][]; excluded: number[][]; }
function context(p: Puzzle): Context {
  const us = units(p);
  return { peers: Array.from({ length: 81 }, (_, i) => [...new Set(us.filter(u => u.includes(i)).flat())].filter(j => i !== j)), cages: Array.from({ length: 81 }, (_, i) => p.cages.filter(c => c.cells.includes(i))), lines: Array.from({ length: 81 }, (_, i) => p.lines.filter(l => l.includes(i))), dots: new Set(p.dots.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`)), inequalities: Array.from({ length: 81 }, (_, i) => p.options.inequality ? (p.inequalities ?? []).filter(pair => pair.includes(i)) : []), excluded: Array.from({ length: 81 }, (_, i) => p.options.exclusion ? (p.exclusions ?? []).filter(e => exclusionCells(e.at).includes(i)).flatMap(exclusionDigits) : []) };
}
function sumPossible(available: number[], count: number, target: number, start = 0): boolean {
  if (!count) return target === 0;
  if (target <= 0 || available.length - start < count) return false;
  for (let i = start; i <= available.length - count; i++) if (sumPossible(available, count - 1, target - available[i]!, i + 1)) return true;
  return false;
}
function allowed(p: Puzzle, board: number[], i: number, v: number, ctx: Context, useLights = true): boolean {
  if (p.blocked[i] || (p.givens[i] && p.givens[i] !== v) || (p.options.led !== false && useLights && !ledAllows(p.lights[i]!, v))) return false;
  if (ctx.peers[i]!.some(j => board[j] === v)) return false;
  if (p.options.parity && p.parity?.[i] && v % 2 !== (p.parity[i] === 1 ? 1 : 0)) return false;
  if (ctx.excluded[i]!.includes(v)) return false;
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
    const filled = line.filter(j => j !== i && board[j]).map(j => board[j]!);
    if (filled.includes(v) || Math.max(v, ...filled) - Math.min(v, ...filled) >= line.length) return false;
  }
  if (p.options.consecutive) for (const j of neighbors(i)) {
    if (!p.blocked[j] && board[j] && (Math.abs(board[j]! - v) === 1) !== ctx.dots.has(`${Math.min(i, j)}:${Math.max(i, j)}`)) return false;
  }
  return true;
}
export function candidates(p: Puzzle, board: number[], i: number, useLights = true): number[] {
  if (i < 0 || i >= 81 || p.blocked[i]) return [];
  const ctx = context(p);
  return DIGITS.filter(v => allowed(p, board, i, v, ctx, useLights));
}
/** Visible, local rule descriptions, also used by screen readers and hints. */
export function cellRuleDetails(p: Puzzle, i: number): string[] {
  const name = (n: number) => `R${Math.floor(n / 9) + 1}C${n % 9 + 1}`;
  const details: string[] = [];
  if (p.options.parity && p.parity?.[i]) details.push(p.parity[i] === 1 ? '红底：只能填奇数 1、3、5、7、9。' : '蓝底：只能填偶数 2、4、6、8。');
  if (p.options.inequality) for (const [a, b] of p.inequalities ?? []) if (a === i || b === i) details.push(`数比：${name(a)} < ${name(b)}。`);
  if (p.options.multiDiagonal) (p.slants ?? []).forEach((line, n) => { if (line.includes(i)) details.push(`斜线 ${n + 1}：${name(line[0]!)} 至 ${name(line[line.length - 1]!)} 的可填格不重复。`); });
  if (p.options.exclusion) for (const e of p.exclusions ?? []) if (exclusionCells(e.at).includes(i)) details.push(`排除点（${name(e.at)} 右下交点）${e.mask ? '亮灯匹配' : '标注'} ${exclusionDigits(e).join('、')}，周围四格均不可填。`);
  return details;
}
export function validBoard(p: Puzzle, board: number[], complete = false): boolean {
  if (board.length !== 81) return false;
  const ctx = context(p);
  return board.every((v, i) => Number.isInteger(v) && v >= 0 && v <= 9 && (p.blocked[i] ? v === 0 : (!p.givens[i] || p.givens[i] === v) && (v ? allowed(p, board, i, v, ctx) : !complete)));
}
export interface SearchResult { count: number; solution: number[] | null; exhausted: boolean; nodes: number; }
/** A budget exhaustion is never accepted as proof of uniqueness. */
export function search(p: Puzzle, initial = p.givens, limit = 2, budget = 150000, random?: () => number): SearchResult {
  const board = initial.slice(), ctx = context(p);
  const result: SearchResult = { count: 0, solution: null, exhausted: false, nodes: 0 };
  if (!validBoard(p, board)) return result;
  function visit(): void {
    if (++result.nodes > budget) { result.exhausted = true; return; }
    let best = -1, values: number[] = [];
    for (let i = 0; i < 81; i++) if (!p.blocked[i] && !board[i]) {
      const vs = DIGITS.filter(v => allowed(p, board, i, v, ctx));
      if (!vs.length) return;
      if (best < 0 || vs.length < values.length) { best = i; values = vs; if (vs.length === 1) break; }
    }
    if (best < 0) { result.count++; result.solution ??= board.slice(); return; }
    if (random) values = shuffle(values, random);
    for (const v of values) {
      board[best] = v; visit(); board[best] = 0;
      if (result.count >= limit || result.exhausted) return;
    }
  }
  visit(); return result;
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
  const random = seeded(seed);
  const p: Puzzle = { version: 1, seed, options: { ...options }, givens: Array(81).fill(0), lights: Array(81).fill(0), blocked: Array(81).fill(false), cages: [], lines: [], dots: [], inequalities: [], slants: [], exclusions: [], parity: Array(81).fill(0) };
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
  const solved = search({ ...p, options: { ...options, consecutive: false } }, p.givens, 1, 500000, random);
  if (!solved.solution) throw new Error('生成超出搜索预算，请重试。');
  const solution = solved.solution;
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
  const cells = shuffle(Array.from({ length: 81 }, (_, i) => i).filter(i => !p.blocked[i]), random);
  if (options.inequality) {
    const edges: [number, number][] = [];
    for (const i of cells) for (const j of neighbors(i)) if (i < j && !p.blocked[j]) edges.push(solution[i]! < solution[j]! ? [i, j] : [j, i]);
    p.inequalities = shuffle(edges, random).slice(0, 24);
  }
  if (options.parity) for (const i of cells.slice(0, 24)) p.parity![i] = solution[i]! % 2 ? 1 : 2;
  if (options.exclusion) {
    const intersections = shuffle(Array.from({ length: 64 }, (_, n) => Math.floor(n / 8) * 9 + n % 8), random);
    for (const at of intersections) {
      if (p.exclusions!.length >= 10) break;
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
      const size = 2 + Math.floor(random() * 3);
      while (group.length < size) {
        const next = shuffle([...new Set(group.flatMap(neighbors))], random).find(i => remaining.has(i) && !group.some(j => solution[j] === solution[i]));
        if (next === undefined) break;
        group.push(next); remaining.delete(next);
      }
      p.cages.push({ cells: group.sort((a, b) => a - b), sum: group.reduce((sum, i) => sum + solution[i]!, 0) });
    }
  }
  if (options.renban) {
    const used = new Set<number>();
    for (const first of cells) {
      if (used.has(first) || p.lines.length >= 8) continue;
      let best: number[] = [];
      function walk(path: number[]): void {
        const values = path.map(i => solution[i]!);
        if (path.length >= 2 && Math.max(...values) - Math.min(...values) === path.length - 1 && path.length > best.length) best = path.slice();
        if (path.length === 5) return;
        for (const i of neighbors(path[path.length - 1]!)) if (!p.blocked[i] && !used.has(i) && !path.includes(i) && !values.includes(solution[i]!)) walk([...path, i]);
      }
      walk([first]);
      if (best.length) { p.lines.push(best); best.forEach(i => used.add(i)); }
    }
  }
  if (options.consecutive) for (let i = 0; i < 81; i++) for (const j of neighbors(i)) if (i < j && !p.blocked[i] && !p.blocked[j] && Math.abs(solution[i]! - solution[j]!) === 1) p.dots.push([i, j]);
  p.givens = solution.slice();
  const targets = { easy: 35, normal: 25, hard: 17 };
  let remaining = cells.length;
  for (const i of cells) {
    if (remaining <= targets[options.difficulty]) break;
    const digit = solution[i]!, full = SEGMENTS[digit]!;
    const bits = shuffle([1, 2, 4, 8, 16, 32, 64].filter(bit => full & bit), random);
    // Most removed givens become real partial LED clues, some remain blank.
    const count = random() < 0.3 ? 0 : Math.min(bits.length - 1, options.difficulty === 'easy' ? 3 : options.difficulty === 'normal' ? 2 : 1);
    p.lights[i] = options.led === false ? 0 : bits.slice(0, count).reduce((mask, bit) => mask | bit, 0);
    p.givens[i] = 0;
    const proof = search(p, p.givens, 2, 18000);
    if (proof.count === 1 && !proof.exhausted) remaining--;
    else { p.givens[i] = digit; p.lights[i] = 0; }
  }
  return { puzzle: p, solution };
}
export interface Hint { cell: number; value: number; explanation: string; }
export function findHint(p: Puzzle, board: number[]): Hint | null {
  if (!validBoard(p, board)) return null;
  const cs = Array.from({ length: 81 }, (_, i) => !board[i] && !p.blocked[i] ? candidates(p, board, i) : []);
  for (let i = 0; i < 81; i++) if (cs[i]!.length === 1) {
    const basic = candidates(p, board, i, false);
    return { cell: i, value: cs[i]![0]!, explanation: `R${Math.floor(i / 9) + 1}C${i % 9 + 1} 只剩 ${cs[i]![0]}。${basic.length > 1 ? `规则候选 ${basic.join('、')}，亮起灯段进一步排除不匹配的数字。` : '依据行、列、宫及已启用的附加规则，其他数字均被排除。'}` };
  }
  // A shortened unit in missing-cell Sudoku need not contain every digit.
  for (const u of units(p).filter(u => u.length === 9)) for (const v of DIGITS) {
    if (u.some(i => board[i] === v)) continue;
    const places = u.filter(i => cs[i]!.includes(v));
    if (places.length === 1) return { cell: places[0]!, value: v, explanation: `此完整行、列、宫${p.options.diagonal ? '或对角线' : ''}${p.options.multiDiagonal ? '或九格斜线' : ''}中，${v} 只能放在 R${Math.floor(places[0]! / 9) + 1}C${places[0]! % 9 + 1}。候选已包含${p.options.led === false ? '当前' : ' LED 与'}附加规则。` };
  }
  return null;
}
export function isSaveData(value: unknown): value is SaveData {
  try {
    if (!value || typeof value !== 'object') return false;
    const s = value as SaveData, p = s.puzzle;
    const nums = (a: unknown, max: number): a is number[] => Array.isArray(a) && a.length === 81 && a.every(v => Number.isInteger(v) && v >= 0 && v <= max);
    if (!p || p.version !== 1 || !Number.isSafeInteger(p.seed) || !p.options || !['easy', 'normal', 'hard'].includes(p.options.difficulty) || !['diagonal', 'missing', 'killer', 'renban', 'consecutive'].every(k => typeof (p.options as unknown as Record<string, unknown>)[k] === 'boolean')) return false;
    if (p.options.led !== undefined && typeof p.options.led !== 'boolean') return false;
    for (const key of ['inequality', 'multiDiagonal', 'exclusion', 'parity'] as const) if (p.options[key] !== undefined && typeof p.options[key] !== 'boolean') return false;
    if (!nums(p.givens, 9) || !nums(p.lights, 127) || !nums(s.solution, 9) || !nums(s.board, 9) || !nums(s.notes, 511) || !Array.isArray(p.blocked) || p.blocked.length !== 81 || !p.blocked.every(v => typeof v === 'boolean') || !Number.isFinite(s.elapsed) || s.elapsed < 0 || typeof s.assisted !== 'boolean') return false;
    if (p.options.led === false && p.lights.some(Boolean)) return false;
    const group = (a: unknown): a is number[] => Array.isArray(a) && a.length > 0 && a.length <= 9 && new Set(a).size === a.length && a.every(i => Number.isInteger(i) && i >= 0 && i < 81 && !p.blocked[i]);
    const inequalities = p.inequalities ?? [], slants = p.slants ?? [], exclusions = p.exclusions ?? [], parity = p.parity ?? Array(81).fill(0);
    if (!Array.isArray(inequalities) || inequalities.length > 144 || !inequalities.every(pair => group(pair) && pair.length === 2 && neighbors(pair[0]!).includes(pair[1]!))) return false;
    const edge = (i: number) => i < 9 || i >= 72 || i % 9 === 0 || i % 9 === 8;
    if (!Array.isArray(slants) || slants.length > 32 || !slants.every(line => {
      if (!Array.isArray(line) || line.length < 3 || line.length > 9 || !line.every(i => Number.isInteger(i) && i >= 0 && i < 81) || !edge(line[0]!) || !edge(line[line.length - 1]!)) return false;
      const dc = line[1]! % 9 - line[0]! % 9;
      return Math.abs(dc) === 1 && line.every((i, n) => !n || Math.floor(i / 9) - Math.floor(line[n - 1]! / 9) === 1 && i % 9 - line[n - 1]! % 9 === dc);
    })) return false;
    if (!Array.isArray(exclusions) || exclusions.length > 64 || new Set(exclusions.map(e => e.at)).size !== exclusions.length || !exclusions.every(e => e && Number.isInteger(e.at) && e.at >= 0 && e.at < 72 && e.at % 9 < 8 && exclusionCells(e.at).every(i => !p.blocked[i]) && Number.isInteger(e.mask) && e.mask >= 0 && e.mask <= 127 && (e.mask ? p.options.led !== false && e.digit === 0 && exclusionDigits(e).length > 0 : Number.isInteger(e.digit) && e.digit >= 1 && e.digit <= 9))) return false;
    if (!nums(parity, 2) || parity.some((v, i) => v && p.blocked[i])) return false;
    if ((!p.options.inequality && inequalities.length) || (!p.options.multiDiagonal && slants.length) || (!p.options.exclusion && exclusions.length) || (!p.options.parity && parity.some(Boolean))) return false;
    if ((p.options.inequality && !inequalities.length) || (p.options.multiDiagonal && slants.length < 2) || (p.options.exclusion && !exclusions.length) || (p.options.parity && !parity.some(Boolean))) return false;
    if (!Array.isArray(p.cages) || p.cages.length > 81 || !p.cages.every(c => c && group(c.cells) && Number.isInteger(c.sum) && c.sum > 0 && c.sum <= 45) || !Array.isArray(p.lines) || p.lines.length > 81 || !p.lines.every(l => group(l) && l.length >= 2) || !Array.isArray(p.dots) || p.dots.length > 144 || !p.dots.every(d => group(d) && d.length === 2 && neighbors(d[0]!).includes(d[1]!))) return false;
    if ((!p.options.killer && p.cages.length) || (!p.options.renban && p.lines.length) || (!p.options.consecutive && p.dots.length)) return false;
    if (p.options.killer && Array.from({ length: 81 }, (_, i) => i).some(i => p.cages.filter(c => c.cells.includes(i)).length !== (p.blocked[i] ? 0 : 1))) return false;
    if (!p.options.missing && p.blocked.some(Boolean)) return false;
    if (p.options.missing && units({ ...p, options: { ...p.options, diagonal: false, multiDiagonal: false } }).some(u => u.length !== 8)) return false;
    if (!p.givens.every((v, i) => (!v || v === s.board[i]) && (!p.blocked[i] || (!v && !p.lights[i] && !s.board[i] && !s.notes[i])) && ledAllows(p.lights[i]!, s.solution[i] || (p.blocked[i] ? 8 : 0)))) return false;
    return validBoard(p, s.solution, true);
  } catch { return false; }
}
