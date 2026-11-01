import { applyBoardChoice, createSeededBoard, traceBoard, seededTile, cellKey, VERSUS_DIRECTIONS,
  type Axial, type Choice, type Player, type VersusBoard, type VersusLevel, type VersusMove } from './VersusRules';

export const INITIAL_LIVES = 6;
export const CENTER_PATH_LIVES = 1;
export const SPECIAL_PATH_LIVES = 2;
export const LIFE_MAP_ID = 'life-open';
export interface LifeRecord { version: 1 | 2; mode: 'life'; seed: number; moves: VersusMove[] }
export interface LifeBonus { cell: string; count: number }
export function lifeLevel(source: Pick<VersusLevel,'tileLibrary'>): VersusLevel {
  const cells: Axial[] = [];
  for (let q=-3;q<=3;q++) for (let r=-3;r<=3;r++) if (Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=3) cells.push({q,r});
  return { cells, start: {q:0,r:0}, entry: 7, startWall: false, randomStartExit: false,
    wallKeys: new Set(), tileLibrary: source.tileLibrary, unbounded: true };
}
/** A single dedicated layout, independent of the bounded boards selected in other modes. */
export function specialCells(): Axial[] {
  return VERSUS_DIRECTIONS.map(d => ({q:d.q*2,r:d.r*2}));
}
export const lifeSegment = (cell: string, entry: number, exit: number): string => `${cell}:${Math.min(entry,exit)}-${Math.max(entry,exit)}`;
/** Single-player score chase: all transitions reuse the normal deterministic board tracer. */
export class LifeRun {
  readonly mode = 'life' as const;
  readonly turn: Player = 'human';
  readonly level: VersusLevel;
  readonly seed: number;
  readonly human: VersusBoard;
  readonly moves: VersusMove[] = [];
  readonly fixed = new Set<string>();
  readonly claimed = new Set<string>();
  readonly special: Axial[];
  lives = INITIAL_LIVES;
  lastBonuses: LifeBonus[] = [];
  endReason: 'life' | 'blocked' | null = null;
  get winner(): 'ended' | null { return this.human.ended ? 'ended' : null; }
  constructor(source: Pick<VersusLevel,'tileLibrary'>, seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be uint32');
    this.level = lifeLevel(source); this.seed = seed; this.special = specialCells();
    this.human = createSeededBoard(this.level, seed);
    for (const [id, point] of [this.level.start, ...this.special].entries()) {
      const key = cellKey(point), tile = seededTile(this.level, seed, id);
      this.fixed.add(key); this.human.placed.set(key, { tile, rotation: 0, entry: 0, exit: 0, order: 0 });
    }
    this.human.next = seededTile(this.level, seed, 7); this.human.reserve = seededTile(this.level, seed, 8); this.human.serial = 8;
    traceBoard(this.level, this.human); this.human.score = 0;
    if (this.human.ended) throw new Error('Life mode must start at an empty neighboring cell');
    // Departure from the center is free and already used, rather than a free initial life bonus.
    for (const route of this.human.routes) if (this.fixed.has(route.cell)) this.claimed.add(lifeSegment(route.cell, route.entry, route.exit));
    this.expand();
  }
  board(_player: Player): VersusBoard { return this.human; }
  remaining(cell: string): number {
    let count = 0; for (const id of this.claimed) if (id.startsWith(`${cell}:`)) count++;
    return 6 - count;
  }
  play(player: Player, choice: Choice): void {
    if (player !== 'human' || this.winner) throw new Error('Life run does not accept this move');
    const bonuses = new Map<string, number>();
    // Validate/apply first so an invalid input cannot consume life.
    applyBoardChoice(this.level, this.seed, this.human, choice);
    this.lives--; this.lastBonuses = [];
    for (const route of this.human.routes) {
      const id = lifeSegment(route.cell, route.entry, route.exit);
      if (!this.fixed.has(route.cell) || this.claimed.has(id)) continue;
      const reward=route.cell===cellKey(this.level.start)?CENTER_PATH_LIVES:SPECIAL_PATH_LIVES;
      this.claimed.add(id); this.lives+=reward; bonuses.set(route.cell, (bonuses.get(route.cell) ?? 0) + reward);
    }
    this.lastBonuses = [...bonuses].map(([cell,count]) => ({ cell, count }));
    this.moves.push({ player, swap: choice.swap, rotation: choice.rotation });
    if (this.lives === 0) { this.human.ended = true; this.endReason = 'life'; }
    else if (this.human.ended) this.endReason = 'blocked';
    this.expand();
  }
  /** Only materialize a mist fringe around explored cells; it never limits legal coordinates. */
  private expand(): void {
    const cells = new Map(this.level.cells.map(c=>[cellKey(c),c]));
    for (const point of [...this.human.placed.keys()].map(key=>{const [q,r]=key.split(',').map(Number);return {q:q!,r:r!};}).concat(this.human.current)) {
      cells.set(cellKey(point),point);
      for (const d of VERSUS_DIRECTIONS) { const c={q:point.q+d.q,r:point.r+d.r}; cells.set(cellKey(c),c); }
    }
    this.level.cells.splice(0,this.level.cells.length,...cells.values());
  }
  record(): LifeRecord { return { version: 2, mode: 'life', seed: this.seed, moves: this.moves.map(m => ({ ...m })) }; }
  static restore(level: VersusLevel, record: LifeRecord): LifeRun {
    if (!isLifeRecord(record)) throw new Error('Invalid life record');
    if (record.version !== 2) throw new Error('The previous bounded life map needs a fresh run');
    const run = new LifeRun(level, record.seed); for (const move of record.moves) run.play('human', move); return run;
  }
}
export function isLifeRecord(value: unknown): value is LifeRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string,unknown>;
  return (v.version === 1 || v.version === 2) && v.mode === 'life' && typeof v.seed === 'number' && Number.isInteger(v.seed) && v.seed >= 0 && v.seed <= 0xffffffff
    && Array.isArray(v.moves) && v.moves.length <= 512 && v.moves.every(m => m && m.player === 'human' && typeof m.swap === 'boolean'
      && Number.isInteger(m.rotation) && m.rotation >= 0 && m.rotation < 6);
}
