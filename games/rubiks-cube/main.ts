import { HaiyueEngine } from '@haiyue/engine';
import { MemorySaveBackend } from '@haiyue/engine/save';
import { CubeGame } from './CubeGame';
import { KINDS, type Kind } from './model';
import { verifyCube } from './verification';
const errors: string[] = [];
function publish(result: unknown, status: string): void {
  const output = document.getElementById('result')!;
  output.dataset.status = status;
  output.textContent = JSON.stringify(result);
  document.body.dataset.renderStatus = status;
}
function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  errors.push(message);
  publish({ status: 'failed', errors }, 'failed');
  const status = document.getElementById('status')!;
  status.hidden = false;
  status.textContent = `WebGPU 错误：${message}`;
  console.error(error);
}
async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
  const engine = new HaiyueEngine({
    canvas,
    clearColor: { r: 0.022, g: 0.037, b: 0.063, a: 1 },
    msaaSamples: 4,
    renderProfile: 'simple',
    devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2),
  });
  await engine.init();
  engine.device.addEventListener('uncapturederror', (event) => fail(event.error));
  const params = new URLSearchParams(location.search);
  const game = new CubeGame(engine, params.has('verify') ? { saveBackend: new MemorySaveBackend() } : {});
  await game.init();
  if (params.has('test')) Object.assign(window, { cubeGame: game });
  let frames = 0;
  engine.on('after-update', () => {
    if (++frames === 12 && !params.has('verify') && !errors.length)
      publish(
        { schemaVersion: 1, suite: 'rubiks-cube-game', status: 'passed', ...game.snapshot() },
        'passed',
      );
  });
  const suspend = () => {
    game.cancelInteraction();
    void game.flushSave();
    if (document.hidden) engine.stop();
    else engine.run();
  };
  const show = () => engine.run();
  const hide = (event: PageTransitionEvent) => {
    game.cancelInteraction();
    engine.stop();
    if (event.persisted) return;
    document.removeEventListener('visibilitychange', suspend);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    game.dispose();
    engine.destroy();
  };
  document.addEventListener('visibilitychange', suspend);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  engine.run();
  if (params.has('verify')) {
    const requested = params.get('kind') as Kind;
    const result = await verifyCube(game, canvas, KINDS.includes(requested) ? requested : '4');
    await engine.device.queue.onSubmittedWorkDone();
    if (!errors.length) publish(result, 'passed');
  }
}
main().catch(fail);
