import { startTetris } from './TetrisGame';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
void startTetris(canvas).catch(error => console.error(error));
