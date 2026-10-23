import { installGamepad } from '../../gamepad/runtime';
import { TriangleCalendarGame } from '../game/TriangleCalendarGame';
const disposeGamepad = installGamepad('triangle-calendar-puzzle');
const canvas = document.getElementById('puzzle-board');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Triangle Calendar requires #puzzle-board.');
const game = new TriangleCalendarGame(canvas);
window.addEventListener('pagehide', event => { if (!event.persisted) { disposeGamepad(); game.destroy(); } });
void game.init().catch(error => {
  game.destroy(); document.body.dataset.renderStatus = 'failed';
  const status = document.getElementById('load-status')!;
  status.hidden = false; status.textContent = `游戏加载失败：${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
