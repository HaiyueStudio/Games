import { CALENDAR_BOARD_CELLS, CALENDAR_PIECES } from './model';

export interface CalendarPlacement { piece: number; row: number; col: number; rotation: number; flipped: boolean }
export interface CalendarSolveInput { month: number; day: number; weekday: number; fixed: CalendarPlacement[] }
export interface CalendarSolveResult { status: 'solved' | 'unsolvable' | 'limit' | 'invalid'; solution: CalendarPlacement[]; compatible: boolean; nodes: number }
export const CALENDAR_SOLVER_MODEL = { board: CALENDAR_BOARD_CELLS, pieces: CALENDAR_PIECES };

/** Exact cover (Algorithm X / dancing links). Self-contained so web/native workers share it. */
export function solveCalendarPuzzle(input: CalendarSolveInput, model: typeof CALENDAR_SOLVER_MODEL): CalendarSolveResult {
  let nodes = 0, limited = false;
  const result = (status: CalendarSolveResult['status'], solution: CalendarPlacement[] = [], compatible = true): CalendarSolveResult => ({ status, solution, compatible, nodes });
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12 || !Number.isInteger(input.day) || input.day < 1 || input.day > 31 || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6 || !Array.isArray(input.fixed) || input.fixed.length > model.pieces.length) return result('invalid');
  const blocked = new Set([`m${input.month}`, `d${input.day}`, `w${input.weekday}`]);
  const cells = model.board.filter(c => !blocked.has(c.key));
  const index = new Map(cells.map((c, i) => [`${c.row},${c.col}`, i]));
  const grid = new Int16Array(8 * 7).fill(-1);
  cells.forEach((c, i) => { grid[c.row * 7 + c.col] = i; });
  const candidates: Array<{ placement: CalendarPlacement; columns: number[]; low: number; high: number }> = [];
  const shape = (piece: number, rotation: number, flipped: boolean) => {
    let points = model.pieces[piece]!.cells.map(c => ({ x: flipped ? -c.x : c.x, y: c.y }));
    for (let r = 0; r < rotation; r++) points = points.map(c => ({ x: c.y, y: -c.x }));
    const minX = Math.min(...points.map(c => c.x)), minY = Math.min(...points.map(c => c.y));
    return points.map(c => ({ x: c.x - minX, y: c.y - minY })).sort((a, b) => a.y - b.y || a.x - b.x);
  };
  const key = (piece: number, ids: number[]) => `${piece}:${ids.slice().sort((a,b) => a-b).join(',')}`;
  const keys = new Map<string, number>();
  const pinnedPieces = new Set(input.fixed.map(p => p.piece));
  for (let piece = 0; piece < model.pieces.length; piece++) {
    const seen = new Set<string>();
    for (const flipped of [false, true]) for (let rotation = 0; rotation < 4; rotation++) {
      const points = shape(piece, rotation, flipped), signature = JSON.stringify(points);
      if (seen.has(signature)) continue; seen.add(signature);
      const width = 1 + Math.max(...points.map(p => p.x)), height = 1 + Math.max(...points.map(p => p.y));
      for (let row = 0; row <= 8 - height; row++) for (let col = 0; col <= 7 - width; col++) {
        const ids: number[] = [];
        let low = 0, high = 0;
        for (const point of points) {
          const id = grid[(row + point.y) * 7 + col + point.x]!;
          if (id < 0) break;
          ids.push(id);
          if (id < 32) low |= 1 << id; else high |= 1 << (id - 32);
        }
        if (ids.length !== points.length) continue;
        if (pinnedPieces.has(piece)) keys.set(key(piece, ids), candidates.length);
        ids.push(cells.length + piece);
        candidates.push({ placement: { piece, row, col, rotation, flipped }, columns: ids, low, high });
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
  // Each remaining piece is connected: disconnected holes must each be tiled
  // independently. The calendar set has balanced tetrominoes and pentominoes
  // with checkerboard imbalance ±1. Guard this specialization for future sets.
  const connected = (points: Array<{ x: number; y: number }>) => {
    const reached = new Set([0]);
    for (const i of reached) points.forEach((p, j) => {
      if (Math.abs(p.x - points[i]!.x) + Math.abs(p.y - points[i]!.y) === 1) reached.add(j);
    });
    return reached.size === points.length;
  };
  const compact = cells.length <= 64 && model.pieces.length <= 10;
  const regionChecks = compact && model.pieces.every(p => connected(p.cells)
    && (p.cells.length === 4 || p.cells.length === 5)
    && Math.abs(p.cells.reduce((n, c) => n + ((c.x + c.y) % 2 === 0 ? 1 : -1), 0)) === p.cells.length % 2);
  const states = compact ? 1 << model.pieces.length : 1;
  const fours = new Uint8Array(states), fives = new Uint8Array(states);
  for (let mask = 1; mask < states; mask++) {
    const bit = mask & -mask, piece = 31 - Math.clz32(bit), rest = mask ^ bit;
    fours[mask] = fours[rest]! + (model.pieces[piece]!.cells.length === 4 ? 1 : 0);
    fives[mask] = fives[rest]! + (model.pieces[piece]!.cells.length === 5 ? 1 : 0);
  }
  const neighborsLow = new Int32Array(cells.length), neighborsHigh = new Int32Array(cells.length);
  const color = new Int8Array(cells.length), queue = new Uint8Array(cells.length);
  cells.forEach((cell, i) => {
    color[i] = (cell.row + cell.col) % 2 === 0 ? 1 : -1;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const j = index.get(`${cell.row + dr!},${cell.col + dc!}`);
      if (j !== undefined) { if (j < 32) neighborsLow[i] = neighborsLow[i]! | (1 << j); else neighborsHigh[i] = neighborsHigh[i]! | (1 << (j - 32)); }
    }
  });
  const fullLow = cells.length >= 32 ? -1 : (2 ** cells.length - 1) | 0;
  const fullHigh = cells.length > 32 ? (2 ** (cells.length - 32) - 1) | 0 : 0;
  const feasibleRegions = (low: number, high: number, remaining: number): boolean => {
    let freeLow = fullLow & ~low, freeHigh = fullHigh & ~high, totals = 1;
    const n4 = fours[remaining]!, n5 = fives[remaining]!;
    while (freeLow || freeHigh) {
      let head = 0, tail = 1, area = 0, imbalance = 0;
      if (freeLow) { const bit = freeLow & -freeLow; queue[0] = 31 - Math.clz32(bit); freeLow ^= bit; }
      else { const bit = freeHigh & -freeHigh; queue[0] = 63 - Math.clz32(bit); freeHigh ^= bit; }
      while (head < tail) {
        const i = queue[head++]!; area++; imbalance += color[i]!;
        let a = neighborsLow[i]! & freeLow, b = neighborsHigh[i]! & freeHigh;
        freeLow &= ~a; freeHigh &= ~b;
        while (a) { const bit = a & -a; queue[tail++] = 31 - Math.clz32(bit); a ^= bit; }
        while (b) { const bit = b & -b; queue[tail++] = 63 - Math.clz32(bit); b ^= bit; }
      }
      // Combine component allocations, so separate holes cannot both claim
      // the same remaining pieces. Area fixes the tetromino count as well.
      let nextTotals = 0;
      for (let n = Math.abs(imbalance); n <= n5 && 5 * n <= area; n++) {
        const rest = area - 5 * n;
        if (rest % 4 === 0 && rest / 4 <= n4) nextTotals |= totals << n;
      }
      totals = nextTotals & ((1 << (n5 + 1)) - 1);
      if (!totals) return false;
    }
    return (totals & (1 << n5)) !== 0;
  };
  // A state records all uncovered columns, independent of placement order.
  // Share proven dead ends with the fallback search, but never retain a timeout.
  const dead = new Set<string>();
  function search(pinned: number[], budgetMs: number, nodeBudget: number): CalendarPlacement[] | null {
    const start = Date.now(), firstNode = nodes;
    limited = false;
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
    let pinnedLow = 0, pinnedHigh = 0, remaining = states - 1;
    for (const row of pinned) {
      const candidate = candidates[row]!;
      pinnedLow |= candidate.low; pinnedHigh |= candidate.high; remaining &= ~(1 << candidate.placement.piece);
    }
    function visit(low: number, high: number, remaining: number): boolean {
      if (++nodes % 256 === 0 && (nodes - firstNode > nodeBudget || Date.now() - start > budgetMs)) { limited = true; return false; }
      if (R[0] === 0) return true;
      let c = R[0]!; for (let j = R[c]!; j !== 0; j = R[j]!) if (S[j]! < S[c]!) c = j;
      if (S[c] === 0) return false;
      const state = compact && chosen.length >= 3 ? `${remaining}:${low}:${high}` : '';
      if (state && dead.has(state)) return false;
      if (regionChecks && chosen.length && !feasibleRegions(low, high, remaining)) return false;
      cover(c);
      for (let r = D[c]!; r !== c; r = D[r]!) {
        chosen.push(rowId[r]!);
        for (let j = R[r]!; j !== r; j = R[j]!) cover(C[j]!);
        const candidate = candidates[rowId[r]!]!;
        if (visit(low | candidate.low, high | candidate.high, remaining & ~(1 << candidate.placement.piece))) return true;
        for (let j = L[r]!; j !== r; j = L[j]!) uncover(C[j]!);
        chosen.pop(); if (limited) break;
      }
      uncover(c);
      if (!limited && state && dead.size < 20_000) dead.add(state);
      return false;
    }
    return visit(pinnedLow, pinnedHigh, remaining) ? chosen.map(row => candidates[row]!.placement).sort((a,b) => a.piece - b.piece) : null;
  }
  const solution = search(fixedRows, fixedRows.length ? 1200 : 5000, fixedRows.length ? 400_000 : 2_000_000);
  if (solution) return result('solved', solution);
  if (fixedRows.length) {
    // A difficult partial board must not consume the budget for a fresh
    // full-date solution. It can still provide a useful correction hint.
    const alternative = search([], 5000, 2_000_000);
    if (alternative) return result('solved', alternative, false);
  }
  return result(limited ? 'limit' : 'unsolvable');
}
