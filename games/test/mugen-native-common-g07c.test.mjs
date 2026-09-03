import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { importMugenCharacter }, { MugenScriptRuntime }, { MugenHeadlessMatch }, { MugenInputHistory }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/worker/MugenCharacterImport.ts'),
  import('../mugen/runtime/script/MugenScriptRuntime.ts'),
  import('../mugen/runtime/match/MugenMatchState.ts'),
  import('../mugen/runtime/input/MugenInputRuntime.ts'),
]);

const catalog = JSON.parse(read('../mugen/charactors/catalog.json'));
const compiled = await Promise.all(catalog.characters.map(async descriptor => {
  const inputs = [...descriptor.files.map(path => ({ path, bytes: readBytes(`../mugen/charactors/${descriptor.directory}/${path}`) })), { path: catalog.commonState, bytes: readBytes(`../mugen/common/${catalog.commonState}`) }];
  const result = await importMugenCharacter(await createMugenVfs(inputs), { contentRole: 'local-content', entryDef: descriptor.entryDef, entryKind: 'character', scriptProfile: 'm09-native-common' });
  return { descriptor, metadata: result.metadata, commands: result.package.tables.commands[0], states: result.package.tables.states[0] };
}));
const officialKfm = compiled.filter(value => value.descriptor.id === 'kfm' || value.descriptor.id === 'kfm720');

test('G07-C composes common states as fallback while character StateDefs override by number', () => {
  for (const value of officialKfm) {
    assert.equal(value.commands.commands.length, 37);
    assert(value.states.states.length >= 108);
    assert.equal(value.states.states.find(state => state.number === 0).sourcePath, catalog.commonState);
    const overridden = value.states.states.find(state => state.number === 170); assert.equal(overridden.sourcePath, `${value.descriptor.id}.cns`); assert(overridden.controllers.every(controller => controller.sourcePath === `${value.descriptor.id}.cns`));
    assert.equal(value.states.constants['data.life'], 1000); assert.equal(value.states.constants['movement.yaccel'], Math.fround(value.descriptor.id === 'kfm' ? 0.44 : 1.76));
  }
});

test('G07-C product-native KFM programs execute their own light-punch command deterministically', () => {
  const create = () => new MugenScriptRuntime(officialKfm.map((value, index) => ({ fighterId: `P${index + 1}`, name: value.metadata.name ?? undefined, authorName: value.metadata.author ?? undefined, commands: value.commands, states: value.states, localCoord: value.metadata.localCoord ?? [320, 240] })));
  const first = runPunch(create()); const second = runPunch(create());
  assert.equal(first.state, 200); assert.equal(second.state, 200); assert.equal(first.scriptHash, second.scriptHash); assert.equal(first.matchHash, second.matchHash); assert(first.executed.some(value => value.endsWith(':change-state')));
});

test('G07-C engine air physics lands an attack state that relies on MUGEN state 52', () => {
  const runtime = new MugenScriptRuntime(officialKfm.map((value, index) => ({ fighterId: `P${index + 1}`, name: value.metadata.name ?? undefined, authorName: value.metadata.author ?? undefined, commands: value.commands, states: value.states, localCoord: value.metadata.localCoord ?? [320, 240], engineControlTransitions: true })));
  const match = new MugenHeadlessMatch({ seed: 'g07c-air-landing', roundsToWin: 1, roundTimeTicks: null, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: 'a'.repeat(64), spawn: [-40, -40], facing: 1, initialStateNumber: 640, initialControl: false }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [40, 0], facing: -1, initialControl: true }] });
  const history = new MugenInputHistory(180);
  let snapshot;
  for (let tick = 1; tick <= 90; tick += 1) {
    const input = history.push({ tick, players: [player('P1', new Set()), player('P2', new Set())] }, { P1: 1, P2: -1 });
    match.beginTick(input); if (tick === 1) match.startFight(); runtime.step(match, input, history, { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), stageBounds: [-160, 160], screenBounds: [-160, 160] }); snapshot = match.endTick().state;
  }
  assert.equal(snapshot.fighters[0].position[1], 0); assert.notEqual(snapshot.fighters[0].stateNumber, 640); assert(snapshot.fighters[0].position[1] < 1_000);
});

function runPunch(runtime) {
  const match = new MugenHeadlessMatch({ seed: 'g07c-native-product', roundsToWin: 1, roundTimeTicks: null, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: 'a'.repeat(64), spawn: [-40, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [40, 0], facing: -1, initialControl: true }] });
  const history = new MugenInputHistory(180); const input = history.push({ tick: 1, players: [player('P1', new Set(['x'])), player('P2', new Set())] }, { P1: 1, P2: -1 }); match.beginTick(input).startFight(); const trace = runtime.step(match, input, history, { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), stageBounds: [-160, 160], screenBounds: [-160, 160] }); const result = match.endTick();
  return { state: result.state.fighters[0].stateNumber, scriptHash: trace.hash, matchHash: result.state.hash, executed: trace.executedControllers };
}

function player(id, held) { return { id, actions: CONTROLS.map(action => ({ action, value: held.has(action) ? 1 : 0, held: held.has(action), pressed: held.has(action), released: false })) }; }
function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
function readBytes(path) { return new Uint8Array(readFileSync(new URL(path, import.meta.url))); }
const CONTROLS = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);
