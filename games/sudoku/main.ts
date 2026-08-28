import { startSudoku } from './SudokuGame';

const canvas = document.querySelector<HTMLCanvasElement>('[data-sudoku-game]');
if (canvas) void startSudoku(canvas).catch(error => console.error(error));
