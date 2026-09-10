import { HaiyueEngine } from '@haiyue/engine';
import { RangeGame } from './RangeGame';
import { verifyRange } from './verification';
import { MemorySaveBackend } from '@haiyue/engine/save';
const errors: string[] = [];
const publish = (value: object, status: string) => {
  const result = document.getElementById('result')!;
  result.dataset.status = status; result.textContent = JSON.stringify({ ...value, status, errors });
};
function fail(error: unknown): void {
  errors.push(String(error)); publish({}, 'failed');
  const status = document.getElementById('status')!; status.hidden = false; status.textContent = String(error);
  console.error(error);
}
async function main(): Promise<void> {
  const engine = new HaiyueEngine({ canvas: '#game-canvas', msaaSamples: 4, renderProfile: 'simple',
    clearColor: { r: 0.075, g: 0.12, b: 0.14, a: 1 }, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 2) });
  await engine.init();
  engine.device.addEventListener('uncapturederror', e => fail(e.error));
  const params = new URLSearchParams(location.search);
  const game = new RangeGame(engine, {
    ...(params.has('verify') ? { saveBackend: new MemorySaveBackend() } : {}),
    safeInsets: () => {
      const style = getComputedStyle(document.body);
      return { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
        bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
    },
    haptic: kind => { navigator.vibrate?.(kind === 'shot' ? 8 : 35); },
  });
  const suspend = () => { game.cancelInteraction(); void game.flushSave(); document.hidden ? engine.stop() : engine.run(); };
  const blur = () => game.cancelInteraction();
  const show = () => engine.run();
  const hide = (event: PageTransitionEvent) => {
    game.cancelInteraction(); engine.stop(); if (event.persisted) return;
    document.removeEventListener('visibilitychange', suspend); window.removeEventListener('blur', blur);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
    game.dispose(); engine.destroy();
  };
  document.addEventListener('visibilitychange', suspend); window.addEventListener('blur', blur);
  window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
  await game.init();
  document.getElementById('status')!.hidden = true;
  if (params.has('test')) Object.assign(window, { rangeGame: game });
  engine.run();
  if (params.has('verify')) publish(await verifyRange(game, engine.canvas!), errors.length ? 'failed' : 'passed');
}
void main().catch(fail);
