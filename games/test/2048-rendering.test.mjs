import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('2048 fills the viewport and renders its HUD with engine GUI and four-sample MSAA', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../2048/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../2048/Game2048.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /#canvas\s*{[^}]*width:\s*100vw[^}]*height:\s*100dvh/s);
  assert.doesNotMatch(html, /id="(?:overlay|hud|scores|tile-labels|status|btn-new)"/);
  assert.match(source, /msaaSamples:\s*4/);
  assert.match(source, /engine\.displayWidth/);
  assert.match(source, /engine\.displayHeight/);
  assert.match(source, /cameraProjection\.update/);
  assert.match(source, /new TweenSystem\(/);
  assert.match(source, /Easing\.cubicOut/);
  assert.match(source, /tweenManager\.create/);
  assert.match(source, /loadGame2048Config/);
  assert.match(source, /new GuiRoot\(/);
  assert.match(source, /new GuiLabel\(/);
  assert.match(source, /new GuiButton\(/);
  assert.equal(source.match(/new GuiButton\(/g)?.length, 1);
  assert.doesNotMatch(source, /labelRoot|labelEntity|_textElement/);
  assert.match(source, /new GuiSystem\(/);
  assert.doesNotMatch(source, /document\.|HTMLElement|createElement|getElementById/);
  assert.doesNotMatch(source, /updateWorldMatrix\(/);
  assert.doesNotMatch(source, /updateAspect\(/);
  assert.doesNotMatch(source, /_updateAnimations/);
  assert.doesNotMatch(source, /interface TileAnimation/);
  assert.doesNotMatch(source, /const (?:CELL|TILE|MOVE|SWIPE)_/);
  assert.doesNotMatch(source, /const TILE_COLORS/);
  assert.doesNotMatch(source, /const CANVAS_[WH]\s*=/);
});
