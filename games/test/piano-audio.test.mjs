import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { midiToFrequency, pianoVoiceDuration } from '../piano/audio.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(repositoryRoot, ...parts), 'utf8');

test('piano note frequencies use equal temperament around A4', () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(21) - 27.5) < 1e-10);
  assert.ok(Math.abs(midiToFrequency(60) - 261.6255653005986) < 1e-10);
  assert.throws(() => midiToFrequency(-1), RangeError);
  assert.throws(() => midiToFrequency(128), RangeError);
  assert.throws(() => midiToFrequency(60.5), RangeError);
});

test('lower piano notes sustain longer than higher notes', () => {
  assert.ok(pianoVoiceDuration(21) > pianoVoiceDuration(72));
  assert.equal(pianoVoiceDuration(127), 1.25);
});

test('piano audio is self-contained and no longer loads MIDI.js', () => {
  const html = read('games', 'piano', 'index.html');
  const main = read('games', 'piano', 'main.ts');
  assert.doesNotMatch(html, /MIDI\.min\.js|cdnjs\.cloudflare\.com/);
  assert.match(html, /bundle\.js\?v=piano-midi-library-v3/);
  assert.doesNotMatch(main, /window\.MIDI|midi-js-soundfonts/);
  assert.match(main, /new PianoSynth\(\)/);
});
