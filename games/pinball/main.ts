import { installGamepad } from '../gamepad/runtime';
installGamepad('pinball');
import { PinballGame } from './game/PinballGame';

const game = new PinballGame();
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
window.addEventListener('pagehide', event => { if (!event.persisted) game.dispose(); });
void game.init(canvas).then(async () => {
  const query = new URLSearchParams(location.search);
  if (query.has('verify') || query.has('gamepadVerify')) Object.defineProperty(window, '__pinball', { configurable: true, value: { snapshot: () => game.snapshot() } });
  if (new URLSearchParams(location.search).has('verify')) {
    const { verifyPinball } = await import('./verification/verification');
    await verifyPinball(game);
  }
}).catch(error => {
  console.error(error);
  const errorPanel = document.getElementById('boot-error')!;
  errorPanel.hidden = false; errorPanel.textContent = `暂时无法打开练习本：${String(error)}`;
  const result = document.getElementById('result')!;
  result.dataset.status = 'failed'; result.textContent = JSON.stringify({ status: 'failed', message: String(error) });
  game.dispose();
});
