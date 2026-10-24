import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { JIGSAW_SOUND_IDS, JIGSAW_SAMPLE_RATE, JIGSAW_SOUNDS } from '../games/jigsaw-puzzle/audio/sounds.ts';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.endsWith('/jigsaw-puzzle/audio/synthesis.ts') && specifier === './sounds' ? './sounds.ts' : specifier, context);
} });
const { synthesizeJigsawSound, encodeJigsawWav } = await import('../games/jigsaw-puzzle/audio/synthesis.ts');
hook.deregister();
const directory = new URL('../games/jigsaw-puzzle/assets/audio/', import.meta.url);
mkdirSync(directory, { recursive: true });
const effects = [], clips = [];
for (const id of JIGSAW_SOUND_IDS) {
  const pcm = synthesizeJigsawSound(id), wav = encodeJigsawWav(pcm);
  writeFileSync(new URL(`${id}.wav`, directory), wav);
  effects.push({ id, seconds: JIGSAW_SOUNDS[id].seconds, bytes: wav.length, sha256: createHash('sha256').update(wav).digest('hex') });
  clips.push(pcm, new Float32Array(Math.round(JIGSAW_SAMPLE_RATE * .25)));
}
writeFileSync(new URL('generation.json', directory), JSON.stringify({
  generator: 'node --experimental-strip-types scripts/generate-jigsaw-audio.mjs', version: 1,
  method: 'Original deterministic offline synthesis, modal wood percussion and a four-note rising completion chime; no third-party samples.',
  sampleRate: JIGSAW_SAMPLE_RATE, channels: 1, bits: 16, effects,
}, null, 2) + '\n');
const reel = new Float32Array(clips.reduce((sum, clip) => sum + clip.length, 0));
let offset = 0; for (const clip of clips) { reel.set(clip, offset); offset += clip.length; }
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/jigsaw-audio-preview.wav', import.meta.url), encodeJigsawWav(reel));
console.log(`Generated ${effects.length} jigsaw sound assets; preview: artifacts/jigsaw-audio-preview.wav`);
