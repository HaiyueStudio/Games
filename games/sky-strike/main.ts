import { SkyStrikeAudio } from './audio/SkyStrikeAudio';
import { SkyStrikeBrowserAudio } from './audio/browser';
import { browserSkyStrikeLocale } from './i18n';
import { HaiyueEngine, World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { SkyStrikeGame } from './SkyStrikeGame';
import { SkyStrikeBattleLayer, loadSkySprites } from './battleLayer';
import { SkyStrikeGuiHud } from './guiHud';

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
  const engine = new HaiyueEngine({ canvas, clearColor: { r: 0.004, g: 0.004, b: 0.016, a: 1 }, msaaSamples: 4, devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2) });
  await engine.init();
  const world = new World('Sky Strike');
  const battle = new SkyStrikeBattleLayer(engine, await loadSkySprites()); world.addSystem(battle);
  const locale = browserSkyStrikeLocale();
  const ui = new SkyStrikeGuiHud(world, id => battle.guiImage(id), undefined, locale);
  const audioBackend = new SkyStrikeBrowserAudio(); await audioBackend.load();
  let settingsStorage: Storage | undefined; try { settingsStorage=globalThis.localStorage; } catch { /* Private browsing can deny persistence. */ }
  const audio = new SkyStrikeAudio(audioBackend, settingsStorage);
  const game = new SkyStrikeGame(canvas, battle, engine, world, { ui, locale, audio,
    acceptsGameplayInput: (_x,y) => y >= 94 && y <= canvas.getBoundingClientRect().height - 94,
  });
  await game.init();
  const renderIntegration = new RenderIntegration(engine, { label: 'SkyStrike.gui' });
  world.addRuntimeIntegration(renderIntegration); renderIntegration.registerAll(world);
  document.body.dataset.renderStatus = 'passed';
  const update = ({ detail: { time, delta } }: { detail: { time: number; delta: number } }) => { game.update(delta); world.update(time, delta); };
  engine.on('update', update);
  const visibility = () => { if (document.hidden) game.suspend(); };
  const pageShow = (event: PageTransitionEvent) => { if (event.persisted) engine.run(); };
  const pageHide = (event: PageTransitionEvent) => {
    if (event.persisted) { game.suspend(); engine.stop(); return; }
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
    game.dispose(); engine.off('update', update); world.destroy(); engine.destroy();
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow);
  engine.run();
}
main().catch(error => {
  document.body.dataset.renderStatus = 'failed';
  document.body.dataset.renderError = error instanceof Error ? error.message : String(error);
  console.error(error);
});
