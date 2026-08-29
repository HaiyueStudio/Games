import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { projectToScreen } from '../billiards-3d/input.ts';

test('billiards 3d cue picking projects into the current viewport', () => {
  const identity = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);

  assert.deepEqual(projectToScreen(0, 0, 0, identity, 1280, 720), {
    x: 640,
    y: 360,
    behind: false,
  });
  assert.deepEqual(projectToScreen(0, 0, 0, identity, 390, 844), {
    x: 195,
    y: 422,
    behind: false,
  });
});

test('billiards 3d cue charging takes pointer priority over orbit controls', async () => {
  const source = await readFile(new URL('../billiards-3d/main.ts', import.meta.url), 'utf8');
  assert.match(source, /addEventListener\('pointerdown',[\s\S]*?stopImmediatePropagation\(\);[\s\S]*?capture:\s*true/);
  assert.match(source, /writeProjectionMatrix\(this\.projection, aspect\)/);
  assert.doesNotMatch(source, /\* 450|\* 300/);
});
