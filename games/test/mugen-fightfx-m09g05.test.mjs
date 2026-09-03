import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const { loadMugenFightFx } = await import('../mugen/game/MugenFightFx.ts');

const fixtureDirectory = new URL('../mugen/fixtures/g05-viewer-v1/', import.meta.url);
const sndFixture = new URL('../mugen/fixtures/g06-generated-snd-v1/vertical.snd', import.meta.url);
const fixtureInputs = () => [
  { path: 'selected-data/FIGHTFX.AIR', bytes: new Uint8Array(readFileSync(new URL('hero.air', fixtureDirectory))) },
  { path: 'selected-data/fightfx.sff', bytes: new Uint8Array(readFileSync(new URL('hero.sff', fixtureDirectory))) },
];

test('G05 FightFX imports only AIR/SFF into an independent deterministic render model', async () => {
  const first = await loadMugenFightFx(fixtureInputs());
  const second = await loadMugenFightFx([...fixtureInputs()].reverse());
  assert.equal(first.sourceSetSha256, second.sourceSetSha256);
  assert.deepEqual({ actions: first.air.actions.length, sprites: first.sprites.length, rendererSprites: first.rendererSprites.length, palettes: first.palettes.length }, { actions: 2, sprites: 2, rendererSprites: 1, palettes: 1 });
  assert.equal(first.contentLicense, 'user-local');
  assert.equal(first.soundBankSha256, null); assert.deepEqual(first.sounds, []);
  assert.deepEqual(first.localCoord, [320, 240]);
  const referenced = first.air.actions.flatMap(action => action.elements).filter(element => element.spriteId !== null);
  assert.ok(referenced.length > 0);
  assert.ok(referenced.every(element => first.spriteById.has(element.spriteId)));
  assert.ok(first.sprites.every(sprite => sprite.id.startsWith('fightfx:sprite:')));
  assert.strictEqual(first.sprites[1].pixels, first.sprites[0].pixels);
});

test('G08 FightFX optionally imports fight.snd as a distinct common sound bank', async () => {
  const model = await loadMugenFightFx([...fixtureInputs(), { path: 'selected-data/FIGHT.SND', bytes: new Uint8Array(readFileSync(sndFixture)) }]);
  assert.match(model.soundBankSha256, /^[0-9a-f]{64}$/u); assert.equal(model.sounds.length, 6); assert.equal(model.sounds.filter(value => value.selectedByKey).length, 5); assert(model.sounds.every(value => value.encodedBase64.length > 0));
});

test('G05 FightFX fails closed on missing or ambiguous local files', async () => {
  const [air, sff] = fixtureInputs();
  await assert.rejects(() => loadMugenFightFx([air]), /fightfx\.sff/i);
  await assert.rejects(() => loadMugenFightFx([air, { ...air, path: 'other/fightfx.air' }, sff]), /多个 fightfx\.air/i);
  const snd = { path: 'fight.snd', bytes: new Uint8Array(readFileSync(sndFixture)) }; await assert.rejects(() => loadMugenFightFx([air, sff, snd, { ...snd, path: 'other/FIGHT.SND' }]), /多个 fight\.snd/i);
});

test('G05 browser game installs and renders the local fight animation owner', () => {
  const source = readFileSync(new URL('../mugen/main.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../mugen/index.html', import.meta.url), 'utf8');
  assert.match(source, /fightAir:\s*this\.#fightFx\.air/);
  assert.match(source, /animationOwnerId === 'fight' \? this\.#fightFx/);
  assert.doesNotMatch(source, /animationOwnerId === 'fight'\) return \[\]/);
  assert.match(source, /verifyFightFx/);
  assert.match(source, /fightfx:verification/);
  assert.match(html, /id="load-fightfx"/);
  assert.match(html, /id="fightfx-directory"[^>]*webkitdirectory/);
});

const localDataDirectory = process.env.MUGEN_DATA_DIR;
const localAir = localDataDirectory ? join(localDataDirectory, 'fightfx.air') : '';
const localSff = localDataDirectory ? join(localDataDirectory, 'fightfx.sff') : '';
const localSnd = localDataDirectory ? join(localDataDirectory, 'fight.snd') : '';
test('local official FightFX parses through the browser resource model', { skip: !localDataDirectory || !existsSync(localAir) || !existsSync(localSff) }, async () => {
  const model = await loadMugenFightFx([
    { path: 'fightfx.air', bytes: new Uint8Array(readFileSync(localAir)) },
    { path: 'fightfx.sff', bytes: new Uint8Array(readFileSync(localSff)) },
    ...(existsSync(localSnd) ? [{ path: 'fight.snd', bytes: new Uint8Array(readFileSync(localSnd)) }] : []),
  ]);
  assert.ok(model.air.actions.length > 0);
  assert.ok(model.sprites.length > 0);
  assert.ok(model.air.actions.some(action => action.elements.some(element => element.spriteId !== null)));
  if (existsSync(localSnd)) { assert.match(model.soundBankSha256, /^[0-9a-f]{64}$/u); assert.ok(model.sounds.length > 0); assert.ok(model.sounds.some(value => value.selectedByKey)); }
});
