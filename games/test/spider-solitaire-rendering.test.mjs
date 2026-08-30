import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(repositoryRoot, ...parts), 'utf8');

test('Spider Solitaire draws canvas card textures after opaque card bodies', () => {
  const source = read('games', 'spider-solitaire', 'SpiderSolitaireGame.ts');
  const page = read('games', 'spider-solitaire', 'index.html');

  assert.match(
    source,
    /texture: this\.createCardCanvas\(rank, suit\), cullMode: 'none', blending: 'normal', depthWrite: false/,
    'face textures should use the blended render pass',
  );
  assert.match(
    source,
    /texture: this\.createBackCanvas\(\), cullMode: 'none', blending: 'normal', depthWrite: false/,
    'back textures should use the blended render pass',
  );
  assert.match(
    page,
    /bundle\.js\?v=spider-solitaire-interaction-v7/,
    'the page should invalidate bundles cached before engine-managed interaction',
  );
});

test('Spider Solitaire exposes one, two, and four-suit difficulty controls', () => {
  const source = read('games', 'spider-solitaire', 'SpiderSolitaireGame.ts');

  assert.match(source, /difficulty: 'easy'.*label: 'Easy · 1 Suit'/);
  assert.match(source, /difficulty: 'normal'.*label: 'Normal · 2'/);
  assert.match(source, /difficulty: 'hard'.*label: 'Hard · 4'/);
  assert.match(source, /private difficulty: Difficulty = 'easy'/, 'easy should be the default difficulty');
  assert.match(source, /this\.newGame\(true, `\$\{DIFFICULTY_LABELS\[difficulty\]\} started\./);
});

test('Spider Solitaire reuses scene entities and geometry during drag and deal animation', () => {
  const source = read('games', 'spider-solitaire', 'SpiderSolitaireGame.ts');

  assert.match(source, /private sceneVisuals: SceneVisual\[\] = \[\]/, 'scene visuals should be pooled');
  assert.match(source, /private geometryCache = new Map<string, Geometry3D>\(\)/, 'generated geometry should be cached');
  assert.match(source, /if \(this\.drag\.active\) this\.requestSceneRender\(\)/, 'pointer events should only invalidate the next frame');
  assert.match(source, /this\.flushRender\(\);\s+this\.world\.update\(time, delta\)/, 'scene rebuilds should be coalesced to the engine tick');
  assert.match(source, /if \(position\[0\] !== x \|\| position\[1\] !== y \|\| position\[2\] !== z\)/, 'static transforms should not be dirtied every frame');
  assert.doesNotMatch(source, /this\.world\.removeEntity\(entity\)/, 'animation frames should not destroy scene entities');
  assert.doesNotMatch(source, /new CartesianTransform3D\(\{\s+position: \[pose\.x, pose\.y, pose\.z\]/, 'card picking should reuse its transform');
});

test('Spider Solitaire delegates pointer and keyboard input to engine components', () => {
  const source = read('games', 'spider-solitaire', 'SpiderSolitaireGame.ts');

  assert.match(source, /new InteractionSystem\(this\.engine, this\.cameraEntity\)/);
  assert.match(source, /new Interactive\(\{/);
  assert.match(source, /this\.keyboard = new KeyboardComponent\(\)/);
  assert.match(source, /this\.keyboard\.wasPressed\('spider\.deal'\)/);
  assert.doesNotMatch(source, /\.addEventListener\(/, 'game code should not bind native input listeners');
});
