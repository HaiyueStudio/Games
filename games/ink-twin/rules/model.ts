export type Difficulty = 'easy' | 'medium' | 'hard';
export const INKS = ['black', 'white'] as const;
export type Ink = typeof INKS[number];
export type InkPair<T> = Record<Ink, T>;
export interface Clue { cell: number; number: number }
export interface Puzzle {
  size: number; seed: number; difficulty: Difficulty;
  clues: InkPair<readonly Clue[]>;
  solution: InkPair<readonly number[]>;
}
export interface GameState { puzzle: Puzzle; paths: InkPair<readonly number[]>; won: boolean }
export type MoveResult = { state: GameState; kind: 'moved' | 'backtracked' | 'blocked'; reason?: string };
export const DIFFICULTIES = { easy: { size: 6, clues: 5, label: '入墨' }, medium: { size: 8, clues: 7, label: '行笔' }, hard: { size: 10, clues: 9, label: '化境' } } as const;
export const otherInk = (ink: Ink): Ink => ink === 'black' ? 'white' : 'black';
export const inkName = (ink: Ink): string => ink === 'black' ? '墨笔' : '白笔';
export function adjacent(a: number, b: number, size: number): boolean {
  return Math.abs(a % size - b % size) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1;
}
function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** A bounded Hamiltonian backbite construction is split into two independent, unequal routes.
 * Both paths have their own clues and endpoints; their union always covers the board. */
export function createPuzzle(difficulty: Difficulty, seed: number): Puzzle {
  const { size, clues: count } = DIFFICULTIES[difficulty], random = randomSource(seed), total = size * size;
  let path = Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / size), col = i % size;
    return row * size + (row % 2 ? size - col - 1 : col);
  });
  for (let iteration = 0; iteration < total * 14; iteration++) {
    if (random() < .5) path.reverse();
    const end = path[path.length - 1]!, choices = [end - size, end + 1, end + size, end - 1]
      .filter(cell => cell >= 0 && cell < total && adjacent(end, cell, size));
    const at = path.indexOf(choices[Math.floor(random() * choices.length)]!);
    if (at < path.length - 2) path = [...path.slice(0, at + 1), ...path.slice(at + 1).reverse()];
  }
  let cut = Math.round(total * (.34 + random() * .32));
  if (cut === total / 2) cut++;
  const solution: InkPair<number[]> = { black: path.slice(0, cut), white: path.slice(cut) };
  for (const ink of INKS) if (random() < .5) solution[ink].reverse();
  const cluesFor = (route: readonly number[]): Clue[] => Array.from({ length: count }, (_, i) => {
    const last = route.length - 1;
    const position = i === 0 ? 0 : i === count - 1 ? last : Math.round((i + (random() - .5) * .48) * last / (count - 1));
    return { cell: route[position]!, number: i + 1 };
  });
  return { size, seed: seed >>> 0, difficulty, clues: { black: cluesFor(solution.black), white: cluesFor(solution.white) }, solution };
}
export function newGame(puzzle: Puzzle): GameState {
  return { puzzle, paths: { black: [puzzle.clues.black[0]!.cell], white: [puzzle.clues.white[0]!.cell] }, won: false };
}
export function nextNumber(state: GameState, ink: Ink): number {
  return state.puzzle.clues[ink].filter(clue => state.paths[ink].includes(clue.cell)).length + 1;
}
export function lineComplete(state: GameState, ink: Ink): boolean {
  return state.paths[ink].at(-1) === state.puzzle.clues[ink].at(-1)!.cell;
}
export function coveredCells(state: GameState): number { return state.paths.black.length + state.paths.white.length; }
export function trimPath(state: GameState, ink: Ink, length: number): GameState {
  if (!Number.isInteger(length) || length < 1 || length >= state.paths[ink].length) return state;
  return { ...state, paths: { ...state.paths, [ink]: state.paths[ink].slice(0, length) }, won: false };
}
export function move(state: GameState, ink: Ink, cell: number): MoveResult {
  const { puzzle, paths } = state, { size } = puzzle, path = paths[ink], other = otherInk(ink);
  const blocked = (reason: string): MoveResult => ({ state, kind: 'blocked', reason });
  if (state.won) return blocked('这一卷已完成，换卷再续。');
  if (!Number.isInteger(cell) || cell < 0 || cell >= size * size) return blocked('请在棋盘内行笔。');
  if (!adjacent(path.at(-1)!, cell, size)) return blocked('只能向相邻的上下左右格行笔。');
  const previous = path.indexOf(cell);
  if (previous >= 0) return { state: trimPath(state, ink, previous + 1), kind: 'backtracked' };
  if (lineComplete(state, ink)) return blocked(`${inkName(ink)}已到终点，请续另一笔，或沿原路收笔。`);
  if (paths[other].includes(cell)) return blocked('墨白不可相交，请为另一笔留路。');
  if (puzzle.clues[other].some(clue => clue.cell === cell)) return blocked(`这是${inkName(other)}的数字，请连接同色数字。`);
  const clue = puzzle.clues[ink].find(item => item.cell === cell);
  if (clue && clue.number !== nextNumber(state, ink)) return blocked(`${inkName(ink)}请先经过数字 ${nextNumber(state, ink)}。`);
  if (clue?.number === puzzle.clues[ink].length && lineComplete(state, other) && coveredCells(state) + 1 !== size * size) return blocked('两笔都到终点前，须铺满每一格；可回退调整另一条线。');
  const updated: GameState = { ...state, paths: { ...paths, [ink]: [...path, cell] }, won: false };
  updated.won = coveredCells(updated) === size * size && INKS.every(color => lineComplete(updated, color));
  return { state: updated, kind: 'moved' };
}
export function undo(state: GameState, ink: Ink): GameState { return trimPath(state, ink, state.paths[ink].length - 1); }

/** Preserve each solution prefix, rewind divergent suffixes, then reveal one selected-color step. */
export function hint(state: GameState, requested: Ink): { state: GameState; rewound: boolean; ink: Ink } {
  if (state.won) return { state, rewound: false, ink: requested };
  let base = state, rewound = false;
  for (const ink of INKS) {
    let common = 0;
    while (common < state.paths[ink].length && state.paths[ink][common] === state.puzzle.solution[ink][common]) common++;
    if (common < state.paths[ink].length) { base = trimPath(base, ink, common); rewound = true; }
  }
  const ink = lineComplete(base, requested) ? otherInk(requested) : requested;
  return { state: move(base, ink, base.puzzle.solution[ink][base.paths[ink].length]!).state, rewound, ink };
}
export function dailySeed(date: string, difficulty: Difficulty): number {
  let hash = 2166136261;
  for (const char of `${date}:${difficulty}:independent-v2`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export interface InkTwinSave {
  schemaVersion: 2; date: string; difficulty: Difficulty; mode: 'daily' | 'practice'; seed: number;
  paths: InkPair<number[]>; active: Ink; seconds: number; hints: number; practiceIndex: number;
}
export function isInkTwinSave(value: unknown): value is InkTwinSave {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>, paths = data.paths as Record<string, unknown> | undefined;
  if (data.schemaVersion !== 2 || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
    || !['easy', 'medium', 'hard'].includes(String(data.difficulty)) || !['daily', 'practice'].includes(String(data.mode))
    || !INKS.includes(data.active as Ink) || !paths || typeof paths !== 'object') return false;
  if (!INKS.every(ink => Array.isArray(paths[ink]) && (paths[ink] as unknown[]).length >= 1 && (paths[ink] as unknown[]).length <= 100)) return false;
  for (const key of ['seed', 'seconds', 'hints', 'practiceIndex']) if (!Number.isSafeInteger(data[key]) || Number(data[key]) < 0 || Number(data[key]) > 0xffffffff) return false;
  const saved = value as InkTwinSave;
  if (saved.mode === 'daily' && saved.seed !== dailySeed(saved.date, saved.difficulty)) return false;
  let state = newGame(createPuzzle(saved.difficulty, saved.seed));
  for (const ink of INKS) {
    if (saved.paths[ink][0] !== state.paths[ink][0]) return false;
    for (const cell of saved.paths[ink].slice(1)) { const result = move(state, ink, cell); if (result.kind !== 'moved') return false; state = result.state; }
  }
  return true;
}
export function restoreGame(saved: InkTwinSave): GameState {
  let state = newGame(createPuzzle(saved.difficulty, saved.seed));
  for (const ink of INKS) for (const cell of saved.paths[ink].slice(1)) state = move(state, ink, cell).state;
  return state;
}
