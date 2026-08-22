import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(repositoryRoot, ...parts), 'utf8');

test('Spider Solitaire draws canvas card textures after opaque card bodies', () => {
  const source = read('games', 'spider-solitaire', 'main.ts');
  const page = read('games', 'spider-solitaire', 'index.html');

  assert.match(
    source,
    /texture: this\.createCardCanvas\(rank\), cullMode: 'none', blending: 'normal', depthWrite: false/,
    'face textures should use the blended render pass',
  );
  assert.match(
    source,
    /texture: this\.createBackCanvas\(\), cullMode: 'none', blending: 'normal', depthWrite: false/,
    'back textures should use the blended render pass',
  );
  assert.match(
    page,
    /bundle\.js\?v=spider-solitaire-card-material-fix-v4/,
    'the page should invalidate bundles cached before the card material fix',
  );
});
