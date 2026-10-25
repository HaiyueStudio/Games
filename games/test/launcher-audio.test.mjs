import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LAUNCHER_AUDIO, renderLauncherAudio } from '../launcher/audio/soundscape.ts';

const generation = JSON.parse(readFileSync(new URL('../../site/audio/generation.json', import.meta.url)));
test('authored page audio has verified original PCM assets with bounded peaks and a quiet ambient mix', () => {
  assert.equal(generation.assets.length, Object.keys(LAUNCHER_AUDIO).length);
  for (const asset of generation.assets) {
    const bytes = readFileSync(new URL('../../site/audio/' + asset.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.length, asset.bytes); assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.readUInt16LE(22), 2);
    assert.equal(bytes.readUInt32LE(24), 22050); assert.equal(bytes.readUInt32LE(40) / 4, Math.round(asset.seconds * 22050));
    assert.ok(asset.peak < .9 && asset.rms > .001);
    if (asset.kind === 'ambient') assert.ok(asset.rms < .04 && asset.seconds >= 32);
    else assert.ok(asset.seconds <= 1.4);
  }
});

test('ethereal UI cues are deterministic, distinct, stereo, bounded and fade cleanly to silence', () => {
  const hashes = new Set();
  for (const kind of Object.keys(LAUNCHER_AUDIO).filter(kind => kind !== 'ambient')) {
    const first = renderLauncherAudio(kind), second = renderLauncherAudio(kind);
    assert.equal(first.length, 2); assert.equal(first[0].length, Math.round(LAUNCHER_AUDIO[kind].seconds * 22050));
    assert.deepEqual(first, second); assert.notDeepEqual(first[0], first[1]);
    assert.equal(Math.abs(first[0][0]), 0); assert.equal(Math.abs(first[0].at(-1)), 0);
    assert.ok(first.every(channel => channel.every(sample => Number.isFinite(sample) && Math.abs(sample) < .9)));
    hashes.add(createHash('sha256').update(new Uint8Array(first[0].buffer)).digest('hex'));
  }
  assert.equal(hashes.size, 5);
});

test('ambient harmony wraps continuously without hard loop clicks or percussion spikes', () => {
  const channels = renderLauncherAudio('ambient');
  for (const samples of channels) {
    assert.ok(Math.abs(samples[0] - samples.at(-1)) < .005);
    let largest = 0;
    for (let frame = 1; frame < samples.length; frame++) largest = Math.max(largest, Math.abs(samples[frame] - samples[frame - 1]));
    assert.ok(largest < .02);
  }
});
