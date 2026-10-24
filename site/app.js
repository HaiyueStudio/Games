import { installLobbyGamepad, GameOS } from './gamepad.js';
import { detailFor, filterGames, filterOptions, gameUrl, genreLabels, is3d, thumbnailUrl } from './catalog/details.js';
import { launcherPaths } from './catalog/paths.js';
import { LibraryState } from './state/library.js';

const paths = launcherPaths(location.href, import.meta.url, document.querySelector('meta[name="haiyue-games-root"]').content);
const { catalogUrl } = paths;
const canvas = document.querySelector('#os-desktop');
const lifetime = new AbortController();
let storage;
try { storage = localStorage; } catch {}
const library = new LibraryState(storage);
let games = [], visible = [], selectedId = '', category = 'all', view = 'all', search = '', error = '', ready = false, frame = null;
const selectedGame = () => games.find(game => game.id === selectedId);
const presentation = game => {
  const detail = detailFor(game);
  return { id: game.id, title: detail.title, description: detail.description, genre: genreLabels[detail.genre], threeD: is3d(game), thumbnail: thumbnailUrl(game, paths.siteRoot), favorite: library.favorites.includes(game.id) };
};
const gameOS = new GameOS(canvas, {
  select: id => selectGame(id), launch: id => openGame(games.find(game => game.id === id)),
  view: value => setView(value), category: value => { category = value; render(true); },
  search: value => { search = value; render(true); }, favorite: () => toggleFavorite(),
  external: id => window.open(gameUrl(games.find(game => game.id === id), paths.gamesRoot), '_blank', 'noopener'),
});

function render(resetScroll = false) {
  visible = filterGames(games, { category, term: search, view, ...library });
  if (!visible.some(game => game.id === selectedId)) selectedId = visible[0]?.id ?? '';
  gameOS.setState({ games: visible.map(presentation), selected: selectedGame() ? presentation(selectedGame()) : null, view, category, search, total: games.length, favorites: library.favorites.length, error }, resetScroll);
}
function selectGame(id, focus = false) {
  if (!visible.some(game => game.id === id)) return;
  if (selectedId !== id) { selectedId = id; render(); }
  if (focus) gameOS.focusCard(id);
}
function move(horizontal, vertical) {
  if (!visible.length) return;
  const index = Math.max(0, visible.findIndex(game => game.id === selectedId));
  selectGame(visible[Math.max(0, Math.min(visible.length - 1, index + horizontal + vertical * gameOS.columns))].id, true);
}
function setView(value) { view = value; category = 'all'; search = ''; render(true); }
function toggleFavorite() { if (!selectedId) return; library.toggleFavorite(selectedId); render(); }
function cycleCategory(direction) { const index = filterOptions.findIndex(([value]) => value === category); category = filterOptions[(index + direction + filterOptions.length) % filterOptions.length][0]; render(true); }
function setGameQuery(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('game', id); else url.searchParams.delete('game');
  history.pushState({}, '', url);
}
function openGame(game, updateHistory = true) {
  if (!game) return;
  if (frame) { frame.src = 'about:blank'; frame.remove(); }
  selectedId = game.id; library.recordLaunch(game.id); gameOS.setPlaying(true);
  const player = document.createElement('iframe'); frame = player;
  player.id = 'game-frame'; player.title = `${detailFor(game).title}游戏`; player.dataset.gameId = game.id;
  player.allow = 'autoplay; fullscreen; gamepad'; player.allowFullscreen = true;
  player.addEventListener('load', () => {
    if (frame !== player || !player.contentWindow) return;
    player.contentWindow.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || player.contentDocument?.body.dataset.gameReturnOpen === 'true') return;
      event.preventDefault(); event.stopImmediatePropagation(); closeGame();
    }, { capture: true });
    player.contentWindow.focus();
  });
  player.src = gameUrl(game, paths.gamesRoot); document.body.append(player);
  if (updateHistory) setGameQuery(game.id);
}
function closeGame(updateHistory = true) {
  if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }
  if (updateHistory) setGameQuery(null);
  render(); gameOS.setPlaying(false); if (selectedId) gameOS.focusCard(selectedId);
}
function syncGameFromUrl() {
  const id = new URL(location.href).searchParams.get('game'), game = games.find(entry => entry.id === id);
  if (game) openGame(game, false); else closeGame(false);
}
window.addEventListener('popstate', syncGameFromUrl, { signal: lifetime.signal });
window.addEventListener('message', event => {
  if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
  if (event.data?.type === 'haiyue-gamepad-home') { closeGame(); return; }
  const direction = event.data?.type === 'haiyue-gamepad-next' ? 1 : event.data?.type === 'haiyue-gamepad-previous' ? -1 : 0;
  if (!direction) return;
  const list = visible.length ? visible : games, index = list.findIndex(game => game.id === frame.dataset.gameId);
  openGame(list[(index + direction + list.length) % list.length]);
}, { signal: lifetime.signal });
window.addEventListener('keydown', event => {
  if (!ready || frame || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  let handled = true;
  if (gameOS.editing) {
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
  else if (event.key === 'Enter' && (!gameOS.focused || gameOS.focused.startsWith('game-'))) openGame(selectedGame());
  else handled = false;
  if (handled) { event.preventDefault(); event.stopImmediatePropagation(); }
}, { capture: true, signal: lifetime.signal });

let disposeGamepad;
function startController() {
  disposeGamepad?.();
  disposeGamepad = installLobbyGamepad({ move, launch: () => openGame(selectedGame()), category: cycleCategory,
    view: () => { const values = ['all', 'recent', 'favorites']; setView(values[(values.indexOf(view) + 1) % values.length]); },
    favorite: toggleFavorite, playing: () => !!frame, ready: () => ready,
    notices: (notices, connected) => gameOS.setNotices(notices, connected) });
}
window.addEventListener('pagehide', event => { disposeGamepad?.(); if (!event.persisted) lifetime.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) startController(); });

async function loadCatalog() {
  try {
    const response = await fetch(catalogUrl);
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status} ${catalogUrl}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error('The game manifest has no entries.');
    games = manifest.entries; library.reconcile(games); render();
    if (new URL(location.href).searchParams.has('game')) gameOS.setPlaying(true);
    const glyphs = games.map(game => { const detail = detailFor(game); return `${game.title}${detail.title}${detail.description}${genreLabels[detail.genre]}`; }).join('');
    await gameOS.init(glyphs); ready = true; startController();
    if (new URL(location.href).searchParams.has('game')) syncGameFromUrl();
    else canvas.focus({ preventScroll: true });
  } catch (failure) {
    error = '请检查连接，然后刷新页面重试。'; render(); gameOS.destroy(); document.body.dataset.osError = 'true'; canvas.setAttribute('aria-label', error); console.error('Game OS initialization failed', failure);
  }
}
void loadCatalog();
