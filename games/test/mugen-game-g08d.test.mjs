import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { importMugenCharacter }, { createMugenCharacterModel }, { MugenInputHistory }, { MugenHeadlessMatch }, { MugenScriptRuntime }, { MugenCombatRuntime }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'), import('../mugen/import/worker/MugenCharacterImport.ts'), import('../mugen/viewer/MugenCharacterModel.ts'), import('../mugen/runtime/input/index.ts'), import('../mugen/runtime/match/index.ts'), import('../mugen/runtime/script/index.ts'), import('../mugen/runtime/combat/index.ts'),
]);

const SHA = 'e'.repeat(64); const CONTROLS = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);

test('G08-D formal fixture imports package, CMD/CNS and all browser fight actions', async () => {
  const imported = await fixtureImport(); const model = createMugenCharacterModel(imported.package, imported.metadata); const manifest = JSON.parse(read('../mugen/fixtures/g08-game-v1.fixture.json'));
  assert.equal(imported.package.tables.commands.length, 1); assert.equal(imported.package.tables.states.length, 1); assert.equal(imported.package.tables.sounds.length, manifest.expected.sounds);
  assert.deepEqual(model.actions.map(value => value.action.number), [0, 10, 20, 21, 40, 120, 200, 5000, 5020]);
  assert.deepEqual(imported.package.featureUsage.filter(value => value.startsWith('g08.') || value.startsWith('m09.')), ['g08.cmd.basic-v1', 'g08.cns.minimal-v1', 'g08.vm.typed-no-eval-v1', 'm09.expression.bytecode-v1']);
  const attackAction = model.actions.find(value => value.action.number === 200);
  assert.equal(attackAction.clsn1Count, 1);
  assert.deepEqual(attackAction.audioCues.map(value => ({ key: [value.sound.group, value.sound.item], tick: value.tick, channel: value.channel, volume: value.volume, repeatOnLoop: value.repeatOnLoop })), [{ key: [2, 0], tick: 0, channel: 0, volume: 210 / 255, repeatOnLoop: false }]);
  assert.equal(imported.encoded.packageSha256, manifest.expected.packageSha256); assert.equal(imported.package.tables.commands[0].commands.length, manifest.expected.commands); assert.equal(imported.package.tables.states[0].states.length, manifest.expected.states);
  for (const input of fixtureInputs()) { const expected = manifest.files[input.path]; assert.deepEqual({ bytes: input.bytes.byteLength, sha256: createHash('sha256').update(input.bytes).digest('hex') }, { bytes: expected.bytes, sha256: expected.sha256 }); }
});

test('G08-D fixture drives browser match authority from input through combat contact', async () => {
  const imported = await fixtureImport(); const model = createMugenCharacterModel(imported.package, imported.metadata); const commands = imported.package.tables.commands[0]; const states = imported.package.tables.states[0];
  const air = Object.freeze({ canonicalPath: 'hero.air', sourceSha256: imported.package.sourceSetSha256, actions: Object.freeze(model.actions.map(value => value.action)), diagnostics: model.diagnostics, elementCount: model.actions.reduce((sum, value) => sum + value.action.elements.length, 0), collisionBoxCount: model.actions.reduce((sum, value) => sum + value.clsn1Count + value.clsn2Count, 0) });
  const script = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]); const combat = new MugenCombatRuntime(script, { fighters: [{ fighterId: 'P1', air }, { fighterId: 'P2', air }], koHoldTicks: 2 });
  const match = new MugenHeadlessMatch({ seed: 'g08d', roundsToWin: 1, roundTimeTicks: 600, fighters: [{ id: 'P1', displayName: 'Azure', packageSha256: SHA, spawn: [-14, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'Crimson', packageSha256: SHA, spawn: [14, 0], facing: -1, initialControl: true }] }); const inputs = inputBuilder(match);
  step(match, combat, inputs, {}, true); const attack = step(match, combat, inputs, { P1: ['x'] }); const audioEvents = [...attack.result.events.filter(value => value.kind === 'audio')]; let contact = step(match, combat, inputs, {}); audioEvents.push(...contact.result.events.filter(value => value.kind === 'audio')); for (let guard = 0; guard < 8 && contact.combat.contacts.length === 0; guard += 1) { contact = step(match, combat, inputs, {}); audioEvents.push(...contact.result.events.filter(value => value.kind === 'audio')); } assert.deepEqual(audioEvents.map(value => [value.operation, value.group, value.item, value.channel]), [['play', 2, 0, 0]]);
  assert.deepEqual(contact.combat.contacts.map(value => [value.attackerId, value.result, value.damage]), [['P1', 'hit', 90]]); assert.equal(contact.result.state.fighters[1].life, 910); assert.equal(contact.result.state.fighters[0].power, 60);
});

test('M10 combat clamps knockback to the moving camera screen bounds', async () => {
  const imported = await fixtureImport(); const model = createMugenCharacterModel(imported.package, imported.metadata); const commands = imported.package.tables.commands[0]; const states = imported.package.tables.states[0];
  const air = Object.freeze({ canonicalPath: 'hero.air', sourceSha256: imported.package.sourceSetSha256, actions: Object.freeze(model.actions.map(value => value.action)), diagnostics: model.diagnostics, elementCount: model.actions.reduce((sum, value) => sum + value.action.elements.length, 0), collisionBoxCount: model.actions.reduce((sum, value) => sum + value.clsn1Count + value.clsn2Count, 0) });
  const script = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]); const combat = new MugenCombatRuntime(script, { fighters: [{ fighterId: 'P1', air }, { fighterId: 'P2', air }], stageBounds: [-1000, 1000], camera: { start: [0, 0], horizontalBounds: [-150, 150], verticalBounds: [-25, 0], localCoord: [320, 240], tension: 50, verticalFollow: .2, floorTension: 0, screenMargins: [15, 15], playerBounds: [-1000, 1000] } });
  const match = new MugenHeadlessMatch({ seed: 'm10-camera-clamp', roundsToWin: 1, roundTimeTicks: 600, fighters: [{ id: 'P1', displayName: 'Azure', packageSha256: SHA, spawn: [-70, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'Crimson', packageSha256: SHA, spawn: [70, 0], facing: -1, initialControl: true }] }); const inputs = inputBuilder(match); const input = inputs.push({});
  match.beginTick(input); match.startFight(); match.setKinematics('P2', { position: [1000, 0], velocity: [40, 0] }); combat.step(match, input, inputs.history); const result = match.endTick();
  assert.equal(combat.camera.position[0], 150); assert.equal(result.state.fighters[1].position[0], 295); assert.equal(result.state.fighters[1].velocity[0], 0);
});

test('new index is the game entry and charactorPreview preserves the original viewer', () => {
  const manifest = JSON.parse(read('../manifest.json')); const entry = manifest.entries.find(value => value.id === 'mugen'); assert.equal(entry.entry, 'mugen/main.ts'); assert.equal(entry.title, 'Haiyue MUGEN Fight'); assert(entry.capabilities.includes('game-workflow')); assert(entry.capabilities.includes('input'));
  const game = read('../mugen/index.html'); for (const id of ['fight-canvas', 'p1-character', 'p2-character', 'stage-select', 'p1-life', 'p2-life', 'round-time', 'phase-banner', 'start-match', 'open-key-settings', 'key-settings']) assert.match(game, new RegExp(`id="${id}"`)); assert.match(game, /charactorPreview\.html/u); assert.match(game, /dist\/bundle\.js/u); assert.match(game, /value="kfm"/u); assert.match(game, /value="kfm720"/u);
  const preview = read('../mugen/charactorPreview.html'); for (const id of ['directory-input', 'entry-select', 'action-search', 'timeline', 'viewer-canvas']) assert.match(preview, new RegExp(`id="${id}"`)); assert.match(preview, /dist\/charactorPreview\.js/u);
  const source = read('../mugen/main.ts'); assert.match(source, /MugenFixedStepInputDriver/u); assert.match(source, /MugenCombatRuntime/u); assert.match(source, /renderActors/u); assert.match(source, /createMugenBrowserPlayerBindings/u); assert.match(source, /saveMugenKeyBindings/u); assert.match(source, /startButton\.disabled = false; this\.#startButton\.textContent = '重新开始'/u); assert.doesNotMatch(source, /(?:\/src\/|\.\.\/\.\.\/Engine)/u);
  const rollup = read('../../rollup.config.js'); assert.match(rollup, /charactorPreview: 'games\/mugen\/charactorPreview\.ts'/u);
});

async function fixtureImport() { return importMugenCharacter(await createMugenVfs(fixtureInputs()), { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8', scriptProfile: 'g08-minimal' }); }
function fixtureInputs() { return ['hero.def', 'hero.cmd', 'hero.cns', 'hero.air'].map(path => ({ path, bytes: readBytes(`../mugen/fixtures/g08-game-v1/${path}`) })).concat([{ path: 'hero.sff', bytes: readBytes('../mugen/fixtures/g05-viewer-v1/hero.sff') }, { path: 'hero.act', bytes: readBytes('../mugen/fixtures/g05-viewer-v1/hero.act') }, { path: 'vertical.snd', bytes: readBytes('../mugen/fixtures/g06-generated-snd-v1/vertical.snd') }]); }
function inputBuilder(match) { const history = new MugenInputHistory(180); const previous = new Map([['P1', new Set()], ['P2', new Set()]]); return { history, push(values) { const players = ['P1', 'P2'].map(id => { const held = new Set(values[id] ?? []); const prior = previous.get(id); previous.set(id, held); return { id, actions: CONTROLS.map(action => ({ action, value: held.has(action) ? 1 : 0, held: held.has(action), pressed: held.has(action) && !prior.has(action), released: !held.has(action) && prior.has(action) })) }; }); const facing = Object.fromEntries(match.snapshot().fighters.map(value => [value.id, value.facing])); return history.push({ tick: history.tick + 1, players }, facing); } }; }
function step(match, combat, inputs, held, start = false) { const input = inputs.push(held); match.beginTick(input); if (start) match.startFight(); const trace = combat.step(match, input, inputs.history); return { combat: trace, result: match.endTick() }; }
function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
function readBytes(path) { return new Uint8Array(readFileSync(new URL(path, import.meta.url))); }
