import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(repositoryRoot, ...parts), 'utf8');

test('Pages lobby is driven by the game manifest', () => {
  const manifest = JSON.parse(read('games', 'manifest.json'));
  const app = read('site', 'app.js');

  assert.ok(manifest.entries.length > 0);
  assert.match(app, /fetch\(catalogUrl\)/);
  assert.match(app, /\.\/games\/\$\{encodeURIComponent\(game\.id\)\}\/index\.html/);

  for (const game of manifest.entries) {
    assert.ok(existsSync(join(repositoryRoot, 'games', game.id, 'index.html')), `${game.id} needs index.html`);
  }
});

test('Pages deployment validates games and uploads the generated site', () => {
  const packageJson = JSON.parse(read('package.json'));
  const workflow = read('.github', 'workflows', 'deploy-pages.yml');

  assert.equal(packageJson.scripts['preview:build'], 'node scripts/build-preview-site.mjs');
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build\n/);
  assert.match(workflow, /npm run preview:build/);
  assert.match(workflow, /path: Games\/artifacts\/pages/);
});
