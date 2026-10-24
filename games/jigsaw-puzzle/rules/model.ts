export interface Point { x: number; y: number }
export interface Piece { id: number; row: number; col: number; center: Point; edges: readonly [number, number, number, number] }
export interface Group extends Point { id: number; angle: number; pieces: number[]; order: number }
export interface Puzzle {
  rows: number; cols: number; width: number; height: number; cellWidth: number; cellHeight: number;
  allowRotation: boolean; pieces: Piece[]; groups: Group[]; moves: number;
}
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export const normalizeAngle = (angle: number): number => ((angle % 4) + 4) % 4;
export function rotate(point: Point, angle: number): Point {
  switch (normalizeAngle(angle)) {
    case 1: return { x: -point.y, y: point.x };
    case 2: return { x: -point.x, y: -point.y };
    case 3: return { x: point.y, y: -point.x };
    default: return { ...point };
  }
}
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function createPuzzle(rows: number, cols: number, aspect: number, allowRotation: boolean, seed: number): Puzzle {
  if (![rows, cols].every(n => Number.isInteger(n) && n >= 1 && n <= 12) || !Number.isFinite(aspect) || aspect <= 0) throw new Error('Invalid puzzle dimensions');
  const width = Math.min(600, 450 * aspect), height = width / aspect;
  const cellWidth = width / cols, cellHeight = height / rows, rng = random(seed);
  const pieces: Piece[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const id = row * cols + col;
    pieces.push({ id, row, col, center: { x: (col + .5) * cellWidth - width / 2, y: (row + .5) * cellHeight - height / 2 },
      edges: [row ? -pieces[id - cols]!.edges[2] : 0, col < cols - 1 ? (rng() < .5 ? -1 : 1) : 0,
        row < rows - 1 ? (rng() < .5 ? -1 : 1) : 0, col ? -pieces[id - 1]!.edges[1] : 0] });
  }
  const puzzle: Puzzle = { rows, cols, width, height, cellWidth, cellHeight, allowRotation, pieces, groups: [], moves: 0 };
  scatter(puzzle, seed ^ 0x7f4a7c15);
  return puzzle;
}
export function scatter(puzzle: Puzzle, seed: number): void {
  const rng = random(seed), ids = puzzle.pieces.map(p => p.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
  const columns = Math.ceil(Math.sqrt(ids.length * 1.55)), rows = Math.ceil(ids.length / columns);
  const extent = Math.max(puzzle.cellWidth, puzzle.cellHeight);
  const dx = Math.max(140, (puzzle.allowRotation ? extent : puzzle.cellWidth) * 1.6 + 12);
  const dy = Math.max(130, (puzzle.allowRotation ? extent : puzzle.cellHeight) * 1.6 + 12);
  puzzle.groups = ids.map((id, index) => {
    const angle = puzzle.allowRotation ? Math.floor(rng() * 4) : 0, center = rotate(puzzle.pieces[id]!.center, angle);
    return { id, pieces: [id], angle, order: index,
      x: (index % columns - (columns - 1) / 2) * dx + (rng() - .5) * 12 - center.x,
      y: (Math.floor(index / columns) - (rows - 1) / 2) * dy + (rng() - .5) * 12 - center.y };
  });
  puzzle.moves = 0;
}
export function pieceCenter(piece: Piece, group: Group): Point {
  const p = rotate(piece.center, group.angle); return { x: group.x + p.x, y: group.y + p.y };
}
export function groupCenter(puzzle: Puzzle, group: Group): Point {
  const centers = group.pieces.map(id => pieceCenter(puzzle.pieces[id]!, group));
  return { x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length, y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length };
}
/** Pack the current rigid groups from their local bounds, independent of previous positions. */
export function arrangeGroups(puzzle: Puzzle, aspect = 1.55): void {
  const padding = Math.min(puzzle.cellWidth, puzzle.cellHeight) * .3;
  const gap = Math.max(12, Math.min(puzzle.cellWidth, puzzle.cellHeight) * .14);
  const items = puzzle.groups.map(group => {
    const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const odd = group.angle % 2;
    const halfWidth = (odd ? puzzle.cellHeight : puzzle.cellWidth) / 2 + padding;
    const halfHeight = (odd ? puzzle.cellWidth : puzzle.cellHeight) / 2 + padding;
    for (const id of group.pieces) {
      const center = rotate(puzzle.pieces[id]!.center, group.angle);
      bounds.minX = Math.min(bounds.minX, center.x - halfWidth); bounds.maxX = Math.max(bounds.maxX, center.x + halfWidth);
      bounds.minY = Math.min(bounds.minY, center.y - halfHeight); bounds.maxY = Math.max(bounds.maxY, center.y + halfHeight);
    }
    return { group, bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY, x: 0, y: 0 };
  }).sort((a, b) => b.height - a.height || b.width - a.width || a.group.id - b.group.id);
  if (!items.length) return;
  const area = items.reduce((sum, item) => sum + (item.width + gap) * (item.height + gap), 0);
  const targetWidth = Math.max(...items.map(item => item.width), Math.sqrt(area * Math.max(.4, Math.min(2.5, aspect))));
  let x = 0, y = 0, rowHeight = 0, width = 0;
  for (const item of items) {
    if (x > 0 && x + item.width > targetWidth) { x = 0; y += rowHeight + gap; rowHeight = 0; }
    item.x = x; item.y = y;
    width = Math.max(width, x + item.width); rowHeight = Math.max(rowHeight, item.height); x += item.width + gap;
  }
  const height = y + rowHeight;
  for (const item of items) {
    item.group.x = item.x - width / 2 - item.bounds.minX;
    item.group.y = item.y - height / 2 - item.bounds.minY;
  }
}
export function rotateGroup(puzzle: Puzzle, group: Group, steps: number): boolean {
  if (!puzzle.allowRotation) return false;
  const pivot = groupCenter(puzzle, group), oldAngle = group.angle;
  const localPivot = rotate({ x: pivot.x - group.x, y: pivot.y - group.y }, -oldAngle);
  group.angle = normalizeAngle(oldAngle + steps);
  const next = rotate(localPivot, group.angle);
  group.x = pivot.x - next.x; group.y = pivot.y - next.y;
  puzzle.moves++;
  return true;
}
function adjacent(puzzle: Puzzle, a: Group, b: Group): boolean {
  return a.pieces.some(i => b.pieces.some(j => {
    const p = puzzle.pieces[i]!, q = puzzle.pieces[j]!;
    return Math.abs(p.row - q.row) + Math.abs(p.col - q.col) === 1;
  }));
}
/** All members share one rigid transform in solved-image coordinates. */
export function snapGroup(puzzle: Puzzle, moving: Group, tolerance: number): number {
  let merged = 0;
  for (;;) {
    const target = puzzle.groups.filter(g => g !== moving && g.angle === moving.angle && adjacent(puzzle, moving, g)
      && Math.hypot(g.x - moving.x, g.y - moving.y) <= tolerance)
      .sort((a, b) => Math.hypot(a.x - moving.x, a.y - moving.y) - Math.hypot(b.x - moving.x, b.y - moving.y))[0];
    if (!target) break;
    moving.x = target.x; moving.y = target.y;
    moving.pieces.push(...target.pieces); merged += target.pieces.length;
    puzzle.groups.splice(puzzle.groups.indexOf(target), 1);
  }
  // The faint image frame is an optional alignment aid, not a lock on assembled groups.
  if (moving.angle === 0 && Math.hypot(moving.x, moving.y) <= tolerance) { moving.x = 0; moving.y = 0; }
  return merged;
}
export function puzzleBounds(puzzle: Puzzle): Bounds {
  const bounds = { minX: -puzzle.width / 2, maxX: puzzle.width / 2, minY: -puzzle.height / 2, maxY: puzzle.height / 2 };
  for (const group of puzzle.groups) for (const id of group.pieces) {
    const p = pieceCenter(puzzle.pieces[id]!, group), odd = group.angle % 2;
    const w = (odd ? puzzle.cellHeight : puzzle.cellWidth) / 2 + Math.min(puzzle.cellWidth, puzzle.cellHeight) * .3;
    const h = (odd ? puzzle.cellWidth : puzzle.cellHeight) / 2 + Math.min(puzzle.cellWidth, puzzle.cellHeight) * .3;
    bounds.minX = Math.min(bounds.minX, p.x - w); bounds.maxX = Math.max(bounds.maxX, p.x + w);
    bounds.minY = Math.min(bounds.minY, p.y - h); bounds.maxY = Math.max(bounds.maxY, p.y + h);
  }
  return bounds;
}
