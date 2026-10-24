import { installLobbyGamepad, GameOS } from './gamepad.js';
import { GameRouter, GameNavigation, gameModuleUrl } from './game-host.js';
import { detailFor, filterGames, filterOptions, gameUrl, genreLabels, is3d, thumbnailUrl } from './catalog/details.js';
import { launcherPaths } from './catalog/paths.js';
import { LibraryState } from './state/library.js';

const paths = launcherPaths(location.href, import.meta.url, document.querySelector('meta[name="haiyue-games-root"]').content);
const { catalogUrl } = paths;
const canvas = document.querySelector('#os-desktop');
const lifetime = new AbortController();
const router = new GameRouter();
let storage;
try { storage = localStorage; } catch {}
const library = new LibraryState(storage);
let games = [], visible = [], selectedId = '', selectionActive = false, category = 'all', view = 'all', search = '', error = '', ready = false;
let gameRoot = null, simulator = null, simulatorCode = null, transition = 0, phase = 'desktop';
const navigation = new GameNavigation(() => { if (ready) void syncRoute(); });
const selectedGame = () => games.find(game => game.id === selectedId);
const presentation = game => {
  const detail = detailFor(game);
  return { id: game.id, title: detail.title, description: detail.description, genre: genreLabels[detail.genre], threeD: is3d(game), thumbnail: thumbnailUrl(game, paths.siteRoot), favorite: library.favorites.includes(game.id),
    gamepad: game.capabilities.includes('gamepad'), mobile: game.capabilities.includes('input') };
};
const gameOS = new GameOS(canvas, {
  select: id => selectGame(id), launch: id => openGame(games.find(game => game.id === id)),
  view: value => setView(value), category: value => { category = value; render(true); },
  search: value => { search = value; render(true); }, favorite: () => toggleFavorite(),
  external: id => window.open(gameUrl(games.find(game => game.id === id), paths.gamesRoot), '_blank', 'noopener'),
  home: () => navigation.route.game ? closeGame() : navigation.navigate({game:null,device:null}), retry: () => void syncRoute(), simulator: mode => navigation.navigate({game:null,device:mode}),
});
canvas.style.cssText = 'position:fixed;inset:0;z-index:2;';
function render(resetScroll = false) {
  visible = filterGames(games, { category, term: search, view, ...library });
  if (!visible.some(game => game.id === selectedId)) { selectedId = visible[0]?.id ?? ''; selectionActive = false; }
  gameOS.setState({ games: visible.map(presentation), selected: selectedGame() ? presentation(selectedGame()) : null, selectionActive, view, category, search, total: games.length, favorites: library.favorites.length, error }, resetScroll);
}
function selectGame(id, focus = false) {
  if (!visible.some(game => game.id === id)) return;
  if (selectedId !== id || !selectionActive) { selectedId = id; selectionActive = true; render(); }
  if (focus) gameOS.focusCard(id);
}
function move(horizontal, vertical) {
  if (navigation.route.device && !navigation.route.game) { simulator?.move(horizontal, vertical); return; }
  if (!visible.length) return;
  const index = Math.max(0, visible.findIndex(game => game.id === selectedId));
  selectGame(visible[Math.max(0, Math.min(visible.length - 1, index + horizontal + vertical * gameOS.columns))].id, true);
}
function launchSelected() {
  if (navigation.route.device && !navigation.route.game) simulator?.launch(); else openGame(selectedGame());
}
function setView(value) { view = value; category = 'all'; search = ''; render(true); }
function toggleFavorite() { if (!selectedId) return; library.toggleFavorite(selectedId); render(); }
function cycleCategory(direction) { const index = filterOptions.findIndex(([value]) => value === category); category = filterOptions[(index + direction + filterOptions.length) % filterOptions.length][0]; render(true); }
function openGame(game) { if (game) navigation.navigate({ game: game.id, device: navigation.route.device }); }
function closeGame() { navigation.navigate({ game: null, device: navigation.route.device }); }
function switchGame(direction) {
  const list = visible.length ? visible : games, index = list.findIndex(game => game.id === navigation.route.game);
  if (list.length) openGame(list[(index + direction + list.length) % list.length]);
}
async function loadSimulator() {
  if (!simulatorCode) simulatorCode = import('./simulator.js').catch(error => { simulatorCode = null; throw error; });
  return simulatorCode;
}
function clearPlayer(disposeDevice = false) {
  simulator?.showHome(); router.clear(); gameRoot?.remove(); gameRoot = null;
  if (disposeDevice) { simulator?.dispose(); simulator = null; gameOS.setDeviceView(null); }
}
async function syncRoute() {
  const current = ++transition, route = navigation.route;
  clearPlayer(); gameOS.setPanel(null);
  if (!route.device || simulator && simulator.mode !== route.device) clearPlayer(true);
  if (route.device && !simulator) {
    gameOS.setPlaying(false); gameOS.setLoading({phase:'code',completed:0,total:0,loaded:0,bytes:0,message:'加载设备模拟器'}, '设备模拟器');
    try {
      const module = await loadSimulator(); if (current !== transition) return;
      const device = await module.createSimulatorDevice({ mode: route.device, games: games.map(presentation), launch: id => openGame(games.find(game => game.id === id)),
        home: closeGame, retry: () => void syncRoute(), desktop: () => navigation.navigate({game:null,device:null}),
        device: mode => navigation.navigate({game:navigation.route.game,device:mode}), external: () => window.open(new URL('../simulator/index.html', paths.gamesRoot), '_blank', 'noopener') });
      if (current !== transition) { device.dispose(); return; } simulator = device;
      gameOS.setDeviceView(() => { const snapshot = simulator?.snapshot(); return snapshot ? { simulatorHome: snapshot.simulatorHome, nodes: snapshot.nodes } : {}; });
    } catch (failure) {
      if (current !== transition) return; phase = 'error';
      gameOS.setLoading({phase:'error',completed:0,total:0,loaded:0,bytes:0,message:String(failure)}, '设备模拟器'); return;
    }
  }
  gameOS.setLoading(null); gameOS.setPlaying(!!route.device);
  if (!route.game) {
    gameOS.setLoading(null); phase = route.device ? 'simulator' : 'desktop';
    if (route.device) {
      simulator.showHome();
    } else { render(); if (selectedId) gameOS.focusCard(selectedId); }
    return;
  }
  const game = games.find(entry => entry.id === route.game);
  if (!game) { navigation.navigate({game:null,device:route.device}, true); return; }
  selectedId = game.id; selectionActive = true; render(); phase = 'loading';
  const title = detailFor(game).title;
  const progress = {phase:'code',completed:0,total:0,loaded:0,bytes:0,message:'按需加载游戏代码'};
  if (route.device) simulator.showLoading(progress, title); else gameOS.setLoading(progress, title);
  const root = document.createElement('div'); gameRoot = root; root.id = 'game-host'; root.dataset.gameId = game.id;
  const {width,height} = simulator?.size ?? {width:820,height:1080};
  root.style.cssText = route.device ? 'position:fixed;left:-10000px;top:0;width:'+width+'px;height:'+height+'px;' : 'position:fixed;inset:0;z-index:1;visibility:hidden;';
  root.inert = true; document.body.append(root);
  try {
    const instance = await router.mount(game.id, gameModuleUrl(game.id, paths.gamesRoot), {
      root, url: gameUrl(game, paths.gamesRoot)+(location.search || ''), mode: route.device ? 'texture' : 'screen',
      ...(route.device ? {width,height} : {}), onHome: closeGame, onSwitch: switchGame,
      onProgress: progress => { if (current === transition && phase === 'loading') { if (route.device) simulator?.showLoading(progress, title); else gameOS.setLoading(progress, title); } },
    });
    if (!instance || current !== transition) return;
    if (route.device) {
      simulator.setGame(instance);
    } else { root.style.visibility = 'visible'; root.inert = false; instance.canvas?.focus({preventScroll:true}); }
    library.recordLaunch(game.id); phase = 'playing'; gameOS.setLoading(null); gameOS.setPlaying(true);
  } catch (failure) {
    if (current !== transition) return;
    clearPlayer(); phase = 'error'; gameOS.setPlaying(!!route.device);
    const progress = {phase:'error',completed:0,total:0,loaded:0,bytes:0,message:failure instanceof Error ? failure.message : String(failure)};
    if (route.device) simulator?.showLoading(progress, title); else gameOS.setLoading(progress, title);
    console.error('Game route failed', failure);
  }
}
window.addEventListener('keydown', event => {
  if (!ready || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  if (navigation.route.game) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeGame(); }
    return;
  }
  let handled = true;
  if (navigation.route.device) {
    if (event.key === 'Escape') navigation.navigate({game:null,device:null});
    else if (event.key === 'ArrowLeft') move(-1,0);
    else if (event.key === 'ArrowRight') move(1,0);
    else if (event.key === 'ArrowUp') move(0,-1);
    else if (event.key === 'ArrowDown') move(0,1);
    else if (event.key === 'Enter') launchSelected();
    else handled=false;
  } else if (gameOS.editing) {
    if (event.key !== 'Escape') return;
    search = ''; render(true); gameOS.blurSearch(); if (selectedId) gameOS.focusCard(selectedId);
  } else if (event.key === '/') gameOS.focusSearch();
  else if (event.key.toLowerCase() === 'f' && !event.repeat) toggleFavorite();
  else if (event.key === 'Escape') { setView('all'); if (selectedId) gameOS.focusCard(selectedId); }
  else if (event.key === 'ArrowLeft') move(-1, 0);
  else if (event.key === 'ArrowRight') move(1, 0);
  else if (event.key === 'ArrowUp') move(0, -1);
  else if (event.key === 'ArrowDown') move(0, 1);
  else if (event.key === 'Home' && visible.length) selectGame(visible[0].id, true);
  else if (event.key === 'End' && visible.length) selectGame(visible.at(-1).id, true);
  else if (event.key === 'Enter' && (!gameOS.focused || gameOS.focused.startsWith('game-'))) launchSelected();
  else handled = false;
  if (handled) { event.preventDefault(); event.stopImmediatePropagation(); }
}, { capture: true, signal: lifetime.signal });
let disposeGamepad;
function startController() {
  disposeGamepad?.();
  disposeGamepad = installLobbyGamepad({ move, launch: launchSelected, category: cycleCategory,
    view: () => { const values = ['all', 'recent', 'favorites']; setView(values[(values.indexOf(view) + 1) % values.length]); },
    favorite: toggleFavorite, playing: () => !!navigation.route.game, ready: () => ready,
    notices: (notices, connected) => gameOS.setNotices(notices, connected) });
}
window.addEventListener('pagehide', event => { disposeGamepad?.(); if (!event.persisted) { clearPlayer(true); navigation.dispose(); router.dispose(); lifetime.abort(); } });
window.addEventListener('pageshow', event => { if (event.persisted) startController(); });
window.haiyueGameOS = {navigate:(game,device=null)=>navigation.navigate({game,device}),get game(){return router.instance;},get simulator(){return simulator;},get route(){return navigation.route;}};
if (new URLSearchParams(location.search).has('verify') || new URLSearchParams(location.search).has('gamepadVerify')) Object.defineProperty(window,'__gameHost',{configurable:true,get:()=>({route:navigation.route,phase,id:router.instance?.id??null,engine:router.instance?.engine?.state??null,mode:router.instance?.texture?'texture':'screen',mounted:!!router.instance,simulator:simulator?.snapshot?.()??null})});
async function loadCatalog() {
  try {
    const response = await fetch(catalogUrl);
    if (!response.ok) throw new Error('Catalog request failed: '+response.status+' '+catalogUrl);
    const manifest = await response.json();
    if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error('The game manifest has no entries.');
    games = manifest.entries.filter(game=>game.launcher!==false); library.reconcile(games); render();
    const glyphs = games.map(game => { const detail = detailFor(game); return game.title+detail.title+detail.description+genreLabels[detail.genre]; }).join('');
    await gameOS.init(glyphs); ready = true; startController();
    const defaultDevice = document.querySelector('meta[name="haiyue-default-device"]')?.content;
    if (!navigation.route.device && (defaultDevice === 'pad' || defaultDevice === 'phone')) { navigation.navigate({game:navigation.route.game,device:defaultDevice},true); return; }
    if (navigation.route.game || navigation.route.device) await syncRoute(); else canvas.focus({ preventScroll: true });
  } catch (failure) {
    error = '请检查连接，然后刷新页面重试。'; render(); gameOS.destroy(); document.body.dataset.osError = 'true'; canvas.setAttribute('aria-label', error); console.error('Game OS initialization failed', failure);
  }
}
void loadCatalog();
