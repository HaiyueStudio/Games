import { startSpiderSolitaire } from './SpiderSolitaireGame';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
void startSpiderSolitaire(canvas).catch(error => console.error(error));
