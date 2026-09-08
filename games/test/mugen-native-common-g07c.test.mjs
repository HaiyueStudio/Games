import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { importMugenCharacter }, { MugenCommandMatcher, MugenScriptRuntime }, { MugenHeadlessMatch }, { MugenBrowserInput, MugenInputHistory }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/worker/MugenCharacterImport.ts'),
  import('../mugen/runtime/script/index.ts'),
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

test('built-in characters expose the standard MUGEN time-over result states', () => {
  for (const value of compiled) for (const stateNumber of [170, 175, 180]) assert(value.states.states.some(state => state.number === stateNumber), `${value.descriptor.id} state ${stateNumber}`);
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

test('KFM720 localcoord converts walk speed, jump velocity and gravity into stage coordinates', () => {
  const kfm = officialKfm.find(value => value.descriptor.id === 'kfm'); const kfm720 = officialKfm.find(value => value.descriptor.id === 'kfm720');
  assert(kfm); assert(kfm720);
  const classicWalk = runFirstFrame(kfm, 1, new Set(['right'])); const hdWalk = runFirstFrame(kfm720, .25, new Set(['right']));
  assert.equal(classicWalk.state, 20); assert.equal(hdWalk.state, 20); assert.equal(hdWalk.velocity[0], classicWalk.velocity[0]); assert.equal(hdWalk.position[0], classicWalk.position[0]);
  const classicJump = runFirstFrame(kfm, 1, new Set(['up'])); const hdJump = runFirstFrame(kfm720, .25, new Set(['up']));
  assert([40, 41].includes(classicJump.state)); assert.equal(hdJump.state, classicJump.state); assert.equal(hdJump.velocity[1], classicJump.velocity[1]); assert.equal(hdJump.position[1], classicJump.position[1]);
});

test('KFM720 official direction-plus-button throw and quarter-circle command enter package states', () => {
  const kfm720 = officialKfm.find(value => value.descriptor.id === 'kfm720'); assert(kfm720);
  // KFM720 declares a 12-local-unit P2BodyDist threshold. At .25 stage scale
  // this is the same 3-unit body gap as classic KFM, not an axis-to-axis gap.
  const throwResult = runFrames(kfm720, .25, [new Set(['right', 'y'])], [-17.4, 17.4]);
  assert.equal(throwResult.state, 800);
  const motion = [new Set(['down']), new Set(['down', 'right']), new Set(['right', 'x'])];
  const matcher = new MugenCommandMatcher(kfm720.commands); const history = new MugenInputHistory(180); let names = [];
  for (let index = 0; index < motion.length; index += 1) { history.push({ tick: index + 1, players: [player('P1', motion[index]), player('P2', new Set())] }, { P1: 1, P2: -1 }); names = matcher.match(history, 'P1').names; }
  assert(names.includes('QCF_x'), `matched commands: ${names.join(', ')}`);
  const specialResult = runFrames(kfm720, .25, motion);
  assert.equal(specialResult.state, 1000);
});

test('rapid browser events activate official KFM720 motion commands and its maximum body-gap throw', () => {
  const kfm720 = officialKfm.find(value => value.descriptor.id === 'kfm720'); assert(kfm720);
  const motionTarget = new EventTarget(); const motionInput = new MugenBrowserInput({ eventTarget: motionTarget, visibilityTarget: motionTarget });
  for (const [type, code] of [['keydown', 'KeyS'], ['keydown', 'KeyD'], ['keyup', 'KeyS'], ['keydown', 'KeyU']]) motionTarget.dispatchEvent(keyboardEvent(type, code));
  const matcher = new MugenCommandMatcher(kfm720.commands); let names = [];
  for (let tick = 1; tick <= 4; tick += 1) { motionInput.sample(tick, { P1: 1, P2: -1 }); names = matcher.match(motionInput.history, 'P1').names; }
  assert(names.includes('QCF_x'), `matched commands: ${names.join(', ')}`); motionInput.dispose();

  const throwTarget = new EventTarget(); const throwInput = new MugenBrowserInput({ eventTarget: throwTarget, visibilityTarget: throwTarget });
  const runtime = new MugenScriptRuntime(['P1', 'P2'].map(fighterId => ({ fighterId, name: kfm720.metadata.name ?? undefined, authorName: kfm720.metadata.author ?? undefined, commands: kfm720.commands, states: kfm720.states, localCoord: kfm720.metadata.localCoord ?? [1280, 720], coordinateScale: .25, engineControlTransitions: true })));
  const match = new MugenHeadlessMatch({ seed: 'rapid-browser-throw', roundsToWin: 1, roundTimeTicks: null, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: 'a'.repeat(64), spawn: [-17.4, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [17.4, 0], facing: -1, initialControl: true }] });
  throwTarget.dispatchEvent(keyboardEvent('keydown', 'KeyD')); throwTarget.dispatchEvent(keyboardEvent('keydown', 'KeyI'));
  for (let tick = 1; tick <= 2; tick += 1) { const input = throwInput.sample(tick, { P1: 1, P2: -1 }); match.beginTick(input); if (tick === 1) match.startFight(); runtime.step(match, input, throwInput.history, { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), stageBounds: [-160, 160], screenBounds: [-160, 160] }); match.endTick(); }
  assert.equal(match.fighter('P1').stateNumber, 800); throwInput.dispose();
});

function runPunch(runtime) {
  const match = new MugenHeadlessMatch({ seed: 'g07c-native-product', roundsToWin: 1, roundTimeTicks: null, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: 'a'.repeat(64), spawn: [-40, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [40, 0], facing: -1, initialControl: true }] });
  const history = new MugenInputHistory(180); const input = history.push({ tick: 1, players: [player('P1', new Set(['x'])), player('P2', new Set())] }, { P1: 1, P2: -1 }); match.beginTick(input).startFight(); const trace = runtime.step(match, input, history, { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), stageBounds: [-160, 160], screenBounds: [-160, 160] }); const result = match.endTick();
  return { state: result.state.fighters[0].stateNumber, scriptHash: trace.hash, matchHash: result.state.hash, executed: trace.executedControllers };
}

function runFirstFrame(character, coordinateScale, held) { return runFrames(character, coordinateScale, [held]); }
function runFrames(character, coordinateScale, frames, spawn = [-40, 40]) {
  const runtime = new MugenScriptRuntime(['P1', 'P2'].map(fighterId => ({ fighterId, name: character.metadata.name ?? undefined, authorName: character.metadata.author ?? undefined, commands: character.commands, states: character.states, localCoord: character.metadata.localCoord ?? [320, 240], coordinateScale, engineControlTransitions: true })));
  const match = new MugenHeadlessMatch({ seed: 'kfm720-native-input', roundsToWin: 1, roundTimeTicks: null, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: 'a'.repeat(64), spawn: [spawn[0], 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [spawn[1], 0], facing: -1, initialControl: true }] });
  const history = new MugenInputHistory(180); let result;
  for (let index = 0; index < frames.length; index += 1) { const tick = index + 1; const input = history.push({ tick, players: [player('P1', frames[index]), player('P2', new Set())] }, { P1: 1, P2: -1 }); match.beginTick(input); if (tick === 1) match.startFight(); runtime.step(match, input, history, { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), stageBounds: [-160, 160], screenBounds: [-160, 160] }); result = match.endTick().state; }
  const fighter = result.fighters[0]; return { state: fighter.stateNumber, position: fighter.position, velocity: fighter.velocity };
}

function player(id, held) { return { id, actions: CONTROLS.map(action => ({ action, value: held.has(action) ? 1 : 0, held: held.has(action), pressed: held.has(action), released: false })) }; }
function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
function readBytes(path) { return new Uint8Array(readFileSync(new URL(path, import.meta.url))); }
function keyboardEvent(type, code) { const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'code', { value: code }); return event; }
const CONTROLS = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);
