import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { createMugenDefaultFightSounds, MUGEN_DEFAULT_FIGHT_SOUND_PACKAGE } = await import('../mugen/game/MugenDefaultFightSounds.ts');

class FakeParam { value = 0; setValueAtTime(value) { this.value = value; } }
class FakeNode { connect(node) { return node; } disconnect() {} }
class FakeSource extends FakeNode { buffer = null; loop = false; playbackRate = new FakeParam(); onended = null; start() {} stop() { this.onended?.(); } }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakePanner extends FakeNode { pan = new FakeParam(); }
class FakeContext { state = 'suspended'; currentTime = 0; sampleRate = 48_000; destination = new FakeNode(); createBufferSource() { return new FakeSource(); } createGain() { return new FakeGain(); } createStereoPanner() { return new FakePanner(); } async decodeAudioData() { return { sampleRate: 22_050, length: 2_205, numberOfChannels: 1, duration: .1 }; } async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; } async close() { this.state = 'closed'; } }

test('generated fallback fight bank covers standard hit and guard cues with valid deterministic WAV data', async () => {
  const first = await createMugenDefaultFightSounds(); const second = await createMugenDefaultFightSounds();
  assert.equal(MUGEN_DEFAULT_FIGHT_SOUND_PACKAGE, 'haiyue-default-fight-sounds-v1'); assert.equal(first, second);
  assert.deepEqual(first.map(sound => [sound.group, sound.item]), [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [6, 0], [6, 1]]);
  for (const sound of first) { const bytes = Buffer.from(sound.encodedBase64, 'base64'); assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF'); assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE'); assert.equal(bytes.readUInt32LE(40), sound.frameLength * 2); assert.equal(createHash('sha256').update(bytes).digest('hex'), sound.encodedSha256); assert(bytes.some((value, index) => index >= 44 && value !== 0)); }
});

test('game audio automatically installs and plays the fallback bank for unprefixed HitDef sounds', async () => {
  const previous = globalThis.AudioContext; globalThis.AudioContext = FakeContext;
  try {
    const { MugenGameAudio } = await import('../mugen/game/MugenGameAudio.ts'); const audio = new MugenGameAudio(); await audio.install([{ packageSha256: 'a'.repeat(64), sounds: [] }]); audio.configureOwners({ P1: 'a'.repeat(64), P2: 'a'.repeat(64) }); await audio.unlock();
    const result = audio.consume([{ id: 'hit-1', tick: 1, sequence: 1, kind: 'audio', fighterId: 'P1', resourceOwner: 'fight', operation: 'play', group: 5, item: 2, channel: -1, volume: 255, pan: 0, frequency: 1, loop: false, lowPriority: false }]); assert.deepEqual(result, { requested: 1, played: 1, missing: 0 }); assert.equal(audio.stats.buffers, 7); audio.dispose();
  } finally { if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous; }
});
