import test from 'node:test';
import assert from 'node:assert/strict';
import { launcherPaths } from '../../site/catalog/paths.js';
import { gameUrl, thumbnailUrl } from '../../site/catalog/details.js';
import { desktopLayout } from '../launcher/layout.ts';

test('launcher resolves source, root and published games under arbitrary Live Server or Pages prefixes', () => {
  const game = { id: 'fruit-ninja', thumbnail: 'screenshots/fruit-ninja.png' };
  for (const [page, script, directory, expectedGame, expectedThumbnail] of [
    ['http://localhost:5500/site/index.html', 'http://localhost:5500/site/app.js', '../games/', '/games/fruit-ninja/index.html', '/site/screenshots/fruit-ninja.png'],
    ['http://localhost:5500/Games/index.html', 'http://localhost:5500/Games/site/app.js', './games/', '/Games/games/fruit-ninja/index.html', '/Games/site/screenshots/fruit-ninja.png'],
    ['http://localhost:5500/work/Games/site/index.html?game=2048', 'http://localhost:5500/work/Games/site/app.js', '../games/', '/work/Games/games/fruit-ninja/index.html', '/work/Games/site/screenshots/fruit-ninja.png'],
    ['https://haiyuestudio.github.io/Games/index.html', 'https://haiyuestudio.github.io/Games/app.js', './games/', '/Games/games/fruit-ninja/index.html', '/Games/screenshots/fruit-ninja.png'],
    ['http://localhost:5500/artifacts/pages/index.html', 'http://localhost:5500/artifacts/pages/app.js', './games/', '/artifacts/pages/games/fruit-ninja/index.html', '/artifacts/pages/screenshots/fruit-ninja.png'],
  ]) {
    const paths = launcherPaths(page, script, directory);
    assert.equal(new URL(gameUrl(game, paths.gamesRoot)).pathname, expectedGame);
    assert.equal(new URL(thumbnailUrl(game, paths.siteRoot)).pathname, expectedThumbnail);
    assert.equal(new URL(paths.catalogUrl).pathname, expectedGame.replace('/fruit-ninja/index.html', '/manifest.json'));
  }
});

test('native desktop keeps launch controls and a scrollable shelf inside phone and desktop viewports', () => {
  for (const [width, height] of [[320, 568], [390, 844], [600, 800], [844, 390], [1040, 600], [1440, 900], [2560, 1080]]) {
    const layout = desktopLayout(width, height);
    for (const rectangle of [layout.hero, layout.shelf]) {
      assert.ok(rectangle.x >= 0 && rectangle.y >= 0, `${width}x${height} origin`);
      assert.ok(rectangle.x + rectangle.width <= width && rectangle.y + rectangle.height <= height - layout.footer, `${width}x${height} bounds`);
    }
    assert.ok(layout.shelf.height >= 60 && layout.cardWidth >= 100, `${width}x${height} usable shelf`);
    assert.ok(layout.columns >= 2 && layout.columns <= 5);
    assert.ok(Math.abs(layout.cardHeight / layout.cardWidth - .625) < .01, `${width}x${height} image-only card aspect`);
  }
});
