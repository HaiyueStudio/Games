import { installGamepad } from '../../gamepad/runtime';
import { JigsawGame } from '../game/JigsawGame';
const disposeGamepad = installGamepad('jigsaw-puzzle');
const game = new JigsawGame(document.getElementById('puzzle-board') as HTMLCanvasElement, document.getElementById('image-upload') as HTMLInputElement);
window.addEventListener('pagehide', event => { if (!event.persisted) { disposeGamepad(); game.destroy(); } });
void game.init().catch(error => {
  game.destroy(); disposeGamepad(); document.body.dataset.renderStatus = 'failed';
  const status = document.getElementById('load-status')!;
  status.hidden = false; status.textContent = `游戏加载失败：${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
