import assert from 'node:assert/strict';
import test from 'node:test';
import { BilliardsAudio } from '../billiards-3d/audio/BilliardsAudio.ts';
import { BILLIARDS_SAMPLE_RATE, BILLIARDS_SOUNDS, synthesizeBilliardsSound } from '../billiards-3d/audio/sounds.ts';

function fixture() {
  const calls = [];
  const backend = { ready: true, stops: 0, disposals: 0,
    unlock() {}, play(id, strength, pan) { if (!this.ready) return false; calls.push({ id, strength, pan }); return true; },
    stop() { this.stops++; }, dispose() { this.disposals++; }, snapshot() { return {}; } };
  return { audio: new BilliardsAudio(backend), backend, calls };
}

test('billiards effects are reproducible, distinct and unclipped with silent boundaries', () => {
  const signatures = new Set();
  for (const id of Object.keys(BILLIARDS_SOUNDS)) {
    const samples = synthesizeBilliardsSound(id);
    assert.deepEqual(samples, synthesizeBilliardsSound(id));
    assert.equal(samples.length, Math.round(BILLIARDS_SOUNDS[id].seconds * BILLIARDS_SAMPLE_RATE));
    assert.equal(samples[0], 0); assert.equal(Math.abs(samples.at(-1)), 0);
    let peak = 0, energy = 0;
    for (const sample of samples) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
    assert.ok(peak > 0.79 && peak < 0.81); assert.ok(energy / samples.length > 0.001);
    signatures.add(samples.slice(10, 20).join(','));
  }
  assert.equal(signatures.size, 5);
});

test('collision chatter is filtered while distinct and later impacts keep their strength and position', () => {
  const { audio, calls } = fixture();
  audio.contact('1:2', false, 0.04, 0);
  assert.equal(calls.length, 0, 'resting contacts are silent');
  audio.contact('1:2', false, 2, -380); audio.contact('1:2', false, 2, -380);
  audio.contact('2:3', true, 6, 380);
  assert.equal(calls.length, 2); assert.equal(calls[0].id, 'collision'); assert.equal(calls[1].id, 'cushion');
  assert.ok(calls[0].strength < calls[1].strength); assert.ok(calls[0].pan < 0 && calls[1].pan > 0);
  audio.update(0.07); audio.contact('1:2', false, 3, 0);
  assert.equal(calls.length, 3);
});

test('last pot plays the pocket cue and a single victory; restarting cancels voices and re-arms victory', () => {
  const { audio, backend, calls } = fixture();
  audio.cue(0.8); audio.pocket(380); audio.victory(); audio.victory();
  assert.deepEqual(calls.map(call => call.id), ['cue', 'pocket', 'victory']);
  audio.reset(); assert.equal(backend.stops, 1); audio.victory();
  assert.equal(calls.filter(call => call.id === 'victory').length, 2);
  audio.dispose(); audio.dispose(); audio.cue(1); audio.contact('1:2', false, 8, 0); audio.pocket(0); audio.victory();
  assert.equal(backend.disposals, 1); assert.equal(calls.length, 4);
});

test('locked audio never queues a stale burst after unlock', () => {
  const { audio, backend, calls } = fixture(); backend.ready = false;
  audio.contact('1:2', false, 2, 0); audio.pocket(0); audio.update(1);
  backend.ready = true; audio.update(1); assert.equal(calls.length, 0);
  audio.contact('1:2', false, 2, 0); assert.equal(calls.length, 1);
});
