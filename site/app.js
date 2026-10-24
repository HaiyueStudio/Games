import { installLobbyGamepad, GameOS } from './gamepad.js';
import { detailFor, filterGames, filterOptions, gameUrl, genreLabels, is3d, thumbnailUrl } from './catalog/details.js';
import { LibraryState } from './state/library.js';
import { createCard, focusCard } from './ui/library.js';

const catalogUrl = './games/manifest.json';
const $ = selector => document.querySelector(selector);
const elements = {
  dialog: $('#game-dialog'), frame: $('#game-frame'), grid: $('#game-grid'), filters: $('#game-filters'),
  search: $('#game-search'), empty: $('#empty-state'), title: $('#spotlight-title'), image: $('#spotlight-image'),
  description: $('#spotlight-description'), tags: $('#spotlight-tags'), play: $('#spotlight-play'),
  favorite: $('#favorite-toggle'), loading: $('#player-loading'), announcement: $('#catalog-announcement'),
};
let storage;
try { storage = window.localStorage; } catch { /* The launcher also works without persistence. */ }
const library = new LibraryState(storage);
let games = [], visible = [], selectedId = '', category = 'all', view = 'all';
const viewTitles = { all: '全部游戏', recent: '最近游玩', favorites: '我的收藏' };
const cards = () => [...elements.grid.querySelectorAll('.card-visual')];
const selectedGame = () => games.find(game => game.id === selectedId);
const gameOS = new GameOS($('#os-desktop'));

function selectGame(game) {
  selectedId = game?.id ?? '';
  for (const card of cards()) {
    const selected = card.dataset.gameId === selectedId;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-current', String(selected));
    if (!selected) card.classList.remove('gamepad-selected');
    card.tabIndex = selected ? 0 : -1;
  }
  elements.play.disabled = elements.favorite.disabled = !game;
  elements.image.hidden = !game;
  elements.favorite.setAttribute('aria-pressed', String(library.favorites.includes(selectedId)));
  elements.favorite.setAttribute('aria-label', `${library.favorites.includes(selectedId) ? '取消收藏' : '收藏'}${game ? `：${detailFor(game).title}` : '当前游戏'}`);
  if (!game) {
    elements.title.textContent = view === 'favorites' ? '把喜欢的，留在这里' : view === 'recent' ? '下一场，从这里开始' : '换个关键词试试';
    elements.description.textContent = '浏览游戏库，发现值得再玩一次的游戏。';
    elements.tags.replaceChildren();
    return;
  }
  const detail = detailFor(game);
  if (elements.image.dataset.gameId !== game.id) {
    elements.image.dataset.gameId = game.id;
    elements.image.src = thumbnailUrl(game);
  }
  elements.title.textContent = detail.title;
  elements.description.textContent = detail.description;
  $('#spotlight-kicker').textContent = library.recent.includes(game.id) ? '再次出发 · 重返喜欢的世界' : '准备就绪 · 即刻游玩';
  const labels = [genreLabels[detail.genre], is3d(game) ? '3D 世界' : '2D 游戏'];
  if (game.capabilities.includes('gamepad')) labels.push('支持手柄');
  elements.tags.replaceChildren(...labels.map(label => {
    const tag = document.createElement('span'); tag.textContent = label; return tag;
  }));
}

function renderFilters() {
  elements.filters.replaceChildren(...filterOptions.map(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.filter = value;
    button.classList.toggle('active', value === category);
    button.setAttribute('aria-pressed', String(value === category));
    button.addEventListener('click', () => {
      category = value;
      // Retain the actual focused button for keyboard users.
      for (const item of elements.filters.children) {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      }
      renderGames(true);
    });
    return button;
  }));
}

function renderGames(resetScroll = false) {
  const scrollTop = resetScroll ? 0 : elements.grid.scrollTop;
  visible = filterGames(games, { category, term: elements.search.value, view, ...library });
  if (!visible.some(game => game.id === selectedId)) selectedId = visible[0]?.id ?? '';
  elements.grid.replaceChildren(...visible.map((game, index) => createCard(game, index, {
    selected: game.id === selectedId, favorite: library.favorites.includes(game.id), select: selectGame, launch: openGame,
  })));
  elements.grid.scrollTop = scrollTop;
  selectGame(selectedGame());
  elements.empty.hidden = visible.length !== 0;
  elements.grid.hidden = visible.length === 0;
  $('#visible-count').textContent = `${visible.length} 款`;
  $('#favorite-count').textContent = library.favorites.length;
  elements.announcement.textContent = `${viewTitles[view]}，${visible.length} 款游戏`;
  const searching = elements.search.value.trim() || category !== 'all';
  $('#empty-title').textContent = searching ? '没有找到匹配的游戏' : view === 'favorites' ? '还没有收藏' : '还没有游玩记录';
  $('#empty-description').textContent = searching ? '试试其他名称，或切换游戏分类。' : view === 'favorites' ? '选中游戏后按 F，或点击爱心，即可加入收藏。' : '启动一款游戏，下次就能在这里快速找到它。';
}

function setView(next) {
  view = next; category = 'all'; elements.search.value = '';
  for (const button of document.querySelectorAll('[data-view]')) {
    button.classList.toggle('active', button.dataset.view === view);
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  $('#collection-title').textContent = viewTitles[view];
  renderFilters(); renderGames(true);
}

function toggleFavorite() {
  if (!selectedGame()) return;
  const hadCardFocus = elements.grid.contains(document.activeElement);
  library.toggleFavorite(selectedId);
  renderGames();
  if (hadCardFocus) {
    if (visible.length) focusCard(cards(), visible.findIndex(game => game.id === selectedId));
    else $('#empty-reset').focus();
  }
}

function setGameQuery(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('game', id); else url.searchParams.delete('game');
  history.pushState({}, '', url);
}

function openGame(game, updateHistory = true) {
  gameOS.setPlaying(true);
  selectGame(game);
  library.recordLaunch(game.id);
  $('#player-title').textContent = detailFor(game).title;
  $('#player-new-tab').href = gameUrl(game);
  elements.frame.title = `${detailFor(game).title}游戏`;
  elements.frame.dataset.gameId = game.id;
  elements.loading.hidden = false;
  elements.frame.src = gameUrl(game);
  if (!elements.dialog.open) elements.dialog.showModal();
  if (updateHistory) setGameQuery(game.id);
}

function closeGame(updateHistory = true) {
  const wasOpen = elements.dialog.open;
  if (wasOpen) elements.dialog.close();
  elements.frame.src = 'about:blank';
  delete elements.frame.dataset.gameId;
  gameOS.setPlaying(false);
  if (updateHistory) setGameQuery(null);
  if (wasOpen) {
    renderGames();
    if (visible.length) focusCard(cards(), visible.findIndex(game => game.id === selectedId));
    else $('#empty-reset').focus();
  }
}

function syncGameFromUrl() {
  const id = new URL(location.href).searchParams.get('game');
  const game = games.find(entry => entry.id === id);
  if (game) openGame(game, false); else closeGame(false);
}

async function loadCatalog() {
  const status = $('#webgpu-status');
  status.textContent = 'gpu' in navigator ? 'WebGPU 可用' : '浏览器未提供 WebGPU';
  status.classList.toggle('unsupported', !('gpu' in navigator));
  try {
    const response = await fetch(catalogUrl);
    if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.entries)) throw new Error('Catalog has no entries array');
    games = manifest.entries;
    library.reconcile(games);
    $('#game-count').textContent = games.length;
    renderFilters(); renderGames(); syncGameFromUrl();
    const glyphs = games.map(game => { const d = detailFor(game); return `${game.title}${d.title}${d.description}${d.mark}`; }).join('') + Object.values(viewTitles).join('') + '把喜欢的留在这里下一场从这里开始换个关键词试试浏览游戏库发现值得再玩一次的游戏没有找到匹配的还没有收藏游玩记录试试其他名称或切换分类选中游戏后按点击爱心即可加入启动一款下次就能在这里快速找到准备就绪即刻游玩再次出发重返喜欢的世界手柄已连接切换视图';
    void gameOS.init(glyphs).catch(error => { gameOS.destroy(); document.body.dataset.osError = 'true'; console.error('Game OS renderer unavailable', error); });
  } catch (error) {
    elements.empty.hidden = false;
    $('#empty-title').textContent = '游戏库暂时无法载入';
    $('#empty-description').textContent = '请检查连接，然后刷新页面重试。';
    $('#empty-reset').hidden = true;
    elements.description.textContent = '游戏库暂时无法载入，请刷新页面重试。';
    console.error(error);
  }
}

for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => setView(button.dataset.view));
$('#empty-reset').addEventListener('click', () => { setView('all'); focusCard(cards(), 0); });
elements.search.addEventListener('input', () => renderGames(true));
elements.play.addEventListener('click', () => { const game = selectedGame(); if (game) openGame(game); });
elements.favorite.addEventListener('click', toggleFavorite);
$('#player-close').addEventListener('click', () => closeGame());
elements.dialog.addEventListener('cancel', event => { event.preventDefault(); closeGame(); });
window.addEventListener('popstate', syncGameFromUrl);

document.addEventListener('keydown', event => {
  if (elements.dialog.open || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  if (event.target.matches('input, textarea, [contenteditable]')) {
    if (event.key === 'Escape') { elements.search.value = ''; renderGames(true); focusCard(cards(), 0); }
    return;
  }
  if (event.key === '/') { event.preventDefault(); elements.search.focus(); return; }
  if (event.key.toLowerCase() === 'f' && !event.repeat) { event.preventDefault(); toggleFavorite(); return; }
  if (event.key === 'Escape') { setView('all'); focusCard(cards(), 0); return; }
  const targets = cards();
  if (!targets.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  if (!(elements.grid.contains(event.target) || event.target === document.body || event.target === elements.play)) return;
  event.preventDefault();
  const index = Math.max(0, visible.findIndex(game => game.id === selectedId));
  const columns = targets.filter(card => Math.abs(card.getBoundingClientRect().top - targets[0].getBoundingClientRect().top) < 4).length || 1;
  const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
  focusCard(targets, event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : index + offset);
});

elements.frame.addEventListener('load', () => {
  if (!elements.dialog.open || !elements.frame.dataset.gameId) return;
  elements.loading.hidden = true;
  // Same-origin games keep their own controls; Escape is the launcher's return key.
  elements.frame.contentWindow.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || elements.frame.contentDocument.body.dataset.gameReturnOpen === 'true') return;
    event.preventDefault(); event.stopImmediatePropagation(); closeGame();
  }, { capture: true });
  elements.frame.contentWindow.focus();
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== elements.frame.contentWindow || !elements.dialog.open) return;
  if (event.data?.type === 'haiyue-gamepad-home') { closeGame(); return; }
  const direction = event.data?.type === 'haiyue-gamepad-next' ? 1 : event.data?.type === 'haiyue-gamepad-previous' ? -1 : 0;
  if (!direction || !visible.length) return;
  const index = visible.findIndex(game => game.id === elements.frame.dataset.gameId);
  openGame(visible[(index + direction + visible.length) % visible.length]);
});

function updateTime() {
  const now = new Date();
  $('#system-time').textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#system-time').dateTime = now.toISOString();
}
let timer, disposeGamepad;
function startSystem() {
  updateTime(); timer = setInterval(updateTime, 15000);
  disposeGamepad = installLobbyGamepad({ cards, filters: () => [...elements.filters.querySelectorAll('button')],
    views: () => [...document.querySelectorAll('[data-view]')], favorite: toggleFavorite,
    playing: () => elements.dialog.open, hint: $('#gamepad-help'),
    connection: connected => { $('#input-status').textContent = connected ? '手柄已连接 · X 收藏 · Y 切换视图' : '手柄 / 键鼠 / 触屏'; },
  });
}
window.addEventListener('pagehide', () => { clearInterval(timer); disposeGamepad?.(); });
window.addEventListener('pageshow', event => { if (event.persisted) startSystem(); });
startSystem();
void loadCatalog();
