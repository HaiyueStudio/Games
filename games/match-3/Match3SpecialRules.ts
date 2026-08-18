import type { GemKind, GridPosition } from './Match3Board';

export type TileSpecial = 'normal' | 'bomb' | 'rainbow' | 'super-bomb';

export interface SpecialCell {
  readonly color: GemKind | null;
  readonly special: TileSpecial;
}

export type SpecialGrid = Array<Array<SpecialCell | null>>;

export interface SpecialSpawn {
  readonly position: GridPosition;
  readonly special: Exclude<TileSpecial, 'normal'>;
  readonly color: GemKind | null;
  readonly matchedCellCount: number;
}

export interface MatchClearPlan {
  readonly matchedCellCount: number;
  readonly clear: Set<number>;
  readonly spawns: readonly SpecialSpawn[];
}

export type SpecialSwapKind =
  | 'rainbow-color'
  | 'rainbow-bomb'
  | 'rainbow-super-bomb'
  | 'rainbow-rainbow';

export interface SpecialConversion {
  readonly indexes: Set<number>;
  readonly special: 'bomb' | 'super-bomb';
}

export interface SpecialSwapPlan {
  readonly kind: SpecialSwapKind;
  readonly clear: Set<number>;
  readonly conversion: SpecialConversion | null;
  readonly targetColor: GemKind | null;
  readonly activatedRainbows: readonly GridPosition[];
}

interface MatchRun {
  readonly color: GemKind;
  readonly orientation: 'horizontal' | 'vertical';
  readonly cells: readonly number[];
}

interface MatchGroup {
  readonly color: GemKind;
  readonly runs: readonly MatchRun[];
  readonly cells: Set<number>;
}

const ROWS = 8;
const COLUMNS = 8;

/** Plans normal matches and the special tile retained by each match group. */
export function planMatchedClear(
  grid: SpecialGrid,
  preferredSpawns: readonly GridPosition[] = [],
): MatchClearPlan {
  const groups = groupRuns(findMatchRuns(grid));
  const clear = new Set<number>();
  const spawns: SpecialSpawn[] = [];
  let matchedCellCount = 0;

  for (const group of groups) {
    matchedCellCount += group.cells.size;
    for (const index of group.cells) clear.add(index);
    const spawnSpecial = specialForGroup(group);
    if (!spawnSpecial) continue;
    const spawnIndex = chooseSpawnIndex(grid, group, preferredSpawns);
    if (spawnIndex === null) continue;
    clear.delete(spawnIndex);
    spawns.push({
      position: decodeIndex(spawnIndex),
      special: spawnSpecial,
      color: spawnSpecial === 'rainbow' ? null : group.color,
      matchedCellCount: group.cells.size,
    });
  }

  return { matchedCellCount, clear, spawns };
}

/** Expands a clear set through bomb and super-bomb chain reactions.
 * Rainbow tiles are blast-proof and are only consumed by a swap that activates them.
 */
export function expandTriggeredSpecials(grid: SpecialGrid, initialClear: ReadonlySet<number>): Set<number> {
  const clear = new Set<number>();
  const queue: number[] = [];
  for (const index of initialClear) addClearIndex(grid, clear, queue, index);

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = requiredItem(queue, cursor, 'special clear queue');
    const cell = cellAtIndex(grid, index);
    if (!cell) continue;
    const radius = cell.special === 'bomb' ? 1 : cell.special === 'super-bomb' ? 2 : 0;
    if (radius === 0) continue;
    const center = decodeIndex(index);
    addRadius(grid, clear, queue, center, radius);
  }
  return clear;
}

/** Handles every swap whose behavior is defined by a rainbow tile. */
export function planSpecialSwap(
  grid: SpecialGrid,
  first: GridPosition,
  second: GridPosition,
): SpecialSwapPlan | null {
  const firstCell = getCell(grid, first.row, first.column);
  const secondCell = getCell(grid, second.row, second.column);
  if (!firstCell || !secondCell) return null;
  const firstRainbow = firstCell.special === 'rainbow';
  const secondRainbow = secondCell.special === 'rainbow';
  if (!firstRainbow && !secondRainbow) return null;

  const rainbowPosition = firstRainbow ? first : second;
  const otherCell = firstRainbow ? secondCell : firstCell;
  const rainbowIndex = gridIndex(rainbowPosition.row, rainbowPosition.column);

  if (firstRainbow && secondRainbow) {
    const clear = new Set<number>();
    const activatedRainbows = new Set([gridIndex(first.row, first.column), gridIndex(second.row, second.column)]);
    forEachCell(grid, (cell, index) => {
      if (cell.special !== 'rainbow' || activatedRainbows.has(index)) clear.add(index);
    });
    return {
      kind: 'rainbow-rainbow',
      clear,
      conversion: null,
      targetColor: null,
      activatedRainbows: [first, second],
    };
  }

  if (otherCell.color === null) return null;
  const colorTargets = indexesForColor(grid, otherCell.color);
  const clear = new Set<number>([rainbowIndex]);

  if (otherCell.special === 'bomb' || otherCell.special === 'super-bomb') {
    const convertedSpecial = otherCell.special;
    const blastRadius = convertedSpecial === 'super-bomb' ? 2 : 1;
    const conversionIndexes = new Set<number>();
    for (const index of colorTargets) {
      conversionIndexes.add(index);
      const position = decodeIndex(index);
      addRadius(grid, clear, [], position, blastRadius);
    }
    return {
      kind: convertedSpecial === 'super-bomb' ? 'rainbow-super-bomb' : 'rainbow-bomb',
      clear: includeActivatedRainbow(expandTriggeredSpecials(grid, clear), rainbowIndex),
      conversion: { indexes: conversionIndexes, special: convertedSpecial },
      targetColor: otherCell.color,
      activatedRainbows: [rainbowPosition],
    };
  }

  for (const index of colorTargets) clear.add(index);
  return {
    kind: 'rainbow-color',
    clear: includeActivatedRainbow(expandTriggeredSpecials(grid, clear), rainbowIndex),
    conversion: null,
    targetColor: otherCell.color,
    activatedRainbows: [rainbowPosition],
  };
}

export function countSpecialTiles(grid: SpecialGrid): Record<Exclude<TileSpecial, 'normal'>, number> {
  const counts = { bomb: 0, rainbow: 0, 'super-bomb': 0 };
  forEachCell(grid, cell => {
    if (cell.special !== 'normal') counts[cell.special]++;
  });
  return counts;
}

export function findRainbowSwap(grid: SpecialGrid): readonly [GridPosition, GridPosition] | null {
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      if (getCell(grid, row, column)?.special !== 'rainbow') continue;
      const neighbor = column + 1 < COLUMNS
        ? { row, column: column + 1 }
        : column > 0
          ? { row, column: column - 1 }
          : row + 1 < ROWS
            ? { row: row + 1, column }
            : row > 0
              ? { row: row - 1, column }
              : null;
      if (neighbor && getCell(grid, neighbor.row, neighbor.column)) return [{ row, column }, neighbor];
    }
  }
  return null;
}

function findMatchRuns(grid: SpecialGrid): MatchRun[] {
  const runs: MatchRun[] = [];
  for (let row = 0; row < ROWS; row++) {
    let column = 0;
    while (column < COLUMNS) {
      const color = matchColor(getCell(grid, row, column));
      if (color === null) {
        column++;
        continue;
      }
      let end = column + 1;
      while (end < COLUMNS && matchColor(getCell(grid, row, end)) === color) end++;
      if (end - column >= 3) {
        runs.push({
          color,
          orientation: 'horizontal',
          cells: Array.from({ length: end - column }, (_, offset) => gridIndex(row, column + offset)),
        });
      }
      column = end;
    }
  }

  for (let column = 0; column < COLUMNS; column++) {
    let row = 0;
    while (row < ROWS) {
      const color = matchColor(getCell(grid, row, column));
      if (color === null) {
        row++;
        continue;
      }
      let end = row + 1;
      while (end < ROWS && matchColor(getCell(grid, end, column)) === color) end++;
      if (end - row >= 3) {
        runs.push({
          color,
          orientation: 'vertical',
          cells: Array.from({ length: end - row }, (_, offset) => gridIndex(row + offset, column)),
        });
      }
      row = end;
    }
  }
  return runs;
}

function groupRuns(runs: readonly MatchRun[]): MatchGroup[] {
  const parents = runs.map((_, index) => index);
  const ownerByCell = new Map<number, number>();
  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const run = requiredItem(runs, runIndex, 'match runs');
    for (const cell of run.cells) {
      const owner = ownerByCell.get(cell);
      if (owner === undefined) ownerByCell.set(cell, runIndex);
      else union(parents, runIndex, owner);
    }
  }

  const grouped = new Map<number, MatchRun[]>();
  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const root = findRoot(parents, runIndex);
    const group = grouped.get(root) ?? [];
    group.push(requiredItem(runs, runIndex, 'match runs'));
    grouped.set(root, group);
  }

  return [...grouped.values()].map(groupRuns => ({
    color: requiredItem(groupRuns, 0, 'grouped match runs').color,
    runs: groupRuns,
    cells: new Set(groupRuns.flatMap(run => run.cells)),
  }));
}

function specialForGroup(group: MatchGroup): SpecialSpawn['special'] | null {
  const orientations = new Set(group.runs.map(run => run.orientation));
  if (orientations.size > 1 && group.cells.size >= 5) return 'super-bomb';
  const longestRun = Math.max(...group.runs.map(run => run.cells.length));
  if (longestRun >= 5) return 'rainbow';
  if (longestRun >= 4) return 'bomb';
  return null;
}

function chooseSpawnIndex(
  grid: SpecialGrid,
  group: MatchGroup,
  preferred: readonly GridPosition[],
): number | null {
  for (const position of preferred) {
    const index = gridIndex(position.row, position.column);
    if (group.cells.has(index) && cellAtIndex(grid, index)?.special === 'normal') return index;
  }

  if (new Set(group.runs.map(run => run.orientation)).size > 1) {
    const horizontal = group.runs.filter(run => run.orientation === 'horizontal');
    const verticalCells = new Set(group.runs
      .filter(run => run.orientation === 'vertical')
      .flatMap(run => run.cells));
    for (const run of horizontal) {
      const intersection = run.cells.find(index => verticalCells.has(index)
        && cellAtIndex(grid, index)?.special === 'normal');
      if (intersection !== undefined) return intersection;
    }
  }

  const longest = [...group.runs].sort((a, b) => b.cells.length - a.cells.length)[0];
  if (!longest) throw new Error('Cannot choose a special spawn without a match run.');
  const normalCells = longest.cells.filter(index => cellAtIndex(grid, index)?.special === 'normal');
  if (normalCells.length === 0) return null;
  return requiredItem(normalCells, Math.floor((normalCells.length - 1) / 2), 'special spawn run');
}

function indexesForColor(grid: SpecialGrid, color: GemKind): number[] {
  const indexes: number[] = [];
  forEachCell(grid, (cell, index) => {
    if (cell.color === color) indexes.push(index);
  });
  return indexes;
}

function addRadius(
  grid: SpecialGrid,
  clear: Set<number>,
  queue: number[],
  center: GridPosition,
  radius: number,
): void {
  for (let row = center.row - radius; row <= center.row + radius; row++) {
    for (let column = center.column - radius; column <= center.column + radius; column++) {
      if (row < 0 || row >= ROWS || column < 0 || column >= COLUMNS) continue;
      addClearIndex(grid, clear, queue, gridIndex(row, column));
    }
  }
}

function addClearIndex(grid: SpecialGrid, clear: Set<number>, queue: number[], index: number): void {
  const cell = cellAtIndex(grid, index);
  if (!cell || cell.special === 'rainbow' || clear.has(index)) return;
  clear.add(index);
  queue.push(index);
}

function includeActivatedRainbow(clear: Set<number>, rainbowIndex: number): Set<number> {
  clear.add(rainbowIndex);
  return clear;
}

function forEachCell(grid: SpecialGrid, visit: (cell: SpecialCell, index: number) => void): void {
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const cell = getCell(grid, row, column);
      if (cell) visit(cell, gridIndex(row, column));
    }
  }
}

function matchColor(cell: SpecialCell | null): GemKind | null {
  return cell?.special === 'rainbow' ? null : cell?.color ?? null;
}

function getCell(grid: SpecialGrid, row: number, column: number): SpecialCell | null {
  return grid[row]?.[column] ?? null;
}

function cellAtIndex(grid: SpecialGrid, index: number): SpecialCell | null {
  const position = decodeIndex(index);
  return getCell(grid, position.row, position.column);
}

function gridIndex(row: number, column: number): number {
  return row * COLUMNS + column;
}

function decodeIndex(index: number): GridPosition {
  return { row: Math.floor(index / COLUMNS), column: index % COLUMNS };
}

function findRoot(parents: number[], index: number): number {
  const parent = requiredItem(parents, index, 'match group parents');
  if (parent === index) return index;
  const root = findRoot(parents, parent);
  parents[index] = root;
  return root;
}

function union(parents: number[], first: number, second: number): void {
  const firstRoot = findRoot(parents, first);
  const secondRoot = findRoot(parents, second);
  if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot;
}

function requiredItem<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} is missing index ${index}.`);
  return value;
}
