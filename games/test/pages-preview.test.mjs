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
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build\n/);
  assert.match(workflow, /npm run preview:build/);
  assert.match(workflow, /path: Games\/artifacts\/pages/);
});
