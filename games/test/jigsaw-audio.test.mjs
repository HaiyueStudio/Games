import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { JIGSAW_SOUND_IDS, JIGSAW_SAMPLE_RATE, JIGSAW_SOUNDS } from '../jigsaw-puzzle/audio/sounds.ts';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/jigsaw-puzzle/audio/') && specifier === './sounds' ? './sounds.ts' : specifier, context);
} });
const { JigsawAudio } = await import('../jigsaw-puzzle/audio/JigsawAudio.ts');
const { synthesizeJigsawSound, encodeJigsawWav } = await import('../jigsaw-puzzle/audio/synthesis.ts');
hook.deregister();

function fixture() {
  const played = [], stopped = [];
  const backend = { ready: true, disposals: 0, suspends: 0,
    unlock() {}, play(id) { if (!this.ready) return false; played.push(id); return true; },
    stop(channel) { stopped.push(channel); }, suspend() { this.suspends++; }, dispose() { this.disposals++; }, snapshot() { return {}; } };
  return { audio: new JigsawAudio(backend), backend, played, stopped };
}

test('wood atlas matches its generation record and the manifest', () => {
  const png = readFileSync(new URL('../jigsaw-puzzle/assets/wood-ui.png', import.meta.url));
  const provenance = JSON.parse(readFileSync(new URL('../jigsaw-puzzle/assets/wood-ui.provenance.json', import.meta.url)));
  const entry = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).entries.find(entry => entry.id === 'jigsaw-puzzle');
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), provenance.width); assert.equal(png.readUInt32BE(20), provenance.height);
  assert.equal(provenance.height % 4, 0);
  assert.equal(createHash('sha256').update(png).digest('hex'), provenance.sha256);
  assert.ok(entry.assets.includes('jigsaw-puzzle/assets/wood-ui.png')); assert.ok(provenance.prompt.length > 0);
});

test('four distinct original WAV assets are reproducible, quiet at boundaries, and manifest-backed', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).entries.find(entry => entry.id === 'jigsaw-puzzle');
  const generation = JSON.parse(readFileSync(new URL('../jigsaw-puzzle/assets/audio/generation.json', import.meta.url)));
  const hashes = new Set(); let total = 0;
  for (const id of JIGSAW_SOUND_IDS) {
    const pcm = synthesizeJigsawSound(id), wav = Buffer.from(encodeJigsawWav(pcm));
    assert.deepEqual(readFileSync(new URL(`../jigsaw-puzzle/assets/audio/${id}.wav`, import.meta.url)), wav);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), JIGSAW_SAMPLE_RATE);
    assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(pcm.length, Math.round(JIGSAW_SOUNDS[id].seconds * JIGSAW_SAMPLE_RATE));
    let peak = 0, energy = 0;
    for (const n of pcm) { assert.ok(Number.isFinite(n)); peak = Math.max(peak, Math.abs(n)); energy += n * n; }
    assert.ok(peak > .7 && peak < .8 && Math.sqrt(energy / pcm.length) > .02);
    assert.equal(wav.readInt16LE(44), 0); assert.equal(wav.readInt16LE(wav.length - 2), 0);
    const hash = createHash('sha256').update(wav).digest('hex'); hashes.add(hash);
    assert.equal(hash, generation.effects.find(effect => effect.id === id).sha256);
    assert.ok(manifest.assets.includes(`jigsaw-puzzle/assets/audio/${id}.wav`)); total += wav.length;
  }
  assert.equal(hashes.size, 4); assert.ok(total < 100000); assert.ok(manifest.capabilities.includes('audio'));
});

test('gesture unlock retries briefly, duplicate clicks coalesce and stale clicks never replay', () => {
  const { audio, backend, played } = fixture(); backend.ready = false;
  audio.emit('ui-click'); audio.emit('ui-click'); audio.update(.016); assert.equal(played.length, 0);
  backend.ready = true; audio.update(.016); assert.deepEqual(played, ['ui-click']);
  audio.update(.1); backend.ready = false; audio.emit('piece-click'); audio.update(.3);
  backend.ready = true; audio.update(.01); assert.deepEqual(played, ['ui-click']);
});

test('piece, snap and completion are distinct events; completion follows the final snap once', () => {
  const { audio, played } = fixture();
  audio.emit('piece-click'); audio.update(.01); audio.emit('snap'); audio.emit('complete'); audio.update(.01);
  assert.deepEqual(played, ['piece-click', 'snap']);
  audio.update(.13); assert.deepEqual(played, ['piece-click', 'snap', 'complete']);
  for (let i = 0; i < 4; i++) { audio.update(.2); audio.emit('complete'); audio.update(.2); }
  assert.equal(audio.snapshot().played.complete, 1);
  audio.reset(true); audio.emit('complete'); audio.update(.2); assert.equal(audio.snapshot().played.complete, 1, 'restored completed game stays silent');
  audio.reset(false); audio.emit('complete'); audio.update(.2); assert.equal(audio.snapshot().played.complete, 2, 'new game can complete again');
});

test('pause cancels queued sounds, restart cancels old completion and disposal is bounded', () => {
  const { audio, backend, played, stopped } = fixture();
  audio.emit('snap'); audio.emit('complete'); audio.pause(); audio.update(1); audio.emit('piece-click');
  assert.equal(played.length, 0); assert.equal(audio.snapshot().pending, 0); assert.ok(stopped.includes(undefined));
  audio.resume(); audio.update(.1); assert.equal(played.length, 0);
  audio.emit('complete'); audio.reset(false); audio.update(.2); assert.equal(played.length, 0);
  audio.emit('ui-click'); audio.update(.01); assert.deepEqual(played, ['ui-click']);
  audio.dispose(); audio.dispose(); audio.resume(); audio.emit('snap'); audio.update(1);
  assert.equal(played.length, 1); assert.equal(backend.disposals, 1);
});
