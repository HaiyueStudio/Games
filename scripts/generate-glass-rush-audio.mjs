import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GLASS_SOUND_IDS, GLASS_SAMPLE_RATE, GLASS_BPM, synthesizeGlassSound, encodeGlassWav } from '../games/glass-rush/audio/synthesis.ts';
const directory = new URL('../games/glass-rush/assets/audio/', import.meta.url);
mkdirSync(directory, { recursive: true });
const assets = GLASS_SOUND_IDS.map(id => {
  const channels = synthesizeGlassSound(id), bytes = encodeGlassWav(channels);
  writeFileSync(new URL(`${id}.wav`, directory), bytes);
  let peak = 0, energy = 0;
  for (const channel of channels) for (const value of channel) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
  return { id, seconds: channels[0].length / GLASS_SAMPLE_RATE, bytes: bytes.length, peak, rms: Math.sqrt(energy / (channels[0].length * 2)), sha256: createHash('sha256').update(bytes).digest('hex') };
});
writeFileSync(new URL('generation.json', directory), JSON.stringify({ version: 1, generator: 'node scripts/generate-glass-rush-audio.mjs', method: 'Original deterministic stereo PCM synthesis; no third-party samples. Eight-bar C minor / Ab / Eb / Bb electronic score with kick, snare, sixteenth hats, bass, FM arpeggios and sidechain pads. Two glass fracture cues with noise transients and inharmonic resonances.', sampleRate: GLASS_SAMPLE_RATE, channels: 2, bpm: GLASS_BPM, assets }, null, 2) + '\n');
console.log(JSON.stringify({ directory: directory.pathname, assets }));
