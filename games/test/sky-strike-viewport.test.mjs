import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const url = new URL('../sky-strike/viewport.ts', import.meta.url);
const source = stripTypeScriptTypes(readFileSync(url, 'utf8')).replace("'./rules'", JSON.stringify(new URL('../sky-strike/rules.ts', import.meta.url).href));
const { skyStrikeViewport, skyStrikePointerX } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('wide and 1:2 screens preserve the full field without stretching', () => {
  const wide = skyStrikeViewport(600, 960, 465);
  assert.equal(wide.left, 60); assert.equal(wide.width, 480); assert.equal(wide.cameraX, 0);
  const standard = skyStrikeViewport(240, 480);
  assert.equal(standard.scale, 0.5); assert.equal(standard.left, 0); assert.equal(standard.visibleWidth, 480);
});
test('narrow viewport follows the fighter proportionally and reaches both field edges', () => {
  assert.equal(skyStrikeViewport(320, 960, 15).cameraX, 0);
  assert.equal(skyStrikeViewport(320, 960, 240).cameraX, 80);
  assert.equal(skyStrikeViewport(320, 960, 465).cameraX, 160);
});
test('pointer inverse remains aligned across screen sizes, camera positions and resizing', () => {
  for (const [width, height] of [[600, 960], [480, 960], [320, 960], [393, 852], [430, 932], [280, 1000]]) {
    for (const x of [15, 70, 160, 240, 360, 465]) {
      const view = skyStrikeViewport(width, height, x);
      const screenX = view.left + (x - view.cameraX) * view.scale;
      assert.ok(Math.abs(skyStrikePointerX(screenX, width, height) - x) < 1e-8);
      assert.ok(screenX >= view.left && screenX <= view.left + view.width);
    }
  }
});
