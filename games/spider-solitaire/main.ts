import { installGamepad } from '../gamepad/runtime';
installGamepad('spider-solitaire');
import { startSpiderSolitaire } from './game/SpiderSolitaireGame';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
void startSpiderSolitaire(canvas).catch(error => console.error(error));
