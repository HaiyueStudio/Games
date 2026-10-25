import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MinesAudio } from '../shared/minesweeper/audio/MinesAudio.ts';
import { MINE_SAMPLE_RATE, MINE_SOUND_IDS, MINE_SOUNDS, synthesizeMineSound, encodeMineWav } from '../shared/minesweeper/audio/SoundAssets.ts';

test('both minefields ship four reproducible, distinct, unclipped WAV effects with provenance', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  const hashes = new Set();
  for (const id of MINE_SOUND_IDS) {
    const pcm = synthesizeMineSound(id), wav = Buffer.from(encodeMineWav(pcm));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt16LE(20), 1); assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), MINE_SAMPLE_RATE); assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(4), wav.length - 8); assert.equal(wav.readUInt32LE(40), pcm.length * 2);
    assert.ok(Math.abs(pcm.length / MINE_SAMPLE_RATE - MINE_SOUNDS[id].seconds) < 1 / MINE_SAMPLE_RATE);
    assert.equal(pcm[0], 0); assert.equal(Math.abs(pcm.at(-1)), 0);
    let peak = 0, energy = 0;
    for (const value of pcm) { assert.ok(Number.isFinite(value)); peak = Math.max(peak, Math.abs(value)); energy += value * value; }
    assert.ok(peak > .73 && peak < .75); assert.ok(energy / pcm.length > .005);
    const hash = createHash('sha256').update(wav).digest('hex'); hashes.add(hash);
    for (const game of ['minesweeper', 'icosahedron-minesweeper']) {
      const entry = manifest.entries.find(entry => entry.id === game);
      assert.ok(entry.capabilities.includes('audio'));
      assert.ok(entry.assets.includes(`${game}/assets/audio/${id}.wav`));
      assert.ok(entry.assets.includes(`${game}/assets/audio/generation.json`));
      assert.deepEqual(wav, readFileSync(new URL(`../${game}/assets/audio/${id}.wav`, import.meta.url)));
      const generation = JSON.parse(readFileSync(new URL(`../${game}/assets/audio/generation.json`, import.meta.url)));
      const effect = generation.effects.find(effect => effect.id === id);
      assert.equal(effect.sha256, hash); assert.equal(effect.bytes, wav.length);
    }
  }
  assert.equal(hashes.size, 4);
});

function fixture() {
  const calls = [], stops = [];
  const backend = { ready: true, unlocks: 0, disposals: 0,
    unlock() { this.unlocks++; }, play(id, rate) { if (!this.ready) return false; calls.push({ id, rate }); return true; },
    stop(id) { stops.push(id); }, dispose() { this.disposals++; }, snapshot() { return {}; } };
  return { audio: new MinesAudio(backend), backend, calls, stops };
}

test('one accepted cue has no frame replay; removal uses a lower flag pitch', () => {
  const { audio, calls } = fixture();
  audio.click(); for (let i = 0; i < 30; i++) audio.update(.016);
  audio.flag(); audio.update(.03); audio.flag(false); audio.button();
  assert.deepEqual(calls, [{ id: 'click', rate: 1 }, { id: 'flag', rate: 1 }, { id: 'flag', rate: .88 }, { id: 'button', rate: 1 }]);
  assert.deepEqual(audio.snapshot().played, { click: 1, flag: 2, explosion: 0, button: 1 });
});

test('unlock delay retries the first cue once and expires stale input', () => {
  const { audio, backend, calls } = fixture(); backend.ready = false;
  audio.click(); audio.click(); audio.update(.05); assert.equal(calls.length, 0);
  backend.ready = true; audio.update(.01); audio.update(.01);
  assert.equal(calls.length, 1); assert.equal(audio.snapshot().pending, 0);
  backend.ready = false; audio.flag(); audio.update(.3); backend.ready = true; audio.update(.01);
  assert.equal(calls.length, 1); assert.equal(audio.snapshot().pending, 0);
});

test('rapid duplicate packets are coalesced, later interactions still play', () => {
  const { audio, calls } = fixture(); audio.click(); audio.click(); audio.update(.01); audio.click();
  assert.equal(calls.length, 1); audio.update(.02); audio.click(); assert.equal(calls.length, 2);
});

test('explosion cancels queued tile/flag sounds and stops current gameplay channels', () => {
  const { audio, backend, calls, stops } = fixture(); backend.ready = false;
  audio.click(); audio.flag(); audio.explosion(); assert.equal(audio.snapshot().pending, 1);
  backend.ready = true; audio.update(.016);
  assert.deepEqual(calls, [{ id: 'explosion', rate: 1 }]); assert.deepEqual(stops, ['click', 'flag']);
});

test('reset stops gameplay but keeps the GUI confirmation and mute preference', () => {
  const { audio, backend, calls, stops } = fixture(); backend.ready = false;
  audio.click(); audio.button(); audio.reset(); backend.ready = true; audio.update(.016);
  assert.deepEqual(calls, [{ id: 'button', rate: 1 }]); assert.deepEqual(stops, ['click', 'flag', 'explosion']);
  audio.toggleMute(); audio.reset(); assert.equal(audio.muted, true); audio.click(); audio.flag(); audio.button(); audio.explosion();
  assert.equal(calls.length, 1); assert.equal(audio.snapshot().pending, 0);
});

test('unmute plays one confirmation with no muted backlog', () => {
  const { audio, calls } = fixture(); assert.equal(audio.toggleMute(), true);
  audio.click(); audio.flag(); audio.explosion(); audio.button(); audio.update(.2);
  assert.equal(calls.length, 0); assert.equal(audio.toggleMute(), false); audio.update(.2);
  assert.deepEqual(calls, [{ id: 'button', rate: 1 }]);
});

test('pause discards pending input and teardown is idempotent with no later playback', () => {
  const { audio, backend, calls } = fixture(); backend.ready = false; audio.click(); audio.pause();
  backend.ready = true; audio.update(.016); audio.button(); assert.equal(calls.length, 0);
  audio.resume(); audio.update(.016); assert.equal(calls.length, 0); audio.click(); assert.equal(calls.length, 1);
  audio.dispose(); audio.dispose(); audio.resume(); audio.click(); audio.button(); audio.explosion(); audio.reset(); audio.update(1);
  assert.equal(backend.disposals, 1); assert.equal(calls.length, 1); assert.equal(audio.snapshot().disposed, true);
});
