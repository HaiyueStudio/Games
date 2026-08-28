import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cloneSudokuBoard,
  emptySudokuBoard,
  isSudokuSaveData,
  isSudokuValueAllowed,
  setSudokuBoardValue,
  sudokuBoardValue,
} from '../sudoku/rules.ts';

test('Sudoku board helpers clone state without sharing rows', () => {
  const board = emptySudokuBoard();
  setSudokuBoardValue(board, 0, 0, 5);
  const cloned = cloneSudokuBoard(board);
  setSudokuBoardValue(cloned, 0, 0, 7);
  assert.equal(sudokuBoardValue(board, 0, 0), 5);
  assert.equal(sudokuBoardValue(cloned, 0, 0), 7);
});

test('Sudoku rules reject row, column, and box conflicts', () => {
  const board = emptySudokuBoard();
  setSudokuBoardValue(board, 0, 0, 5);
  assert.equal(isSudokuValueAllowed(board, 0, 4, 5), false);
  assert.equal(isSudokuValueAllowed(board, 4, 0, 5), false);
  assert.equal(isSudokuValueAllowed(board, 1, 1, 5), false);
  assert.equal(isSudokuValueAllowed(board, 4, 4, 5), true);
});

test('Sudoku save validation requires three complete boards', () => {
  const board = emptySudokuBoard();
  const valid = { difficulty: 'normal', puzzle: board, board, solution: board };
  assert.equal(isSudokuSaveData(valid), true);
  assert.equal(isSudokuSaveData({ ...valid, difficulty: 'expert' }), false);
  assert.equal(isSudokuSaveData({ ...valid, board: [[0]] }), false);
});
