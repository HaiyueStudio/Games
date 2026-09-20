import { LedSudokuGame } from './LedSudokuGame';
const game = new LedSudokuGame();
void game.init().catch(error => {
  game.stop();
  const busy = document.getElementById('busy');
  if (busy) { busy.hidden = false; busy.textContent = `无法启动 LED 数独：${error instanceof Error ? error.message : String(error)}。请使用支持 WebGPU 的浏览器，并通过 HTTP 服务打开。`; }
  console.error(error);
});
