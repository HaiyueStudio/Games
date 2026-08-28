import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('2048 fills the viewport and renders with four-sample MSAA', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../2048/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../2048/Game2048.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /#wrap\s*{[^}]*width:\s*100vw[^}]*height:\s*100dvh/s);
  assert.match(html, /canvas\s*{[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(source, /msaaSamples:\s*4/);
  assert.match(source, /engine\.displayWidth/);
  assert.match(source, /engine\.displayHeight/);
  assert.match(source, /cameraProjection\.update/);
  assert.match(source, /new TweenSystem\(/);
  assert.match(source, /Easing\.cubicOut/);
  assert.match(source, /tweenManager\.create/);
  assert.match(source, /loadGame2048Config/);
  assert.doesNotMatch(source, /updateWorldMatrix\(/);
  assert.doesNotMatch(source, /updateAspect\(/);
  assert.doesNotMatch(source, /_updateAnimations/);
  assert.doesNotMatch(source, /interface TileAnimation/);
  assert.doesNotMatch(source, /const (?:CELL|TILE|MOVE|SWIPE)_/);
  assert.doesNotMatch(source, /const TILE_COLORS/);
  assert.doesNotMatch(source, /const CANVAS_[WH]\s*=/);
});
