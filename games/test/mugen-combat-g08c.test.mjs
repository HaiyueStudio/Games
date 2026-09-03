import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ parseMugenCommandDocument }, { parseMugenStateDocuments }, { parseMugenTextFile }, { createMugenVfs }, { MugenInputHistory }, { MugenHeadlessMatch }, { MugenScriptRuntime }, { MugenCombatRuntime }, { BasicMugenExpressionVmContext, evaluateMugenExpression }] = await Promise.all([
  import('../mugen/import/cmd/index.ts'), import('../mugen/import/cns/index.ts'), import('../mugen/import/text/MugenTextParser.ts'), import('../mugen/import/vfs/MugenVfs.ts'), import('../mugen/runtime/input/index.ts'), import('../mugen/runtime/match/index.ts'), import('../mugen/runtime/script/index.ts'), import('../mugen/runtime/combat/index.ts'), import('../mugen/runtime/vm/index.ts'),
]);

const UTF8 = new TextEncoder(); const SHA = 'c'.repeat(64); const CONTROLS = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);

test('G08-C parser emits typed HitDef IR and rejects fields outside the explicit subset', async () => {
  const states = await stateProgram(); const hitDef = states.states.find(value => value.number === 200).controllers.find(value => value.type === 'hit-def').hitDefinition;
  assert.deepEqual({ attr: [hitDef.attributeState, hitDef.attackAttribute], flags: [hitDef.hitFlags, hitDef.guardFlags], type: hitDef.groundHitType }, { attr: ['S', 'NA'], flags: ['AFM', 'HLM'], type: 'high' });
  const evaluate = expression => evaluateMugenExpression(expression, new BasicMugenExpressionVmContext()).value.value;
  assert.equal(evaluate(hitDef.damage[0]), 100); assert.equal(evaluate(hitDef.damage[1]), 10); assert.equal(evaluate(hitDef.kill), 1);
  const outputStates = await parseStates(`${CNS}\n[State 200, typed output]\ntype=HitDef\ntrigger1=1\nattr=S,NA\ndamage=1\nsparkno=S2\nhitsound=S1,0\npalfx.time=7\npalfx.mul=128,192,256\npalfx.add=1,2,3\n`); const output = outputStates.states.find(value => value.number === 200).controllers.at(-1).hitDefinition.output; assert.equal(output.sparkFromPlayer, true); assert.equal(output.hitSoundFromPlayer, true);
  assert.equal(evaluate(output.defenderPalette.time), 7); assert.deepEqual(output.defenderPalette.multiply.map(evaluate), [128, 192, 256]); assert.deepEqual(output.defenderPalette.add.map(evaluate), [1, 2, 3]);
  const projectileStates = await parseStates(`${CNS}\n[State 200, typed projectile afterimage]\ntype=Projectile\ntrigger1=1\nprojanim=200\nafterimage.time=9\nafterimage.length=4\nafterimage.palcolor=128\nafterimage.palinvertall=1\nafterimage.palbright=1,2,3\nafterimage.palcontrast=4,5,6\nafterimage.palpostbright=7,8,9\nafterimage.paladd=10,11,12\nafterimage.palmul=13,14,15\nafterimage.timegap=2\nafterimage.framegap=3\nafterimage.trans=add\n`); const projectile = projectileStates.states.find(value => value.number === 200).controllers.at(-1); assert.equal(projectile.literalParameters['afterimage.trans'], 'add'); assert.deepEqual(['palbright', 'palcontrast', 'palpostbright', 'paladd', 'palmul'].flatMap(key => [0, 1, 2].map(index => evaluate(projectile.parameters[`afterimage.${key}.${index}`]))), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  await assert.rejects(() => parseStates(`${CNS}\n[State 200, unsupported]\ntype=HitDef\ntrigger1=1\nattr=S,NA\ndamage=1\npalfx.color=128\n`), error => error.diagnostics?.[0]?.code === 'E_MUGEN_CNS_SYNTAX');
});

test('G04 official KFM and KFM720 HitDef inventories compile without dropping their combat parameters', async () => {
  for (const name of ['kfm', 'kfm720']) { const source = readFileSync(new URL(`../mugen/charactors/${name}/${name}.cns`, import.meta.url), 'utf8'); const blocks = source.split(/(?=^\s*\[)/gmu).filter(block => /^\s*\[State\s/iu.test(block) && /^\s*type\s*=\s*HitDef\b/imu.test(block)).map((block, index) => block.replace(/^\s*\[[^\]]+\]/u, `[State 0, official-${index}]`)); const states = await parseStates(`[Statedef 0]\ntype=S\nmovetype=A\nphysics=N\n${blocks.join('\n')}`); const hitDefs = states.states.find(value => value.number === 0).controllers.filter(value => value.type === 'hit-def'); assert.equal(hitDefs.length, 41); assert.equal(hitDefs.every(value => value.hitDefinition !== null), true); }
});

test('G08 HitDef contact commits sound, spark, environment shake and defender PalFX output', async () => {
  const states = await parseStates(CNS.replace('kill=1', 'sparkno=S2\nsparkxy=-3,-4\nhitsound=S5,7\nenvshake.time=8\nenvshake.freq=120\nenvshake.ampl=-6\nenvshake.phase=30\npalfx.time=7\npalfx.mul=128,192,256\npalfx.add=1,2,3\nkill=1'));
  const fixture = await createFixture({ firstStates: states }); tick(fixture, {}, true); const contact = tick(fixture, { P1: ['x'] }); assert.equal(contact.combat.contacts.length, 1);
  const audio = contact.result.events.find(value => value.kind === 'audio'); assert.deepEqual([audio.resourceOwner, audio.group, audio.item], ['self', 5, 7]);
  const output = fixture.combat.script.outputs.snapshot(); const defender = output.entities.find(value => value.entityId === 'P2'); assert.deepEqual(defender.palette, { remainingTicks: 7, elapsedTicks: 0, add: [1, 2, 3], multiply: [128, 192, 256], sineAdd: [0, 0, 0, 1], invertAll: false, color: 256 }); assert.deepEqual(output.cameraShake, { remainingTicks: 8, elapsedTicks: 0, frequency: 120, amplitude: -6, phase: 30 });
  const spark = output.events.find(value => value.kind === 'hit-spark'); assert.deepEqual(spark, { kind: 'hit-spark', policy: 'character-or-fightfx-render-event', entityId: 'P1', animationOwnerId: 'P1', animationNumber: 2, position: [23, -4], facing: 1, layer: 'above' });
  const execution = fixture.combat.script.executionSnapshot(); const commands = parseMugenCommandDocument(await textDocument('fixture.cmd', CMD)); const restored = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states: await stateProgram() }]); restored.restoreExecution(JSON.parse(JSON.stringify(execution))); assert.deepEqual(restored.executionSnapshot(), execution);
});

test('G04 HitBy and NotHitBy compile to two timed attribute slots that gate contact', async () => {
  const defenderStates = await parseStates(`[Statedef -1]\n[State -1, armor]\ntype=NotHitBy\ntrigger1=1\npersistent=0\nvalue=S,NA\ntime=2\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n`);
  const filter = defenderStates.states.find(value => value.number === -1).controllers[0].hitAttributeFilter;
  assert.deepEqual({ slot: filter.slot, allow: filter.allow, attributes: filter.attributes }, { slot: 0, allow: false, attributes: ['S:NA'] });
  const fixture = await createFixture({ secondStates: defenderStates }); tick(fixture, {}, true);
  const blocked = tick(fixture, { P1: ['x'] }); assert.equal(blocked.combat.contacts.length, 0); assert.equal(fixture.match.fighter('P2').life, 1000); assert.equal(fixture.match.fighter('P2').hitAttributeSlots[0].remainingTicks, 1);
  const expired = tick(fixture, {}); assert.deepEqual(expired.combat.contacts.map(value => value.result), ['hit']); assert.equal(fixture.match.fighter('P2').life, 900); assert.equal(fixture.match.fighter('P2').hitAttributeSlots[0], null);
  await assert.rejects(() => parseStates(`[Statedef 0]\n[State 0,bad]\ntype=HitBy\ntrigger1=1\nvalue=S,NA\nvalue2=A,HP\n`), error => error.diagnostics?.[0]?.code === 'E_MUGEN_CNS_SYNTAX');
});

test('G04 HitOverride redirects matching hits through its typed slot and own state data', async () => {
  const defenderStates = await parseStates(`[Statedef -1]\n[State -1, override]\ntype=HitOverride\ntrigger1=1\npersistent=0\nattr=S,NA\nstateno=3000\nslot=3\ntime=2\nforceair=1\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n[Statedef 3000]\ntype=A\nmovetype=H\nphysics=A\nanim=5020\nctrl=0\n`);
  const fixture = await createFixture({ secondStates: defenderStates }); tick(fixture, {}, true); assert.equal(fixture.match.fighter('P2').hitOverrides[3].remainingTicks, 2); const contact = tick(fixture, { P1: ['x'] });
  assert.deepEqual(contact.combat.contacts.map(value => value.result), ['hit']); assert.equal(fixture.match.fighter('P2').stateNumber, 3000); assert.equal(fixture.match.fighter('P2').stateDataOwnerId, 'P2'); assert.equal(fixture.match.fighter('P2').stateType, 'A'); assert.equal(fixture.match.fighter('P2').life, 900); assert.equal(fixture.match.fighter('P2').hitOverrides[3].remainingTicks, 1);
  const snapshot = fixture.match.snapshot(); assert.deepEqual(MugenHeadlessMatch.restore(fixture.matchConfig, JSON.parse(JSON.stringify(snapshot))).snapshot(), snapshot);
});

test('G04 ReversalDef intercepts an attack box and transfers both fighters into reversal-owned states', async () => {
  const reversalStates = await parseStates(REVERSAL_CNS); const fixture = await createFixture({ firstStates: reversalStates }); tick(fixture, {}, true); const contact = tick(fixture, { P1: ['x'], P2: ['x'] });
  const p1 = fixture.match.fighter('P1'); const p2 = fixture.match.fighter('P2');
  assert.deepEqual(contact.combat.contacts.map(value => [value.result, value.damage]), [['reversed', 0]]); assert.equal(p1.life, 1000); assert.equal(p2.life, 1000);
  assert.equal(p1.stateNumber, 1310); assert.equal(p1.stateDataOwnerId, 'P1'); assert.equal(p2.stateNumber, 1320); assert.equal(p2.stateDataOwnerId, 'P1'); assert.equal(p2.animationOwnerId, 'P1');
  assert.equal(p1.moveContact, 'reversed'); assert.equal(p1.hitCount, 0); assert.deepEqual(p1.targets, [{ fighterId: 'P2', targetId: 0 }]); assert.equal(p2.activeHitDefinition, null); assert.deepEqual([p1.spritePriority, p2.spritePriority], [2, 1]);
  const snapshot = fixture.match.snapshot(); assert.deepEqual(MugenHeadlessMatch.restore(fixture.matchConfig, JSON.parse(JSON.stringify(snapshot))).snapshot(), snapshot);
});

test('G04 combat utility controllers own damage scaling, combo count, guard distance and per-tick push', async () => {
  const firstStates = await parseStates(CNS.replace('[Statedef 0]', '[State -1, attack scale]\ntype=AttackMulSet\ntrigger1=1\nvalue=.5\n[State -1, no push]\ntype=PlayerPush\ntrigger1=1\nvalue=0\n[Statedef 0]').replace('[State 200, done]', '[State 200, distance]\ntype=AttackDist\ntrigger1=time=0\nvalue=5\n[State 200, combo]\ntype=HitAdd\ntrigger1=time=0\npersistent=0\nvalue=2\n[State 200, done]'));
  const secondStates = await parseStates(CNS.replace('[Statedef 0]', '[State -1, defense scale]\ntype=DefenceMulSet\ntrigger1=1\nvalue=.5\n[State -1, no push]\ntype=PlayerPush\ntrigger1=1\nvalue=0\n[Statedef 0]'));
  const fixture = await createFixture({ firstStates, secondStates, spawn: [-5, 5] }); tick(fixture, {}, true); assert.deepEqual(fixture.match.snapshot().fighters.map(value => value.position[0]), [-5, 5]); const contact = tick(fixture, { P1: ['x'] });
  assert.deepEqual(contact.combat.contacts.map(value => value.damage), [25]); assert.equal(fixture.match.fighter('P2').life, 975); assert.deepEqual([fixture.match.fighter('P1').attackMultiplier, fixture.match.fighter('P2').defenseMultiplier], [.5, .5]); assert.equal(fixture.match.fighter('P1').activeHitDefinition.guardDistance, 5); assert.equal(fixture.match.fighter('P1').hitCount, 3);
});

test('G04 fall controllers retain GetHitVar data and apply landing velocity, damage and FallEnvShake', async () => {
  const attackerStates = await parseStates(CNS.replace('ground.velocity=-3,0', 'ground.velocity=-2,-3\nfall=1\nfall.xvelocity=4\nfall.yvelocity=-6\nfall.recover=0\nfall.recovertime=30\nfall.damage=70\nfall.kill=0\nfall.envshake.time=9\nfall.envshake.freq=72\nfall.envshake.ampl=-7\nfall.envshake.phase=33\nyaccel=.5'));
  const defenderStates = await parseStates(`[Statedef -1]\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n[Statedef 5020]\ntype=A\nmovetype=H\nphysics=A\nanim=5020\nctrl=0\n[State 5020, remember shake time]\ntype=VarSet\ntrigger1=time=0\npersistent=0\nv=0\nvalue=GetHitVar(fall.envshake.time)\n[State 5020, remember shake frequency]\ntype=VarSet\ntrigger1=time=0\npersistent=0\nv=1\nvalue=GetHitVar(fall.envshake.freq)\n[State 5020, remember shake amplitude]\ntype=VarSet\ntrigger1=time=0\npersistent=0\nv=2\nvalue=GetHitVar(fall.envshake.ampl)\n[State 5020, remember shake phase]\ntype=VarSet\ntrigger1=time=0\npersistent=0\nv=3\nvalue=GetHitVar(fall.envshake.phase)\n[State 5020, shake on landing]\ntype=FallEnvShake\ntrigger1=time=0\npersistent=0\n[State 5020, adjust fall]\ntype=HitFallSet\ntrigger1=time=0\npersistent=0\nvalue=1\nxvel=6\nyvel=-8\n[State 5020, use fall velocity]\ntype=HitFallVel\ntrigger1=time=0\npersistent=0\n[State 5020, landing damage]\ntype=HitFallDamage\ntrigger1=time=0\npersistent=0\n`);
  const fixture = await createFixture({ firstStates: attackerStates, secondStates: defenderStates }); tick(fixture, {}, true); tick(fixture, { P1: ['x'] }); const hit = fixture.match.fighter('P2'); assert.equal(hit.hitFall, true); assert.deepEqual(hit.getHitVelocity, [2, -3]); assert.deepEqual(hit.hitFallVelocity, [4, -6]); assert.deepEqual(hit.hitFallEnvShake, [9, 72, -7, 33]); assert.deepEqual([hit.hitFallDamage, hit.hitFallKill, hit.hitFallRecover, hit.hitFallRecoverTime, hit.getHitYAcceleration], [70, false, false, 30, .5]);
  const saved = fixture.match.snapshot(); assert.deepEqual(MugenHeadlessMatch.restore(fixture.matchConfig, JSON.parse(JSON.stringify(saved))).snapshot(), saved);
  let applied = null; for (let guard = 0; guard < 8 && applied === null; guard += 1) { const next = tick(fixture, {}); if (next.combat.script.executedControllers.some(value => value.endsWith(':hit-fall-damage'))) applied = next; } assert.notEqual(applied, null); assert.equal(fixture.match.fighter('P2').life, 830); assert.deepEqual(fixture.match.fighter('P2').hitFallVelocity, [6, -8]); assert.deepEqual(fixture.match.fighter('P2').integerVariables.slice(0, 4), [9, 72, -7, 33]); assert.deepEqual(applied.combat.script.output.cameraShake, { remainingTicks: 9, elapsedTicks: 0, frequency: 72, amplitude: -7, phase: 33 });
});

test('G04 airjuggle, StateDef juggle and HitDef air.juggle share an authoritative point pool', async () => {
  const attackerStates = await parseStates(`[Data]\nairjuggle=15\n${CNS.replace('[Statedef 200]\ntype=S', '[Statedef 200]\ntype=S\njuggle=6').replace('pausetime=3,3', 'pausetime=0,0').replace('ground.velocity=-3,0', 'ground.velocity=0,0\nfall=1\nair.juggle=2').replace('air.velocity=-2,-3', 'air.velocity=0,0').replace('trigger1=time>=3', 'trigger1=time>=1')}`);
  const defenderStates = await parseStates(`[Data]\nairjuggle=15\n${CNS}`);
  const typedHitDef = attackerStates.states.find(value => value.number === 200).controllers.find(value => value.type === 'hit-def').hitDefinition; const evaluate = expression => evaluateMugenExpression(expression, new BasicMugenExpressionVmContext()).value.value;
  assert.equal(attackerStates.attributes.airJuggle, 15); assert.equal(evaluate(typedHitDef.airJuggle), 2);
  const fixture = await createFixture({ firstStates: attackerStates, secondStates: defenderStates }); tick(fixture, {}, true); const first = tick(fixture, { P1: ['x'] }); assert.equal(first.combat.contacts.length, 1); assert.equal(fixture.match.fighter('P2').juggleRemaining, 7);
  tick(fixture, {}); tick(fixture, {}); const rejected = tick(fixture, { P1: ['x'] }); assert.equal(rejected.combat.contacts.length, 0); assert.equal(fixture.match.fighter('P2').life, 900); assert.equal(fixture.match.fighter('P2').juggleRemaining, 7);
  const snapshot = fixture.match.snapshot(); assert.deepEqual(MugenHeadlessMatch.restore(fixture.matchConfig, JSON.parse(JSON.stringify(snapshot))).snapshot(), snapshot);
});

test('G04 fall recovery remains character-script controlled through CanRecover and GetHitVar', async () => {
  const attackerStates = await parseStates(CNS.replace('ground.velocity=-3,0', 'ground.velocity=0,-2\nfall=1\nfall.damage=17\nfall.recovertime=2').replace('pausetime=3,3', 'pausetime=0,0'));
  const defenderStates = await parseStates(`[Statedef -1]\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n[Statedef 5020]\ntype=A\nmovetype=H\nphysics=A\nanim=5020\nctrl=0\n[State 5020, remember fall damage]\ntype=VarSet\ntrigger1=HitFall\nv=0\nvalue=GetHitVar(fall.damage)\n[State 5020, remember previous state]\ntype=VarSet\ntrigger1=HitFall\nv=1\nvalue=PrevStateNo\n[State 5020, remember hit over]\ntype=VarSet\ntrigger1=HitOver\nv=2\nvalue=1\n[State 5020, recover]\ntype=HitFallSet\ntrigger1=CanRecover\nvalue=0\n`);
  const fixture = await createFixture({ firstStates: attackerStates, secondStates: defenderStates }); tick(fixture, {}, true); tick(fixture, { P1: ['x'] }); assert.equal(fixture.match.fighter('P2').hitFall, true); assert.equal(fixture.match.fighter('P2').stateNumber, 5020);
  const beforeRecovery = tick(fixture, {}); assert.equal(beforeRecovery.result.state.fighters[1].stateNumber, 5020); assert.equal(beforeRecovery.result.state.fighters[1].integerVariables[0], 17); assert.equal(beforeRecovery.result.state.fighters[1].integerVariables[1], 0);
  for (let guard = 0; guard < 5 && fixture.match.fighter('P2').hitFall; guard += 1) tick(fixture, {}); assert.equal(fixture.match.fighter('P2').hitFall, false); for (let guard = 0; guard < 10 && fixture.match.fighter('P2').stateNumber !== 0; guard += 1) tick(fixture, {}); assert.equal(fixture.match.fighter('P2').stateNumber, 0); assert.equal(fixture.match.fighter('P2').control, true); assert.equal(fixture.match.fighter('P2').integerVariables[2], 1);
});

test('G04 affectteam, corner push, snap and down.bounce preserve official HitDef behavior', async () => {
  const friendlyOnly = await parseStates(CNS.replace('attr=S,NA', 'attr=S,NA\naffectteam=F')); const blocked = await createFixture({ firstStates: friendlyOnly }); tick(blocked, {}, true); const rejected = tick(blocked, { P1: ['x'] }); assert.equal(rejected.combat.contacts.length, 0); assert.equal(blocked.match.fighter('P2').life, 1000);
  const cornerStates = await parseStates(CNS.replace('ground.velocity=-3,0', 'ground.velocity=-3,0\nground.cornerpush.veloff=7\ndown.bounce=1')); const corner = await createFixture({ firstStates: cornerStates, spawn: [-20, 20], stageBounds: [-20, 20] }); tick(corner, {}, true); tick(corner, { P1: ['x'] }); const active = corner.match.fighter('P1').activeHitDefinition; assert.deepEqual([active.affectTeam, active.groundCornerPush, active.airCornerPush, active.downCornerPush, active.guardCornerPush, active.airGuardCornerPush], ['E', 7, 7, 7, 7, 7]); assert.equal(corner.match.fighter('P1').velocity[0], 7); assert.equal(corner.match.fighter('P2').hitDownBounce, true);
  const snapStates = await parseStates(CNS.replace('ground.velocity=-3,0', 'ground.velocity=-3,0\nsnap=12,-3')); const snapped = await createFixture({ firstStates: snapStates }); tick(snapped, {}, true); tick(snapped, { P1: ['x'] }); assert.deepEqual(snapped.match.fighter('P2').position, [-8, -3]);
});

test('G04 HitDefAttr, NumTarget and UniqHitCount triggers observe committed combat authority', async () => {
  const states = await parseStates(CNS.replace('pausetime=3,3', 'pausetime=0,0').replace('[State 200, done]', '[State 200, typed attr]\ntype=VarSet\ntrigger1=HitDefAttr = S, NA\nv=10\nvalue=1\n[State 200, target count]\ntype=VarSet\ntrigger1=NumTarget = 1\nv=11\nvalue=NumTarget\n[State 200, unique hit count]\ntype=VarSet\ntrigger1=UniqHitCount = 1\nv=12\nvalue=UniqHitCount\n[State 200, done]'));
  const fixture = await createFixture({ firstStates: states }); tick(fixture, {}, true); tick(fixture, { P1: ['x'] }); assert.equal(fixture.match.fighter('P1').integerVariables[10], 1); tick(fixture, {}); assert.deepEqual(fixture.match.fighter('P1').integerVariables.slice(10, 13), [1, 1, 1]);
});

test('G04 Move contact triggers start at one and advance only on unpaused attacker ticks', async () => {
  const states = await parseStates(CNS.replace('pausetime=3,3', 'pausetime=2,2').replace('trigger1=time>=3', 'trigger1=time>=10').replace('[State 200, done]', '[State 200, capture move hit]\ntype=VarSet\ntrigger1=MoveHit\nv=20\nvalue=MoveHit\n[State 200, done]'));
  const fixture = await createFixture({ firstStates: states }); tick(fixture, {}, true); tick(fixture, { P1: ['x'] }); assert.deepEqual([fixture.match.fighter('P1').moveContactTime, fixture.match.fighter('P1').integerVariables[20]], [0, 0]);
  tick(fixture, {}); assert.deepEqual([fixture.match.fighter('P1').moveContactTime, fixture.match.fighter('P1').integerVariables[20]], [0, 0]);
  tick(fixture, {}); assert.deepEqual([fixture.match.fighter('P1').moveContactTime, fixture.match.fighter('P1').integerVariables[20]], [1, 1]);
  tick(fixture, {}); assert.deepEqual([fixture.match.fighter('P1').moveContactTime, fixture.match.fighter('P1').integerVariables[20]], [2, 2]);
});

test('Clsn1 versus Clsn2 produces one hit, freezes authoritative time, then recovers', async () => {
  const fixture = await createFixture(); const traces = [];
  tick(fixture, { P1: [] }, true); const contact = tick(fixture, { P1: ['x'] }); traces.push(contact.combat.hash, contact.result.traceHash);
  assert.deepEqual(contact.combat.contacts.map(value => [value.result, value.damage]), [['hit', 100]]);
  assert.equal(contact.result.state.fighters[1].life, 900); assert.equal(contact.result.state.fighters[0].power, 50); assert.equal(contact.result.state.fighters[1].power, 25);
  assert.equal(contact.result.state.fighters[0].moveContact, 'hit'); assert.equal(contact.result.state.fighters[1].stateNumber, 5000); assert.equal(contact.result.state.fighters[1].stunKind, 'hit');
  assert.deepEqual(MugenHeadlessMatch.restore(fixture.matchConfig, JSON.parse(JSON.stringify(contact.result.state))).snapshot(), contact.result.state);
  const frozen = contact.result.state.fighters.map(value => [value.stateTime, value.actionTime]);
  const paused = tick(fixture, {}); assert.deepEqual(paused.result.state.fighters.map(value => [value.stateTime, value.actionTime]), frozen); assert.equal(paused.combat.contacts.length, 0);
  for (let guard = 0; guard < 12 && fixture.match.fighter('P2').moveType === 'H'; guard += 1) tick(fixture, {});
  assert.equal(fixture.match.fighter('P2').stateNumber, 0); assert.equal(fixture.match.fighter('P2').control, true); assert.match(traces.join(':'), /fnv1a64:/u);
});

test('holding back selects guard damage/stun and AIR body boxes provide deterministic push', async () => {
  const fixture = await createFixture(); tick(fixture, {}, true); const guarded = tick(fixture, { P1: ['x'], P2: ['right'] });
  assert.deepEqual(guarded.combat.contacts.map(value => [value.result, value.damage]), [['guarded', 10]]); assert.equal(fixture.match.fighter('P2').stateNumber, 120); assert.equal(fixture.match.fighter('P1').moveContact, 'guarded');
  const pushed = await createFixture({ spawn: [-5, 5] }); tick(pushed, {}, true); assert.deepEqual(pushed.match.snapshot().fighters.map(value => value.position[0]), [-10, 10]);
  const repeated = await createFixture({ spawn: [-5, 5] }); tick(repeated, {}, true); assert.equal(repeated.match.snapshot().hash, pushed.match.snapshot().hash);
});

test('G05 Projectile AIR boxes resolve contact and expose ProjHit lifecycle triggers', async () => {
  const projectileStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, projectile]
type=Projectile
trigger1=Time=0
persistent=0
projid=12
projanim=20
offset=20,0
velocity=0,0
projhits=1
projremovetime=30
attr=S,NP
damage=33,4
hitflag=MAF
guardflag=HLM
ground.hittime=2
ground.velocity=0,0
[State -1, projectile observed]
type=VarSet
trigger1=ProjHit12
v=30
value=ProjHitTime(12)
[State -1, projectile one tick pulse]
type=VarAdd
trigger1=ProjHit12
v=31
value=1
`));
  const fixture = await createFixture({ firstStates: projectileStates });
  const first = tick(fixture, {}, true);
  assert.deepEqual(first.combat.contacts.map(value => [value.activationId, value.damage]), [['projectile:0000000001', 33]]);
  assert.equal(fixture.combat.script.entities.projectiles('P1', 12)[0].contact, 'hit');
  tick(fixture, {});
  assert.equal(fixture.match.fighter('P1').integerVariables[30], 0);
  assert.equal(fixture.match.fighter('P1').integerVariables[31], 1);
  assert.equal(fixture.combat.script.entities.projectiles('P1', 12)[0].contactTime, 1);
  tick(fixture, {});
  assert.equal(fixture.match.fighter('P1').integerVariables[31], 1);
});

test('G08 Projectile projmisstime blocks exactly the documented ticks between repeated hits', async () => {
  const projectileStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, multi-hit projectile]
type=Projectile
trigger1=Time=0
persistent=0
projid=13
projanim=20
offset=20,0
velocity=0,0
projhits=2
projmisstime=2
projremovetime=30
attr=S,NP
damage=1,0
hitflag=MAF
guardflag=HLM
pausetime=0,0
ground.hittime=0
ground.velocity=0,0
`));
  const fixture = await createFixture({ firstStates: projectileStates });
  const contacts = [];
  for (let index = 0; index < 4; index += 1) contacts.push(tick(fixture, {}, index === 0).combat.contacts.filter(value => value.activationId === 'projectile:0000000001').length);
  assert.deepEqual(contacts, [1, 0, 0, 1]);
  const projectile = fixture.combat.script.entities.projectiles('P1', 13)[0]; assert.deepEqual([projectile.missTime, projectile.remainingHits, projectile.hitCooldown], [2, 0, 0]);
});

test('G05 opposing projectile boxes cancel by priority and expose ProjCancelTime', async () => {
  const projectileStates = async (id, priority) => parseStates(`[Statedef -1]
[State -1, projectile]
type=Projectile
trigger1=Time=0
persistent=0
projid=${id}
projanim=20
offset=0,0
velocity=0,0
projhits=1
projpriority=${priority}
projremovetime=30
attr=S,NP
damage=33,4
hitflag=MAF
guardflag=HLM
[State -1, cancellation observed]
type=VarSet
trigger1=ProjCancelTime(${id})>=0
v=31
value=ProjCancelTime(${id})
${CNS.slice(CNS.indexOf('[Statedef 0]'))}`);
  const fixture = await createFixture({ firstStates: await projectileStates(21, 2), secondStates: await projectileStates(22, 2) });
  const first = tick(fixture, {}, true); assert.equal(first.combat.contacts.length, 0);
  const [left, right] = fixture.combat.script.entities.projectiles();
  assert.deepEqual([left.contact, left.remainingHits, right.contact, right.remainingHits], ['cancelled', 0, 'cancelled', 0]);
  tick(fixture, {});
  assert.deepEqual([fixture.match.fighter('P1').integerVariables[31], fixture.match.fighter('P2').integerVariables[31]], [0, 0]);
});

test('G05 Helper owns HitDef, life, hit pause and target contact when attacking a root player', async () => {
  const helperStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, attack helper]
type=Helper
trigger1=Time=0
persistent=0
id=90
stateno=3000
pos=20,0
[Statedef 3000]
type=S
movetype=A
physics=N
anim=20
ctrl=0
[State 3000, helper hit]
type=HitDef
trigger1=Time=0
persistent=0
attr=S,NP
damage=40,5
hitflag=MAF
guardflag=HLM
pausetime=2,3
ground.hittime=4
ground.velocity=0,0
[State 3000, bind root target]
type=TargetBind
trigger1=MoveHit
ignorehitpause=1
time=2
pos=12,-4
`));
  const fixture = await createFixture({ firstStates: helperStates }); tick(fixture, {}, true); const contact = tick(fixture, {}); const helper = fixture.combat.script.entities.helpers('P1', 90)[0];
  assert.deepEqual(contact.combat.contacts.map(value => [value.attackerId, value.defenderId, value.damage]), [[helper.entityId, 'P2', 40]]);
  assert.equal(fixture.match.fighter('P2').life, 960); assert.equal(helper.moveContact, 'hit'); assert.equal(helper.hitCount, 1); assert.equal(helper.hitPauseTicks, 2); assert.deepEqual(helper.targets, [{ entityId: 'P2', targetId: 0 }]);
  tick(fixture, {}); const boundHelper = fixture.combat.script.entities.helpers('P1', 90)[0]; assert.deepEqual(fixture.match.fighter('P2').position, [boundHelper.position[0] + 12 * boundHelper.facing, boundHelper.position[1] - 4]); assert.equal(fixture.combat.script.entities.entity('P2').bindTime, 1);
});

test('G05 root HitDef transfers FallEnvShake GetHitVar data to an enemy Helper', async () => {
  const firstStates = await parseStates(CNS.replace('pausetime=3,3', 'pausetime=0,0').replace('ground.velocity=-3,0', 'ground.velocity=-3,0\nfall.envshake.time=11\nfall.envshake.freq=84\nfall.envshake.ampl=-6\nfall.envshake.phase=21'));
  const helperStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, defender helper]
type=Helper
trigger1=Time=0
persistent=0
id=91
stateno=3100
pos=20,0
[Statedef 3100]
type=S
movetype=I
physics=N
anim=0
ctrl=0
`).replace('ctrl=0\n[Statedef 5020]', `ctrl=0
[State 5000, remember fall shake time]
type=VarSet
trigger1=Time=0
persistent=0
v=0
value=GetHitVar(fall.envshake.time)
[State 5000, remember fall shake frequency]
type=VarSet
trigger1=Time=0
persistent=0
v=1
value=GetHitVar(fall.envshake.freq)
[State 5000, remember fall shake amplitude]
type=VarSet
trigger1=Time=0
persistent=0
v=2
value=GetHitVar(fall.envshake.ampl)
[State 5000, remember fall shake phase]
type=VarSet
trigger1=Time=0
persistent=0
v=3
value=GetHitVar(fall.envshake.phase)
[State 5000, fall shake]
type=FallEnvShake
trigger1=Time=0
persistent=0
[Statedef 5020]`));
  const fixture = await createFixture({ firstStates, secondStates: helperStates }); tick(fixture, {}, true); const contact = tick(fixture, { P1: ['x'] }); const helper = fixture.combat.script.entities.helpers('P2', 91)[0];
  assert.equal(contact.combat.contacts.some(value => value.attackerId === 'P1' && value.defenderId === helper.entityId && value.damage === 100), true);
  assert.equal(helper.life, 900); assert.equal(helper.moveType, 'H'); assert.equal(helper.stateNumber, 5000); assert.equal(helper.hitPauseTicks, 0); assert.deepEqual(helper.hitFallEnvShake, [11, 84, -6, 21]); assert.equal(fixture.match.fighter('P1').activeHitDefinition.hitTargets.includes(helper.entityId), true); assert.deepEqual(fixture.combat.script.entities.targets('P1').filter(value => value.entityId === helper.entityId), [{ entityId: helper.entityId, targetId: 0 }]);
  const landed = tick(fixture, {}); const updated = fixture.combat.script.entities.helpers('P2', 91)[0]; assert.deepEqual(updated.integerVariables.slice(0, 4), [11, 84, -6, 21]); assert.deepEqual(landed.combat.script.output.cameraShake, { remainingTicks: 11, elapsedTicks: 0, frequency: 84, amplitude: -6, phase: 21 });
  const snapshot = fixture.combat.script.executionSnapshot(); const commands = parseMugenCommandDocument(await textDocument('fixture.cmd', CMD)); const restored = new MugenScriptRuntime([{ fighterId: 'P1', commands, states: firstStates }, { fighterId: 'P2', commands, states: helperStates }]); restored.restoreExecution(JSON.parse(JSON.stringify(snapshot))); assert.deepEqual(restored.executionSnapshot(), snapshot);
});

test('G05 Helper HitBy slots gate incoming root HitDefs and expire on Helper time', async () => {
  const helperStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, protected helper]
type=Helper
trigger1=Time=0
persistent=0
id=97
stateno=3150
pos=20,0
[Statedef 3150]
type=S
movetype=I
physics=N
anim=0
[State 3150, reject normal attacks]
type=NotHitBy
trigger1=Time=0
persistent=0
value=S,NA
time=2
`));
  const fixture = await createFixture({ secondStates: helperStates }); tick(fixture, {}, true); const blocked = tick(fixture, { P1: ['x'] }); const helper = fixture.combat.script.entities.helpers('P2', 97)[0];
  assert.equal(blocked.combat.contacts.some(value => value.defenderId === helper.entityId), false); assert.equal(helper.life, 1000); assert.equal(helper.hitAttributeSlots[0].remainingTicks, 1);
});

test('G05 Helper HitOverride enters its owner state and applies the pending StateDef on the next tick', async () => {
  const helperStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, override helper]
type=Helper
trigger1=Time=0
persistent=0
id=98
stateno=3160
pos=20,0
[Statedef 3160]
type=S
movetype=I
physics=N
anim=0
[State 3160, override normal]
type=HitOverride
trigger1=Time=0
persistent=0
attr=S,NA
stateno=3600
slot=0
time=5
forceair=1
[Statedef 3600]
type=A
movetype=H
physics=A
anim=5020
velset=1,-2
`));
  const fixture = await createFixture({ secondStates: helperStates }); tick(fixture, {}, true); tick(fixture, { P1: ['x'] }); let helper = fixture.combat.script.entities.helpers('P2', 98)[0];
  assert.deepEqual([helper.stateNumber, helper.stateDataOwnerId, helper.stateDefinitionPending, helper.stateType], [3600, 'P2', true, 'A']);
  tick(fixture, {}); helper = fixture.combat.script.entities.helpers('P2', 98)[0]; assert.deepEqual([helper.stateDefinitionPending, helper.actionNumber, helper.physics, helper.velocity], [false, 5020, 'A', [-1, -2]]);
});

test('G05 enemy Helpers exchange simultaneous HitDefs with independent life and targets', async () => {
  const helperStates = async id => parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, combat helper]
type=Helper
trigger1=Time=0
persistent=0
id=${id}
stateno=3200
pos=100,0
[Statedef 3200]
type=S
movetype=A
physics=N
anim=20
[State 3200, helper hit]
type=HitDef
trigger1=Time=0
persistent=0
attr=S,NP
damage=25,2
hitflag=MAF
guardflag=HLM
pausetime=1,1
ground.hittime=3
ground.velocity=0,0
`));
  const fixture = await createFixture({ firstStates: await helperStates(92), secondStates: await helperStates(93), spawn: [-100, 100] }); tick(fixture, {}, true); const contact = tick(fixture, {}); const [first, second] = fixture.combat.script.entities.helpers();
  assert.equal(contact.combat.contacts.some(value => value.attackerId === first.entityId && value.defenderId === second.entityId), true); assert.equal(contact.combat.contacts.some(value => value.attackerId === second.entityId && value.defenderId === first.entityId), true);
  assert.deepEqual([fixture.combat.script.entities.entity(first.entityId).life, fixture.combat.script.entities.entity(second.entityId).life], [975, 975]); assert.deepEqual(fixture.combat.script.entities.targets(first.entityId), [{ entityId: second.entityId, targetId: 0 }]); assert.deepEqual(fixture.combat.script.entities.targets(second.entityId), [{ entityId: first.entityId, targetId: 0 }]);
});

test('G05 Projectile can hit an enemy Helper and retain projectile contact history', async () => {
  const projectileStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, helper projectile]
type=Projectile
trigger1=Time=0
persistent=0
projid=94
projanim=20
offset=100,0
velocity=0,0
projhits=1
projremovetime=30
attr=S,NP
damage=35,3
hitflag=MAF
guardflag=HLM
ground.hittime=3
ground.velocity=0,0
`));
  const helperStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, projectile target helper]
type=Helper
trigger1=Time=0
persistent=0
id=95
stateno=3300
pos=100,0
[Statedef 3300]
type=S
movetype=I
physics=N
anim=0
`));
  const fixture = await createFixture({ firstStates: projectileStates, secondStates: helperStates, spawn: [-100, 100] }); const contact = tick(fixture, {}, true); const helper = fixture.combat.script.entities.helpers('P2', 95)[0]; const projectile = fixture.combat.script.entities.projectiles('P1', 94)[0];
  assert.equal(contact.combat.contacts.some(value => value.activationId === projectile.entityId && value.defenderId === helper.entityId && value.damage === 35), true); assert.equal(helper.life, 965); assert.equal(projectile.contact, 'hit'); assert.equal(projectile.remainingHits, 0); assert.equal(fixture.combat.script.entities.latestProjectileContact('P1').entityId, projectile.entityId);
});

test('G05 Helper AnimTime observes its AIR action and can destroy a completed effect helper', async () => {
  const states = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, finite helper]
type=Helper
trigger1=Time=0
persistent=0
id=96
stateno=3500
[Statedef 3500]
type=A
movetype=I
physics=N
anim=21
[State 3500, finished]
type=DestroySelf
trigger1=AnimTime=0
`));
  const fixture = await createFixture({ firstStates: states }); tick(fixture, {}, true); assert.equal(fixture.combat.script.entities.helpers('P1', 96).length, 1); tick(fixture, {}); tick(fixture, {}); assert.equal(fixture.combat.script.entities.helpers('P1', 96).length, 1); tick(fixture, {}); assert.equal(fixture.combat.script.entities.helpers('P1', 96).length, 0);
});

test('G05 fight AIR owner supplies F-prefixed Projectile collision actions', async () => {
  const projectileStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, fight projectile]
type=Projectile
trigger1=Time=0
persistent=0
projid=99
projanim=F20
offset=20,0
velocity=0,0
projhits=1
projremovetime=30
attr=S,NP
damage=45,4
hitflag=MAF
guardflag=HLM
ground.hittime=3
ground.velocity=0,0
`));
  const fixture = await createFixture({ firstStates: projectileStates, fightAir: airBank() }); const contact = tick(fixture, {}, true); const projectile = fixture.combat.script.entities.projectiles('P1', 99)[0];
  assert.equal(projectile.animationOwnerId, 'fight'); assert.equal(contact.combat.contacts.some(value => value.activationId === projectile.entityId && value.defenderId === 'P2' && value.damage === 45), true);
});

test('G05 Target controllers and Target redirection mutate a targeted Helper in attacker-owned custom state', async () => {
  const attackerStates = await parseStates(CNS.replace('pausetime=3,3', 'pausetime=0,0').replace('trigger1=time>=3', 'trigger1=time>=10').replace('[State 200, done]', `[State 200, observe helper target]
type=VarSet
trigger1=MoveHit
v=40
value=Target, Life
[State 200, target helper life]
type=TargetLifeAdd
trigger1=MoveHit
value=-11
id=0
absolute=1
[State 200, target helper custom state]
type=TargetState
trigger1=MoveHit
value=3400
id=0
[State 200, target helper velocity]
type=TargetVelSet
trigger1=MoveHit
x=7
y=-2
id=0
[State 200, done]`) + `
[Statedef 3400]
type=A
movetype=H
physics=N
anim=5020
ctrl=0
`);
  const helperStates = await parseStates(CNS.replace('[Statedef -1]', `[Statedef -1]
[State -1, target helper]
type=Helper
trigger1=Time=0
persistent=0
id=96
stateno=3500
pos=20,0
[Statedef 3500]
type=S
movetype=I
physics=N
anim=0
`));
  const fixture = await createFixture({ firstStates: attackerStates, secondStates: helperStates }); tick(fixture, {}, true); tick(fixture, { P1: ['x'] }); tick(fixture, {}); const helper = fixture.combat.script.entities.helpers('P2', 96)[0];
  assert.equal(fixture.match.fighter('P1').integerVariables[40], 900); assert.equal(helper.life, 889); assert.equal(helper.stateNumber, 3400); assert.equal(helper.stateDataOwnerId, 'P1'); assert.deepEqual(helper.velocity, [-7, -2]);
});

test('simultaneous contacts resolve as a deterministic double KO and complete after the KO hold', async () => {
  const first = await runDoubleKo(); const second = await runDoubleKo(); assert.deepEqual(first.trace, second.trace);
  assert.deepEqual(first.contact.combat.contacts.map(value => value.attackerId), ['P1', 'P2']); assert.equal(first.contact.result.state.phase, 'ko'); assert.equal(first.contact.result.state.roundWinnerId, null); assert.deepEqual(first.contact.result.state.fighters.map(value => value.life), [0, 0]);
  assert.equal(first.final.phase, 'round-over'); assert.equal(first.final.matchWinnerId, null);
  const win = await createFixture({ maxLife: 100, koHoldTicks: 1 }); tick(win, {}, true); tick(win, { P1: ['x'] }); tick(win, {}); tick(win, {}); assert.equal(win.match.snapshot().phase, 'match-over'); assert.equal(win.match.snapshot().matchWinnerId, 'P1');
});

test('G04 simultaneous HitDef priority and class resolve before contact commits', async () => {
  const normal = await parseStates(CNS.replace('damage=100,10', 'priority=4,Hit\ndamage=100,10'));
  const throwMiss = await parseStates(CNS.replace('attr=S,NA', 'attr=S,NT').replace('damage=100,10', 'priority=1,Miss\ndamage=100,10'));
  const fixture = await createFixture({ firstStates: normal, secondStates: throwMiss }); tick(fixture, {}, true); const contact = tick(fixture, { P1: ['x'], P2: ['x'] });
  assert.deepEqual(contact.combat.contacts.map(value => value.attackerId), ['P1']); assert.deepEqual(fixture.match.snapshot().fighters.map(value => value.life), [1000, 900]);
  const dodgeA = await parseStates(CNS.replace('damage=100,10', 'priority=4,Dodge\ndamage=100,10')); const dodgeB = await createFixture({ firstStates: dodgeA, secondStates: normal }); tick(dodgeB, {}, true); const tied = tick(dodgeB, { P1: ['x'], P2: ['x'] }); assert.equal(tied.combat.contacts.length, 0);
});

test('G04 throw creates a target, runs attacker-owned custom states, binds, damages and returns with SelfState', async () => {
  const attackerStates = await parseStates(THROW_CNS); const defenderStates = await parseStates(`[Statedef -1]\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n`); const fixture = await createFixture({ firstStates: attackerStates, secondStates: defenderStates });
  tick(fixture, {}, true); const contact = tick(fixture, { P1: ['x'] }); const p1 = fixture.match.fighter('P1'); const p2 = fixture.match.fighter('P2');
  assert.deepEqual(contact.combat.contacts.map(value => value.result), ['hit']); assert.equal(p1.stateNumber, 810); assert.equal(p2.stateNumber, 820); assert.equal(p2.previousStateNumber, 5020); assert.equal(p2.stateDataOwnerId, 'P1'); assert.equal(p2.animationOwnerId, 'P1'); assert.deepEqual(p1.targets, [{ fighterId: 'P2', targetId: 7 }]);
  const bound = tick(fixture, {}); assert.match(bound.combat.script.executedControllers.join(','), /target-life-add/u); assert.equal(fixture.match.fighter('P2').life, 922); assert.deepEqual(fixture.match.fighter('P2').position, [fixture.match.fighter('P1').position[0] + 15 * fixture.match.fighter('P1').facing, fixture.match.fighter('P1').position[1] - 5]); assert.equal(fixture.match.fighter('P2').targetBinding.remainingTicks, 2);
  const boundSnapshot = fixture.match.snapshot(); assert.deepEqual(MugenHeadlessMatch.restore(fixture.matchConfig, JSON.parse(JSON.stringify(boundSnapshot))).snapshot(), boundSnapshot);
  tick(fixture, {}); assert.equal(fixture.match.fighter('P2').stateNumber, 821); assert.equal(fixture.match.fighter('P2').stateDataOwnerId, 'P1'); assert.equal(fixture.match.fighter('P1').stateTime, 2);
  const released = tick(fixture, {}); assert.match(released.combat.script.executedControllers.join(','), /target-vel-set/u); assert.match(released.combat.script.executedControllers.join(','), /target-vel-add/u); assert.equal(fixture.match.fighter('P2').stateNumber, 0); assert.equal(fixture.match.fighter('P2').stateDataOwnerId, 'P2'); assert.deepEqual(fixture.match.fighter('P2').velocity, [Math.fround(-3 * Math.fround(.85)), -2]); assert.equal(fixture.match.fighter('P2').power, 100); assert.deepEqual(fixture.match.fighter('P1').targets, []); assert.equal(fixture.match.fighter('P2').targetBinding, null);
  tick(fixture, {}); assert.deepEqual(fixture.match.fighter('P1').targets, []);
});

test('1000-tick combat replay is byte-exact across independent authorities', async () => {
  const first = await runSoak(); const second = await runSoak(); assert.deepEqual(first, second); assert.equal(first.hashes.length, 1000); assert.equal(first.snapshot.tick, 1000);
});

test('expired round timer resolves life lead and equal-life draw deterministically', async () => {
  const lead = await createFixture({ roundTimeTicks: 1 }); const firstInput = lead.inputs.push({}); lead.match.beginTick(firstInput).startFight().setLife('P2', 500); lead.combat.step(lead.match, firstInput, lead.inputs.history); lead.match.endTick(); tick(lead, {}); assert.equal(lead.match.snapshot().phase, 'match-over'); assert.equal(lead.match.snapshot().matchWinnerId, 'P1');
  const draw = await createFixture({ roundTimeTicks: 1 }); tick(draw, {}, true); tick(draw, {}); assert.equal(draw.match.snapshot().phase, 'round-over'); assert.equal(draw.match.snapshot().roundResultReason, 'draw');
});

test('G04 official executable oracle pass is content-addressed and machine-observed', () => {
  const evidence = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/g04-official-oracle-evidence.json', import.meta.url), 'utf8')); assert.equal(evidence.result, 'pass'); assert.deepEqual(evidence.run.observedColor, { r: 0, g: 255, b: 0 }); assert.equal(evidence.run.sampleCount, 5); assert.equal(evidence.run.allSamplesMatched, true); assert.equal(evidence.run.originalConfigurationRestored, true);
  for (const source of evidence.sources.filter(value => value.path.startsWith('Games/'))) { const relative = source.path.slice('Games/'.length); const bytes = readFileSync(new URL(`../../${relative}`, import.meta.url)); assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path); }
});

async function runDoubleKo() { const fixture = await createFixture({ maxLife: 100, koHoldTicks: 2 }); const trace = []; trace.push(tick(fixture, {}, true).result.traceHash); const contact = tick(fixture, { P1: ['x'], P2: ['x'] }); trace.push(contact.result.traceHash); for (let index = 0; index < 3; index += 1) trace.push(tick(fixture, {}).result.traceHash); return { contact, trace, final: fixture.match.snapshot() }; }
async function runSoak() { const fixture = await createFixture({ maxLife: 100_000, koHoldTicks: 2, roundTimeTicks: null }); const hashes = []; for (let index = 1; index <= 1000; index += 1) { const held = index % 24 === 2 ? { P1: ['x'] } : index % 31 === 2 ? { P2: ['x'] } : index % 31 === 3 ? { P1: ['right'] } : {}; const value = tick(fixture, held, index === 1); hashes.push(`${value.combat.hash}:${value.result.traceHash}`); } return Object.freeze({ hashes: Object.freeze(hashes), snapshot: fixture.match.snapshot() }); }

async function createFixture(options = {}) {
  const commands = parseMugenCommandDocument(await textDocument('fixture.cmd', CMD)); const states = await stateProgram(); const script = new MugenScriptRuntime([{ fighterId: 'P1', commands, states: options.firstStates ?? states }, { fighterId: 'P2', commands, states: options.secondStates ?? states }]); const air = airBank(); const spawn = options.spawn ?? [-20, 20];
  const matchConfig = { seed: 'g08c', roundsToWin: 1, roundTimeTicks: options.roundTimeTicks === undefined ? 600 : options.roundTimeTicks, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: SHA, maxLife: options.maxLife, spawn: [spawn[0], 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'd'.repeat(64), maxLife: options.maxLife, spawn: [spawn[1], 0], facing: -1, initialControl: true }] };
  const match = new MugenHeadlessMatch(matchConfig); const combat = new MugenCombatRuntime(script, { fighters: [{ fighterId: 'P1', air }, { fighterId: 'P2', air }], fightAir: options.fightAir, koHoldTicks: options.koHoldTicks ?? 2, stageBounds: options.stageBounds }); return { match, matchConfig, combat, inputs: inputBuilder(match) };
}

function tick(fixture, held = {}, start = false) { const input = fixture.inputs.push(held); fixture.match.beginTick(input); if (start) fixture.match.startFight(); const combat = fixture.combat.step(fixture.match, input, fixture.inputs.history); const result = fixture.match.endTick(); return { combat, result }; }
function inputBuilder(match) { const history = new MugenInputHistory(180); const previous = new Map([['P1', new Set()], ['P2', new Set()]]); return { history, push(values) { const players = ['P1', 'P2'].map(id => { const held = new Set(values[id] ?? []); const prior = previous.get(id); const source = sourcePlayer(id, held, prior); previous.set(id, held); return source; }); const facing = Object.fromEntries(match.snapshot().fighters.map(value => [value.id, value.facing])); return history.push({ tick: history.tick + 1, players }, facing); } }; }
function sourcePlayer(id, held, previous) { return { id, actions: CONTROLS.map(action => ({ action, value: held.has(action) ? 1 : 0, held: held.has(action), pressed: held.has(action) && !previous.has(action), released: !held.has(action) && previous.has(action) })) }; }
async function stateProgram() { return parseStates(CNS); }
async function parseStates(source) { return parseMugenStateDocuments([await textDocument('fixture.cns', source)]); }
async function textDocument(path, source) { const vfs = await createMugenVfs([{ path, bytes: UTF8.encode(source) }]); return parseMugenTextFile(vfs.require(path), 'utf-8'); }

function airBank() { const actions = [action(0, false), action(20, true), action(21, false, 2), action(120, false), action(200, true), action(5000, false), action(5020, false)]; return Object.freeze({ canonicalPath: 'fixture.air', sourceSha256: SHA, actions: Object.freeze(actions), diagnostics: Object.freeze([]), elementCount: actions.length, collisionBoxCount: actions.length + 1 }); }
function action(number, attack, durationTicks = -1) { const body = box(0, -10, -40, 10, 0); const hit = box(0, 0, -30, 40, -5); const element = Object.freeze({ index: 0, byteOffset: 0, line: 1, column: 1, spriteGroup: -1, spriteItem: -1, spriteId: null, offsetX: 0, offsetY: 0, durationTicks, flipX: false, flipY: false, blend: Object.freeze({ mode: 'opaque', sourceAlpha: 1, destinationAlpha: 0 }), scaleX: 1, scaleY: 1, angleDegrees: 0, interpolateToThis: Object.freeze([]), clsn1: Object.freeze(attack ? [hit] : []), clsn2: Object.freeze([body]) }); return Object.freeze({ number, byteOffset: 0, line: 1, column: 1, loopStart: 0, elements: Object.freeze([element]), totalTicks: durationTicks < 0 ? null : durationTicks, preLoopTicks: 0, loopTicks: durationTicks < 0 ? null : durationTicks }); }
function box(index, left, top, right, bottom) { return Object.freeze({ index, left, top, right, bottom, byteOffset: 0, line: 1, column: 1 }); }

const CMD = `[Command]\nname="x"\ncommand=x\n`;
const REVERSAL_CNS = `[Statedef -1]\n[State -1, reversal]\ntype=ChangeState\ntriggerall=ctrl\ntrigger1=command="x"\nvalue=1300\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n[Statedef 1300]\ntype=S\nmovetype=I\nphysics=N\nanim=200\nctrl=0\n[State 1300, reversal]\ntype=ReversalDef\ntrigger1=time=0\npersistent=0\nreversal.attr=S,NA\npausetime=1,2\np1stateno=1310\np2stateno=1320\np1sprpriority=2\np2sprpriority=1\n[Statedef 1310]\ntype=S\nmovetype=A\nphysics=N\nanim=200\nctrl=0\n[Statedef 1320]\ntype=S\nmovetype=H\nphysics=N\nanim=5000\nctrl=0\n`;
const CNS = `[Statedef -1]\n[State -1, attack]\ntype=ChangeState\ntriggerall=ctrl\ntrigger1=command="x"\nvalue=200\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n[Statedef 120]\ntype=S\nmovetype=H\nphysics=N\nanim=120\nctrl=0\n[Statedef 5000]\ntype=S\nmovetype=H\nphysics=N\nanim=5000\nctrl=0\n[Statedef 5020]\ntype=A\nmovetype=H\nphysics=A\nanim=5020\nctrl=0\n[Statedef 200]\ntype=S\nmovetype=A\nphysics=N\nanim=200\nctrl=0\n[State 200, hit]\ntype=HitDef\ntrigger1=time=0\npersistent=0\nattr=S,NA\ndamage=100,10\nhitflag=MAF\nguardflag=HLM\nground.type=high\npausetime=3,3\nguard.pausetime=2,2\nground.hittime=4\nair.hittime=6\nguard.ctrltime=3\nground.velocity=-3,0\nair.velocity=-2,-3\nguard.velocity=-1,0\ngetpower=50,20\ngivepower=25,10\nkill=1\nguard.kill=0\n[State 200, done]\ntype=ChangeState\ntrigger1=time>=3\nvalue=0\n`;
const THROW_CNS = `[Statedef -1]\n[State -1, throw]\ntype=ChangeState\ntriggerall=ctrl\ntrigger1=command="x"\nvalue=800\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\nanim=0\nctrl=1\n[Statedef 800]\ntype=S\nmovetype=A\nphysics=N\nanim=200\nctrl=0\n[State 800, grab]\ntype=HitDef\ntrigger1=time=0\npersistent=0\nattr=S,NT\nhitflag=M-\npriority=1,Miss\np1stateno=810\np2stateno=820\np2getp1state=1\nid=7\nfall=1\n[Statedef 810]\ntype=S\nmovetype=A\nphysics=N\nanim=200\nctrl=0\n[State 810, bind]\ntype=TargetBind\ntrigger1=time=0\ntime=2\nid=7\npos=15,-5\n[State 810, damage]\ntype=TargetLifeAdd\ntrigger1=time=0\nvalue=-78\nid=7\nabsolute=1\n[State 810, face]\ntype=TargetFacing\ntrigger1=time=0\nvalue=-1\nid=7\n[State 810, custom release]\ntype=TargetState\ntrigger1=time=1\nvalue=821\nid=7\n[State 810, velocity set]\ntype=TargetVelSet\ntrigger1=time=2\nx=2\ny=-3\nid=7\n[State 810, velocity add]\ntype=TargetVelAdd\ntrigger1=time=2\nx=1\ny=1\nid=7\n[State 810, power]\ntype=TargetPowerAdd\ntrigger1=time=2\nvalue=100\nid=7\n[State 810, drop]\ntype=TargetDrop\ntrigger1=time=3\nexcludeid=-1\n[Statedef 820]\ntype=S\nmovetype=H\nphysics=N\nanim=5000\nctrl=0\n[Statedef 821]\ntype=A\nmovetype=H\nphysics=A\nanim=5020\nctrl=0\n[State 821, return]\ntype=SelfState\ntrigger1=time=1\nvalue=0\nctrl=1\n`;
