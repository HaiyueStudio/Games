import { World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GameEngine } from '../session/GameEngine';
import { installGamepad } from '../gamepad/runtime';
import { createScorer } from './rules/scorer';
import { CoachSystem } from './ai/coaching/CoachSystem';
import { WorkerAgent } from './ai/WorkerAgent';
import { MatchController } from './app/MatchController';
import { ModelHub } from './api/ModelHub';
import { MahjongHud } from './ui/MahjongHud';
import { httpAgent, AGENT_SYSTEM_PROMPT } from './api/agents';
import { runTournament } from './api/tournament';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import { isSavedGame, type SavedGame } from './rules/replay';
import { loadTileAtlas } from './ui/TileAtlas';
import { MahjongTable3D } from './rendering/MahjongTable3D';
import { loadUiArt, installUiBackdrop } from './ui/UiArt';
import { loadTableArt } from './rendering/TableSurface';

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const lifetime = new AbortController();
const engine = new GameEngine({ canvas, clearColor: { r: .047, g: .114, b: .094, a: 1 }, msaaSamples: 4, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 2) });
const world = new World('国标雀局');
const saves = new SingleSlotGameSave<SavedGame>({ gameId: 'guobiao-mahjong', name: '国标雀局自动存档', validateData: isSavedGame });
const worker = new WorkerAgent(new URL('./ai/mahjong.worker.js', location.href));
const disposePad = installGamepad('guobiao-mahjong');
let controller: MatchController | null = null, modelHub: ModelHub | null = null, coaching: CoachSystem | null = null, disposed = false;
function dispose(): void { if (disposed) return; disposed = true; lifetime.abort(); controller?.dispose(); modelHub?.dispose(); coaching?.dispose(); worker.dispose(); disposePad(); world.destroy(); engine.destroy(); delete (window as unknown as Record<string, unknown>).haiyueMahjong; }
window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { signal: lifetime.signal });
async function boot(): Promise<void> {
  const response = await fetch('./assets/mcr.wasm', { signal: lifetime.signal });
  if (!response.ok) throw new Error(`算番模块加载失败 HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const [scorer, , , atlas,tableArt,uiArt] = await Promise.all([createScorer(bytes), engine.init(), worker.init(bytes), loadTileAtlas(lifetime.signal),loadTableArt(lifetime.signal),loadUiArt(lifetime.signal)]);
  if (disposed) return;
  const query = new URLSearchParams(location.search);
  const game = controller = new MatchController(scorer, worker, Number(query.get('seed') ?? 20261105));
  let loadedSettings: SavedGame['browserModels'];
  if (!query.has('verify') && !query.has('seed')) { const saved = await saves.load(); if (saved) { try { await game.restore(saved); loadedSettings = saved.browserModels; } catch { game.status = '存档无法恢复，新比赛就绪'; } } }
  if (disposed) return;
  if (query.get('mode') === 'spectate') game.setHuman(null);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(game.exportReplay(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'haiyue-mahjong-replay.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const models = modelHub = new ModelHub(game);
  models.restoreConfiguration(loadedSettings);
  const save = (): SavedGame => ({ ...game.save(), browserModels: models.savedConfiguration() });
  let restoreSerial = 0;
  const restore = async (saved: SavedGame) => {
    if (!isSavedGame(saved)) throw new Error('无效的存档');
    const serial = ++restoreSerial;
    if (await game.restore(saved) && !disposed && serial === restoreSerial) models.restoreConfiguration(saved.browserModels);
  };
  installUiBackdrop(engine,world,uiArt);
  const coach = coaching = new CoachSystem(bytes);
  const table = new MahjongTable3D(engine, world, atlas,tableArt);
  const hud = new MahjongHud(engine, world, game, scorer, download, atlas, models, table, uiArt, coach);
  const integration = new RenderIntegration(engine, { label: 'MCR 3D table and Engine GUI' });
  world.addRuntimeIntegration(integration); integration.registerAll(world, () => ({ pass: 'shared' }));
  const resize = new ResizeObserver(() => engine.resizeToDisplaySize()); resize.observe(canvas); world.addRuntimeIntegration({ onDetach: () => resize.disconnect() });
  window.addEventListener('keydown', event => {
    if (event.repeat) return;
    if (hud.modalOpen) { if (event.code === 'Escape') hud.closeModal(); event.preventDefault(); return; }
    if (event.code === 'KeyP' || event.code === 'Space') { event.preventDefault(); if (!game.started) game.start(); else game.pause(); }
    if (event.code === 'KeyH') hud.openCoach();
  }, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(true); }, { signal: lifetime.signal });
  const api = Object.freeze({ protocol: 'haiyue.mcr/1', controller: game, modelHub: models, coach, httpAgent, runTournament: runTournament.bind(null, scorer), systemPrompt: AGENT_SYSTEM_PROMPT, fanCatalog: scorer.catalog, save, restore,
    snapshot: () => { const observation=game.observation(); return { observation, paused: game.paused, thinking: game.thinking, waitingMs: game.waitingMs, delayMs: game.delayMs, status: game.status, handAnalysis: game.handAnalysis, coaching: coach.snapshot(), presentation: hud.presentationSnapshot(observation), hud: hud.snapshot() }; }, dispose });
  Object.defineProperty(window, 'haiyueMahjong', { configurable: true, value: api });
  let savedRevision = '', saveClock = 0;
  engine.on('update', event => {
    table.tick(event.detail.delta, game.paused, hud.modalOpen || document.hidden);
    if (!table.animating) game.tick(event.detail.delta);
    hud.sync(); world.update(event.detail.time, event.detail.delta);
    saveClock += event.detail.delta;
    const revision = `${game.revision}:${game.viewRevision}:${models.configRevision}`;
    if (!query.has('verify') && saveClock > 1000 && savedRevision !== revision) { savedRevision = revision; saveClock = 0; saves.save(save()); }
  });
  engine.run(); document.body.dataset.renderStatus = 'ready';
}
void boot().catch(error => { if (disposed) return; const status = document.getElementById('status')!; status.hidden = false; status.textContent = `启动失败：${String(error)}`; document.body.dataset.renderStatus = 'failed'; console.error(error); dispose(); });
