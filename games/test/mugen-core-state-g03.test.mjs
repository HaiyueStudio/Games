import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? specifier + '.ts' : specifier, context); } });

const [{ parseMugenCommandDocument }, { parseMugenStateDocuments }, { parseMugenTextFile }, { createMugenVfs }, { MugenInputHistory }, { MugenHeadlessMatch }, { MugenScriptRuntime }] = await Promise.all([
  import('../mugen/import/cmd/index.ts'), import('../mugen/import/cns/index.ts'), import('../mugen/import/text/MugenTextParser.ts'), import('../mugen/import/vfs/MugenVfs.ts'), import('../mugen/runtime/input/index.ts'), import('../mugen/runtime/match/index.ts'), import('../mugen/runtime/script/index.ts'),
]);

const UTF8 = new TextEncoder(); const SHA = 'a'.repeat(64); const CONTROLS = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);

test('G03 StateDef expressions and core controllers commit through deterministic authoritative state', async () => {
  const states = await stateProgram([
    '[Data]', 'defence=200',
    '[Movement]', 'yaccel=.44', 'stand.friction=.85', 'crouch.friction=.82',
    '[Statedef 0]', 'type=S', 'movetype=I', 'physics=N',
    '[State 0, seed]', 'type=VarSet', 'trigger1=1', 'v=0', 'value=7',
    '[State 0, enter]', 'type=ChangeState', 'trigger1=1', 'value=100', 'ctrl=0', 'anim=107',
    '[Statedef 100]', 'type=U', 'movetype=A', 'physics=N', 'anim=var(0)+100', 'velset=var(0),-2', 'poweradd=100', 'juggle=4', 'facep2=1', 'sprpriority=3',
    '[State 100, random]', 'type=VarRandom', 'trigger1=1', 'persistent=0', 'v=1', 'range=5,5',
    '[State 100, range]', 'type=VarRangeSet', 'trigger1=1', 'persistent=0', 'first=2', 'last=4', 'value=9',
    '[State 100, vel set]', 'type=VelSet', 'trigger1=1', 'persistent=0', 'x=2', 'y=3',
    '[State 100, vel add]', 'type=VelAdd', 'trigger1=1', 'persistent=0', 'x=1', 'y=1',
    '[State 100, vel mul]', 'type=VelMul', 'trigger1=1', 'persistent=0', 'x=2', 'y=.5',
    '[State 100, gravity]', 'type=Gravity', 'trigger1=1', 'persistent=0',
    '[State 100, pos set]', 'type=PosSet', 'trigger1=1', 'persistent=0', 'x=10', 'y=-20',
    '[State 100, pos add]', 'type=PosAdd', 'trigger1=1', 'persistent=0', 'x=3', 'y=4',
    '[State 100, width]', 'type=Width', 'trigger1=1', 'persistent=0', 'value=15,0',
    '[State 100, freeze]', 'type=PosFreeze', 'trigger1=1', 'persistent=0',
    '[State 100, turn]', 'type=Turn', 'trigger1=1', 'persistent=0',
    '[State 100, life set]', 'type=LifeSet', 'trigger1=1', 'persistent=0', 'value=900',
    '[State 100, life add scaled]', 'type=LifeAdd', 'trigger1=1', 'persistent=0', 'value=-100', 'kill=0', 'absolute=0',
    '[State 100, life add absolute]', 'type=LifeAdd', 'trigger1=1', 'persistent=0', 'value=-50', 'kill=0', 'absolute=1',
    '[State 100, power set]', 'type=PowerSet', 'trigger1=1', 'persistent=0', 'value=200',
    '[State 100, power add]', 'type=PowerAdd', 'trigger1=1', 'persistent=0', 'value=-50',
    '[State 100, control]', 'type=CtrlSet', 'trigger1=1', 'persistent=0', 'value=1',
    '[State 100, metadata]', 'type=StateTypeSet', 'trigger1=1', 'persistent=0', 'statetype=C', 'movetype=I', 'physics=N',
    '[State 100, anim self]', 'type=ChangeAnim', 'trigger1=1', 'persistent=0', 'value=150', 'elem=2',
    '[State 100, anim owner]', 'type=ChangeAnim2', 'trigger1=1', 'persistent=0', 'value=200', 'elem=3',
    '[State 100, reset contact]', 'type=MoveHitReset', 'trigger1=1', 'persistent=0',
  ].join('\n'));
  assert.deepEqual(states.attributes, { defense: 200, airJuggle: 15 }); assert.deepEqual(states.physics, { gravity: Math.fround(.44), standFriction: Math.fround(.85), crouchFriction: Math.fround(.82) });
  const runtime = await runtimeFor(states, states); const inputs = inputBuilder(); const match = createMatch(); const input = inputs.push([]);
  match.beginTick(input).startFight(); runtime.step(match, input, inputs.history); const result = match.endTick(); const fighter = result.state.fighters[0];
  assert.equal(fighter.stateNumber, 100); assert.equal(fighter.stateType, 'C'); assert.equal(fighter.moveType, 'I'); assert.equal(fighter.physics, 'N');
  assert.equal(fighter.actionNumber, 200); assert.equal(fighter.animationElement, 3); assert.equal(fighter.animationOwnerId, 'P1');
  const gravityVelocity = Math.fround(2 + Math.fround(.44)); assert.deepEqual(fighter.velocity, [6, gravityVelocity]); assert.deepEqual(fighter.position, [13, -16]); assert.equal(fighter.positionFrozen, true); assert.equal(fighter.facing, -1);
  assert.deepEqual(fighter.integerVariables.slice(0, 5), [7, 5, 9, 9, 9]); assert.equal(fighter.life, 800); assert.equal(fighter.power, 150); assert.equal(fighter.control, true); assert.equal(fighter.juggleCost, 4); assert.equal(fighter.spritePriority, 3);
  assert.deepEqual(fighter.widthOverride, { edge: [15, 0], player: [15, 0] });
  const restored = MugenHeadlessMatch.restore(matchConfig(), result.state); assert.deepEqual(restored.snapshot(), result.state);
  const nextInput = inputs.push([]); match.beginTick(nextInput); runtime.step(match, nextInput, inputs.history); match.endTick(); const next = match.fighter('P1'); assert.equal(next.positionFrozen, false); assert.deepEqual(next.widthOverride, { edge: [0, 0], player: [0, 0] }); assert.deepEqual(next.position, [19, Math.fround(-16 + gravityVelocity)]);
});

test('G03 SelfState returns a custom-state fighter to its own state and animation data', async () => {
  const own = await stateProgram(['[Statedef 0]', 'type=S', 'movetype=I', 'physics=N', '[Statedef 200]', 'type=S', 'movetype=I', 'physics=N', 'anim=200', 'ctrl=1'].join('\n'));
  const foreign = await stateProgram(['[Statedef 0]', 'type=S', 'movetype=I', 'physics=N', '[State 0, return]', 'type=SelfState', 'trigger1=1', 'value=200'].join('\n'));
  const runtime = await runtimeFor(own, foreign); const inputs = inputBuilder(); const match = createMatch(); const input = inputs.push([]);
  match.beginTick(input).startFight().setHitPause('P2', 1); match.changeFighterState('P1', 0, true, { stateDataOwnerId: 'P2', preserveHitDefinition: true, preserveMoveContact: true, preserveHitCount: true });
  runtime.step(match, input, inputs.history); match.endTick(); const fighter = match.fighter('P1');
  assert.equal(fighter.stateNumber, 200); assert.equal(fighter.stateDataOwnerId, 'P1'); assert.equal(fighter.animationOwnerId, 'P1'); assert.equal(fighter.actionNumber, 200);
});

test('standard var(n)/fvar(n) assignment syntax and AssertSpecial parse without changing authoritative fighter state', async () => {
  const states = await stateProgram([
    '[Statedef 0]', 'type=S', 'movetype=I', 'physics=N',
    '[State 0, integer]', 'type=VarSet', 'trigger1=1', 'var(3)=11',
    '[State 0, float]', 'type=VarSet', 'trigger1=1', 'fvar(2)=1.25',
    '[State 0, add]', 'type=VarAdd', 'trigger1=1', 'var(3)=4',
    '[State 0, flags]', 'type=AssertSpecial', 'trigger1=1', 'flag=NoAutoTurn', 'flag2=NoShadow',
    '[State 0, parent integer]', 'type=ParentVarSet', 'trigger1=0', 'var(55)=7',
    '[State 0, parent float]', 'type=ParentVarAdd', 'trigger1=0', 'fvar(39)=.5',
  ].join('\n'));
  const controllers = states.states.find(value => value.number === 0).controllers;
  assert.deepEqual(controllers.find(value => value.type === 'assert-special').literalParameters, { flag: 'noautoturn', flag2: 'noshadow' });
  assert(controllers.find(value => value.name === 'parent integer').parameters.v);
  assert(controllers.find(value => value.name === 'parent float').parameters.fv);
  const runtime = await runtimeFor(states, states); const inputs = inputBuilder(); const match = createMatch(); const input = inputs.push([]);
  match.beginTick(input).startFight(); runtime.step(match, input, inputs.history); match.endTick();
  assert.equal(match.fighter('P1').integerVariables[3], 15);
  assert.equal(match.fighter('P1').floatVariables[2], Math.fround(1.25));
});

test('G03 parser fails closed on ambiguous Width and VarRangeSet parameters', async () => {
  await assert.rejects(() => stateProgram(['[Statedef 0]', 'type=S', 'movetype=I', 'physics=N', '[State 0,x]', 'type=Width', 'trigger1=1', 'value=1,2', 'edge=3,4'].join('\n')), error => error.diagnostics?.[0]?.code === 'E_MUGEN_CNS_SYNTAX');
  await assert.rejects(() => stateProgram(['[Statedef 0]', 'type=S', 'movetype=I', 'physics=N', '[State 0,x]', 'type=VarRangeSet', 'trigger1=1', 'value=1', 'fvalue=2'].join('\n')), error => error.diagnostics?.[0]?.code === 'E_MUGEN_CNS_SYNTAX');
  await assert.rejects(() => stateProgram(['[Movement]', 'stand.friction=2', '[Statedef 0]', 'type=S', 'movetype=I', 'physics=N'].join('\n')), error => error.diagnostics?.[0]?.code === 'E_MUGEN_CNS_SYNTAX');
});

test('G03 ledger closes 25 core controllers and script runtime has no direct core field writes', () => {
  const ledger = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/core-controller-ledger.json', import.meta.url), 'utf8'));
  assert.equal(ledger.closedCount, 25); assert.equal(ledger.controllers.length, 25); assert.equal(new Set(ledger.controllers.map(value => value.name)).size, 25);
  const evidence = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/g03-official-oracle-evidence.json', import.meta.url), 'utf8')); assert.equal(evidence.result, 'pass'); assert.deepEqual([evidence.officialLoadEvidence.expressions, evidence.officialLoadEvidence.triggerLineExpressions], [98, 45]);
  for (const source of evidence.sources.filter(value => value.path.startsWith('Games/games/mugen/oracle/g03-core-state-oracle/'))) { const bytes = readFileSync(new URL(`../mugen/oracle/g03-core-state-oracle/${source.path.split('/').at(-1)}`, import.meta.url)); assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256); }
  const source = readFileSync(new URL('../mugen/runtime/script/MugenScriptRuntime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /match\.(?:setKinematics|setFighterState|setFighterAction|setFighterStateMetadata|setIntegerVariable|addIntegerVariable|setFloatVariable|addFloatVariable|setLife|setPower|resetMoveContact|changeFighterState)\(/u);
  const officialSources = ['../mugen/charactors/kfm/kfm.cns', '../mugen/charactors/kfm/kfm.cmd', '../mugen/charactors/kfm720/kfm720.cns', '../mugen/charactors/kfm720/kfm720.cmd'].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  const present = [...officialSources.matchAll(/^\s*type\s*=\s*([A-Za-z][A-Za-z0-9]*)/gimu)].map(match => match[1].toLowerCase()); const ledgerNames = new Map(ledger.controllers.map(value => [value.name.toLowerCase(), value.name])); const officialCore = [...new Set(present.filter(value => ledgerNames.has(value)).map(value => ledgerNames.get(value)))].sort();
  assert.deepEqual(officialCore, ['ChangeAnim', 'ChangeAnim2', 'ChangeState', 'CtrlSet', 'PosAdd', 'PosFreeze', 'PosSet', 'SelfState', 'SprPriority', 'Turn', 'VarSet', 'VelAdd', 'VelMul', 'VelSet', 'Width']);
});

async function stateProgram(source) { return parseMugenStateDocuments([await textDocument('g03.cns', source)]); }
async function runtimeFor(first, second) { const command = parseMugenCommandDocument(await textDocument('g03.cmd', '[Command]\nname="dummy"\ncommand=s\n')); return new MugenScriptRuntime([{ fighterId: 'P1', commands: command, states: first }, { fighterId: 'P2', commands: command, states: second }]); }
async function textDocument(path, source) { const vfs = await createMugenVfs([{ path, bytes: UTF8.encode(source) }]); return parseMugenTextFile(vfs.require(path), 'utf-8'); }
function createMatch() { return new MugenHeadlessMatch(matchConfig()); }
function matchConfig() { return { seed: 'g03', roundsToWin: 1, roundTimeTicks: null, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: SHA, spawn: [-20, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [20, 0], facing: -1, initialControl: true }] }; }
function inputBuilder() { const history = new MugenInputHistory(180); let previous = new Set(); return { history, push(controls) { const held = new Set(controls); const source = { tick: history.tick + 1, players: [sourcePlayer('P1', held, previous), sourcePlayer('P2', new Set(), new Set())] }; const input = history.push(source, { P1: 1, P2: -1 }); previous = held; return input; } }; }
function sourcePlayer(id, held, previous) { return { id, actions: CONTROLS.map(action => ({ action, value: held.has(action) ? 1 : 0, held: held.has(action), pressed: held.has(action) && !previous.has(action), released: !held.has(action) && previous.has(action) })) }; }
