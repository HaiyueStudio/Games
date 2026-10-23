import { detailFor, genreLabels, thumbnailUrl } from '../catalog/details.js';

export function favoriteBadge() {
  const badge = document.createElement('span');
  badge.className = 'card-favorite';
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = '<svg><use href="#icon-heart"/></svg>';
  return badge;
}

export function createCard(game, index, { selected, favorite, select, launch }) {
  const detail = detailFor(game);
  const article = document.createElement('article');
  article.className = 'game-card';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card-visual';
  button.classList.toggle('selected', selected);
  button.dataset.gameId = game.id;
  button.setAttribute('aria-label', `开始游戏：${detail.title}`);
  button.tabIndex = selected ? 0 : -1;
  button.addEventListener('focus', () => select(game));
  button.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' && !document.activeElement?.matches('input, textarea')) button.focus({ preventScroll: true });
  });
  button.addEventListener('click', () => launch(game));
  const screenshot = document.createElement('img');
  screenshot.className = 'card-screenshot';
  screenshot.src = thumbnailUrl(game);
  screenshot.alt = '';
  screenshot.loading = index < 3 ? 'eager' : 'lazy';
  screenshot.decoding = 'async';
  screenshot.addEventListener('load', () => button.classList.add('has-screenshot'));
  screenshot.addEventListener('error', () => screenshot.remove());
  const mark = document.createElement('span');
  mark.className = 'card-mark';
  mark.textContent = detail.mark;
  mark.setAttribute('aria-hidden', 'true');
  button.append(screenshot, mark);
  if (favorite) button.append(favoriteBadge());
  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('h3');
  title.textContent = detail.title;
  const genre = document.createElement('p');
  genre.textContent = genreLabels[detail.genre];
  body.append(title, genre);
  article.append(button, body);
  return article;
}

export function focusCard(cards, index) {
  const card = cards[Math.max(0, Math.min(cards.length - 1, index))];
  if (!card) return;
  card.focus({ preventScroll: true });
  card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}
