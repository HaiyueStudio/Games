import { installGamepad } from '../gamepad/runtime';
installGamepad('2048');
import { start2048 } from './game/Game2048';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
void start2048(canvas).then(game => {
  if (new URLSearchParams(location.search).get('verify') === '1') {
    (window as unknown as { __forge2048: ReturnType<typeof game.verification> }).__forge2048 = game.verification();
  }
  document.body.dataset.renderStatus = 'passed';
}).catch(error => { document.body.dataset.renderStatus = 'failed'; console.error(error); });
