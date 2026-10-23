import { installGamepad } from '../../gamepad/runtime';
import { FruitGame } from '../game/FruitGame';
const disposeGamepad = installGamepad('fruit-ninja');
const game = new FruitGame(document.getElementById('fruit-board') as HTMLCanvasElement);
window.addEventListener('pagehide', event => { if (!event.persisted) { disposeGamepad(); game.destroy(); } });
void game.init().catch(error => {
  game.destroy(); disposeGamepad(); document.body.dataset.renderStatus = 'failed';
  const status = document.getElementById('load-status')!; status.hidden = false; status.textContent = `游戏加载失败：${String(error)}`; console.error(error);
});
