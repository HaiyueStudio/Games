import { start2048 } from './Game2048';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
void start2048(canvas).catch(error => console.error(error));
