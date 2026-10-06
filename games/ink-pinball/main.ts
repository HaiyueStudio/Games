import { InkPinballGame } from './InkPinballGame';

const game = new InkPinballGame();
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
window.addEventListener('pagehide', event => { if (!event.persisted) game.dispose(); });
void game.init(canvas).then(async () => {
  if (new URLSearchParams(location.search).has('verify')) {
    const { verifyInkPinball } = await import('./verification');
    await verifyInkPinball(game);
  }
}).catch(error => {
  console.error(error);
  document.getElementById('banner')!.hidden = false;
  document.getElementById('banner-title')!.textContent = '暂时无法展开画卷';
  document.getElementById('banner-detail')!.textContent = `请使用支持 WebGPU 的浏览器，并检查素材是否加载成功。${String(error)}`;
  const result = document.getElementById('result')!;
  result.dataset.status = 'failed'; result.textContent = JSON.stringify({ status: 'failed', message: String(error) });
  game.dispose();
});
