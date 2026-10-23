export type SudokuDifficulty = 'easy' | 'normal' | 'hard';
export type SudokuBoard = number[][];

export interface SudokuConfig {
  difficulty: SudokuDifficulty;
}

export interface SudokuSaveData {
  difficulty: SudokuDifficulty;
  puzzle: SudokuBoard;
  board: SudokuBoard;
  solution: SudokuBoard;
}

export const SUDOKU_SIZE = 9;
export const SUDOKU_BOX_SIZE = 3;

const DIFFICULTY_HOLES: Record<SudokuDifficulty, number> = {
  easy: 36,
  normal: 46,
  hard: 56,
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSudokuSaveData(value: unknown): value is SudokuSaveData {
  return isRecord(value)
    && (value.difficulty === 'easy' || value.difficulty === 'normal' || value.difficulty === 'hard')
    && isBoard(value.puzzle)
    && isBoard(value.board)
    && isBoard(value.solution);
}

export function emptySudokuBoard(): SudokuBoard {
  return Array.from({ length: SUDOKU_SIZE }, () => Array(SUDOKU_SIZE).fill(0));
}

export function cloneSudokuBoard(board: SudokuBoard): SudokuBoard {
  return board.map(row => row.slice());
}

export function sudokuBoardValue(board: SudokuBoard, row: number, col: number): number {
  return requiredNumberAt(requiredItemAt(board, row, 'Sudoku board rows'), col, 'Sudoku board cells');
}

export function setSudokuBoardValue(
  board: SudokuBoard,
  row: number,
  col: number,
  value: number,
): void {
  requiredItemAt(board, row, 'Sudoku board rows')[col] = value;
}

export function isSudokuValueAllowed(
  board: SudokuBoard,
  row: number,
  col: number,
  value: number,
): boolean {
  for (let index = 0; index < SUDOKU_SIZE; index++) {
    if (sudokuBoardValue(board, row, index) === value || sudokuBoardValue(board, index, col) === value) {
      return false;
    }
  }
  const boxRow = Math.floor(row / SUDOKU_BOX_SIZE) * SUDOKU_BOX_SIZE;
  const boxCol = Math.floor(col / SUDOKU_BOX_SIZE) * SUDOKU_BOX_SIZE;
  for (let currentRow = boxRow; currentRow < boxRow + SUDOKU_BOX_SIZE; currentRow++) {
    for (let currentCol = boxCol; currentCol < boxCol + SUDOKU_BOX_SIZE; currentCol++) {
      if (sudokuBoardValue(board, currentRow, currentCol) === value) return false;
    }
  }
  return true;
}

export function generateSudokuPuzzle(
  difficulty: SudokuDifficulty,
): { puzzle: SudokuBoard; solution: SudokuBoard } {
  const solution = emptySudokuBoard();
  fillBoard(solution);
  const puzzle = cloneSudokuBoard(solution);
  const cells = shuffle(Array.from({ length: SUDOKU_SIZE * SUDOKU_SIZE }, (_, index) => index));
  let removed = 0;

  for (const index of cells) {
    if (removed >= DIFFICULTY_HOLES[difficulty]) break;
    const row = Math.floor(index / SUDOKU_SIZE);
    const col = index % SUDOKU_SIZE;
    const backup = sudokuBoardValue(puzzle, row, col);
    setSudokuBoardValue(puzzle, row, col, 0);
    if (countSolutions(puzzle) === 1) removed++;
    else setSudokuBoardValue(puzzle, row, col, backup);
  }

  return { puzzle, solution };
}

function isBoard(value: unknown): value is SudokuBoard {
  return Array.isArray(value) && value.length === SUDOKU_SIZE
    && value.every(row => Array.isArray(row) && row.length === SUDOKU_SIZE
      && row.every(cell => Number.isSafeInteger(cell) && cell >= 0 && cell <= 9));
}

function shuffle<T>(items: readonly T[]): T[] {
  const output = items.slice();
  for (let index = output.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    const current = requiredItemAt(output, index, 'Sudoku shuffle items');
    output[index] = requiredItemAt(output, target, 'Sudoku shuffle items');
    output[target] = current;
  }
  return output;
}

function fillBoard(board: SudokuBoard): boolean {
  let bestRow = -1;
  let bestCol = -1;
  let bestCandidates: number[] = [];

  for (let row = 0; row < SUDOKU_SIZE; row++) {
    for (let col = 0; col < SUDOKU_SIZE; col++) {
      if (sudokuBoardValue(board, row, col) !== 0) continue;
      const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])
        .filter(value => isSudokuValueAllowed(board, row, col, value));
      if (bestRow === -1 || candidates.length < bestCandidates.length) {
        bestRow = row;
        bestCol = col;
        bestCandidates = candidates;
      }
    }
  }

  if (bestRow === -1) return true;
  for (const value of bestCandidates) {
    setSudokuBoardValue(board, bestRow, bestCol, value);
    if (fillBoard(board)) return true;
    setSudokuBoardValue(board, bestRow, bestCol, 0);
  }
  return false;
}

function countSolutions(board: SudokuBoard, limit = 2): number {
  let count = 0;
  const work = cloneSudokuBoard(board);

  const solve = (): boolean => {
    let bestRow = -1;
    let bestCol = -1;
    let bestCandidates: number[] = [];
    for (let row = 0; row < SUDOKU_SIZE; row++) {
      for (let col = 0; col < SUDOKU_SIZE; col++) {
        if (sudokuBoardValue(work, row, col) !== 0) continue;
        const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9]
          .filter(value => isSudokuValueAllowed(work, row, col, value));
        if (candidates.length === 0) return false;
        if (bestRow === -1 || candidates.length < bestCandidates.length) {
          bestRow = row;
          bestCol = col;
          bestCandidates = candidates;
        }
      }
    }

    if (bestRow === -1) {
      count++;
      return count >= limit;
    }
    for (const value of bestCandidates) {
      setSudokuBoardValue(work, bestRow, bestCol, value);
      if (solve()) return true;
      setSudokuBoardValue(work, bestRow, bestCol, 0);
    }
    return false;
  };

  solve();
  return count;
}
