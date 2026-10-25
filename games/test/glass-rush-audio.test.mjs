import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GlassAudio } from '../glass-rush/audio/GlassAudio.ts';
import { GLASS_SOUND_IDS, GLASS_SAMPLE_RATE, GLASS_BPM, synthesizeGlassSound, encodeGlassWav } from '../glass-rush/audio/synthesis.ts';
import { createRound } from '../glass-rush/rules/model.ts';

test('original stereo assets reproduce exactly, remain unclipped and match the manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).entries.find(entry => entry.id === 'glass-rush');
  const generation = JSON.parse(readFileSync(new URL('../glass-rush/assets/audio/generation.json', import.meta.url)));
  for (const id of GLASS_SOUND_IDS) {
    const pcm = synthesizeGlassSound(id), wav = Buffer.from(encodeGlassWav(pcm));
    assert.deepEqual(wav, readFileSync(new URL(`../glass-rush/assets/audio/${id}.wav`, import.meta.url)));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt16LE(22), 2); assert.equal(wav.readUInt32LE(24), GLASS_SAMPLE_RATE);
    assert.equal(createHash('sha256').update(wav).digest('hex'), generation.assets.find(asset => asset.id === id).sha256);
    let peak = 0, energy = 0, stereo = 0;
    for (let i = 0; i < pcm[0].length; i++) {
      const l = pcm[0][i], r = pcm[1][i]; assert.ok(Number.isFinite(l) && Number.isFinite(r));
      peak = Math.max(peak, Math.abs(l), Math.abs(r)); energy += l*l + r*r; stereo += Math.abs(l-r);
    }
    assert.ok(peak > .8 && peak < .9); assert.ok(energy / (pcm[0].length * 2) > .002); assert.ok(stereo > 1);
    assert.ok(manifest.assets.includes(`glass-rush/assets/audio/${id}.wav`));
    if (id === 'music') {
      assert.equal(pcm[0].length / GLASS_SAMPLE_RATE, 32 * 60 / GLASS_BPM);
      for (const channel of pcm) assert.ok(Math.abs(channel[0] - channel.at(-1)) < .06, 'loop boundary is continuous');
    } else for (const channel of pcm) { assert.equal(channel[0], 0); assert.equal(channel.at(-1), 0); }
  }
});

function fixture() {
  const calls = [], stops = [];
  const backend = { ready: true, unlocks: 0, suspends: 0, disposed: 0,
    unlock() { this.unlocks++; }, suspend() { this.suspends++; },
    play(id, loop) { if (!this.ready) return false; calls.push({ id, loop }); return true; },
    stop(channel) { stops.push(channel); }, dispose() { this.disposed++; }, snapshot() { return {}; } };
  return { audio: new GlassAudio(backend), backend, calls, stops, round: createRound() };
}

test('music waits for activation, has one loop, and pause/resume preserves the existing voice', () => {
  const { audio, round, backend, calls } = fixture();
  audio.sync(round,.1); assert.equal(calls.length,0);
  backend.ready=false; round.phase='playing'; audio.sync(round,.1); assert.equal(calls.length,0);
  backend.ready=true; for(let i=0;i<100;i++) audio.sync(round,.016);
  assert.deepEqual(calls,[{id:'music',loop:true}]);
  round.phase='paused';audio.sync(round,.1);assert.ok(backend.suspends>0);assert.equal(audio.snapshot().musicPlaying,false);
  round.phase='playing';audio.sync(round,.1);assert.equal(calls.length,1);assert.equal(audio.snapshot().musicPlaying,true);
});

test('each hit plays once, fourth hit stops music and plays the larger shatter cue, restart has no backlog', () => {
  const { audio, round, calls, stops } = fixture();round.phase='playing';audio.sync(round,0);
  for(let hit=1;hit<=4;hit++) {
    round.hits=hit;if(hit===4)round.phase='over';audio.sync(round,.016);audio.sync(round,.016);
  }
  assert.deepEqual(calls.map(call=>call.id),['music','impact','impact','impact','shatter']);
  assert.ok(stops.includes('music'));assert.equal(audio.snapshot().musicPlaying,false);
  const next=createRound();next.phase='playing';audio.sync(next,.016);
  assert.equal(calls.at(-1).id,'music');assert.equal(audio.snapshot().pending,false);
});

test('mute, stale unlock requests, pause and disposal cannot replay old fractures', () => {
  const { audio, round, backend, calls } = fixture();round.phase='playing';audio.sync(round,0);
  backend.ready=false;round.hits=1;audio.sync(round,.016);assert.equal(audio.snapshot().pending,true);
  audio.sync(round,.3);backend.ready=true;audio.sync(round,.016);assert.equal(calls.length,1);
  audio.toggle();round.hits=2;audio.sync(round,.016);assert.equal(calls.length,1);
  audio.toggle();audio.sync(round,.016);assert.equal(calls.at(-1).id,'music');assert.equal(audio.snapshot().played.impact,0);
  round.phase='paused';audio.sync(round,.016);const count=calls.length;
  audio.dispose();audio.dispose();audio.unlock();audio.toggle();audio.sync(round,1);
  assert.equal(calls.length,count);assert.equal(backend.disposed,1);
});
test('music-only toggle preserves fracture cues and does not duplicate the resumed loop',()=>{
  const { audio,round,calls,stops }=fixture();round.phase='playing';audio.sync(round,0);
  audio.toggleMusic();audio.sync(round,.016);assert.equal(audio.snapshot().musicMuted,true);assert.equal(audio.snapshot().musicPlaying,false);
  round.hits=1;audio.sync(round,.016);assert.equal(calls.at(-1).id,'impact');assert.equal(audio.snapshot().played.music,1);assert.ok(stops.includes('music'));
  audio.toggleMusic();audio.sync(round,.016);audio.sync(round,.016);assert.equal(audio.snapshot().played.music,2);assert.equal(audio.snapshot().musicPlaying,true);
});
