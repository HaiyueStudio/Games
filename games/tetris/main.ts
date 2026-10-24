import { installGamepad } from '../gamepad/runtime';
installGamepad('tetris');
import { startTetris } from './game/TetrisGame';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
void startTetris(canvas).catch(error => { document.body.dataset.renderStatus = 'failed'; console.error(error); });
