import { CalendarPuzzleGame } from '../../../calendar-puzzle/CalendarPuzzleGame';
import type { CalendarPurchaseState } from '../../../calendar-puzzle/purchases';
import type { CalendarRewards } from '../../../calendar-puzzle/rewards';
const canvas = document.querySelector('canvas')!;
const result = document.querySelector<HTMLElement>('#result')!;
const query = new URLSearchParams(location.search), mode = query.get('mode') ?? 'startup';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok: boolean, message: string) => { if (!ok) throw Error(message); };
let store: CalendarPurchaseState = { entitled: false, busy: false, phase: 'loading', price: null, canPurchase: false };
let reward: ReturnType<CalendarRewards['snapshot']> = { unlimited: false, free: 1, credits: 0, adsRemaining: 2, busy: false, initializing: true, presenting: false, operation: null, phase: 'ready', privacyRequired: false };
const storeListeners = new Set<() => void>(), rewardListeners = new Set<() => void>();
const storeChanged = () => { for (const fn of storeListeners) fn(); };
const rewardChanged = () => { for (const fn of rewardListeners) fn(); };
let buys = 0, ads = 0, privacyRequests = 0;
const game = new CalendarPuzzleGame({ purchases: {
  snapshot: () => store, subscribe: fn => { storeListeners.add(fn); return () => { storeListeners.delete(fn); }; },
  async purchase() { buys++;store = { ...store, busy: true, phase: 'purchasing' };storeChanged(); },
  async restore() {}, async refresh() {},
}, rewards: {
  snapshot: () => reward, subscribe: fn => { rewardListeners.add(fn); return () => { rewardListeners.delete(fn); }; },
  async watch() { ads++;reward = { ...reward, busy: true, phase: 'loading', operation: 'ad' };rewardChanged(); },
  async privacy() { privacyRequests++;reward = { ...reward, busy: true, phase: 'loading', operation: 'privacy' };rewardChanged(); }, consume: () => true, refresh: rewardChanged,
}, guiFont: {
  canvasFactory(w, h) { const image = document.createElement('canvas');image.width = w;image.height = h;return image; },
  readAtlasPixels(image) { return new Uint8Array(image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data); },
} });
async function click(id: string) {
  const r = game.snapshot().ui[id]!;
  check(!!r?.visible, `visible ${id}`);
  const rect = canvas.getBoundingClientRect();
  for (const type of ['pointerdown','pointerup']) {
    canvas.dispatchEvent(new PointerEvent(type, { clientX: rect.left + r.x + r.width / 2, clientY: rect.top + r.y + r.height / 2, pointerId: 1, pointerType: 'mouse', button: 0 }));
    await wait(35);
  }
}
async function run() {
  await game.init(canvas);
  canvas.setPointerCapture = () => {};canvas.releasePointerCapture = () => {};
  // The same product views, layout and renderer as the shipped game.
  (game as any).setLanguage(query.get('language') ?? 'zh');
  await wait(300);
  await click('settings');
  if (mode === 'privacy') {
    check(game.snapshot().ui.rewardPrivacy!.disabled, 'privacy initially disabled');
    (game as any).setLanguage('ja');
    check(game.snapshot().ui.rewardPrivacy!.text === '', 'language change preserves loading indicator');
    reward = { ...reward, initializing: false, privacyRequired: true };rewardChanged();await wait(150);
    for (let i = 0; i < 5; i++) await click('rewardPrivacy');
    check(privacyRequests === 1, 'one privacy request for repeated taps');
    check((game as any).networkButtons.isAnimating, 'privacy spinner active');
  } else {
  await click('settingsPurchases');
  check(game.snapshot().ui.purchaseBuy!.disabled, 'startup buy disabled');
  check(game.snapshot().ui.purchaseRestore!.disabled, 'startup restore disabled');
  check(!game.snapshot().ui.purchaseToday!.disabled, 'today stays available');
  check((game as any).purchaseView.isAnimating, 'startup spinner active');
  if (mode !== 'startup') {
    store = { ...store, phase: 'ready', price: '¥18.00', canPurchase: true };storeChanged();
    reward = { ...reward, initializing: false };rewardChanged();await wait(150);
    check(!(game as any).purchaseView.isAnimating, 'ready stops spinner');
    if (mode === 'purchase') {
      for (let i = 0; i < 5; i++) await click('purchaseBuy');
      check(buys === 1, 'one purchase for repeated taps');
      check((game as any).purchaseView.isAnimating, 'purchase spinner active');
      check(!game.snapshot().ui.purchasePrice!.visible, 'loading hides price behind spinner');
    } else {
      await click('purchaseClose');(game as any).toggleRewards(true);await wait(150);
      for (let i = 0; i < 5; i++) await click('rewardWatch');
      check(ads === 1, 'one ad for repeated taps');
      check((game as any).rewardView.isAnimating, 'ad spinner active');
    }
  }
  }
  const view = mode === 'privacy' ? { network: (game as any).networkButtons } : mode === 'ad' ? (game as any).rewardView : (game as any).purchaseView;
  const before = [...view.network.entries.values()].flatMap((entry: any) => entry.dots.map((dot: any) => dot.style.backgroundColor));
  await wait(220);
  const after = [...view.network.entries.values()].flatMap((entry: any) => entry.dots.map((dot: any) => dot.style.backgroundColor));
  check(JSON.stringify(before) !== JSON.stringify(after), 'loading dots animate in actual renderer');
  (game as any).engine.stop(); // deterministic capture without leaving a frame loop after the fixture
  result.textContent = JSON.stringify({ status: 'passed', mode, buys, ads, privacyRequests,
    checks: mode === 'privacy' ? ['privacy-startup-disabled','loading-survives-language-change','privacy-tap-coalescing','animated-button-dots']
      : ['startup-disabled-loading','local-navigation-enabled','animated-button-dots', ...(mode === 'startup' ? [] : ['ready-stops-loading','network-tap-coalescing'])], state: game.snapshot() });
  result.dataset.status = 'passed';
}
run().catch(error => { result.textContent = JSON.stringify({ status: 'failed', message: String(error) });result.dataset.status = 'failed'; });
