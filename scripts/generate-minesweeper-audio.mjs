import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MINE_SAMPLE_RATE, MINE_SOUND_IDS, MINE_SOUNDS, synthesizeMineSound, encodeMineWav } from '../games/shared/minesweeper/audio/SoundAssets.ts';

const effects = MINE_SOUND_IDS.map(id => {
  const pcm = synthesizeMineSound(id), bytes = encodeMineWav(pcm);
  let energy = 0, peak = 0;
  for (const sample of pcm) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  return { id, pcm, bytes, definition: { id, file: `${id}.wav`, seconds: MINE_SOUNDS[id].seconds, bytes: bytes.length,
    peak, rms: Math.sqrt(energy / pcm.length), sha256: createHash('sha256').update(bytes).digest('hex') } };
});
const generation = { version: 1, generator: 'node --experimental-strip-types scripts/generate-minesweeper-audio.mjs',
  method: 'Original deterministic offline synthesis: modal metal tile contact, fabric swish/brass pin, filtered-noise explosion with falling bass and debris, and a two-tone UI confirmation. No external samples.',
  sampleRate: MINE_SAMPLE_RATE, channels: 1, bits: 16, effects: effects.map(effect => effect.definition) };
for (const game of ['minesweeper', 'icosahedron-minesweeper']) {
  const output = new URL(`../games/${game}/assets/audio/`, import.meta.url); mkdirSync(output, { recursive: true });
  for (const effect of effects) writeFileSync(new URL(`${effect.id}.wav`, output), effect.bytes);
  writeFileSync(new URL('generation.json', output), JSON.stringify(generation, null, 2) + '\n');
}
const gap = new Float32Array(Math.round(MINE_SAMPLE_RATE * .3)), frames = effects.reduce((sum, effect) => sum + effect.pcm.length + gap.length, 0);
const preview = new Float32Array(frames); let offset = 0;
for (const effect of effects) { preview.set(effect.pcm, offset); offset += effect.pcm.length + gap.length; }
const artifacts = new URL('../artifacts/', import.meta.url); mkdirSync(artifacts, { recursive: true });
writeFileSync(new URL('minesweeper-audio-preview.wav', artifacts), encodeMineWav(preview));
console.log(`Generated four shared Minesweeper sounds (${effects.reduce((sum, effect) => sum + effect.bytes.length, 0)} bytes per game); preview: artifacts/minesweeper-audio-preview.wav`);
