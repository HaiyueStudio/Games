import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });
const [{ assignMugenKey, createMugenBrowserPlayerBindings, loadMugenKeyBindings, MUGEN_DEFAULT_KEY_BINDINGS, saveMugenKeyBindings }, { createMugenVfs }, { importMugenCharacter }, { createMugenCharacterModel }] = await Promise.all([import('../mugen/game/MugenKeyBindings.ts'), import('../mugen/import/vfs/MugenVfs.ts'), import('../mugen/import/worker/MugenCharacterImport.ts'), import('../mugen/viewer/MugenCharacterModel.ts')]);

test('default keyboard layout is WASD/UIJK versus arrows/numpad 4512', () => {
  assert.deepEqual(MUGEN_DEFAULT_KEY_BINDINGS.players.P1, { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack1: 'KeyU', attack2: 'KeyI', attack3: 'KeyJ', attack4: 'KeyK' });
  assert.deepEqual(MUGEN_DEFAULT_KEY_BINDINGS.players.P2, { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack1: 'Numpad4', attack2: 'Numpad5', attack3: 'Numpad1', attack4: 'Numpad2' });
  const players = createMugenBrowserPlayerBindings(MUGEN_DEFAULT_KEY_BINDINGS); assert.deepEqual(players[0].bindings.x.keys, ['KeyU']); assert.deepEqual(players[0].bindings.y.keys, ['KeyI']); assert.deepEqual(players[0].bindings.a.keys, ['KeyJ']); assert.deepEqual(players[0].bindings.b.keys, ['KeyK']); assert.deepEqual(players[1].bindings.x.keys, ['Numpad4']); assert.deepEqual(players[1].bindings.b.keys, ['Numpad2']);
});

test('remapping swaps conflicts and persists a validated versioned document', () => {
  const changed = assignMugenKey(MUGEN_DEFAULT_KEY_BINDINGS, 'P1', 'attack1', 'KeyJ'); assert.equal(changed.players.P1.attack1, 'KeyJ'); assert.equal(changed.players.P1.attack3, 'KeyU');
  let stored = ''; const storage = { getItem: () => stored || null, setItem: (_key, value) => { stored = value; } }; saveMugenKeyBindings(changed, storage); assert.deepEqual(loadMugenKeyBindings(storage), changed);
  stored = '{"schemaVersion":99}'; assert.strictEqual(loadMugenKeyBindings(storage), MUGEN_DEFAULT_KEY_BINDINGS); assert.throws(() => assignMugenKey(changed, 'P1', 'up', 'Escape'), /Invalid keyboard code/u);
});

test('G08 runtime adapter maps four attack controls to the supported basic attack state', async () => {
  const definition = bytes('[Info]\nname=adapter\n[Files]\ncmd=adapter.cmd\ncns=adapter.cns\n'); const inputs = [{ path: 'adapter.def', bytes: definition }, { path: 'adapter.cmd', bytes: readBytes('../mugen/game/g08-runtime-adapter.cmd') }, { path: 'adapter.cns', bytes: readBytes('../mugen/fixtures/g08-game-v1/hero.cns') }]; const imported = await importMugenCharacter(await createMugenVfs(inputs), { contentRole: 'formal-fixture', entryDef: 'adapter.def', entryKind: 'character', encoding: 'utf-8', scriptProfile: 'g08-minimal' }); const commands = imported.package.tables.commands[0];
  assert.deepEqual(commands.commands.filter(value => ['x', 'y', 'a', 'b'].includes(value.name)).map(value => value.name), ['x', 'y', 'a', 'b']); assert.equal(imported.package.tables.states[0].states.some(value => value.number === 200), true);
});

test('character catalog selects KFM variants and accepted Petra with native executable scripts', async () => {
  const catalog = JSON.parse(read('../mugen/charactors/catalog.json')); assert.equal(catalog.schemaVersion, 2); assert.equal(catalog.runtimeProfile, 'm09-native-character-common-v1'); assert.deepEqual(catalog.characters.map(value => value.id), ['kfm', 'kfm720', 'petra-johanna-lagerkvist']); assert(catalog.characters.every(value => value.scriptProfile === 'native-common-v1')); const imported = [];
  for (const descriptor of catalog.characters) { const inputs = [...descriptor.files.map(path => ({ path, bytes: readBytes(`../mugen/charactors/${descriptor.directory}/${path}`) })), { path: catalog.commonState, bytes: readBytes(`../mugen/common/${catalog.commonState}`) }]; const result = await importMugenCharacter(await createMugenVfs(inputs), { contentRole: 'local-content', entryDef: descriptor.entryDef, entryKind: 'character', scriptProfile: 'm09-native-common' }); const model = createMugenCharacterModel(result.package, result.metadata, { viewerAudioCues: result.viewerAudioCues }); for (const action of [0, 10, 20, 21, 40, 120, 200, 5000, 5020]) assert(model.actions.some(value => value.action.number === action), `${descriptor.id} action ${action}`); assert(model.sprites.length > 200); assert(result.package.tables.sounds.length > 0); assert(result.viewerAudioCues.length > 0, `${descriptor.id} tolerant audio cues`); assert(model.actions.some(value => value.audioCues.length > 0), `${descriptor.id} linked action audio`); const commands = result.package.tables.commands[0]; const states = result.package.tables.states[0]; if (descriptor.id === 'petra-johanna-lagerkvist') { const actionsByStatus = status => model.actions.filter(value => value.visualStatus === status).map(value => value.action.number); assert(model.actions.some(value => value.action.number === 295), 'Petra ChangeAnim2 victim action 295'); assert.deepEqual(actionsByStatus('blank'), [345, 1109, 1507]); assert.deepEqual(actionsByStatus('missing'), [335, 336, 18300, 18301]); assert.deepEqual(actionsByStatus('partial'), [580, 15909, 36790, 36795]); assert.equal(commands.commands.length, 136); assert.equal(states.states.length, 422); assert.equal(states.states.find(value => value.number === -3).sourcePath, 'AI_1_0.txt'); assert.equal(states.states.find(value => value.number === 0).sourcePath, 'EmanonAI/stcommon.cns'); assert.equal(descriptor.contentLicense, 'user-local'); } else { assert.equal(commands.commands.length, 37); assert(states.states.length >= 108); assert.equal(states.states.find(value => value.number === 0).sourcePath, catalog.commonState); assert.equal(states.states.find(value => value.number === 170).sourcePath, `${descriptor.id}.cns`); assert(states.states.find(value => value.number === 170).controllers.every(value => value.sourcePath === `${descriptor.id}.cns`)); } imported.push(result); }
  assert.equal(new Set(imported.map(value => value.encoded.packageSha256)).size, 3); assert.deepEqual(imported.slice(0, 2).map(value => value.metadata.localCoord), [[320, 240], [1280, 720]]);
});

function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
function readBytes(path) { return new Uint8Array(readFileSync(new URL(path, import.meta.url))); }
function bytes(value) { return new TextEncoder().encode(value); }
