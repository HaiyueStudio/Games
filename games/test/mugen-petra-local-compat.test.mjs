import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [{ createMugenVfs }, { importMugenCharacter }, { createMugenCharacterModel }, { buildMugenImportGraph }, { parseMugenExpression }, { MugenInputHistory, MugenLegacyAiInput }, { MugenHeadlessMatch }, { MugenScriptRuntime }, { MugenCombatRuntime }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/worker/MugenCharacterImport.ts'),
  import('../mugen/viewer/MugenCharacterModel.ts'),
  import('../mugen/import/text/DependencyGraph.ts'),
  import('../mugen/import/cns/ExpressionParser.ts'),
  import('../mugen/runtime/input/index.ts'),
  import('../mugen/runtime/match/index.ts'),
  import('../mugen/runtime/script/index.ts'),
  import('../mugen/runtime/combat/index.ts'),
]);

const directory = fileURLToPath(new URL('../mugen/charactors/Petra_Johanna_Lagerkvist/', import.meta.url));
const entryDef = 'Petra_Johanna_Lagerkvist.def';

test('local Petra package completes the asset-viewer pipeline with official duplicate and legacy bounds semantics', { skip: !existsSync(join(directory, entryDef)), timeout: 30_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content',
    entryDef,
    entryKind: 'character',
  });
  const model = createMugenCharacterModel(imported.package, imported.metadata, { viewerAudioCues: imported.viewerAudioCues });
  const diagnostics = Object.fromEntries([...new Set(model.diagnostics.map(item => item.code))].sort().map(code => [code, model.diagnostics.filter(item => item.code === code).length]));

  assert.deepEqual({
    packageSha256: imported.encoded.packageSha256,
    actions: model.actions.length,
    sprites: model.sprites.length,
    rendererSprites: model.rendererSprites.length,
    palettes: model.palettes.length,
    sounds: imported.package.tables.sounds.length,
    referencedSprites: model.referencedSpriteCount,
    missingSpriteReferences: model.missingSpriteReferenceCount,
    diagnostics,
  }, {
    packageSha256: 'ab6faba6b6c1e7d65802f25657051a308f88f4749a3ead056fc5f94f333463f0',
    actions: 747,
    sprites: 1_532,
    rendererSprites: 1_471,
    palettes: 83,
    sounds: 161,
    referencedSprites: 1_467,
    missingSpriteReferences: 40,
    diagnostics: {
      E_MUGEN_AIR_ACTION_DUPLICATE: 1,
      E_MUGEN_AIR_SPRITE_MISSING: 40,
      E_MUGEN_SFF_SPRITE_DUPLICATE: 1,
    },
  });
  assert(imported.viewerAudioCues.length > 0);
  assert(model.actions.filter(value => value.audioCues.length > 0).length >= 100);
});

test('Petra executable audit has no remaining strict import gap in the legacy G08 profile', { skip: !existsSync(join(directory, entryDef)), timeout: 30_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'g08-minimal',
  });
  assert.equal(imported.package.tables.commands[0].commands.length, 136);
  assert.equal(imported.package.tables.states[0].states.length, 422);
});

test('G07-B strictly compiles all 12,267 Petra trigger expressions without a fallback', { skip: !existsSync(join(directory, entryDef)), timeout: 30_000 }, async () => {
  const graph = await buildMugenImportGraph(await createMugenVfs(readDirectory(directory)), { entryDef, entryKind: 'character' }); let total = 0;
  for (const resource of graph.resources) {
    const document = resource.document; if (document === undefined) continue;
    for (const token of document.tokens) {
      if (token.kind !== 'assignment' || token.foldedKey !== 'triggerall' && !/^trigger\d+$/u.test(token.foldedKey)) continue;
      parseMugenExpression(token.value, document, token); total += 1;
    }
  }
  assert.equal(total, 12_267);
});

test('G08 Petra native profile strictly imports the complete active CMD/CNS graph', { skip: !existsSync(join(directory, entryDef)), timeout: 30_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'm09-native-common',
  });
  const commands = imported.package.tables.commands[0];
  const states = imported.package.tables.states[0];
  assert.equal(commands.commands.length, 136);
  assert.equal(states.states.length, 422);
  assert.equal(states.states.reduce((total, state) => total + state.controllers.length, 0), 5_233);
  assert.equal(states.states.find(state => state.number === -3).sourcePath, 'AI_1_0.txt');
  assert.equal(states.states.find(state => state.number === -3).controllers.length, 165);
  assert.equal(states.states.find(state => state.number === 10_000).controllers[0].stateNumber, 10_000);
  assert.equal(states.states.find(state => state.number === 10_000).controllers[0].name, 'AssertSpacial');
  const emanonHelper = states.states.find(state => state.number === 90_001);
  assert.equal(emanonHelper.sourcePath, 'EmanonAI/Emanon_helper.cns');
  assert.deepEqual(emanonHelper.controllers.slice(0, 3).map(value => value.type), ['not-hit-by', 'assert-special', 'bind-to-parent']);
  assert.equal(emanonHelper.controllers[0].hitAttributeFilter.allow, false);
  assert.equal(emanonHelper.controllers[0].hitAttributeFilter.attributes.length, 27);
  assert(imported.package.featureUsage.includes('m09.vm.typed-no-eval-v1'));
});

test('G08 Petra native program runs a deterministic neutral opening through combat authority', { skip: !existsSync(join(directory, entryDef)), timeout: 30_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'm09-native-common',
  });
  const first = runNeutralOpening(imported, 120);
  const second = runNeutralOpening(imported, 120);
  assert.deepEqual(second.hashes, first.hashes);
  assert.deepEqual(second.states, first.states);
  assert.equal(first.hashes.length, 120);
  assert(first.states.some(value => value.phase === 'fight'));
});

test('G08 Petra native human path enters movement and attack states deterministically', { skip: !existsSync(join(directory, entryDef)), timeout: 30_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'm09-native-common',
  });
  const controls = tick => tick >= 5 && tick < 25 ? { P1: ['right'] } : tick === 35 || tick === 75 || tick === 115 ? { P1: ['a'] } : {};
  const first = runOpening(imported, 160, controls, [-30, 30]); const second = runOpening(imported, 160, controls, [-30, 30]);
  assert.deepEqual(second.hashes, first.hashes);
  const visited = [...new Set(first.states.map(value => value.p1[0]))];
  assert(first.states.some(value => value.p1[0] === 20), `Petra never entered walk state 20; visited ${visited.join(',')}`);
  assert(first.states.some(value => value.p1[0] >= 200 && value.p1[0] < 300), `Petra never entered a normal attack state; visited ${visited.join(',')}`);
  assert(first.contacts > 0, 'Petra normal attack never produced an authoritative contact');
  assert(first.final.fighters[1].life < first.final.fighters[1].maxLife, 'Petra normal attack never reduced opponent life');
  assert(first.states.some(value => value.p2[0] >= 5000 && value.p2[0] <= 5210), 'Petra opponent never entered a get-hit state');
});

test('G08 Petra native jump applies vertical velocity instead of only changing animation', { skip: !existsSync(join(directory, entryDef)), timeout: 30_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), { contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'm09-native-common' });
  const result = runOpening(imported, 45, tick => tick >= 5 && tick < 13 ? { P1: ['up'] } : {}, [-60, 60]); const visited = [...new Set(result.states.map(value => value.p1[0]))]; const minimumY = Math.min(...result.states.map(value => value.p1Y));
  assert(visited.includes(40) || visited.includes(50), `Petra never entered jump states; visited ${visited.join(',')}`); assert(minimumY < -1, `Petra jump had no vertical displacement; minimum y=${minimumY}; trace=${result.states.map(value => `${value.p1[0]}/${value.p1[1]}@${value.p1Y}`).join(',')}`);
});

test('G08 Petra EmanonAI activates from AILevel and produces a deterministic autonomous trace', { skip: !existsSync(join(directory, entryDef)), timeout: 45_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'm09-native-common',
  });
  const first = runOpening(imported, 30, () => ({}), [-28, 28], { P2: 4 }); const second = runOpening(imported, 30, () => ({}), [-28, 28], { P2: 4 });
  assert.deepEqual(second.hashes, first.hashes);
  assert(first.maxHelpers > 0, 'Petra EmanonAI never spawned its decision helper');
  const aiVariables = [...new Set(first.states.map(value => value.p2Ai.join(',')))];
  assert(first.states.some(value => value.p2Ai[0] === 1 && value.p2Ai[1] > 0), `Petra EmanonAI activation variables were never set; observed ${aiVariables.join(' / ')}`);
});

test('G08 Petra extended AI trace reaches advanced, helper, effect and audio paths deterministically', { skip: !existsSync(join(directory, entryDef)), timeout: 90_000 }, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), { contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'm09-native-common' });
  const first = runOpening(imported, 600, () => ({}), [-35, 35], { P1: 8, P2: 8 }); const second = runOpening(imported, 600, () => ({}), [-35, 35], { P1: 8, P2: 8 }); assert.deepEqual(second.hashes, first.hashes);
  const visited = [...new Set(first.states.flatMap(value => [value.p1[0], value.p2[0]]))];
  assert(visited.some(value => value >= 400 && value < 5_000), `Petra AI never entered an advanced character state; visited ${visited.join(',')}`);
  assert(first.maxHelpers > 0, 'Petra extended AI trace spawned no helper'); assert(first.effectTicks > 0, 'Petra extended AI trace emitted no visual effect authority'); assert(first.audioEvents > 0, 'Petra extended AI trace emitted no audio event');
});

function readDirectory(root) {
  const files = [];
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files.map(path => ({ path: relative(root, path).replaceAll('\\', '/'), bytes: new Uint8Array(readFileSync(path)) }));
}

function runNeutralOpening(imported, ticks) {
  return runOpening(imported, ticks, () => ({}), [-60, 60]);
}

function runOpening(imported, ticks, heldAtTick, spawn, aiLevels = {}) {
  const model = createMugenCharacterModel(imported.package, imported.metadata);
  const air = Object.freeze({ canonicalPath: 'Petra_Johanna_Lagerkvist.air', sourceSha256: imported.package.sourceSetSha256, actions: Object.freeze(model.actions.map(value => value.action)), diagnostics: model.diagnostics, elementCount: model.actions.reduce((sum, value) => sum + value.action.elements.length, 0), collisionBoxCount: model.actions.reduce((sum, value) => sum + value.clsn1Count + value.clsn2Count, 0) });
  const commands = imported.package.tables.commands[0]; const states = imported.package.tables.states[0];
  const match = new MugenHeadlessMatch({ seed: 'g08-petra-neutral-v1', roundsToWin: 1, roundTimeTicks: 5_940, fighters: [{ id: 'P1', displayName: 'Petra', packageSha256: imported.encoded.packageSha256, spawn: [spawn[0], 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'Petra', packageSha256: imported.encoded.packageSha256, spawn: [spawn[1], 0], facing: -1, initialControl: true }] });
  const programs = ['P1', 'P2'].map(fighterId => ({ fighterId, name: imported.metadata.name ?? 'Petra_Johanna_Lagerkvist', authorName: imported.metadata.author ?? '', localCoord: imported.metadata.localCoord ?? [320, 240], commands, states, engineControlTransitions: true }));
  const script = new MugenScriptRuntime(programs); const combat = new MugenCombatRuntime(script, { fighters: [{ fighterId: 'P1', air }, { fighterId: 'P2', air }], stageBounds: [-160, 160], guardDistance: 72 });
  const legacyAiConfigs = Object.entries(aiLevels).filter(([, level]) => level > 0).map(([playerId, aiLevel]) => ({ playerId, aiLevel, seed: 'g08-petra-emnon-ai-v1', commands })); const legacyAi = legacyAiConfigs.length === 0 ? null : new MugenLegacyAiInput(legacyAiConfigs);
  const history = new MugenInputHistory(180); const hashes = []; const snapshots = []; const helperHistory = []; const previous = new Map([['P1', new Set()], ['P2', new Set()]]); const actions = ['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']; let contacts = 0; let final; let maxHelpers = 0; let effectTicks = 0; let audioEvents = 0;
  for (let index = 0; index < ticks; index += 1) { const heldByPlayer = heldAtTick(index); const players = ['P1', 'P2'].map(id => { const held = new Set(heldByPlayer[id] ?? []); const prior = previous.get(id); previous.set(id, held); return { id, aiLevel: aiLevels[id] ?? 0, actions: actions.map(action => ({ action, value: held.has(action) ? 1 : 0, held: held.has(action), pressed: held.has(action) && !prior.has(action), released: !held.has(action) && prior.has(action) })) }; }); const source = { tick: history.tick + 1, players }; const input = history.push(legacyAi?.apply(source) ?? source, { P1: match.fighter('P1').facing, P2: match.fighter('P2').facing }); match.beginTick(input); if (index === 0) match.startFight(); let trace; try { trace = combat.step(match, input, history); } catch (error) { const helpers = script.entities.helpers().map(value => ({ entityId: value.entityId, helperId: value.helperId, stateNumber: value.stateNumber, stateTime: value.stateTime, position: value.position, velocity: value.velocity, physics: value.physics, hitAttributeSlots: value.hitAttributeSlots, hitPauseTicks: value.hitPauseTicks, stunTicks: value.stunTicks, lastHitAttribute: value.lastHitAttribute, bindTargetId: value.bindTargetId, bindTime: value.bindTime })); throw new Error(`Petra runtime failed at tick ${index}: ${error instanceof Error ? error.message : String(error)}\ncurrent=${JSON.stringify(helpers)}\nrecent=${JSON.stringify(helperHistory)}`, { cause: error }); } contacts += trace.contacts.length; maxHelpers = Math.max(maxHelpers, script.entities.helpers().length); helperHistory.push({ tick: index, helpers: script.entities.helpers().map(value => ({ entityId: value.entityId, helperId: value.helperId, stateNumber: value.stateNumber, stateTime: value.stateTime, position: value.position, velocity: value.velocity, slots: value.hitAttributeSlots, lastHitAttribute: value.lastHitAttribute })) }); if (helperHistory.length > 20) helperHistory.shift(); const output = trace.script.output; if (output.allPalette !== null || output.backgroundPalette !== null || output.environmentColor !== null || output.cameraShake !== null || output.entities.some(value => value.palette !== null || value.afterImage !== null || value.drawingTransform !== null || value.displayOffset[0] !== 0 || value.displayOffset[1] !== 0)) effectTicks += 1; const result = match.endTick(); audioEvents += result.events.filter(value => value.kind === 'audio').length; final = result.state; hashes.push(result.traceHash); snapshots.push({ phase: result.state.phase, p1: [result.state.fighters[0].stateNumber, result.state.fighters[0].actionNumber], p1Y: result.state.fighters[0].position[1], p2: [result.state.fighters[1].stateNumber, result.state.fighters[1].actionNumber], p2Ai: [result.state.fighters[1].integerVariables[53], result.state.fighters[1].integerVariables[54]] }); }
  return { hashes, states: snapshots, contacts, final, maxHelpers, effectTicks, audioEvents };
}
