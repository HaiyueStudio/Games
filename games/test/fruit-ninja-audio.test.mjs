import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { FRUIT_SAMPLE_RATE, FRUIT_SOUNDS, FRUIT_SOUND_IDS, fruitSoundPath } from '../fruit-ninja/audio/sounds.ts';

const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(context.parentURL?.includes('/fruit-ninja/audio/') && specifier === './sounds' ? './sounds.ts' : specifier, context);
} });
const { synthesizeFruitSound, encodeFruitWav } = await import('../fruit-ninja/audio/synthesis.ts');
const { FruitAudio } = await import('../fruit-ninja/audio/FruitAudio.ts');
hook.deregister();

function fixture() {
  const played = [], stopped = [];
  const backend = { ready: true, unlocks: 0, disposals: 0,
    unlock() { this.unlocks++; }, play(id, options) { if (!this.ready) return false; played.push({ id, ...options }); return true; },
    stop(channel) { stopped.push(channel); }, dispose() { this.disposals++; }, snapshot() { return {}; } };
  return { audio: new FruitAudio(backend), backend, played, stopped };
}
const fruit = (id = 1, x = 500) => ({ id, kind: 'fruit', fruit: id % 8, x, y: 400, radius: 46, vx: 0, vy: -500, angle: 0, spin: 0 });

test('nine original audio assets reproduce byte-exactly with bounded peaks, silent boundaries and manifest entries', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).entries.find(entry => entry.id === 'fruit-ninja');
  const generation = JSON.parse(readFileSync(new URL('../fruit-ninja/assets/audio/generation.json', import.meta.url)));
  const hashes = new Set(); let total = 0;
  for (const id of FRUIT_SOUND_IDS) {
    const pcm = synthesizeFruitSound(id), bytes = Buffer.from(encodeFruitWav(pcm));
    const shipped = readFileSync(new URL('../fruit-ninja/' + fruitSoundPath(id), import.meta.url));
    assert.deepEqual(shipped, bytes, id);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt32LE(24), FRUIT_SAMPLE_RATE); assert.equal(bytes.readUInt16LE(22), 1); assert.equal(bytes.readUInt16LE(34), 16);
    assert.equal(bytes.readUInt32LE(40), pcm.length * 2); assert.equal(pcm.length, Math.round(FRUIT_SOUNDS[id].seconds * FRUIT_SAMPLE_RATE));
    let peak = 0, energy = 0;
    for (const sample of pcm) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
    assert.ok(peak > .7 && peak < .8 && Math.sqrt(energy / pcm.length) > .02, id);
    assert.equal(bytes.readInt16LE(44), 0); assert.equal(bytes.readInt16LE(bytes.length - 2), 0);
    const hash = createHash('sha256').update(bytes).digest('hex'); hashes.add(hash);
    assert.equal(hash, generation.effects.find(effect => effect.id === id).sha256);
    assert.ok(manifest.assets.includes('fruit-ninja/' + fruitSoundPath(id))); total += bytes.length;
  }
  assert.equal(hashes.size, 9); assert.ok(total < 500000); assert.ok(manifest.capabilities.includes('audio'));
});

test('button click retries first-gesture unlock briefly and stale clicks cannot burst later', () => {
  const { audio, backend, played } = fixture(); backend.ready = false;
  audio.click(); audio.update(.016); assert.equal(played.length, 0);
  backend.ready = true; audio.update(.016); assert.equal(played[0].id, 'ui-click');
  audio.update(.3); assert.equal(played.length, 1);
  backend.ready = false; audio.click(); audio.update(.3); backend.ready = true; audio.update(.01); assert.equal(played.length, 1);
  assert.equal(audio.snapshot().active, false);
});

test('one throw per wave, cyclic splash variations, cooldowns and stereo pan stay bounded', () => {
  const { audio, played } = fixture(); audio.thrown([fruit()]); audio.hit(fruit()); assert.equal(played.length, 0);
  audio.start(); audio.thrown([fruit(1, -200), fruit(2, 0), { ...fruit(), kind: 'bomb' }]);
  assert.equal(played.length, 1); assert.equal(played[0].pan, -.65);
  audio.thrown([fruit(3)]); assert.equal(played.length, 1);
  for (let i = 0; i < 3; i++) { audio.update(.05); audio.hit(fruit(i, 1600)); }
  assert.deepEqual(played.filter(value => value.id.startsWith('fruit-splash')).map(value => value.id), ['fruit-splash-a', 'fruit-splash-b', 'fruit-splash-c']);
  assert.ok(played.every(value => Math.abs(value.pan) <= .65 && value.rate >= .95 && value.rate <= 1.055));
  audio.hit(fruit(4)); assert.equal(audio.snapshot().played.splash, 3, 'same-frame combo does not multiply volume');
  audio.hit({ ...fruit(), kind: 'clock' }); assert.equal(audio.snapshot().played.splash, 3);
  audio.hit({ ...fruit(), kind: 'bomb' }); assert.equal(played.at(-1).priority, 100);
});

test('both endings play once; a final explosion gets its attack before the ending cue', () => {
  for (const reason of ['time', 'bombs']) {
    const { audio, played } = fixture(); audio.start(); audio.finish(reason);
    audio.update(.016); assert.equal(audio.snapshot().played.over, reason === 'time' ? 1 : 0);
    audio.update(.2); assert.equal(played.filter(value => value.id === 'game-over').length, 1);
    for (let i = 0; i < 20; i++) { audio.finish(reason); audio.update(.1); }
    assert.equal(audio.snapshot().played.over, 1);
    const count = played.length; audio.thrown([fruit()]); audio.hit(fruit()); assert.equal(played.length, count);
    audio.start(); audio.finish(reason); audio.update(.2); assert.equal(audio.snapshot().played.over, 2, 'new round can end again');
  }
});

test('pause cancels pending audio, resume has no backlog, disposal is idempotent', () => {
  const { audio, backend, played, stopped } = fixture(); audio.start(); audio.hit(fruit()); audio.finish('bombs'); audio.click(); audio.pause();
  const count = played.length; audio.update(1); audio.hit(fruit()); audio.thrown([fruit()]); assert.equal(played.length, count);
  assert.equal(audio.snapshot().pending, false); assert.ok(stopped.includes(undefined));
  audio.start(); audio.pause(); audio.click(); audio.update(.016); assert.equal(played.at(-1).id, 'ui-click', 'pause menu buttons retain feedback');
  audio.resume(); audio.hit(fruit()); assert.equal(played.at(-1).id, 'fruit-splash-a');
  audio.dispose(); audio.dispose(); const after = played.length;
  audio.resume(); audio.start(); audio.click(); audio.hit(fruit()); audio.finish('time'); audio.update(1);
  assert.equal(played.length, after); assert.equal(backend.disposals, 1);
});
