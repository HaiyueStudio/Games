const catalogUrl = './games/manifest.json';

const gameDetails = {
  '2048': { genre: 'puzzle', description: 'Slide matching tiles and build the elusive 2048 tile.', mark: '20' },
  'billiards-3d': { genre: 'physics', description: 'A tactile three-dimensional billiards table driven by physics.', mark: '3D' },
  billiards: { genre: 'physics', description: 'Line up the shot and clear a crisp top-down billiards table.', mark: '8' },
  'calendar-puzzle': { genre: 'puzzle', description: 'Fit every piece while leaving today\'s date visible.', mark: '31' },
  'triangle-calendar-puzzle': { genre: 'puzzle', description: 'Solve a triangular calendar with geometric pieces.', mark: '△' },
  'entanglement-path': { genre: 'puzzle', description: 'Rotate tiles to weave the longest path without crossing the edge.', mark: '∞' },
  'icosahedron-minesweeper': { genre: 'puzzle', description: 'Minesweeper wraps around the faces of an icosahedron.', mark: '◆' },
  'gravity-maze': { genre: 'physics', description: 'Tilt a physical maze, dodge holes, and roll to the goal.', mark: '●' },
  'match-3': { genre: 'puzzle', description: 'Swap colorful pieces and build satisfying chain reactions.', mark: '✦' },
  minesweeper: { genre: 'puzzle', description: 'Clear the board with deduction, flags, and a little nerve.', mark: '✹' },
  'minecraft-lite': { genre: 'sandbox', description: 'Explore a voxel world and add or remove colorful blocks.', mark: '▦' },
  'pad-simulator': { genre: 'audio', description: 'Play a responsive drum-pad grid with pointer or keyboard input.', mark: '▤' },
  pacman: { genre: 'arcade', description: 'Navigate the maze, collect every pellet, and avoid the ghosts.', mark: 'ᗧ' },
  piano: { genre: 'audio', description: 'A playable browser piano with keyboard and pointer controls.', mark: '♬' },
  pong: { genre: 'arcade', description: 'A fast two-player 3D Pong table with reactive paddles, smoke, and an ever-faster ball.', mark: 'VS' },
  'sky-strike': { genre: 'arcade', description: 'Pilot a starfighter through dense formations and cascading bullet patterns.', mark: '▲' },
  'sokoban-3d': { genre: 'puzzle', description: 'Push every crate into place in a dimensional warehouse.', mark: '⬡' },
  'spider-solitaire': { genre: 'cards', description: 'Build descending runs and complete all eight suits.', mark: '♠' },
  sudoku: { genre: 'puzzle', description: 'A clean number puzzle with notes, checks, and saved progress.', mark: '9' },
  tetris: { genre: 'arcade', description: 'Stack falling pieces, clear lines, and keep the board alive.', mark: '▥' },
  'wfc-map': { genre: 'procedural', description: 'Watch wave function collapse assemble a fresh tiled world.', mark: '⌘' },
};

const filterOptions = [
  ['all', 'All games'],
  ['puzzle', 'Puzzle'],
  ['3d', '3D'],
  ['physics', 'Physics'],
  ['arcade', 'Arcade'],
  ['audio', 'Audio'],
];

const elements = {
  count: document.querySelector('#game-count'),
  dialog: document.querySelector('#game-dialog'),
  empty: document.querySelector('#empty-state'),
  filters: document.querySelector('#game-filters'),
  frame: document.querySelector('#game-frame'),
  grid: document.querySelector('#game-grid'),
  newTab: document.querySelector('#player-new-tab'),
  playerTitle: document.querySelector('#player-title'),
  search: document.querySelector('#game-search'),
  status: document.querySelector('#webgpu-status'),
};

let games = [];
let activeFilter = 'all';

function gameUrl(game) {
  return `./games/${encodeURIComponent(game.id)}/index.html`;
}

function detailFor(game) {
  return gameDetails[game.id] ?? {
    genre: 'game',
    description: `A HaiyueStudio Engine experiment featuring ${game.capabilities.join(', ')}.`,
    mark: game.title.slice(0, 2).toUpperCase(),
  };
}

function is3d(game) {
  return game.capabilities.some((capability) => capability.toLowerCase().includes('3d'));
}

function matchesFilter(game) {
  const details = detailFor(game);
  if (activeFilter === 'all') return true;
  if (activeFilter === '3d') return is3d(game);
  if (activeFilter === 'physics') {
    return details.genre === 'physics' || game.capabilities.some((capability) => capability.includes('physics'));
  }
  return details.genre === activeFilter;
}

function renderFilters() {
  elements.filters.replaceChildren(
    ...filterOptions.map(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.filter = value;
      button.classList.toggle('active', value === activeFilter);
      button.setAttribute('aria-pressed', String(value === activeFilter));
      button.addEventListener('click', () => {
        activeFilter = value;
        renderFilters();
        renderGames();
      });
      return button;
    }),
  );
}

function createTag(label) {
  const tag = document.createElement('span');
  tag.textContent = label.replaceAll('-', ' ');
  return tag;
}

function createCard(game, index) {
  const details = detailFor(game);
  const article = document.createElement('article');
  article.className = 'game-card';
  article.style.setProperty('--delay', `${Math.min(index, 10) * 45}ms`);

  const visual = document.createElement('button');
  visual.type = 'button';
  visual.className = 'card-visual';
  visual.dataset.tone = String((index % 6) + 1);
  visual.setAttribute('aria-label', `Play ${game.title}`);
  visual.addEventListener('click', () => openGame(game));

  const mark = document.createElement('span');
  mark.className = 'card-mark';
  mark.textContent = details.mark;
  visual.append(mark);

  const body = document.createElement('div');
  body.className = 'card-body';

  const heading = document.createElement('div');
  heading.className = 'card-heading';
  const title = document.createElement('h3');
  title.textContent = game.title;
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'play-button';
  play.textContent = 'Play →';
  play.addEventListener('click', () => openGame(game));
  heading.append(title, play);

  const description = document.createElement('p');
  description.textContent = details.description;

  const tags = document.createElement('div');
  tags.className = 'tags';
  const labels = [details.genre, is3d(game) ? '3D' : '2D'];
  tags.append(...[...new Set(labels)].map(createTag));

  body.append(heading, description, tags);
  article.append(visual, body);
  return article;
}

function renderGames() {
  const term = elements.search.value.trim().toLocaleLowerCase();
  const visibleGames = games.filter((game) => {
    const details = detailFor(game);
    const searchText = `${game.title} ${game.id} ${details.genre} ${details.description} ${game.capabilities.join(' ')}`.toLocaleLowerCase();
    return matchesFilter(game) && searchText.includes(term);
  });

  elements.grid.replaceChildren(...visibleGames.map(createCard));
  elements.empty.hidden = visibleGames.length !== 0;
}

function setGameQuery(id, mode = 'push') {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('game', id);
  else url.searchParams.delete('game');
  window.history[`${mode}State`]({}, '', url);
}

function openGame(game, updateHistory = true) {
  const url = gameUrl(game);
  elements.playerTitle.textContent = game.title;
  elements.newTab.href = url;
  elements.frame.title = `${game.title} preview`;
  elements.frame.src = url;
  if (!elements.dialog.open) elements.dialog.showModal();
  if (updateHistory) setGameQuery(game.id);
}

function closeGame(updateHistory = true) {
  if (elements.dialog.open) elements.dialog.close();
  elements.frame.src = 'about:blank';
  if (updateHistory) setGameQuery(null);
}

function syncGameFromUrl() {
  const id = new URL(window.location.href).searchParams.get('game');
  const game = games.find((entry) => entry.id === id);
  if (game) openGame(game, false);
  else closeGame(false);
}

async function loadCatalog() {
  elements.status.textContent = 'gpu' in navigator ? 'WebGPU ready' : 'WebGPU unavailable';
  elements.status.classList.toggle('unsupported', !('gpu' in navigator));

  try {
    const response = await fetch(catalogUrl);
    if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.entries)) throw new Error('Catalog has no entries array');
    games = manifest.entries;
    elements.count.textContent = String(games.length).padStart(2, '0');
    renderFilters();
    renderGames();
    syncGameFromUrl();
  } catch (error) {
    elements.empty.hidden = false;
    elements.empty.textContent = 'The game catalog could not be loaded. Please refresh the page.';
    console.error(error);
  }
}

elements.search.addEventListener('input', renderGames);
document.querySelector('#player-close').addEventListener('click', () => closeGame());
elements.dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeGame();
});
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) closeGame();
});
window.addEventListener('popstate', syncGameFromUrl);

loadCatalog();
