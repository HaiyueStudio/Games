import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LibraryState } from '../../site/state/library.js';
import { detailFor, filterGames } from '../../site/catalog/details.js';

const games = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).entries;
function storage(initial) {
  let value = initial;
  return { getItem: () => value, setItem: (_, next) => { value = next; } };
}

test('launcher preferences recover from invalid storage and discard removed games', () => {
  assert.deepEqual(new LibraryState(storage('{broken')).favorites, []);
  const store = storage(JSON.stringify({ favorites: ['tank-battle', 'tank-battle', 42, 'removed'], recent: ['2048', 'removed'] }));
  const library = new LibraryState(store);
  library.reconcile(games);
  assert.deepEqual(library.favorites, ['tank-battle']);
  assert.deepEqual(library.recent, ['2048']);
  library.toggleFavorite('2048');
  assert.deepEqual(new LibraryState(store).favorites, ['tank-battle', '2048']);
  library.toggleFavorite('tank-battle');
  assert.deepEqual(new LibraryState(store).favorites, ['2048']);
});

test('launch history is ordered, bounded, and still works when storage is blocked', () => {
  const library = new LibraryState({ getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } });
  for (const game of games) library.recordLaunch(game.id);
  assert.equal(library.recent.length, 12);
  const last = games.at(-1).id;
  library.recordLaunch(last);
  assert.equal(library.recent.length, 12);
  assert.equal(library.recent[0], last);
  library.toggleFavorite(last);
  assert.deepEqual(library.favorites, [last]);
});

test('views combine Chinese/English search, category and actual local history', () => {
  assert.equal(filterGames(games, { term: '铁甲' })[0].id, 'tank-battle');
  assert.equal(filterGames(games, { term: 'Tank Battle' })[0].id, 'tank-battle');
  assert.equal(filterGames(games, { view: 'favorites' }).length, 0);
  assert.deepEqual(filterGames(games, { view: 'recent', recent: ['2048', 'tank-battle'] }).map(game => game.id), ['2048', 'tank-battle']);
  assert.deepEqual(filterGames(games, { view: 'favorites', favorites: ['2048', 'tank-battle'], category: 'puzzle' }).map(game => game.id), ['2048']);
  assert.equal(filterGames(games, { term: 'no-such-title' }).length, 0);
  for (const game of games) assert.notEqual(detailFor(game).genre, 'game', game.id);
});
