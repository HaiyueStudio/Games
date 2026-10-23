import { installGamepad } from '../../gamepad/runtime';
import { NeonCircuitGame } from '../game/NeonCircuitGame';
export * from '../game/NeonCircuitGame';

installGamepad('neon-circuit');

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
const game = new NeonCircuitGame(new URLSearchParams(location.search).get('track'));
async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
  if (!canvas) throw new Error('Missing game canvas');
  await game.init(canvas);
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.renderStatus = 'failed';
  document.body.dataset.renderError = message;
  document.body.dataset.phase = 'error';
  const output = document.querySelector<HTMLElement>('#result');
  if (output) { output.textContent = JSON.stringify({ status: 'failed', errors: [message] }); output.dataset.status = 'failed'; }
  game.showStartupError();
  console.error(error);
});

}
