import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { FRUIT_SOUND_IDS, FRUIT_SAMPLE_RATE, FRUIT_SOUNDS, fruitSoundPath } from '../games/fruit-ninja/audio/sounds.ts';
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(context.parentURL?.endsWith('/fruit-ninja/audio/synthesis.ts') && specifier === './sounds' ? './sounds.ts' : specifier, context);
} });
const { synthesizeFruitSound, encodeFruitWav } = await import('../games/fruit-ninja/audio/synthesis.ts');
hook.deregister();

const root = new URL('../games/fruit-ninja/', import.meta.url), directory = new URL('assets/audio/', root);
mkdirSync(directory, { recursive: true });
const effects = [], preview = [], gap = new Float32Array(Math.round(FRUIT_SAMPLE_RATE * .22));
for (const id of FRUIT_SOUND_IDS) {
  const pcm = synthesizeFruitSound(id), wav = encodeFruitWav(pcm);
  writeFileSync(new URL(fruitSoundPath(id), root), wav);
  let peak = 0, energy = 0;
  for (const value of pcm) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
  effects.push({ id, file: `${id}.wav`, seconds: FRUIT_SOUNDS[id].seconds, bytes: wav.length, peak, rms: Math.sqrt(energy / pcm.length), sha256: createHash('sha256').update(wav).digest('hex') });
  preview.push(pcm, gap);
}
writeFileSync(new URL('generation.json', directory), JSON.stringify({
  generator: 'node --experimental-strip-types scripts/generate-fruit-audio.mjs', version: 1,
  method: 'Original deterministic offline synthesis: modal bamboo/wood percussion, filtered-noise air whooshes, liquid chirps, layered bass explosion and descending wooden bells. No third-party recordings, samples or models.',
  sampleRate: FRUIT_SAMPLE_RATE, channels: 1, bits: 16,
  design: { 'ui-click': 'Dry bamboo/wood contact, 110ms', 'bomb-explosion': 'Sharp attack, falling sub-bass body, noisy debris tail and one aftershock', 'fruit-throw': 'Three soft rising air swishes', 'fruit-splash': 'Three wet squelches with independently timed liquid droplets', 'game-over': 'Three descending bell notes followed by a low drum, 1.6s' },
  effects,
}, null, 2) + '\n');
const total = preview.reduce((sum, pcm) => sum + pcm.length, 0), reel = new Float32Array(total);
let offset = 0; for (const pcm of preview) { reel.set(pcm, offset); offset += pcm.length; }
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/fruit-ninja-audio-preview.wav', import.meta.url), encodeFruitWav(reel));
console.log(`Generated ${effects.length} Fruit Ninja WAV assets (${effects.reduce((sum, effect) => sum + effect.bytes, 0)} bytes) in ${directory.pathname}; preview: artifacts/fruit-ninja-audio-preview.wav`);
