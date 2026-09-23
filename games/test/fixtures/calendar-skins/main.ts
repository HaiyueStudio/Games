import { CalendarPuzzleGame } from '../../../calendar-puzzle/CalendarPuzzleGame';
import { CALENDAR_SKINS, CALENDAR_SKIN_IDS } from '../../../calendar-puzzle/calendar-style';
const canvas = document.querySelector('canvas')!, result = document.querySelector<HTMLElement>('#result')!;
const gpuErrors: string[] = [];
const query = new URLSearchParams(location.search), mode = query.get('mode') ?? 'white-settings';
const [skin, screen] = mode.split('-') as [keyof typeof CALENDAR_SKINS, string];
const check = (ok: boolean, message: string) => { if (!ok) throw Error(message); };
let policyOpens = 0;
const platform = {
  purchases: { snapshot: () => ({ entitled: false, phase: 'ready' as const, price: '¥18.00', busy: false, canPurchase: true }), subscribe: () => () => {}, async purchase() {}, async restore() {}, async refresh() {} },
  rewards: { snapshot: () => ({ unlimited: false, free: 1, credits: 3, adsRemaining: 2, busy: false, initializing: false, presenting: false, operation: null, phase: 'ready' as const, privacyRequired: true }), subscribe: () => () => {}, async watch() {}, async privacy() {}, refresh() {}, consume: () => true },
  openPrivacyPolicy: () => { policyOpens++; },
  guiFont: { canvasFactory(w: number, h: number) { const image = document.createElement('canvas');image.width = w;image.height = h;return image; },
    readAtlasPixels(image: HTMLCanvasElement) { return new Uint8Array(image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data); } },
};
let game = new CalendarPuzzleGame(platform);
async function frames(count = 2) {
  for (let i = 0; i < count; i++) await new Promise<void>(resolve => {
    const engine = (game as any).engine;
    const done = () => { engine.off('after-update', done);resolve(); };
    engine.on('after-update', done);
  });
}
async function click(id: string) {
  const r = game.snapshot().ui[id]!;
  check(!!r?.visible, `visible ${id}`);
  const rect = canvas.getBoundingClientRect();
  for (const type of ['pointerdown', 'pointerup']) {
    canvas.dispatchEvent(new PointerEvent(type, { clientX: rect.left + r.x + r.width / 2, clientY: rect.top + r.y + r.height / 2, pointerId: 1, pointerType: 'mouse', button: 0 }));
    await frames();
  }
}
async function run() {
  await game.init(canvas);
  (game as any).engine.device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => gpuErrors.push(event.error.message));
  canvas.setPointerCapture = () => {};canvas.releasePointerCapture = () => {};
  (game as any).setLanguage(query.get('language') ?? 'zh');
  await frames(3); await click('settings');
  const pieces = JSON.stringify(game.snapshot().pieces);
  for (const id of CALENDAR_SKIN_IDS) { await click(`skin_${id}`);check(game.snapshot().skin === id, `select ${id}`); }
  await click(`skin_${skin}`);
  check(JSON.stringify(game.snapshot().pieces) === pieces, 'skin switching preserves puzzle');
  const ui = game.snapshot().ui;
  check(!ui.done && !ui.settingsCalendar, 'redundant buttons removed');
  check(ui.settingsPurchases!.y === ui.privacyPolicy!.y && ui.settingsPurchases!.width === ui.privacyPolicy!.width, 'equal buttons on one row');
  check(ui.settingsClose!.x > ui.settingsTitle!.x && ui.settingsClose!.y < ui.languageLabel!.y, 'top-right close');
  await click('privacyPolicy');check(policyOpens === 1, `privacy link works: ${policyOpens}`);
  await click('settingsClose');check(!game.snapshot().settingsOpen, 'close works');await click('settings');
  await game.flushSave();
  check((await (game as any).saves.load()).skin === skin, 'skin persisted');
  game.dispose();game = new CalendarPuzzleGame(platform);await game.init(canvas);(game as any).engine.device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => gpuErrors.push(event.error.message));await frames(3);
  check(game.snapshot().skin === skin, 'skin restored on restart');
  check(JSON.stringify(game.snapshot().pieces) === pieces, 'restart preserves puzzle');
  check((game as any).guiRoot.theme.colors.background === CALENDAR_SKINS[skin].colors.background, 'restored palette');
  if (screen === 'settings') await click('settings');
  if (screen === 'history') await click('calendar');
  if (screen === 'reward') (game as any).toggleRewards(true);
  if (screen === 'purchase') { await click('settings');await click('settingsPurchases'); }
  await frames(3);
  (game as any).engine.stop();
  check(gpuErrors.length === 0, `GPU validation: ${gpuErrors.join('; ')}`);
  result.textContent = JSON.stringify({ status: 'passed', mode, checks: ['all-skins-selectable', 'no-progress-loss', 'equal-link-row', 'top-right-close', 'policy-action', 'skin-saved-and-restored'], state: game.snapshot() });
  result.dataset.status = 'passed';
}
run().catch(error => {result.textContent = JSON.stringify({status:'failed', message:String(error), stack:error.stack});result.dataset.status = 'failed';});
