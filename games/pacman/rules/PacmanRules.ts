export type Direction = 'up' | 'left' | 'down' | 'right';
export type GhostPersonality = 'blinky' | 'pinky' | 'inky' | 'clyde';

export interface GridPoint {
  readonly row: number;
  readonly column: number;
}

export interface ParsedMaze {
  readonly rows: number;
  readonly columns: number;
  readonly cells: readonly string[];
  readonly pacmanStart: GridPoint;
  readonly ghostStarts: Readonly<Record<GhostPersonality, GridPoint>>;
  readonly tunnelRows: ReadonlySet<number>;
  readonly pelletCount: number;
}

export interface GhostDirectionOptions {
  readonly maze: ParsedMaze;
  readonly position: GridPoint;
  readonly current: Direction;
  readonly target: GridPoint;
  readonly frightened?: boolean;
  readonly allowGate?: boolean;
}

export const PACMAN_MAZE_LAYOUT = Object.freeze([
  '#########################',
  '#o.........#.#.........o#',
  '#.###.####.#.#.####.###.#',
  '#.......................#',
  '#.###.#.#########.#.###.#',
  '#.....#.....#.....#.....#',
  '#####.#####.#.#####.#####',
  '    #.#           #.#    ',
  '#####.#.###---###.#.#####',
  '=    ...#B K I C#...    =',
  '#####.#.#########.#.#####',
  '    #.#           #.#    ',
  '#####.#.#########.#.#####',
  '#...........P...........#',
  '#.###.####.#.#.####.###.#',
  '#o..#......#.#......#..o#',
  '###.#.#.#########.#.#.###',
  '#.....#.....#.....#.....#',
  '#.#########.#.#########.#',
  '#.......................#',
  '#########################',
]);

export const DIRECTION_VECTORS: Readonly<Record<Direction, GridPoint>> = Object.freeze({
  up: Object.freeze({ row: -1, column: 0 }),
  left: Object.freeze({ row: 0, column: -1 }),
  down: Object.freeze({ row: 1, column: 0 }),
  right: Object.freeze({ row: 0, column: 1 }),
});

export const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>> = Object.freeze({
  up: 'down',
  left: 'right',
  down: 'up',
  right: 'left',
});

const GHOST_MARKERS: Readonly<Record<string, GhostPersonality>> = Object.freeze({
  B: 'blinky',
  K: 'pinky',
  I: 'inky',
  C: 'clyde',
});
const DIRECTION_PRIORITY: readonly Direction[] = ['up', 'left', 'down', 'right'];
const ALLOWED_CELLS = new Set('#.o -PBKIC='.split(''));

export function parseMaze(layout: readonly string[]): ParsedMaze {
  if (layout.length === 0) throw new Error('Pac-Man maze must contain at least one row.');
  const columns = layout[0]?.length ?? 0;
  if (columns === 0) throw new Error('Pac-Man maze rows must not be empty.');

  let pacmanStart: GridPoint | null = null;
  const ghostStarts = new Map<GhostPersonality, GridPoint>();
  const tunnelRows = new Set<number>();
  const cells: string[] = [];
  let pelletCount = 0;

  for (let row = 0; row < layout.length; row += 1) {
    const source = requiredRow(layout, row);
    if (source.length !== columns) {
      throw new Error(`Pac-Man maze row ${row} has width ${source.length}; expected ${columns}.`);
    }
    let normalized = '';
    for (let column = 0; column < columns; column += 1) {
      const cell = source.charAt(column);
      if (!ALLOWED_CELLS.has(cell)) {
        throw new Error(`Pac-Man maze contains unsupported cell ${JSON.stringify(cell)} at ${row},${column}.`);
      }
      if (cell === 'P') {
        if (pacmanStart) throw new Error('Pac-Man maze must contain exactly one player start.');
        pacmanStart = { row, column };
        normalized += ' ';
      } else if (GHOST_MARKERS[cell]) {
        const personality = GHOST_MARKERS[cell];
        if (personality && ghostStarts.has(personality)) {
          throw new Error(`Pac-Man maze contains duplicate ${personality} starts.`);
        }
        if (personality) ghostStarts.set(personality, { row, column });
        normalized += ' ';
      } else {
        normalized += cell === '=' ? ' ' : cell;
      }
      if (cell === '.' || cell === 'o') pelletCount += 1;
      if (cell === '=') tunnelRows.add(row);
    }
    cells.push(normalized);
  }

  if (!pacmanStart) throw new Error('Pac-Man maze is missing the player start.');
  const starts = {
    blinky: requiredGhostStart(ghostStarts, 'blinky'),
    pinky: requiredGhostStart(ghostStarts, 'pinky'),
    inky: requiredGhostStart(ghostStarts, 'inky'),
    clyde: requiredGhostStart(ghostStarts, 'clyde'),
  };
  if (pelletCount === 0) throw new Error('Pac-Man maze must contain at least one pellet.');

  return {
    rows: layout.length,
    columns,
    cells,
    pacmanStart,
    ghostStarts: starts,
    tunnelRows,
    pelletCount,
  };
}

export function cellAt(maze: ParsedMaze, row: number, column: number): string {
  const normalizedColumn = normalizeTunnelColumn(maze, row, column);
  if (row < 0 || row >= maze.rows || normalizedColumn < 0 || normalizedColumn >= maze.columns) return '#';
  return requiredRow(maze.cells, row).charAt(normalizedColumn) || '#';
}

export function isWalkable(
  maze: ParsedMaze,
  row: number,
  column: number,
  allowGate = false,
): boolean {
  const cell = cellAt(maze, row, column);
  return cell !== '#' && (allowGate || cell !== '-');
}

export function stepFrom(maze: ParsedMaze, point: GridPoint, direction: Direction): GridPoint {
  const vector = DIRECTION_VECTORS[direction];
  const row = point.row + vector.row;
  const column = normalizeTunnelColumn(maze, row, point.column + vector.column);
  return { row, column };
}

export function availableDirections(
  maze: ParsedMaze,
  point: GridPoint,
  allowGate = false,
): Direction[] {
  return DIRECTION_PRIORITY.filter(direction => {
    const next = stepFrom(maze, point, direction);
    return isWalkable(maze, next.row, next.column, allowGate);
  });
}

/** Deterministic arcade-style choice: no reverse at junctions and stable tie priority. */
export function chooseGhostDirection(options: GhostDirectionOptions): Direction {
  const available = availableDirections(options.maze, options.position, options.allowGate ?? true);
  if (available.length === 0) return OPPOSITE_DIRECTION[options.current];
  const reverse = OPPOSITE_DIRECTION[options.current];
  const candidates = available.length > 1
    ? available.filter(direction => direction !== reverse)
    : available;
  const usable = candidates.length > 0 ? candidates : available;

  let chosen = requiredDirection(usable, 0);
  let chosenDistance = squaredDistance(stepFrom(options.maze, options.position, chosen), options.target);
  for (let index = 1; index < usable.length; index += 1) {
    const direction = requiredDirection(usable, index);
    const distance = squaredDistance(stepFrom(options.maze, options.position, direction), options.target);
    const better = options.frightened ? distance > chosenDistance : distance < chosenDistance;
    if (better) {
      chosen = direction;
      chosenDistance = distance;
    }
  }
  return chosen;
}

export function ghostTarget(
  personality: GhostPersonality,
  ghost: GridPoint,
  pacman: GridPoint,
  pacmanDirection: Direction,
  blinky: GridPoint,
  scatter: boolean,
  maze: ParsedMaze,
): GridPoint {
  if (scatter) {
    const corners: Readonly<Record<GhostPersonality, GridPoint>> = {
      blinky: { row: 0, column: maze.columns - 1 },
      pinky: { row: 0, column: 0 },
      inky: { row: maze.rows - 1, column: maze.columns - 1 },
      clyde: { row: maze.rows - 1, column: 0 },
    };
    return corners[personality];
  }
  if (personality === 'blinky') return pacman;
  const ahead = offsetPoint(pacman, pacmanDirection, personality === 'pinky' ? 4 : 2);
  if (personality === 'pinky') return ahead;
  if (personality === 'inky') {
    return {
      row: ahead.row + (ahead.row - blinky.row),
      column: ahead.column + (ahead.column - blinky.column),
    };
  }
  return squaredDistance(ghost, pacman) > 64
    ? pacman
    : { row: maze.rows - 1, column: 0 };
}

export function normalizeTunnelColumn(maze: ParsedMaze, row: number, column: number): number {
  if (!maze.tunnelRows.has(row)) return column;
  if (column < 0) return maze.columns - 1;
  if (column >= maze.columns) return 0;
  return column;
}

function offsetPoint(point: GridPoint, direction: Direction, distance: number): GridPoint {
  const vector = DIRECTION_VECTORS[direction];
  return {
    row: point.row + vector.row * distance,
    column: point.column + vector.column * distance,
  };
}

function squaredDistance(first: GridPoint, second: GridPoint): number {
  const row = first.row - second.row;
  const column = first.column - second.column;
  return row * row + column * column;
}

function requiredRow(rows: readonly string[], index: number): string {
  const row = rows[index];
  if (row === undefined) throw new RangeError(`Missing Pac-Man maze row ${index}.`);
  return row;
}

function requiredDirection(directions: readonly Direction[], index: number): Direction {
  const direction = directions[index];
  if (!direction) throw new RangeError(`Missing Pac-Man direction ${index}.`);
  return direction;
}

function requiredGhostStart(
  starts: ReadonlyMap<GhostPersonality, GridPoint>,
  personality: GhostPersonality,
): GridPoint {
  const point = starts.get(personality);
  if (!point) throw new Error(`Pac-Man maze is missing the ${personality} start.`);
  return point;
}
