export type MoveDirection = 'left' | 'right' | 'up' | 'down';
export type Game2048Phase = 'playing' | 'won' | 'lost';

export interface TileMovement {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export interface MoveResult {
  board: number[][];
  gained: number;
  movements: TileMovement[];
}

interface LineCoordinate {
  row: number;
  col: number;
}

function requiredItemAt<T>(items: readonly T[], index: number, label: string): T {
  const value = items[index];
  if (value === undefined) throw new RangeError(`${label} index ${index} is out of bounds.`);
  return value;
}

function requiredNumberAt(items: ArrayLike<number>, index: number, label: string): number {
  const value = items[index];
  if (value === undefined) throw new RangeError(`${label} index ${index} is out of bounds.`);
  return value;
}

export function createEmptyBoard(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

export function cloneBoard(board: readonly number[][]): number[][] {
  return board.map(row => row.slice());
}

export function boardValue(board: readonly number[][], row: number, col: number): number {
  return requiredNumberAt(requiredItemAt(board, row, '2048 board rows'), col, '2048 board cells');
}

export function setBoardValue(board: number[][], row: number, col: number, value: number): void {
  requiredItemAt(board, row, '2048 board rows')[col] = value;
}

export function boardsEqual(a: readonly number[][], b: readonly number[][]): boolean {
  return a.length === b.length && a.every((row, rowIndex) => {
    const other = requiredItemAt(b, rowIndex, '2048 comparison board rows');
    return row.length === other.length && row.every((value, colIndex) => value === boardValue(b, rowIndex, colIndex));
  });
}

export function calculateMove(board: readonly number[][], direction: MoveDirection): MoveResult {
  const rows = board.length;
  const cols = rows > 0 ? requiredItemAt(board, 0, '2048 board rows').length : 0;
  const next = createEmptyBoard(rows, cols);
  const movements: TileMovement[] = [];
  let gained = 0;

  for (const line of createMoveLines(rows, cols, direction)) {
    const values = line
      .map(coordinate => ({ ...coordinate, value: boardValue(board, coordinate.row, coordinate.col) }))
      .filter(item => item.value > 0);

    let targetIndex = 0;
    for (let index = 0; index < values.length; index++) {
      const current = requiredItemAt(values, index, '2048 line values');
      const nextValue = values[index + 1];
      const target = requiredItemAt(line, targetIndex, '2048 target line');

      if (nextValue && current.value === nextValue.value) {
        const merged = current.value * 2;
        setBoardValue(next, target.row, target.col, merged);
        gained += merged;
        movements.push({
          fromRow: nextValue.row,
          fromCol: nextValue.col,
          toRow: target.row,
          toCol: target.col,
        });
        index++;
      } else {
        setBoardValue(next, target.row, target.col, current.value);
        movements.push({
          fromRow: current.row,
          fromCol: current.col,
          toRow: target.row,
          toCol: target.col,
        });
      }
      targetIndex++;
    }
  }

  return { board: next, gained, movements };
}

export function canMove(board: readonly number[][]): boolean {
  const rows = board.length;
  const cols = rows > 0 ? requiredItemAt(board, 0, '2048 board rows').length : 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = boardValue(board, row, col);
      if (value === 0) return true;
      if (col + 1 < cols && value === boardValue(board, row, col + 1)) return true;
      if (row + 1 < rows && value === boardValue(board, row + 1, col)) return true;
    }
  }
  return false;
}

function createMoveLines(rows: number, cols: number, direction: MoveDirection): LineCoordinate[][] {
  const lines: LineCoordinate[][] = [];
  if (direction === 'left' || direction === 'right') {
    for (let row = 0; row < rows; row++) {
      const line: LineCoordinate[] = [];
      for (let col = 0; col < cols; col++) {
        line.push({ row, col: direction === 'left' ? col : cols - 1 - col });
      }
      lines.push(line);
    }
    return lines;
  }

  for (let col = 0; col < cols; col++) {
    const line: LineCoordinate[] = [];
    for (let row = 0; row < rows; row++) {
      line.push({ row: direction === 'up' ? row : rows - 1 - row, col });
    }
    lines.push(line);
  }
  return lines;
}
