import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('billiards fills the viewport and renders its HUD with engine GUI', async () => {
  const [html, source, hud] = await Promise.all([
    readFile(new URL('../billiards/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../billiards/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../billiards/BilliardsHud.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /canvas\s*{[^}]*width:\s*100vw[^}]*height:\s*100dvh/s);
  assert.doesNotMatch(html, /id="(?:hud|score|state|aim|btn-new)"/);
  assert.match(source, /resizeToDisplaySize\(true\)/);
  assert.match(source, /viewportMode:\s*'expand'/);
  assert.match(source, /new GuiSystem\(/);
  assert.match(source, /new BilliardsHud\(/);
  assert.match(source, /new BilliardsHud\(this\.world, \(\) => this\.requestNewGame\(\)\)/);
  assert.match(source, /private requestNewGame\(\): void \{\s*this\.newGameRequested = true;/);
  assert.match(source, /private tick\([^)]*\): void \{\s*if \(this\.newGameRequested\)/);
  const newGameBody = source.match(/private newGame\(save = true\): void \{([\s\S]*?)\n {2}\}\n\n {2}private requestNewGame/);
  assert.ok(newGameBody, 'expected to find the newGame method');
  assert.doesNotMatch(newGameBody[1], /this\.world\.update\(/);
  assert.doesNotMatch(source, /getElementById\('(?:score|state|aim|btn-new)'\)/);
  assert.match(hud, /new GuiLabel\(/);
  assert.match(hud, /new GuiButton\(/);
  assert.match(hud, /hoverBackgroundColor:/);
});
