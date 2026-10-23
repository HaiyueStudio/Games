export type MazeDirection = 'north' | 'east' | 'south' | 'west';

export interface MazeCell {
  readonly row: number;
  readonly column: number;
}

export interface MazeLayout {
  readonly rows: number;
  readonly columns: number;
  readonly seed: number;
  readonly start: MazeCell;
  readonly goal: MazeCell;
  readonly walls: Uint8Array;
  readonly holes: readonly MazeCell[];
  readonly solution: readonly MazeCell[];
}

export interface MazeFloorSegment {
  readonly row: number;
  readonly startColumn: number;
  readonly endColumn: number;
}

export const MAZE_ROWS = 9;
export const MAZE_COLUMNS = 9;
export const DEFAULT_MAZE_SEED = 0x47_4d_41_5a;

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const ALL_WALLS = NORTH | EAST | SOUTH | WEST;

const DIRECTIONS: readonly {
  readonly name: MazeDirection;
  readonly row: number;
  readonly column: number;
  readonly wall: number;
  readonly opposite: number;
}[] = Object.freeze([
  { name: 'north', row: -1, column: 0, wall: NORTH, opposite: SOUTH },
  { name: 'east', row: 0, column: 1, wall: EAST, opposite: WEST },
  { name: 'south', row: 1, column: 0, wall: SOUTH, opposite: NORTH },
  { name: 'west', row: 0, column: -1, wall: WEST, opposite: EAST },
]);

/** Generates a perfect maze with optional hazards that never occupy the shortest solution path. */
export function generateMaze(
  seed = DEFAULT_MAZE_SEED,
  rows = MAZE_ROWS,
  columns = MAZE_COLUMNS,
): MazeLayout {
  rows = dimension(rows, 'rows');
  columns = dimension(columns, 'columns');
  const normalizedSeed = seed >>> 0;
  const random = mulberry32(normalizedSeed);
  const walls = new Uint8Array(rows * columns);
  walls.fill(ALL_WALLS);
  const visited = new Uint8Array(rows * columns);
  const stack: MazeCell[] = [{ row: 0, column: 0 }];
  visited[0] = 1;

  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const candidates = DIRECTIONS.filter(direction => {
      const row = current.row + direction.row;
      const column = current.column + direction.column;
      return contains(rows, columns, row, column) && visited[indexOf(columns, row, column)] === 0;
    });
    if (candidates.length === 0) {
      stack.pop();
      continue;
    }
    const direction = candidates[Math.floor(random() * candidates.length)]!;
    const next = { row: current.row + direction.row, column: current.column + direction.column };
    const currentIndex = indexOf(columns, current.row, current.column);
    const nextIndex = indexOf(columns, next.row, next.column);
    walls[currentIndex] = (walls[currentIndex] ?? ALL_WALLS) & ~direction.wall;
    walls[nextIndex] = (walls[nextIndex] ?? ALL_WALLS) & ~direction.opposite;
    visited[nextIndex] = 1;
    stack.push(next);
  }

  const start = Object.freeze({ row: 0, column: 0 });
  const { goal, parents } = farthestCell(rows, columns, walls, start);
  const solution = Object.freeze(reconstructPath(columns, parents, goal));
  const solutionKeys = new Set(solution.map(cellKey));
  const desiredHoleCount = Math.min(4, Math.max(2, Math.floor(rows * columns / 36) + 1));
  const offPath = allCells(rows, columns).filter(cell => !solutionKeys.has(cellKey(cell)));
  const deadEnds = offPath.filter(cell => openNeighborsRaw(rows, columns, walls, cell).length === 1);
  shuffle(deadEnds, random);
  shuffle(offPath, random);
  const holes: MazeCell[] = [];
  for (const cell of [...deadEnds, ...offPath]) {
    if (holes.some(existing => sameCell(existing, cell))) continue;
    holes.push(Object.freeze({ ...cell }));
    if (holes.length >= desiredHoleCount) break;
  }

  return Object.freeze({
    rows,
    columns,
    seed: normalizedSeed,
    start,
    goal: Object.freeze(goal),
    walls,
    holes: Object.freeze(holes),
    solution,
  });
}

export function hasWall(layout: MazeLayout, cell: MazeCell, direction: MazeDirection): boolean {
  if (!contains(layout.rows, layout.columns, cell.row, cell.column)) return true;
  const definition = DIRECTIONS.find(candidate => candidate.name === direction);
  if (!definition) throw new RangeError(`Unknown maze direction: ${direction}.`);
  return ((layout.walls[indexOf(layout.columns, cell.row, cell.column)] ?? ALL_WALLS) & definition.wall) !== 0;
}

export function openNeighbors(layout: MazeLayout, cell: MazeCell): readonly MazeCell[] {
  return openNeighborsRaw(layout.rows, layout.columns, layout.walls, cell);
}

export function isHole(layout: MazeLayout, cell: MazeCell): boolean {
  return layout.holes.some(hole => sameCell(hole, cell));
}

/** Groups supported cells into wide row slabs so physics never depends on per-tile seams. */
export function floorSegments(layout: MazeLayout): readonly MazeFloorSegment[] {
  const segments: MazeFloorSegment[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    let startColumn: number | null = null;
    for (let column = 0; column <= layout.columns; column += 1) {
      const supported = column < layout.columns && !isHole(layout, { row, column });
      if (supported && startColumn === null) startColumn = column;
      if (!supported && startColumn !== null) {
        segments.push(Object.freeze({ row, startColumn, endColumn: column - 1 }));
        startColumn = null;
      }
    }
  }
  return Object.freeze(segments);
}

export function nextLevelSeed(baseSeed: number, level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('Maze level must be a positive integer.');
  let value = (baseSeed ^ Math.imul(level, 0x9e37_79b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0_aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a_2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function farthestCell(
  rows: number,
  columns: number,
  walls: Uint8Array,
  start: MazeCell,
): { goal: MazeCell; parents: Int32Array } {
  const parents = new Int32Array(rows * columns);
  parents.fill(-2);
  const distances = new Int32Array(rows * columns);
  distances.fill(-1);
  const startIndex = indexOf(columns, start.row, start.column);
  parents[startIndex] = -1;
  distances[startIndex] = 0;
  const queue: MazeCell[] = [{ ...start }];
  let goal = { ...start };
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const currentIndex = indexOf(columns, current.row, current.column);
    if ((distances[currentIndex] ?? -1) > (distances[indexOf(columns, goal.row, goal.column)] ?? -1)) {
      goal = current;
    }
    for (const next of openNeighborsRaw(rows, columns, walls, current)) {
      const nextIndex = indexOf(columns, next.row, next.column);
      if (distances[nextIndex] !== -1) continue;
      distances[nextIndex] = (distances[currentIndex] ?? 0) + 1;
      parents[nextIndex] = currentIndex;
      queue.push(next);
    }
  }
  return { goal, parents };
}

function reconstructPath(columns: number, parents: Int32Array, goal: MazeCell): MazeCell[] {
  const reversed: MazeCell[] = [];
  let cursor = indexOf(columns, goal.row, goal.column);
  while (cursor >= 0) {
    reversed.push({ row: Math.floor(cursor / columns), column: cursor % columns });
    cursor = parents[cursor] ?? -1;
  }
  reversed.reverse();
  return reversed.map(cell => Object.freeze(cell));
}

function openNeighborsRaw(rows: number, columns: number, walls: Uint8Array, cell: MazeCell): MazeCell[] {
  if (!contains(rows, columns, cell.row, cell.column)) return [];
  const bits = walls[indexOf(columns, cell.row, cell.column)] ?? ALL_WALLS;
  const neighbors: MazeCell[] = [];
  for (const direction of DIRECTIONS) {
    const row = cell.row + direction.row;
    const column = cell.column + direction.column;
    if ((bits & direction.wall) === 0 && contains(rows, columns, row, column)) neighbors.push({ row, column });
  }
  return neighbors;
}

function allCells(rows: number, columns: number): MazeCell[] {
  const cells: MazeCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) cells.push({ row, column });
  }
  return cells;
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other]!, items[index]!];
  }
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b_79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function dimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 4 || value > 24) {
    throw new RangeError(`Maze ${label} must be an integer between 4 and 24.`);
  }
  return value;
}

function contains(rows: number, columns: number, row: number, column: number): boolean {
  return row >= 0 && row < rows && column >= 0 && column < columns;
}

function indexOf(columns: number, row: number, column: number): number { return row * columns + column; }
function cellKey(cell: MazeCell): string { return `${cell.row},${cell.column}`; }
function sameCell(a: MazeCell, b: MazeCell): boolean { return a.row === b.row && a.column === b.column; }
