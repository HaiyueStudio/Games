import { HaiyueEngine, World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { MemorySaveBackend } from '@haiyue/engine/save';
import { SkyStrikeGame } from '../../../sky-strike/SkyStrikeGame';
import { SkyStrikeBattleLayer, loadSkySprites } from '../../../sky-strike/battleLayer';
import { SkyStrikeGuiHud } from '../../../sky-strike/guiHud';
import { ENEMY_DEFINITIONS } from '../../../sky-strike/rules';
import { loadSkyStrikeLevels } from '../../../sky-strike/levels/loader';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const check = (value: boolean, message: string) => { if (!value) throw new Error(message); };
const result = document.querySelector<HTMLElement>('#result')!;
async function run() {
  const canvas = document.querySelector('canvas')!;
  const engine = new HaiyueEngine({ canvas, msaaSamples: 4, devicePixelRatio: () => 1 }); await engine.init();
  const world = new World('Sky native browser verification');
  const battle = new SkyStrikeBattleLayer(engine, await loadSkySprites('../../../sky-strike/')); world.addSystem(battle);
  const hud = new SkyStrikeGuiHud(world, id => battle.guiImage(id));
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  const levels = await loadSkyStrikeLevels(async source => (await fetch(`../../../sky-strike/${source}`)).json());
  const game = new SkyStrikeGame(canvas, battle, engine, world, { ui: hud, levels, keyboard: false, saveBackend: new MemorySaveBackend() });
  await game.init();
  const integration = new RenderIntegration(engine); world.addRuntimeIntegration(integration); integration.registerAll(world);
  let frames = 0;
  const update = ({ detail: { time, delta } }: { detail: { time: number; delta: number } }) => {
    game.update(16); world.update(frames * 16, 16); frames++;
  };
  engine.on('update', update); engine.run(); await wait(500);
  const scene = new URLSearchParams(location.search).get('scene');
  const send = (type: string, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, button: 0 }));
  const panelHeight = Math.min(720, Math.max(280, innerHeight - 36));
  const panelWidth = Math.min(410, innerWidth - 24), panelLeft = (innerWidth - panelWidth) / 2;
  const arrowSize = Math.max(48, Math.min(64, panelWidth * 0.16));
  const arrowY = (innerHeight - panelHeight) / 2 + panelHeight * 0.36;
  const click = async (x: number,y: number) => { send('pointerdown',x,y); await wait(40); send('pointerup',x,y); await wait(80); };
  await click(panelLeft + panelWidth - 4 - arrowSize / 2, arrowY);
  check(game.snapshot().selectedLevel === 1, 'skinned next button');
  await click(panelLeft + 4 + arrowSize / 2, arrowY);
  check(game.snapshot().selectedLevel === 0, 'skinned previous button');
  if (scene === 'menu') {
    engine.stop(); result.textContent = JSON.stringify({ status:'passed', checks:['engine-gui-menu','skinned-next','skinned-previous'], state:game.snapshot() }); result.dataset.status='passed'; return;
  }

  const startY = (innerHeight - panelHeight) / 2 + panelHeight * 0.91;
  send('pointerdown', innerWidth / 2, startY); send('pointerup', innerWidth / 2, startY); await wait(150);
  check(game.snapshot().phase === 'playing', 'GUI start');
  if (scene === 'pause') {
    await click(innerWidth / 2 + Math.min(innerWidth, innerHeight / 2) / 2 - 60, innerHeight - 36);
    check(game.snapshot().phase === 'paused', 'skinned pause dialog');
    engine.stop(); result.textContent=JSON.stringify({status:'passed',checks:['pause-dialog'],state:game.snapshot()}); result.dataset.status='passed'; return;
  }
  if (scene) {
    // Test-only scene injection exercises procedural boss devices without adding product debug APIs.
    const fixture = game as unknown as { spawnEnemy(d: typeof ENEMY_DEFINITIONS[number]): void; enemies: { y: number; entered: boolean; laserCooldownMs: number }[]; player: { invulnerableMs: number }; levelTimeline: unknown[]; addImpact(x: number,y: number,s: number): void; addLaserImpact(x: number,y: number,s: number): void };
    fixture.player.invulnerableMs = 999999; fixture.levelTimeline = [];
    if (scene.startsWith('boss:')) {
      const definition = ENEMY_DEFINITIONS.find(d => d.id === scene.slice(5)); check(!!definition, 'known boss'); fixture.spawnEnemy(definition!);
      for (const enemy of fixture.enemies) { enemy.y = Math.max(130, enemy.y + 380); enemy.entered = true; enemy.laserCooldownMs = 100; }
    }
    const targetFrame = frames + 100;
    while (frames < targetFrame) await wait(10);
    fixture.addImpact(140,430,100); fixture.addLaserImpact(310,510,70);
    const effectFrame = frames + 8;
    while (frames < effectFrame) await wait(10);
    engine.stop();
    await engine.device.queue.onSubmittedWorkDone(); await wait(100);
    if (scene.startsWith('boss:')) check(game.snapshot().enemies > 0, 'boss remains visible');
    check(game.snapshot().rendering.drawCalls > 0, 'GPU draws'); check(game.snapshot().rendering.pendingUploadBytes === 0, 'static uploads completed');
    result.textContent = JSON.stringify({ status:'passed', checks:['combat-render',scene,'static-atlas'], state:game.snapshot() }); result.dataset.status='passed'; return;
  }
  const y = innerHeight * 0.72;
  send('pointerdown', innerWidth * 0.1, y); await wait(80); const left = game.snapshot();
  send('pointermove', innerWidth * 0.9, y); await wait(80); const right = game.snapshot();
  check(right.player.x > left.player.x, 'fighter moves right');
  if (innerWidth / innerHeight < 0.5) check(right.viewport.cameraX > left.viewport.cameraX, 'narrow camera follows proportionally');
  else check(right.viewport.cameraX === 0 && right.viewport.left >= 0, 'wide camera remains fixed');
  send('pointercancel', innerWidth * 0.9, y); await wait(80); check(!game.snapshot().firing, 'cancel stops firing');
  game.suspend(); await wait(80); check(game.snapshot().phase === 'paused', 'background pauses');
  // Resume through the actual HUD button.
  send('pointerdown', innerWidth / 2, innerHeight / 2 + 58); send('pointerup', innerWidth / 2, innerHeight / 2 + 58); await wait(100);
  check(game.snapshot().phase === 'playing', 'GUI resume');
  check(document.querySelectorAll('canvas').length === 1, 'one visible canvas');
  check(game.snapshot().rendering.frameTextureUploads === 0, 'no frame raster uploads');
  check(game.snapshot().rendering.drawCalls > 0, 'GPU sprite batches submitted');
  engine.stop();
  result.textContent = JSON.stringify({ status: 'passed', checks: ['gui-start','fighter-input','viewport-tracking','pointer-cancel','pause-resume'], left, right, state: game.snapshot() }); result.dataset.status = 'passed';
}
run().catch(error => { result.textContent = JSON.stringify({ status: 'failed', message: String(error) }); result.dataset.status = 'failed'; });
