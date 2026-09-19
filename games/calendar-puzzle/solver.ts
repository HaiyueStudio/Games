import { CALENDAR_BOARD_CELLS, CALENDAR_PIECES } from './model';

export interface CalendarPlacement { piece: number; row: number; col: number; rotation: number; flipped: boolean }
export interface CalendarSolveInput { month: number; day: number; weekday: number; fixed: CalendarPlacement[] }
export interface CalendarSolveResult { status: 'solved' | 'unsolvable' | 'limit' | 'invalid'; solution: CalendarPlacement[]; compatible: boolean; nodes: number }
export const CALENDAR_SOLVER_MODEL = { board: CALENDAR_BOARD_CELLS, pieces: CALENDAR_PIECES };

/** Exact cover (Algorithm X / dancing links). Self-contained so web/native workers share it. */
export function solveCalendarPuzzle(input: CalendarSolveInput, model: typeof CALENDAR_SOLVER_MODEL): CalendarSolveResult {
  const start = Date.now(); let nodes = 0, limited = false;
  const result = (status: CalendarSolveResult['status'], solution: CalendarPlacement[] = [], compatible = true): CalendarSolveResult => ({ status, solution, compatible, nodes });
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12 || !Number.isInteger(input.day) || input.day < 1 || input.day > 31 || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6 || !Array.isArray(input.fixed) || input.fixed.length > model.pieces.length) return result('invalid');
  const blocked = new Set([`m${input.month}`, `d${input.day}`, `w${input.weekday}`]);
  const cells = model.board.filter(c => !blocked.has(c.key));
  const index = new Map(cells.map((c, i) => [`${c.row},${c.col}`, i]));
  const candidates: Array<{ placement: CalendarPlacement; columns: number[]; key: string }> = [];
  const shape = (piece: number, rotation: number, flipped: boolean) => {
    let points = model.pieces[piece]!.cells.map(c => ({ x: flipped ? -c.x : c.x, y: c.y }));
    for (let r = 0; r < rotation; r++) points = points.map(c => ({ x: c.y, y: -c.x }));
    const minX = Math.min(...points.map(c => c.x)), minY = Math.min(...points.map(c => c.y));
    return points.map(c => ({ x: c.x - minX, y: c.y - minY })).sort((a, b) => a.y - b.y || a.x - b.x);
  };
  const key = (piece: number, ids: number[]) => `${piece}:${ids.slice().sort((a,b) => a-b).join(',')}`;
  const keys = new Map<string, number>();
  for (let piece = 0; piece < model.pieces.length; piece++) {
    const seen = new Set<string>();
    for (const flipped of [false, true]) for (let rotation = 0; rotation < 4; rotation++) {
      const points = shape(piece, rotation, flipped), signature = JSON.stringify(points);
      if (seen.has(signature)) continue; seen.add(signature);
      for (let row = 0; row < 8; row++) for (let col = 0; col < 7; col++) {
        const ids = points.map(c => index.get(`${row+c.y},${col+c.x}`));
        if (ids.some(i => i === undefined)) continue;
        const k = key(piece, ids as number[]);
        keys.set(k, candidates.length);
        candidates.push({ placement: { piece, row, col, rotation, flipped }, columns: [...ids as number[], cells.length + piece], key: k });
      }
    }
  }
  const fixedRows: number[] = [], occupied = new Set<number>(), fixedPieces = new Set<number>();
  for (const p of input.fixed) {
    if (!Number.isInteger(p.piece) || p.piece < 0 || p.piece >= model.pieces.length || !Number.isInteger(p.rotation) || p.rotation < 0 || p.rotation > 3 || typeof p.flipped !== 'boolean' || !Number.isInteger(p.row) || !Number.isInteger(p.col) || fixedPieces.has(p.piece)) return result('invalid');
    const ids = shape(p.piece, p.rotation, p.flipped).map(c => index.get(`${p.row+c.y},${p.col+c.x}`));
    if (ids.some(i => i === undefined || occupied.has(i))) return result('invalid');
    const row = keys.get(key(p.piece, ids as number[])); if (row === undefined) return result('invalid');
    ids.forEach(i => occupied.add(i!)); fixedPieces.add(p.piece); fixedRows.push(row);
  }
  function search(pinned: number[]): CalendarPlacement[] | null {
    const columns = cells.length + model.pieces.length;
    const size = columns + 1 + candidates.reduce((n, c) => n + c.columns.length, 0);
    const L = new Int32Array(size), R = new Int32Array(size), U = new Int32Array(size), D = new Int32Array(size), C = new Int32Array(size), S = new Int32Array(columns + 1), rowId = new Int32Array(size);
    const heads = new Int32Array(candidates.length);
    for (let c = 0; c <= columns; c++) { L[c] = c - 1; R[c] = c + 1; U[c] = D[c] = c; }
    L[0] = columns; R[columns] = 0;
    let next = columns + 1;
    candidates.forEach((candidate, row) => {
      const first = next; heads[row] = first;
      for (const column of candidate.columns) {
        const n = next++, c = column + 1;
        C[n] = c; rowId[n] = row; U[n] = U[c]!; D[n] = c; D[U[c]!] = n; U[c] = n; S[c] = S[c]! + 1;
        L[n] = n - 1; R[n] = n + 1;
      }
      L[first] = next - 1; R[next - 1] = first;
    });
    const cover = (c: number) => {
      R[L[c]!] = R[c]!; L[R[c]!] = L[c]!;
      for (let i = D[c]!; i !== c; i = D[i]!) for (let j = R[i]!; j !== i; j = R[j]!) {
        D[U[j]!] = D[j]!; U[D[j]!] = U[j]!; S[C[j]!] = S[C[j]!]! - 1;
      }
    };
    const uncover = (c: number) => {
      for (let i = U[c]!; i !== c; i = U[i]!) for (let j = L[i]!; j !== i; j = L[j]!) {
        S[C[j]!] = S[C[j]!]! + 1; D[U[j]!] = j; U[D[j]!] = j;
      }
      R[L[c]!] = c; L[R[c]!] = c;
    };
    const chosen = pinned.slice();
    for (const row of pinned) { const first = heads[row]!; let n = first; do { cover(C[n]!); n = R[n]!; } while (n !== first); }
    function visit(): boolean {
      if (++nodes % 256 === 0 && (nodes > 2_000_000 || Date.now() - start > 5000)) { limited = true; return false; }
      if (R[0] === 0) return true;
      let c = R[0]!; for (let j = R[c]!; j !== 0; j = R[j]!) if (S[j]! < S[c]!) c = j;
      if (S[c] === 0) return false;
      cover(c);
      for (let r = D[c]!; r !== c; r = D[r]!) {
        chosen.push(rowId[r]!);
        for (let j = R[r]!; j !== r; j = R[j]!) cover(C[j]!);
        if (visit()) return true;
        for (let j = L[r]!; j !== r; j = L[j]!) uncover(C[j]!);
        chosen.pop(); if (limited) break;
      }
      uncover(c); return false;
    }
    return visit() ? chosen.map(row => candidates[row]!.placement).sort((a,b) => a.piece - b.piece) : null;
  }
  const solution = search(fixedRows);
  if (solution) return result('solved', solution);
  if (limited) return result('limit');
  if (fixedRows.length) {
    const alternative = search([]);
    if (alternative) return result('solved', alternative, false);
  }
  return result(limited ? 'limit' : 'unsolvable');
}
