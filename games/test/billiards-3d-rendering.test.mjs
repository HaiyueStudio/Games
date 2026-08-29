import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('billiards 3d renders its responsive HUD with engine GUI', async () => {
  const [html, source, hud] = await Promise.all([
    readFile(new URL('../billiards-3d/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../billiards-3d/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../billiards-3d/Billiards3DHud.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /canvas\s*{[^}]*width:\s*100vw[^}]*height:\s*100dvh/s);
  assert.doesNotMatch(html, /id="(?:hud|score|state|power-wrap|power|controls|btn-new)"/);
  assert.match(source, /new GuiSystem\(/);
  assert.match(source, /new Billiards3DHud\(this\.world, \(\) => this\.requestNewGame\(\)\)/);
  assert.match(source, /private requestNewGame\(\): void \{\s*this\.newGameRequested = true;/);
  assert.match(source, /private tick\([^)]*\): void \{\s*if \(this\.newGameRequested\)/);
  assert.doesNotMatch(source, /getElementById\('(?:score|state|power-wrap|power|btn-new)'\)/);
  assert.match(hud, /new GuiLabel\(/);
  assert.match(hud, /new GuiButton\(/);
  assert.match(hud, /showPower\(power: number\)/);
  assert.match(hud, /hoverBackgroundColor:/);
});

test('billiards 3d delegates matrix operations to wgpu-matrix', async () => {
  const source = await readFile(new URL('../billiards-3d/main.ts', import.meta.url), 'utf8');

  assert.match(source, /import \{ mat4 \} from 'wgpu-matrix'/);
  assert.match(source, /mat4\.inverse\(this\.orbitTransform\.worldMatrix, this\.viewMatrix\)/);
  assert.match(source, /mat4\.multiply\(projection, view, this\.viewProj\)/);
  assert.doesNotMatch(source, /function (?:multiply4|invert4)\(/);
});

test('billiards 3d reuses a tapered cue stick and pulls it back with shot power', async () => {
  const [source, cueStick] = await Promise.all([
    readFile(new URL('../billiards-3d/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../billiards-3d/CueStick.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(source, /this\.cueStick = new CueStick\(this\.world\)/);
  assert.match(source, /this\.cueStick\.show\(/);
  assert.match(source, /this\.cueStick\.hide\(\)/);
  assert.match(cueStick, /createCylinder3D\(\{/);
  assert.match(cueStick, /CUE_MAX_PULLBACK \* clampedPower/);
  assert.match(cueStick, /cueX - directionX \* distance/);
  assert.match(cueStick, /cueZ - directionZ \* distance/);
  assert.match(cueStick, /this\.entity\.disabled = (?:true|false)/);
});
