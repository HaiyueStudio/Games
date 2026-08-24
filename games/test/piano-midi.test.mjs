import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseMidi } from '../piano/midi.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(repositoryRoot, ...parts), 'utf8');

function exactArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

test('MIDI parser converts ticks, running notes, and tempo to timed piano events', () => {
  const track = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0x90, 0x3c, 0x64,
    0x83, 0x60, 0x80, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ];
  const bytes = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, track.length,
    ...track,
  ]);
  const parsed = parseMidi(bytes.buffer);
  assert.equal(parsed.notes.length, 1);
  assert.deepEqual(parsed.notes[0], {
    durationMs: 500,
    midi: 60,
    startMs: 0,
    velocity: 100,
  });
  assert.equal(parsed.durationMs, 500);
});

test('public-domain score catalog contains valid local MIDI files', () => {
  const catalog = JSON.parse(read('games', 'piano', 'scores', 'catalog.json'));
  const manifest = JSON.parse(read('games', 'manifest.json'));
  const piano = manifest.entries.find(entry => entry.id === 'piano');
  assert.equal(catalog.source, 'Mutopia Project');
  assert.equal(catalog.license, 'Public Domain');
  assert.equal(catalog.entries.length, 3);

  for (const score of catalog.entries) {
    assert.match(score.sourcePage, /^https:\/\/www\.mutopiaproject\.org\//);
    assert.match(score.mutopiaId, /^Mutopia-/);
    const relativeFile = score.file.replace(/^\.\//, '');
    const asset = join(repositoryRoot, 'games', 'piano', relativeFile.replace(/^scores\//, 'scores/'));
    assert.ok(existsSync(asset), `${score.id} MIDI file must exist`);
    assert.ok(piano.assets.includes(`piano/${relativeFile}`), `${score.id} must be declared in the manifest`);
    const parsed = parseMidi(exactArrayBuffer(readFileSync(asset)));
    assert.ok(parsed.notes.length > 20, `${score.id} must contain playable notes`);
    assert.ok(parsed.durationMs > 1_000, `${score.id} must have a meaningful duration`);
    assert.ok(parsed.notes.every(note => note.midi >= 0 && note.midi <= 127));
  }
});

test('piano exposes automatic playback and pointer glissando controls', () => {
  const html = read('games', 'piano', 'index.html');
  const main = read('games', 'piano', 'main.ts');
  assert.match(html, /id="score-list"/);
  assert.match(html, /id="auto-play"/);
  assert.match(html, /id="auto-stop"/);
  assert.match(main, /addEventListener\('pointerdown'/);
  assert.match(main, /addEventListener\('pointermove'/);
  assert.match(main, /setPointerCapture\(event\.pointerId\)/);
  assert.match(main, /key\.midi === lastPointerMidi/);
});

test('piano canvas and camera follow the browser viewport', () => {
  const html = read('games', 'piano', 'index.html');
  const main = read('games', 'piano', 'main.ts');
  assert.match(html, /#wrap\s*\{[^}]*width:\s*100vw;[^}]*height:\s*100dvh;/s);
  assert.match(html, /canvas\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
  assert.match(html, /<canvas id="canvas"><\/canvas>/);
  assert.match(main, /devicePixelRatio:\s*\(\) => Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/);
  assert.match(main, /this\.engine\.displayWidth \/ Math\.max\(1, this\.engine\.displayHeight\)/);
  assert.match(main, /CAMERA_BASE_RADIUS \* Math\.max\(1, CAMERA_REFERENCE_ASPECT \/ aspect\)/);
  assert.doesNotMatch(main, /CANVAS_W|CANVAS_H/);
});
