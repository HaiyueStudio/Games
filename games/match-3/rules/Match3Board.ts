export const MATCH3_ROWS = 8;
export const MATCH3_COLUMNS = 8;
export const MATCH3_KIND_COUNT = 6;

export type GemKind = 0 | 1 | 2 | 3 | 4 | 5;
export type GemGrid = Array<Array<GemKind | null>>;

export interface GridPosition {
  readonly row: number;
  readonly column: number;
}

const INITIAL_BOARD_ATTEMPTS = 128;

/** Creates a match-free board with at least one legal adjacent swap. */
export function createPlayableGemGrid(random: () => number = Math.random): GemGrid {
  for (let attempt = 0; attempt < INITIAL_BOARD_ATTEMPTS; attempt++) {
    const grid = emptyGemGrid();
    for (let row = 0; row < MATCH3_ROWS; row++) {
      for (let column = 0; column < MATCH3_COLUMNS; column++) {
        setGem(grid, row, column, chooseInitialKind(grid, row, column, random));
      }
    }
    if (hasLegalGemSwap(grid)) return grid;
  }
  throw new Error('Unable to generate a playable match-3 board.');
}

export function findGemMatches(grid: GemGrid): Set<number> {
  const matches = new Set<number>();

  for (let row = 0; row < MATCH3_ROWS; row++) {
    let column = 0;
    while (column < MATCH3_COLUMNS) {
      const kind = getGem(grid, row, column);
      if (kind === null) {
        column++;
        continue;
      }
      let end = column + 1;
      while (end < MATCH3_COLUMNS && getGem(grid, row, end) === kind) end++;
      if (end - column >= 3) {
        for (let matchedColumn = column; matchedColumn < end; matchedColumn++) {
          matches.add(gridIndex(row, matchedColumn));
        }
      }
      column = end;
    }
  }

  for (let column = 0; column < MATCH3_COLUMNS; column++) {
    let row = 0;
    while (row < MATCH3_ROWS) {
      const kind = getGem(grid, row, column);
      if (kind === null) {
        row++;
        continue;
      }
      let end = row + 1;
      while (end < MATCH3_ROWS && getGem(grid, end, column) === kind) end++;
      if (end - row >= 3) {
        for (let matchedRow = row; matchedRow < end; matchedRow++) {
          matches.add(gridIndex(matchedRow, column));
        }
      }
      row = end;
    }
  }

  return matches;
}

export function hasLegalGemSwap(grid: GemGrid): boolean {
  return findLegalGemSwap(grid) !== null;
}

export function findLegalGemSwap(
  grid: GemGrid,
): readonly [GridPosition, GridPosition] | null {
  if (findGemMatches(grid).size > 0) return null;
  for (let row = 0; row < MATCH3_ROWS; row++) {
    for (let column = 0; column < MATCH3_COLUMNS; column++) {
      if (column + 1 < MATCH3_COLUMNS && swapCreatesMatch(grid, row, column, row, column + 1)) {
        return [{ row, column }, { row, column: column + 1 }];
      }
      if (row + 1 < MATCH3_ROWS && swapCreatesMatch(grid, row, column, row + 1, column)) {
        return [{ row, column }, { row: row + 1, column }];
      }
    }
  }
  return null;
}

export function decodeGridIndex(index: number): GridPosition {
  return {
    row: Math.floor(index / MATCH3_COLUMNS),
    column: index % MATCH3_COLUMNS,
  };
}

export function gridIndex(row: number, column: number): number {
  return row * MATCH3_COLUMNS + column;
}

export function getGem(grid: GemGrid, row: number, column: number): GemKind | null {
  return grid[row]?.[column] ?? null;
}

export function setGem(
  grid: GemGrid,
  row: number,
  column: number,
  kind: GemKind | null,
): void {
  const line = grid[row];
  if (!line || column < 0 || column >= MATCH3_COLUMNS) {
    throw new RangeError(`Invalid match-3 cell (${row}, ${column}).`);
  }
  line[column] = kind;
}

function emptyGemGrid(): GemGrid {
  return Array.from(
    { length: MATCH3_ROWS },
    () => Array<GemKind | null>(MATCH3_COLUMNS).fill(null),
  );
}

function chooseInitialKind(
  grid: GemGrid,
  row: number,
  column: number,
  random: () => number,
): GemKind {
  const candidates = Array.from({ length: MATCH3_KIND_COUNT }, (_, kind) => kind as GemKind);
  shuffle(candidates, random);
  for (const candidate of candidates) {
    const horizontalMatch = column >= 2
      && getGem(grid, row, column - 1) === candidate
      && getGem(grid, row, column - 2) === candidate;
    const verticalMatch = row >= 2
      && getGem(grid, row - 1, column) === candidate
      && getGem(grid, row - 2, column) === candidate;
    if (!horizontalMatch && !verticalMatch) return candidate;
  }
  return 0;
}

function swapCreatesMatch(
  grid: GemGrid,
  firstRow: number,
  firstColumn: number,
  secondRow: number,
  secondColumn: number,
): boolean {
  const first = getGem(grid, firstRow, firstColumn);
  const second = getGem(grid, secondRow, secondColumn);
  if (first === null || second === null || first === second) return false;
  setGem(grid, firstRow, firstColumn, second);
  setGem(grid, secondRow, secondColumn, first);
  const createsMatch = findGemMatches(grid).size > 0;
  setGem(grid, firstRow, firstColumn, first);
  setGem(grid, secondRow, secondColumn, second);
  return createsMatch;
}

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.min(index, Math.floor(random() * (index + 1)));
    const value = values[index];
    values[index] = values[swapIndex]!;
    values[swapIndex] = value!;
  }
}
