import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('the private BoxWorld app is excluded from public examples and thumbnails', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.entries.some(entry => entry.id === 'boxbound'), false);
  assert.equal(existsSync(new URL('../boxbound/', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../site/screenshots/boxbound.png', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../artifacts/pages/games/boxbound/', import.meta.url)), false);
  assert.doesNotMatch(readFileSync(new URL('../../README.md', import.meta.url), 'utf8'), /games\/boxbound\//);
});

test('the private Darkside app is excluded from public games and thumbnails', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.entries.some(entry => entry.id === 'echo-path'), false);
  assert.equal(existsSync(new URL('../echo-path/', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../site/screenshots/echo-path.png', import.meta.url)), false);
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /games\/echo-path\//);
});

test('the private CalendarPuzzle app is excluded from public games and PadOS', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.entries.some(entry => entry.id === 'calendar-puzzle'), false);
  assert.equal(existsSync(new URL('../calendar-puzzle/', import.meta.url)), false);
  assert.equal(existsSync(new URL('../pad-simulator/scenes/CalendarPuzzlePadGame.ts', import.meta.url)), false);
  const pad = readFileSync(new URL('../pad-simulator/scenes/PadOSScene.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(pad, /CalendarPuzzlePadGame|['"]calendar-puzzle['"]/);
  const site = readFileSync(new URL('../../site/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(site, /['"]calendar-puzzle['"]\s*:/);
});
