import { PinballGame } from './PinballGame';

const game = new PinballGame();
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
window.addEventListener('pagehide', event => { if (!event.persisted) game.dispose(); });
void game.init(canvas).then(async () => {
  if (new URLSearchParams(location.search).has('verify')) {
    const { verifyPinball } = await import('./verification');
    await verifyPinball(game);
  }
}).catch(error => {
  console.error(error);
  document.getElementById('banner')!.hidden = false;
  document.getElementById('banner-title')!.textContent = '暂时无法打开练习本';
  document.getElementById('banner-detail')!.textContent = `请使用支持 WebGPU 的浏览器，并检查素材是否加载成功。${String(error)}`;
  const result = document.getElementById('result')!;
  result.dataset.status = 'failed'; result.textContent = JSON.stringify({ status: 'failed', message: String(error) });
  game.dispose();
});
