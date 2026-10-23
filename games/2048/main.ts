import { installGamepad } from '../gamepad/runtime';
installGamepad('2048');
import { start2048 } from './game/Game2048';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
void start2048(canvas).catch(error => console.error(error));
