export type Difficulty = 'easy' | 'medium' | 'hard';
export interface Clue { cell: number; number: number }
export interface Puzzle {
  size: number;
  seed: number;
  difficulty: Difficulty;
  clues: readonly Clue[];
  solution: readonly number[];
}
export interface GameState { puzzle: Puzzle; path: readonly number[]; won: boolean }
export type MoveResult = { state: GameState; kind: 'moved' | 'backtracked' | 'blocked'; reason?: string };
export const DIFFICULTIES = { easy: { size: 6, clues: 5, label: '入墨' }, medium: { size: 8, clues: 7, label: '行笔' }, hard: { size: 10, clues: 9, label: '化境' } } as const;

export const twin = (cell: number, size: number): number => size * size - 1 - cell;
export function adjacent(a: number, b: number, size: number): boolean {
  return Math.abs(a % size - b % size) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1;
}
function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** Paired backbite moves preserve adjacency, half-board length and rotational disjointness.
 * This bounded construction always produces a solvable puzzle; it never searches on the UI thread. */
export function createPuzzle(difficulty: Difficulty, seed: number): Puzzle {
  const { size, clues: count } = DIFFICULTIES[difficulty], random = randomSource(seed);
  let path = Array.from({ length: size * size / 2 }, (_, i) => {
    const row = Math.floor(i / size), col = i % size;
    return row * size + (row % 2 ? size - col - 1 : col);
  });
  for (let iteration = 0; iteration < size * size * 14; iteration++) {
    if (random() < .5) path.reverse();
    const end = path[path.length - 1]!, choices = [end - size, end + 1, end + size, end - 1]
      .filter(cell => cell >= 0 && cell < size * size && adjacent(end, cell, size));
    const neighbor = choices[Math.floor(random() * choices.length)]!;
    const own = path.indexOf(neighbor);
    if (own >= 0 && own < path.length - 2) path = [...path.slice(0, own + 1), ...path.slice(own + 1).reverse()];
    else if (own < 0) {
      const other = path.indexOf(twin(neighbor, size));
      if (other < path.length - 1) path = [...path.slice(other + 1), ...path.slice(0, other + 1).reverse().map(cell => twin(cell, size))];
    }
  }
  const last = path.length - 1;
  const clues = Array.from({ length: count }, (_, i) => {
    const position = i === 0 ? 0 : i === count - 1 ? last : Math.round((i + (random() - .5) * .48) * last / (count - 1));
    return { cell: path[position]!, number: i + 1 };
  });
  return { size, seed: seed >>> 0, difficulty, clues, solution: path };
}
export function newGame(puzzle: Puzzle): GameState { return { puzzle, path: [puzzle.clues[0]!.cell], won: false }; }
export function nextNumber(state: GameState): number {
  return state.puzzle.clues.filter(clue => state.path.includes(clue.cell)).length + 1;
}
export function move(state: GameState, cell: number): MoveResult {
  const { puzzle, path } = state, { size } = puzzle;
  const blocked = (reason: string): MoveResult => ({ state, kind: 'blocked', reason });
  if (state.won) return blocked('这一卷已完成，换卷再续。');
  if (!Number.isInteger(cell) || cell < 0 || cell >= size * size) return blocked('请在棋盘内行笔。');
  if (!adjacent(path[path.length - 1]!, cell, size)) return blocked('只能向相邻的上下左右格行笔。');
  const previous = path.indexOf(cell);
  if (previous >= 0) return { state: { ...state, path: path.slice(0, previous + 1) }, kind: 'backtracked' };
  if (path.includes(twin(cell, size))) return blocked('墨白不可相交，请为另一笔留路。');
  const clue = puzzle.clues.find(item => item.cell === cell);
  if (clue && clue.number !== nextNumber(state)) return blocked(`请先经过数字 ${nextNumber(state)}。`);
  if (clue?.number === puzzle.clues.length && path.length + 1 !== size * size / 2) return blocked('到达终点前，须让双线铺满每一格。');
  const updated = [...path, cell];
  return { state: { ...state, path: updated, won: updated.length === size * size / 2 && updated.includes(puzzle.clues[puzzle.clues.length - 1]!.cell) }, kind: 'moved' };
}
export function undo(state: GameState): GameState {
  return state.path.length < 2 ? state : { ...state, path: state.path.slice(0, -1), won: false };
}
/** Hints reveal a guaranteed continuation, explicitly trimming a diverged suffix. */
export function hint(state: GameState): { state: GameState; rewound: boolean } {
  if (state.won) return { state, rewound: false };
  let common = 0;
  while (common < state.path.length && state.path[common] === state.puzzle.solution[common]) common++;
  const base = { ...state, path: state.path.slice(0, common) };
  return { state: move(base, state.puzzle.solution[common]!).state, rewound: common < state.path.length };
}
export function dailySeed(date: string, difficulty: Difficulty): number {
  let hash = 2166136261;
  for (const char of `${date}:${difficulty}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export interface InkTwinSave {
  date: string; difficulty: Difficulty; mode: 'daily' | 'practice'; seed: number;
  path: number[]; active: 'black' | 'white'; seconds: number; hints: number; practiceIndex: number;
}
export function isInkTwinSave(value: unknown): value is InkTwinSave {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
    || !['easy', 'medium', 'hard'].includes(String(data.difficulty)) || !['daily', 'practice'].includes(String(data.mode))
    || !['black', 'white'].includes(String(data.active)) || !Array.isArray(data.path) || !data.path.length || data.path.length > 50) return false;
  for (const key of ['seed', 'seconds', 'hints', 'practiceIndex']) if (!Number.isSafeInteger(data[key]) || Number(data[key]) < 0 || Number(data[key]) > 0xffffffff) return false;
  const saved = value as InkTwinSave;
  if (saved.mode === 'daily' && saved.seed !== dailySeed(saved.date, saved.difficulty)) return false;
  let state = newGame(createPuzzle(saved.difficulty, saved.seed));
  if (saved.path[0] !== state.path[0]) return false;
  for (const cell of saved.path.slice(1)) { const result = move(state, cell); if (result.kind !== 'moved') return false; state = result.state; }
  return true;
}
export function restoreGame(saved: InkTwinSave): GameState {
  let state = newGame(createPuzzle(saved.difficulty, saved.seed));
  for (const cell of saved.path.slice(1)) state = move(state, cell).state;
  return state;
}
