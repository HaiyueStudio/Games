import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
  assert.match(app, /document\.createElement\('img'\)/);
  assert.match(app, /screenshot\.loading = index < 3 \? 'eager' : 'lazy'/);
  assert.match(app, /screenshot\.decoding = 'async'/);

  const thumbnailPaths = new Set();
  for (const game of manifest.entries) {
    assert.ok(existsSync(join(repositoryRoot, 'games', game.id, 'index.html')), `${game.id} needs index.html`);
    assert.equal(typeof game.thumbnail, 'string', `${game.id} needs a thumbnail path`);
    assert.ok(!thumbnailPaths.has(game.thumbnail), `${game.id} needs a unique thumbnail`);
    const thumbnail = join(repositoryRoot, 'site', game.thumbnail);
    assert.ok(existsSync(thumbnail), `${game.id} thumbnail needs to exist`);
    assert.ok(statSync(thumbnail).size >= 1024, `${game.id} thumbnail needs real image content`);
    thumbnailPaths.add(game.thumbnail);
  }
});

test('Pages deployment validates games and uploads the generated site', () => {
  const packageJson = JSON.parse(read('package.json'));
  const workflow = read('.github', 'workflows', 'deploy-pages.yml');

  assert.equal(packageJson.scripts['preview:build'], 'node scripts/build-preview-site.mjs');
  assert.match(
    workflow,
    /repository: HaiyueStudio\/Engine\n\s+ref: master\n\s+path: Engine/,
    'the Engine checkout should use its default master branch',
  );
  assert.doesNotMatch(
    workflow,
    /repository: HaiyueStudio\/Engine\n\s+ref: main/,
    'the Engine repository does not expose a main branch',
  );
  const enginePackageCommands = [
    'npm run build:shader-language',
    'npm run build:engine',
    'npm run build:animation-spec',
    'npm run build:extensions',
    'npm run pack:candidates',
  ];
  const enginePackageCommandOffsets = enginePackageCommands.map(command => workflow.indexOf(command));
  assert.ok(
    enginePackageCommandOffsets.every((offset, index) => offset >= 0 && (index === 0 || offset > enginePackageCommandOffsets[index - 1])),
    'Engine workspaces should be built in dependency order before candidate packages are packed',
  );
  const uploadOffset = workflow.indexOf('actions/upload-pages-artifact@');
  const deployJobOffset = workflow.indexOf('\n  deploy:');
  const configurePagesOffset = workflow.indexOf('actions/configure-pages@');
  const deployPagesOffset = workflow.indexOf('actions/deploy-pages@');
  assert.ok(
    uploadOffset >= 0
      && deployJobOffset > uploadOffset
      && configurePagesOffset > deployJobOffset
      && deployPagesOffset > configurePagesOffset,
    'Pages should be configured inside the permission-scoped deploy job before deployment',
  );
  assert.match(
    workflow,
    /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5\.0\.0/,
    'the deployment action should use the verified deploy-pages v5.0.0 commit',
  );
  assert.doesNotMatch(
    workflow,
    /actions\/deploy-pages@decdde0ac072f6db7b846693aeb66d213a3b5175/,
    'the unresolved deploy-pages commit must not be restored',
  );
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build\n/);
  assert.match(workflow, /npm run preview:build/);
  assert.match(workflow, /path: Games\/artifacts\/pages/);
});
