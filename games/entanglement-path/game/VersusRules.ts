/** Deterministic versus rules. No DOM, clocks, audio or hidden future-card search. */
export type VersusMode = 'shared' | 'race';
export type Player = 'human' | 'machine';
export type Winner = Player | 'draw' | null;
export interface Axial { q: number; r: number }
export type Pairing = [number, number][];
export interface VersusLevel {
  cells: Axial[]; wallKeys: Set<string>; start: Axial; entry: number;
  startWall: boolean; randomStartExit: boolean; tileLibrary: Pairing[];
}
export interface VersusTile { id: number; pairs: Pairing; variant: number }
export interface Choice { swap: boolean; rotation: number }
export interface VersusMove extends Choice { player: Player }
export interface Placed { tile: VersusTile; rotation: number; entry: number; exit: number; order: number }
export interface Route { cell: string; entry: number; exit: number }
export interface VersusBoard {
  placed: Map<string, Placed>; current: Axial; incoming: number; start: Axial; entry: number;
  sourceExit: number | null; next: VersusTile; reserve: VersusTile; serial: number;
  score: number; length: number; ended: boolean; routes: Route[];
}
export interface MatchRecord { version: 1; mode: VersusMode; seed: number; moves: VersusMove[] }
export const VERSUS_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
];
export const cellKey = ({ q, r }: Axial): string => `${q},${r}`;
const mod12 = (n: number): number => (n % 12 + 12) % 12;
export const opposite = (port: number): number => ((Math.floor(port / 2) + 3) % 6) * 2 + 1 - port % 2;
function hash(seed: number, index: number): number {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  n = Math.imul(n ^ n >>> 16, 0x21f0aaad); n = Math.imul(n ^ n >>> 15, 0x735a2d97);
  return (n ^ n >>> 15) >>> 0;
}
export function seededTile(level: VersusLevel, seed: number, id: number): VersusTile {
  const pairs = level.tileLibrary[hash(seed, id * 2) % level.tileLibrary.length];
  if (!pairs) throw new Error('Versus needs a nonempty tile library');
  return { id, pairs: pairs.map(([a, b]) => [a, b]), variant: hash(seed, id * 2 + 1) % 5 };
}
export function connectedPort(tile: VersusTile, rotation: number, entry: number): number {
  const local = mod12(entry - rotation * 2);
  for (const [a, b] of tile.pairs) {
    if (a === local) return mod12(b + rotation * 2);
    if (b === local) return mod12(a + rotation * 2);
  }
  throw new Error('Tile does not pair every port');
}
function playable(level: VersusLevel, point: Axial): boolean {
  return !level.wallKeys.has(cellKey(point)) && level.cells.some(c => c.q === point.q && c.r === point.r);
}
function createBoard(level: VersusLevel, seed: number): VersusBoard {
  let current = { ...level.start }, entry = level.entry, sourceExit: number | null = null;
  if (level.startWall) {
    const candidates: { point: Axial; port: number }[] = [];
    for (let port = 0; port < 12; port++) {
      const d = VERSUS_DIRECTIONS[Math.floor(port / 2)]!;
      const point = { q: current.q + d.q, r: current.r + d.r };
      if (playable(level, point)) candidates.push({ point, port });
    }
    const candidate = candidates[level.randomStartExit ? hash(seed, 0) % candidates.length : 0];
    if (!candidate) throw new Error('Versus source has no playable neighbor');
    current = candidate.point; entry = opposite(candidate.port); sourceExit = candidate.port;
  }
  return { placed: new Map(), current, incoming: entry, start: { ...current }, entry, sourceExit,
    next: seededTile(level, seed, 1), reserve: seededTile(level, seed, 2), serial: 2,
    score: 0, length: 0, ended: false, routes: [] };
}
function trace(level: VersusLevel, board: VersusBoard): void {
  let point = { ...board.start }, entry = board.entry;
  const visited = new Set<string>(), segments = new Set<string>();
  board.routes = []; board.ended = true;
  for (let i = 0; i <= board.placed.size * 12; i++) {
    const id = cellKey(point);
    if (!playable(level, point)) break;
    const tile = board.placed.get(id);
    if (!tile) { board.current = point; board.incoming = entry; board.ended = false; break; }
    const visit = `${id}:${entry}`;
    if (visited.has(visit)) break;
    visited.add(visit);
    const exit = connectedPort(tile.tile, tile.rotation, entry);
    board.routes.push({ cell: id, entry, exit });
    segments.add(`${id}:${Math.min(entry, exit)}-${Math.max(entry, exit)}`);
    const direction = VERSUS_DIRECTIONS[Math.floor(exit / 2)]!;
    point = { q: point.q + direction.q, r: point.r + direction.r }; entry = opposite(exit);
  }
  const gain = Math.max(0, segments.size - board.length);
  board.length = segments.size; board.score += gain * (gain + 1) / 2;
}
function validChoice(choice: Choice): boolean {
  return typeof choice.swap === 'boolean' && Number.isInteger(choice.rotation) && choice.rotation >= 0 && choice.rotation < 6;
}
function apply(level: VersusLevel, seed: number, board: VersusBoard, choice: Choice): void {
  if (board.ended || !validChoice(choice) || !playable(level, board.current) || board.placed.has(cellKey(board.current))) {
    throw new Error('Invalid versus placement');
  }
  if (choice.swap) [board.next, board.reserve] = [board.reserve, board.next];
  board.placed.set(cellKey(board.current), { tile: board.next, rotation: choice.rotation,
    entry: board.incoming, exit: connectedPort(board.next, choice.rotation, board.incoming), order: board.placed.size + 1 });
  trace(level, board);
  if (!board.ended) board.next = seededTile(level, seed, ++board.serial);
}
export interface Evaluation extends Choice { ended: boolean; gain: number; score: number }
export function evaluateChoices(level: VersusLevel, seed: number, board: VersusBoard): Evaluation[] {
  if (board.ended) return [];
  const choices: Evaluation[] = [];
  for (const swap of [false, true]) for (let rotation = 0; rotation < 6; rotation++) {
    const copy = { ...board, placed: new Map(board.placed) };
    apply(level, seed, copy, { swap, rotation });
    choices.push({ swap, rotation, ended: copy.ended, gain: copy.score - board.score, score: copy.score });
  }
  return choices;
}
/** Survival first, then the largest immediate score; stable ties prefer the current card and lower rotation. */
export function greedyChoice(level: VersusLevel, seed: number, board: VersusBoard): Choice {
  const options = evaluateChoices(level, seed, board);
  options.sort((a, b) => Number(a.ended) - Number(b.ended) || b.gain - a.gain || Number(a.swap) - Number(b.swap) || a.rotation - b.rotation);
  const best = options[0]; if (!best) throw new Error('No move on an ended board');
  return { swap: best.swap, rotation: best.rotation };
}
export class VersusMatch {
  readonly level: VersusLevel;
  readonly seed: number;
  readonly mode: VersusMode;
  readonly human: VersusBoard;
  readonly machine: VersusBoard;
  readonly moves: VersusMove[] = [];
  turn: Player = 'human';
  winner: Winner = null;
  constructor(level: VersusLevel, seed: number, mode: VersusMode) {
    this.level = level; this.seed = seed; this.mode = mode;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be uint32');
    if (!level.cells.length || level.cells.length > 512) throw new Error('Versus board must contain 1–512 cells');
    this.human = createBoard(level, seed);
    this.machine = mode === 'shared' ? this.human : createBoard(level, seed);
  }
  board(player: Player): VersusBoard { return player === 'human' ? this.human : this.machine; }
  play(player: Player, choice: Choice): void {
    if (this.winner || player !== this.turn) throw new Error('It is not this player’s turn');
    apply(this.level, this.seed, this.board(player), choice);
    this.moves.push({ player, swap: choice.swap, rotation: choice.rotation });
    if (this.mode === 'shared') {
      if (this.human.ended) this.winner = player === 'human' ? 'machine' : 'human';
      else this.turn = player === 'human' ? 'machine' : 'human';
    } else if (this.human.ended && this.machine.ended) {
      this.winner = this.human.score === this.machine.score ? 'draw' : this.human.score > this.machine.score ? 'human' : 'machine';
    } else {
      const other = player === 'human' ? 'machine' : 'human';
      this.turn = this.board(other).ended ? player : other;
    }
  }
  machineMove(): Choice {
    const choice = greedyChoice(this.level, this.seed, this.machine); this.play('machine', choice); return choice;
  }
  record(): MatchRecord { return { version: 1, mode: this.mode, seed: this.seed, moves: this.moves.map(m => ({ ...m })) }; }
  static restore(level: VersusLevel, record: MatchRecord): VersusMatch {
    if (!isMatchRecord(record)) throw new Error('Invalid versus record');
    const match = new VersusMatch(level, record.seed, record.mode);
    for (const move of record.moves) match.play(move.player, move);
    return match;
  }
}
export function isMatchRecord(value: unknown): value is MatchRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && (v.mode === 'shared' || v.mode === 'race')
    && typeof v.seed === 'number' && Number.isInteger(v.seed) && v.seed >= 0 && v.seed <= 0xffffffff
    && Array.isArray(v.moves) && v.moves.length <= 1024 && v.moves.every(m => m && typeof m === 'object'
      && (m.player === 'human' || m.player === 'machine') && validChoice(m));
}
