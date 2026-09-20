import { CALENDAR_SOLVER_MODEL, type CalendarPlacement, type CalendarSolveInput, type CalendarSolveResult } from './solver';
import { calendarOrientedCells } from './tray';

interface Entry {
  date: string;
  board: string;
  cells: Map<number, string>;
  solution: CalendarPlacement[];
}

/** Small session LRU of complete solutions, not just the last hint or partial board. */
export class CalendarSolutionCache {
  private entries: Entry[] = [];
  get size(): number { return this.entries.length; }
  clear(): void { this.entries = []; }
  private date(input: CalendarSolveInput): string | null {
    return Number.isInteger(input.month) && input.month >= 1 && input.month <= 12
      && Number.isInteger(input.day) && input.day >= 1 && input.day <= 31
      && Number.isInteger(input.weekday) && input.weekday >= 0 && input.weekday <= 6
      ? `${input.month}/${input.day}/${input.weekday}` : null;
  }
  private cells(input: CalendarSolveInput, placements: CalendarPlacement[]): Map<number, string> | null {
    if (!Array.isArray(placements) || placements.length > CALENDAR_SOLVER_MODEL.pieces.length) return null;
    const blocked = new Set([`m${input.month}`, `d${input.day}`, `w${input.weekday}`]);
    const available = new Set(CALENDAR_SOLVER_MODEL.board.filter(c => !blocked.has(c.key)).map(c => `${c.row},${c.col}`));
    const occupied = new Set<string>(), keys = new Map<number, string>();
    for (const p of placements) {
      if (!p || !Number.isInteger(p.piece) || !CALENDAR_SOLVER_MODEL.pieces[p.piece]
        || !Number.isInteger(p.rotation) || p.rotation < 0 || p.rotation > 3 || typeof p.flipped !== 'boolean'
        || !Number.isInteger(p.row) || !Number.isInteger(p.col) || keys.has(p.piece)) return null;
      const cells = calendarOrientedCells(CALENDAR_SOLVER_MODEL.pieces[p.piece]!.cells, p.rotation, p.flipped)
        .map(c => `${p.row+c.y},${p.col+c.x}`).sort();
      for (const cell of cells) {
        if (!available.has(cell) || occupied.has(cell)) return null;
        occupied.add(cell);
      }
      keys.set(p.piece, cells.join(';'));
    }
    return keys;
  }
  private board(cells: Map<number, string>): string {
    return [...cells].sort(([a], [b]) => a-b).map(([piece, cells]) => `${piece}:${cells}`).join('|');
  }
  get(input: CalendarSolveInput): CalendarSolveResult | null {
    const date = this.date(input);
    if (!date || !this.entries.some(e => e.date === date)) return null;
    const fixed = this.cells(input, input.fixed);
    if (!fixed) return null;
    const board = this.board(fixed);
    // Prefer a compatible completion over a correction for this exact board.
    let index = this.entries.findIndex(e => e.date === date && [...fixed].every(([piece, cells]) => e.cells.get(piece) === cells));
    const compatible = index >= 0;
    if (!compatible) index = this.entries.findIndex(e => e.date === date && e.board === board);
    if (index < 0) return null;
    const entry = this.entries.splice(index, 1)[0]!;
    this.entries.unshift(entry);
    return { status:'solved', compatible, nodes:0, solution:entry.solution.map(p => ({ ...p })) };
  }
  put(input: CalendarSolveInput, result: CalendarSolveResult): void {
    if (result.status !== 'solved' || result.solution.length !== CALENDAR_SOLVER_MODEL.pieces.length) return;
    const date = this.date(input), fixed = this.cells(input, input.fixed), cells = this.cells(input, result.solution);
    if (!date || !fixed || !cells) return;
    const board = this.board(fixed);
    this.entries = this.entries.filter(e => e.date !== date || e.board !== board);
    this.entries.unshift({ date, board, cells, solution:result.solution.map(p => ({ ...p })).sort((a,b) => a.piece-b.piece) });
    // At most 16 full solutions (160 placements), including alternate completions.
    this.entries.length = Math.min(16, this.entries.length);
  }
}
