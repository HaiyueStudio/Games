import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [
  { parseMugenCommandDocument },
  { parseMugenStateDocuments },
  { compileMugenCharacterScripts },
  { isMugenWorkerRequest, MUGEN_WORKER_PROTOCOL, MUGEN_WORKER_PROTOCOL_VERSION },
  { buildMugenImportGraph },
  { parseMugenTextFile },
  { createMugenVfs },
  { createMugenPackage },
  { encodeMugenPackage },
  { MugenInputHistory },
  { MugenHeadlessMatch },
  { MugenCommandMatcher, MugenScriptRuntime },
] = await Promise.all([
  import('../mugen/import/cmd/index.ts'),
  import('../mugen/import/cns/index.ts'),
  import('../mugen/import/script/index.ts'),
  import('../mugen/import/worker/protocol.ts'),
  import('../mugen/import/text/DependencyGraph.ts'),
  import('../mugen/import/text/MugenTextParser.ts'),
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/package/builder.ts'),
  import('../mugen/package/codec.ts'),
  import('../mugen/runtime/input/index.ts'),
  import('../mugen/runtime/match/index.ts'),
  import('../mugen/runtime/script/index.ts'),
]);

const UTF8 = new TextEncoder();
const SHA = 'a'.repeat(64);

test('CMD/CNS compiler produces deterministic package IR for the explicit G08-B subset', async () => {
  const graphA = await scriptGraph();
  const graphB = await scriptGraph([...SCRIPT_INPUTS].reverse());
  const compiledA = compileMugenCharacterScripts(graphA);
  const compiledB = compileMugenCharacterScripts(graphB);
  assert.deepEqual(compiledA.commands, compiledB.commands);
  assert.deepEqual(compiledA.states, compiledB.states);
  assert.deepEqual(compiledA.commands.commands.map(command => command.foldedName), ['holdfwd', 'holdback', 'holddown', 'holdup', 'x', 'z']);
  assert.deepEqual(compiledA.states.states.map(state => state.number), [-1, 0, 10, 20, 21, 40, 200, 300]);
  const packageA = createMugenPackage(graphA, { contentRole: 'formal-fixture', contributions: compiledA.contributions });
  const packageB = createMugenPackage(graphB, { contentRole: 'formal-fixture', contributions: compiledB.contributions });
  const encodedA = await encodeMugenPackage(packageA); const encodedB = await encodeMugenPackage(packageB);
  assert.equal(encodedA.packageSha256, encodedB.packageSha256);
  assert.equal(packageA.tables.commands.length, 1); assert.equal(packageA.tables.states.length, 1);
  assert.deepEqual(packageA.featureUsage.filter(value => value.startsWith('g08.')), ['g08.cmd.basic-v1', 'g08.cns.minimal-v1', 'g08.vm.typed-no-eval-v1']);
});

test('DEF stN dependencies are compiled as state scripts regardless of legacy file extension', async () => {
  const inputs = [
    { path: 'legacy.def', bytes: UTF8.encode('[Info]\nname=Legacy\n[Files]\ncmd=legacy.cmd\ncns=legacy.cns\nst8=AI_1_0.txt\n') },
    { path: 'legacy.cmd', bytes: UTF8.encode('[Command]\nname="x"\ncommand=x\n[Statedef -1]\n') },
    { path: 'legacy.cns', bytes: UTF8.encode('[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\n') },
    { path: 'AI_1_0.txt', bytes: UTF8.encode('[Statedef -3]\n[State -3, AI marker]\ntype=Null\ntrigger1=1\n') },
  ];
  const graph = await buildMugenImportGraph(await createMugenVfs(inputs), { entryDef: 'legacy.def', entryKind: 'character', encoding: 'utf-8' });
  const compiled = compileMugenCharacterScripts(graph, 'm09-native-common');
  assert.equal(compiled.states.states.find(state => state.number === -3).controllers[0].name, 'AI marker');
});

test('legacy Helper pausermovetime spelling is normalized to pausemovetime', async () => {
  const states = parseMugenStateDocuments([await textDocument('legacy-helper.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\n[State 0, helper]\ntype=Helper\ntrigger1=1\nstateno=0\npausermovetime=99\n')]);
  const helper = states.states.find(state => state.number === 0).controllers[0];
  assert(helper.parameters.pausemovetime !== undefined);
  assert.equal(helper.parameters.pausermovetime, undefined);
});

test('legacy non-numeric State labels remain controllers of the preceding StateDef', async () => {
  const states = parseMugenStateDocuments([await textDocument('legacy-state-label.cns', `[Statedef 0]
type=S
movetype=I
physics=N
[Statedef 90001]
type=S
movetype=I
physics=N
[State a]
type=NotHitBy
trigger1=1
value=SCA
time=-1
[State 42, named]
type=BindToParent
trigger1=1
pos=100,0
`)]);
  const state = states.states.find(value => value.number === 90_001);
  assert.deepEqual(state.controllers.map(value => [value.name, value.type]), [['a', 'not-hit-by'], ['named', 'bind-to-parent']]);
  assert.equal(state.controllers[0].hitAttributeFilter.attributes.length, 27);
});

test('known Petra trigger-key typos remain explicit ignored compatibility fields', async () => {
  const states = parseMugenStateDocuments([await textDocument('legacy-trigger-typo.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\n[State 0, typo]\ntype=ChangeState\ntrigger1=0\nTrrigge5=Time>5\nTroggerAll=Time>6\nTriggeeAll=Time>7\nvalue=0\n')]);
  assert.deepEqual(states.states.find(state => state.number === 0).controllers[0].literalParameters, { 'compat.ignored.triggeeall': 'Time>7', 'compat.ignored.troggerall': 'Time>6', 'compat.ignored.trrigge5': 'Time>5' });
});

test('legacy duplicate controller parameters deterministically use the final value', async () => {
  const states = parseMugenStateDocuments([await textDocument('duplicate-hitdef.cns', `[Statedef 0]
type=S
movetype=I
physics=N
[Statedef 200]
type=S
movetype=A
physics=N
[State 200, duplicate hit flags]
type=HitDef
trigger1=1
attr=S,NA
hitflag=M
hitflag=MAF
`)]);
  const controller = states.states.find(state => state.number === 200).controllers[0];
  assert.equal(controller.hitDefinition.hitFlags, 'AFM');
  assert.equal(controller.literalParameters['compat.duplicate.hitflag'], 'MAF');
});

test('command matcher supports hold/four-way, release charge, simultaneous buttons, buffer and no-other-input', async () => {
  const source = `[Defaults]\ncommand.time = 12\ncommand.buffer.time = 3\n[Command]\nname = "holdDown"\ncommand = /$D\n[Command]\nname = "charge"\ncommand = ~3$D, x\n[Command]\nname = "combo"\ncommand = a+b\n[Command]\nname = "clean"\ncommand = F, >a\n`;
  const document = await textDocument('commands.cmd', source);
  const matcher = new MugenCommandMatcher(parseMugenCommandDocument(document));
  const inputs = inputBuilder();
  for (let tick = 1; tick <= 3; tick += 1) { inputs.push(['down']); assert(matcher.match(inputs.history, 'P1').names.includes('holddown')); }
  inputs.push([]); inputs.push(['x']); assert(matcher.match(inputs.history, 'P1').names.includes('charge'));
  inputs.push(['a', 'b']); assert(matcher.match(inputs.history, 'P1').names.includes('combo'));
  inputs.push([]); assert(matcher.match(inputs.history, 'P1').names.includes('combo'));
  inputs.push([]); assert(matcher.match(inputs.history, 'P1').names.includes('combo'));
  inputs.push(['right']); inputs.push(['right', 'b']); inputs.push(['right', 'a']);
  assert.equal(matcher.match(inputs.history, 'P1').names.includes('clean'), false);
});

test('official time=0 and AI.Cheat command activation share the tick command matcher', async () => {
  const document = await textDocument('legacy-ai.cmd', '[Command]\nname="singleZero"\ncommand=a\ntime=0\n[Command]\nname="impossible"\ncommand=a,a,a\ntime=0\nbuffer.time=2\n');
  const program = parseMugenCommandDocument(document); const matcher = new MugenCommandMatcher(program); const history = new MugenInputHistory();
  history.push({ tick: 1, players: [{ ...sourcePlayer('P1', new Set(['a']), new Set()), aiLevel: 0 }, sourcePlayer('P2', new Set(), new Set())] }, { P1: 1, P2: -1 });
  assert.deepEqual(matcher.match(history, 'P1').names, ['singlezero']);
  const aiInput = history.push({ tick: 2, players: [{ ...sourcePlayer('P1', new Set(), new Set(['a'])), aiLevel: 4, aiCommands: ['Impossible'] }, sourcePlayer('P2', new Set(), new Set())] }, { P1: 1, P2: -1 });
  assert.deepEqual(matcher.match(history, 'P1').names, ['impossible']);
  history.push({ tick: 3, players: [{ ...sourcePlayer('P1', new Set(), new Set()), aiLevel: 4 }, sourcePlayer('P2', new Set(), new Set())] }, { P1: 1, P2: -1 });
  assert.deepEqual(matcher.match(history, 'P1').names, ['impossible']);
  assert.equal(aiInput.players[0].aiLevel, 4);
});

test('AILevel reads the current root tick input and remains zero for a human player', async () => {
  const commands = parseMugenCommandDocument(await textDocument('ailevel.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await textDocument('ailevel.cns', '[Statedef -1]\n[State -1, capture]\ntype=VarSet\ntrigger1=AILevel > 0\nv=0\nvalue=AILevel\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\nctrl=1\n')]);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]); const history = new MugenInputHistory(); const match = createMatch();
  const input = history.push({ tick: 1, players: [{ ...sourcePlayer('P1', new Set(), new Set()), aiLevel: 4 }, sourcePlayer('P2', new Set(), new Set())] }, { P1: 1, P2: -1 });
  match.beginTick(input).startFight(); runtime.step(match, input, history); match.endTick();
  assert.equal(match.fighter('P1').integerVariables[0], 4); assert.equal(match.fighter('P2').integerVariables[0], 0);
});

test('G07-B Petra identity, opponent, team, stage and system references evaluate on every tick', async () => {
  const commands = parseMugenCommandDocument(await textDocument('g07b.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const source = `[Statedef 0]
type=S
movetype=I
physics=N
ctrl=1
[State 0, side]
type=VarSet
trigger1=1
v=0
value=TeamSide
[State 0, clock]
type=VarSet
trigger1=1
v=1
value=GameTime
[State 0, front]
type=VarSet
trigger1=1
v=2
value=FrontEdgeDist
[State 0, back]
type=VarSet
trigger1=1
v=3
value=BackEdgeBodyDist
[State 0, sys]
type=VarSet
trigger1=1
v=4
value=SysVar(0)
[State 0, sys native writer]
type=VarSet
trigger1=1
sysvar(0)=77
[State 0, identity]
type=VarSet
trigger1=1
v=5
value=Name="Petra_Johanna_Lagerkvist" && AuthorName="Ina" && TeamMode=single
[State 0, opponent]
type=VarSet
trigger1=1
v=6
value=NumEnemy=1 && P2Name="Rival" && P4Name="" && P2MoveType=I && P2StateNo=0 && P2StateType=S
[State 0, round]
type=VarSet
trigger1=1
v=7
value=RoundsExisted=0 && !MatchOver && !WinKO
[State 0, root]
type=VarSet
trigger1=1
v=8
value=!IsHelper(10020)
`;
  const states = parseMugenStateDocuments([await textDocument('g07b.cns', source)]); const runtime = new MugenScriptRuntime([{ fighterId: 'P1', name: 'Petra_Johanna_Lagerkvist', authorName: 'Ina', commands, states }, { fighterId: 'P2', name: 'Rival', authorName: 'Test', commands, states }]); const inputs = inputBuilder(); const match = createMatch(); const context = { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), stageBounds: [-120, 120], screenBounds: [-100, 100] };
  let input = inputs.push([]); match.beginTick(input).startFight(); runtime.step(match, input, inputs.history, context); match.endTick();
  input = inputs.push([]); match.beginTick(input); runtime.step(match, input, inputs.history, context); match.endTick();
  assert.deepEqual(match.fighter('P1').integerVariables.slice(0, 9), [1, 2, 120, 80, 77, 1, 1, 1, 1]);
  assert.deepEqual(runtime.executionSnapshot().systemVariables.P1, [77, 0, 0, 0, 0]);
});

test('G08 closes the remaining official camera, match, team, stage and SysFVar trigger ledger', async () => {
  const commands = parseMugenCommandDocument(await textDocument('g08-trigger-closure.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const probes = [
    'BackEdge=-100', 'BottomEdge=10', 'CameraZoom=2', '!DrawGame', 'FrontEdge=100', 'GameHeight=120', 'GameWidth=200', 'IsHomeTeam', 'LeftEdge=-100', '!Lose', 'MatchNo=3', 'NumPartner=0', 'P1Name="Petra_Johanna_Lagerkvist"', 'P3Name=""', 'RightEdge=100', 'ScreenHeight=240', 'ScreenWidth=320', 'StageVar(info.authorname)="Haiyue"', 'SysFVar(2)=1.5', 'TicksPerSecond=60', 'TopEdge=-110',
  ];
  const controllers = probes.map((probe, index) => `[State 0, probe ${index}]\ntype=VarSet\ntrigger1=1\nv=${index}\nvalue=${probe}`).join('\n');
  const states = parseMugenStateDocuments([await textDocument('g08-trigger-closure.cns', `[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\nctrl=1\n${controllers}\n`)]);
  const programs = [{ fighterId: 'P1', name: 'Petra_Johanna_Lagerkvist', authorName: 'Ina', commands, states }, { fighterId: 'P2', name: 'Rival', authorName: 'Test', commands, states }];
  const runtime = new MugenScriptRuntime(programs); const inputs = inputBuilder(); const match = createMatch(); const context = { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), screenBounds: [-100, 100], cameraPosition: [5, 10], cameraZoom: 2, stageInfo: { name: 'strict-stage', displayName: 'Strict Stage', authorName: 'Haiyue' }, matchNumber: 3, homeTeamSide: 1 };
  let input = inputs.push([]); match.beginTick(input).startFight(); runtime.step(match, input, inputs.history, context); match.endTick();
  runtime.setSystemFloatVariable('P1', 2, 1.5);
  input = inputs.push([]); match.beginTick(input); runtime.step(match, input, inputs.history, context); match.endTick();
  assert.deepEqual(match.fighter('P1').integerVariables.slice(0, probes.length), new Array(probes.length).fill(1));
  const snapshot = runtime.executionSnapshot(); assert.equal(snapshot.systemFloatVariables.P1[2], 1.5);
  const restored = new MugenScriptRuntime(programs); restored.restoreExecution(snapshot); assert.deepEqual(restored.executionSnapshot(), snapshot);
  assert.throws(() => runtime.setSystemFloatVariable('P1', 5, 0), /out of range/u);
});

test('G08 Lose, LoseKO, LoseTime and DrawGame remain observable during completed-round phases', async () => {
  const commands = parseMugenCommandDocument(await textDocument('g08-result.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await textDocument('g08-result.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\nctrl=1\n[State 0, lose]\ntype=VarSet\ntrigger1=1\nv=0\nvalue=Lose\n[State 0, ko]\ntype=VarSet\ntrigger1=1\nv=1\nvalue=LoseKO\n[State 0, time]\ntype=VarSet\ntrigger1=1\nv=2\nvalue=LoseTime\n[State 0, draw]\ntype=VarSet\ntrigger1=1\nv=3\nvalue=DrawGame\n')]);
  const programs = [{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }];
  const run = reason => { const runtime = new MugenScriptRuntime(programs); const inputs = inputBuilder(); const match = createMatch(); let input = inputs.push([]); match.beginTick(input).startFight(); runtime.step(match, input, inputs.history); match.endTick(); input = inputs.push([]); match.beginTick(input); if (reason === 'ko') match.declareKo('P2'); else match.resolveRound(reason === 'draw' ? null : 'P2', reason); runtime.step(match, input, inputs.history); match.endTick(); return match.fighter('P1').integerVariables.slice(0, 4); };
  assert.deepEqual(run('ko'), [1, 1, 0, 0]);
  assert.deepEqual(run('time-over'), [1, 0, 1, 0]);
  assert.deepEqual(run('draw'), [0, 0, 0, 1]);
});

test('G07-A official time=0 and AI command evidence is content-addressed', () => {
  const evidence = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/g07a-official-oracle-evidence.json', import.meta.url), 'utf8'));
  assert.equal(evidence.result, 'pass');
  for (const source of evidence.sources) {
    const relative = source.path.slice('Games/'.length); const bytes = readFileSync(new URL(`../../${relative}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path);
  }
  const observations = Object.fromEntries(evidence.observations.map(observation => {
    const relative = observation.resultPath.slice('Games/'.length); const bytes = readFileSync(new URL(`../../${relative}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), observation.resultSha256, observation.resultPath);
    return [observation.id, JSON.parse(bytes)];
  }));
  assert.equal(observations['human-time-zero'].screenshotObservation.failureCode, 2);
  assert.equal(observations['human-time-one-control'].result, 'pass');
  assert.equal(observations['legacy-ai-command-and-ailevel'].result, 'pass');
  assert.equal(observations['legacy-ai-command-and-ailevel'].logTail.at(-1), 'Player 1 AI turned on');
});

test('typed state VM drives stand, walk, crouch, jump and basic attack through the G08-A owner', async () => {
  const first = await runActionTrace(); const second = await runActionTrace();
  assert.deepEqual(first, second);
  assert.deepEqual(first.visited.slice(0, 5), [0, 20, 20, 0, 10]);
  assert(first.visited.includes(40)); assert(first.visited.includes(200));
  assert.equal(first.final.stateNumber, 0); assert.equal(first.final.position[1], 0); assert.equal(first.final.actionNumber, 0);
  assert.equal(first.final.integerVariables[0], 5);
  assert(first.executed.some(value => value.endsWith(':change-anim')));
  assert(first.executed.some(value => value.endsWith(':var-set')));
  assert(first.executed.some(value => value.endsWith(':var-add')));
});

test('native engine automatically leaves state 5110 after Data.liedown.time and restores control through 5120', async () => {
  const commands = parseMugenCommandDocument(await textDocument('liedown.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await textDocument('liedown.cns', `[Data]
liedown.time = 2
[Velocity]
jump.neu = 0,-9.5
airjump.neu = 0,-8
[Statedef -1]
[Statedef 0]
type=S
movetype=I
physics=S
ctrl=1
[Statedef 5110]
type=L
movetype=H
physics=N
ctrl=0
[Statedef 5120]
type=L
movetype=I
physics=N
ctrl=0
[State 5120, finished]
type=ChangeState
trigger1=Time>=2
value=0
ctrl=1
`)]);
  assert.equal(states.constants['velocity.jump.y'], -9.5); assert.equal(states.constants['velocity.airjump.y'], -8);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states, engineControlTransitions: true }, { fighterId: 'P2', commands, states, engineControlTransitions: true }]); const inputs = inputBuilder(); const match = createMatch(); const visited = [];
  for (let tick = 0; tick < 6; tick += 1) { const input = inputs.push([]); match.beginTick(input); if (tick === 0) { match.startFight(); runtime.enterFighterState(match, 'P1', 5110, 'P1', {}, false); } runtime.step(match, input, inputs.history); const result = match.endTick(); visited.push(result.state.fighters[0].stateNumber); }
  assert(visited.includes(5120), `get-up state was not visited: ${visited.join(',')}`); assert.equal(match.fighter('P1').stateNumber, 0); assert.equal(match.fighter('P1').control, true);
});

test('state metadata and variables are part of the authoritative hash and survive snapshot restore', async () => {
  const { history, push } = inputBuilder(); const match = createMatch();
  const input = push([]); match.beginTick(input).startFight().setFighterStateMetadata('P1', { stateType: 'A', moveType: 'A', physics: 'A' }).setIntegerVariable('P1', 7, 42).setFloatVariable('P1', 3, 1.25);
  const result = match.endTick(); const restored = MugenHeadlessMatch.restore(matchConfig(), result.state);
  assert.deepEqual(restored.snapshot(), result.state);
  assert.deepEqual(restored.fighter('P1').integerVariables.slice(6, 9), [0, 42, 0]);
  assert.equal(restored.fighter('P1').floatVariables[3], 1.25); assert.equal(history.tick, 1);
});

test('G02 script execution snapshot preserves persistent counters across authoritative replay restore', async () => {
  const commands = parseMugenCommandDocument(await textDocument('snapshot.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await textDocument('snapshot.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\nctrl=1\n[State 0, every second true activation]\ntype=VarAdd\ntrigger1=1\npersistent=2\nv=0\nvalue=1\n')]);
  const programs = [{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]; const runtimeA = new MugenScriptRuntime(programs); const runtimeB = new MugenScriptRuntime(programs); const inputsA = inputBuilder(); const inputsB = inputBuilder(); const matchA = createMatch();
  const firstA = inputsA.push([]); inputsB.push([]); matchA.beginTick(firstA).startFight(); runtimeA.step(matchA, firstA, inputsA.history); const firstResult = matchA.endTick();
  const execution = runtimeA.executionSnapshot(); runtimeB.restoreExecution(execution); const matchB = MugenHeadlessMatch.restore(matchConfig(), firstResult.state);
  const secondA = inputsA.push([]); const secondB = inputsB.push([]); matchA.beginTick(secondA); matchB.beginTick(secondB); const traceA = runtimeA.step(matchA, secondA, inputsA.history); const traceB = runtimeB.step(matchB, secondB, inputsB.history); const resultA = matchA.endTick(); const resultB = matchB.endTick();
  assert.deepEqual(resultB.state, resultA.state); assert.equal(resultB.state.fighters[0].integerVariables[0], 1); assert.equal(traceB.hash, traceA.hash); assert.deepEqual(runtimeB.executionSnapshot(), runtimeA.executionSnapshot());
  const corrupt = structuredClone(execution); corrupt.programHash = '0'.repeat(64); assert.throws(() => runtimeB.restoreExecution(corrupt), /snapshot is invalid/u);
});

test('VelSet/Add/Mul, PosAdd and CtrlSet execute in source order with facing-relative x', async () => {
  const compiled = compileMugenCharacterScripts(await scriptGraph());
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands: compiled.commands, states: compiled.states }, { fighterId: 'P2', commands: compiled.commands, states: compiled.states }]);
  const inputs = inputBuilder(); const match = createMatch();
  let input = inputs.push([]); match.beginTick(input).startFight(); runtime.step(match, input, inputs.history); match.endTick();
  input = inputs.push(['z']); match.beginTick(input); runtime.step(match, input, inputs.history); match.endTick(); assert.equal(match.fighter('P1').stateNumber, 300);
  assert.deepEqual(match.fighter('P1').velocity, [6, 1.5]); assert.deepEqual(match.fighter('P1').position, [-11, 5.5]); assert.equal(match.fighter('P1').control, true);
  input = inputs.push([]); match.beginTick(input); runtime.step(match, input, inputs.history); match.endTick(); assert.equal(match.fighter('P1').stateNumber, 0); assert.deepEqual(match.fighter('P1').velocity, [0, 0]); assert.deepEqual(match.fighter('P1').position, [-11, 5.5]);
});

test('G05 Helper, Projectile and Explod controllers parse and commit through the script authority', async () => {
  const commands = parseMugenCommandDocument(await textDocument('g05.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const source = `[Statedef 0]
type=S
movetype=I
physics=N
ctrl=1
[State 0, helper]
type=Helper
trigger1=Time=0
name="child"
id=7
stateno=1000
pos=10,-5
pausemovetime=999999999999
[State 0, projectile]
type=Projectile
trigger1=Time=0
projid=8
projanim=20
attr=S,NP
damage=20,5
offset=12,-6
velocity=3,0
projremovetime=30
afterimage.time=9
afterimage.length=4
afterimage.palcolor=128
afterimage.palinvertall=1
afterimage.palbright=1,2,3
afterimage.palcontrast=4,5,6
afterimage.palpostbright=7,8,9
afterimage.paladd=10,11,12
afterimage.palmul=.5,.6,.7
afterimage.timegap=2
afterimage.framegap=3
afterimage.trans=add
[State 0, explod]
type=Explod
trigger1=Time=0
anim=F72
id=9
postype=p1
pos=4,-8
vel=1,0
removetime=20
ontop=1
supermove=1
[State 0, entity counts]
type=VarSet
triggerall=Time>0
trigger1=NumHelper(7)=1
trigger1=NumExplod(9)=1
trigger1=NumProj=1
trigger1=NumProjID(8)=1
trigger1=ID=1
trigger1=PlayerIDExist(2)
v=10
value=1
[Statedef 1000]
type=S
movetype=I
physics=N
anim=0
[State 1000, nested]
type=Helper
trigger1=Time=0
id=17
stateno=1001
[State 1000, parent variable]
type=ParentVarSet
trigger1=Time=0
v=11
value=ID
[State 1000, parent redirect]
type=VarSet
trigger1=Time=0
v=1
value=parent, ID
[State 1000, root redirect]
type=VarSet
trigger1=Time=0
v=2
value=root, ID
[State 1000, helper random]
type=VarRandom
trigger1=Time=0
v=3
range=7,7
[State 1000, helper range]
type=VarRangeSet
trigger1=Time=0
first=4
last=5
value=9
[State 1000, custom state]
type=ChangeState
trigger1=Time=0
value=1002
[Statedef 1001]
type=S
movetype=I
physics=N
[State 1001, destroy]
type=DestroySelf
trigger1=Time=0
[Statedef 1002]
type=S
movetype=I
physics=N
[State 1002, bind root]
type=BindToRoot
trigger1=Time=1
time=2
pos=5,-2
`;
  const states = parseMugenStateDocuments([await textDocument('g05.cns', source)]);
  assert.deepEqual(states.states[1].controllers.map(value => value.type), ['helper', 'projectile', 'explod', 'var-set']);
  assert.equal(states.states[1].controllers[2].literalParameters['anim.owner'], 'fight');
  assert.equal(states.states[1].controllers[2].literalParameters['compat.deprecated.supermove'], '1');
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]);
  const inputs = inputBuilder(); const match = createMatch(); const input = inputs.push([]); match.beginTick(input).startFight();
  const trace = runtime.step(match, input, inputs.history); match.endTick();
  assert.deepEqual(trace.entityCommit.spawned, ['helper:0000000001', 'projectile:0000000002', 'explod:0000000003', 'helper:0000000004', 'projectile:0000000005', 'explod:0000000006']);
  assert.deepEqual(runtime.entities.helpers('P1').map(value => [value.helperId, value.name, value.stateNumber]), [[7, 'child', 1000]]);
  assert.equal(runtime.entities.helpers('P1')[0].pauseMoveTime, 2_147_483_647);
  assert.deepEqual(runtime.entities.projectiles('P1').map(value => [value.projectileId, value.position]), [[8, [-5, -6]]]);
  assert.deepEqual(trace.output.entities.find(value => value.entityId === 'projectile:0000000002').afterImage, { remainingTicks: 9, length: 4, paletteColor: 128, paletteInvertAll: true, paletteBright: [1, 2, 3], paletteContrast: [4, 5, 6], palettePostBright: [7, 8, 9], paletteAdd: [10, 11, 12], paletteMultiply: [.5, Math.fround(.6), Math.fround(.7)], timeGap: 2, frameGap: 3, transparency: 'add' });
  assert.deepEqual(runtime.entities.explods('P1').map(value => [value.explodId, value.animationOwnerId, value.layer]), [[9, 'fight', 'above']]);
  assert.equal(runtime.entities.explods('P1')[0].superMoveTime, 2_147_483_647);
  const second = inputs.push([]); match.beginTick(second); runtime.step(match, second, inputs.history); match.endTick();
  assert.equal(match.fighter('P1').integerVariables[10], 1);
  assert.equal(match.fighter('P2').integerVariables[10], 0);
  assert.equal(match.fighter('P1').integerVariables[11], 3);
  assert.deepEqual(runtime.entities.helpers('P1').map(value => [value.helperId, value.parentId, value.rootId, value.stateNumber]), [[7, 'P1', 'P1', 1002], [17, 'helper:0000000001', 'P1', 1001]]);
  assert.deepEqual(runtime.entities.helpers('P1')[0].integerVariables.slice(1, 3), [1, 1]);
  assert.deepEqual(runtime.entities.helpers('P1')[0].integerVariables.slice(3, 6), [7, 9, 9]);
  const execution = runtime.executionSnapshot(); const restoredRuntime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]); restoredRuntime.restoreExecution(JSON.parse(JSON.stringify(execution))); assert.deepEqual(restoredRuntime.executionSnapshot(), execution);
  const third = inputs.push([]); match.beginTick(third); runtime.step(match, third, inputs.history); match.endTick();
  assert.deepEqual(runtime.entities.helpers('P1').map(value => value.helperId), [7]);
  assert.deepEqual(runtime.entities.helpers('P1')[0].position, [-15, -2]);
});

test('G08 Petra entity parameters drive postype, persistent scale, palette ownership, binding and get-hit removal', async () => {
  const commands = parseMugenCommandDocument(await textDocument('g08-entity-params.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await textDocument('g08-entity-params.cns', `[Size]
xscale=1
yscale=1
ground.front=12
height=60
head.pos=-5,-90
mid.pos=-5,-40
[Statedef 0]
type=S
movetype=I
physics=N
ctrl=1
[State 0, opponent helper]
type=Helper
trigger1=Time=0
id=70
stateno=1000
postype=p2
pos=5,-2
facing=-1
scale=.5,.75
sprpriority=7
ownpal=1
remappal=2,3
size.xscale=.625
size.ground.front=19
size.head.pos=-7,-81
[State 0, bound explod]
type=Explod
trigger1=Time=0
id=80
anim=0
postype=p1
pos=10,-5
random=1,1
facing=-1
vfacing=-1
bindtime=2
scale=2,.5
angle=30
ownpal=1
remappal=2,3
trans=addalpha
alpha=200,50
removeongethit=1
removetime=20
[State 0, screen explod]
type=Explod
trigger1=Time=0
id=81
anim=0
postype=right
pos=-8,12
removetime=20
[State 0, animation lifetime explod]
type=Explod
trigger1=Time=0
id=82
anim=0
postype=p1
[State 0, resize]
type=ModifyExplod
trigger1=Time=1
id=80
scale=.25,.75
[Statedef 1000]
type=S
movetype=I
physics=N
anim=0
[State 1000, overridden x scale]
type=VarSet
trigger1=Time=0
fv=0
value=Const(size.xscale)
[State 1000, overridden ground front]
type=VarSet
trigger1=Time=0
v=1
value=Const(size.ground.front)
[State 1000, overridden head x]
type=VarSet
trigger1=Time=0
v=2
value=Const(size.head.pos.x)
[State 1000, overridden head y]
type=VarSet
trigger1=Time=0
v=3
value=Const(size.head.pos.y)
[State 1000, inherited height]
type=VarSet
trigger1=Time=0
v=4
value=Const(size.height)
[State 1000, inherited mid y]
type=VarSet
trigger1=Time=0
v=5
value=Const(size.mid.pos.y)
`)]);
  const programs = [{ fighterId: 'P1', paletteNumber: 4, commands, states }, { fighterId: 'P2', paletteNumber: 5, commands, states }]; const runtime = new MugenScriptRuntime(programs); const inputs = inputBuilder(); const match = createMatch(); const context = { opponentByFighter: new Map([['P1', 'P2'], ['P2', 'P1']]), animationDurationByOwner: new Map([['P1', new Map([[0, 2]])], ['P2', new Map([[0, 2]])]]), screenBounds: [-100, 100] };
  let input = inputs.push([]); match.beginTick(input).startFight(); let trace = runtime.step(match, input, inputs.history, context); match.endTick();
  const helper = runtime.entities.helpers('P1', 70)[0]; assert.deepEqual([helper.position, helper.facing, helper.spritePriority], [[15, -2], 1, 7]);
  const explod = runtime.entities.explods('P1', 80)[0]; assert.deepEqual([explod.position, explod.facing, explod.verticalFacing, explod.bindTargetId, explod.bindTime, explod.removeOnGetHit], [[-10, -5], -1, -1, 'P1', 1, true]);
  const screen = runtime.entities.explods('P1', 81)[0]; assert.deepEqual([screen.coordinateSpace, screen.position], ['screen', [312, 12]]);
  assert.equal(runtime.entities.explods('P1', 82).length, 1);
  let helperOutput = trace.output.entities.find(value => value.entityId === helper.entityId); let explodOutput = trace.output.entities.find(value => value.entityId === explod.entityId);
  assert.deepEqual([helperOutput.paletteIsolated, helperOutput.paletteRemap.destination, helperOutput.baseDrawingTransform.scale], [true, [2, 3], [.5, .75]]);
  assert.deepEqual(helper.constantOverrides, { 'size.ground.front': 19, 'size.head.pos': -7, 'size.head.pos.x': -7, 'size.head.pos.y': -81, 'size.xscale': .625 });
  assert.deepEqual([explodOutput.paletteIsolated, explodOutput.paletteRemap.destination, explodOutput.baseDrawingTransform, explodOutput.baseTransparency], [true, [2, 3], { angle: 30, scale: [2, .5] }, { mode: 'addalpha', alpha: [200, 50] }]);
  input = inputs.push([]); match.beginTick(input); trace = runtime.step(match, input, inputs.history, context); match.endTick(); explodOutput = trace.output.entities.find(value => value.entityId === explod.entityId); assert.deepEqual(explodOutput.baseDrawingTransform, { angle: 30, scale: [.25, .75] }); assert.equal(runtime.entities.explods('P1', 82).length, 0);
  const updatedHelper = runtime.entities.helpers('P1', 70)[0]; assert.deepEqual(updatedHelper.floatVariables.slice(0, 1), [.625]); assert.deepEqual(updatedHelper.integerVariables.slice(1, 6), [19, -7, -81, 60, -40]);
  const execution = runtime.executionSnapshot(); const restored = new MugenScriptRuntime(programs); restored.restoreExecution(JSON.parse(JSON.stringify(execution))); assert.deepEqual(restored.entities.helpers('P1', 70)[0].constantOverrides, updatedHelper.constantOverrides); assert.deepEqual(restored.executionSnapshot(), execution);
  input = inputs.push([]); match.beginTick(input).setFighterStateMetadata('P1', { moveType: 'H' }); trace = runtime.step(match, input, inputs.history, context); match.endTick();
  assert.equal(runtime.entities.explods('P1', 80).length, 0); assert.equal(trace.output.entities.some(value => value.entityId === explod.entityId), false);
});

test('Helper PosFreeze suppresses velocity integration for one tick without stopping velocity or state time', async () => {
  const commands = parseMugenCommandDocument(await textDocument('helper-posfreeze.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await textDocument('helper-posfreeze.cns', `[Statedef 0]
type=S
movetype=I
physics=N
ctrl=1
[State 0, spawn]
type=Helper
trigger1=Time=0
persistent=0
id=5100
stateno=5100
[Statedef 5100]
type=A
movetype=H
physics=N
velset=3,-2
[State 5100, Petra common-state freeze]
type=PosFreeze
trigger1=Time=0
value=4
`)]);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]);
  const inputs = inputBuilder(); const match = createMatch();
  const step = () => { const input = inputs.push([]); match.beginTick(input); if (input.tick === 1) match.startFight(); const trace = runtime.step(match, input, inputs.history); match.endTick(); return trace; };

  step();
  assert.deepEqual(runtime.entities.helpers('P1', 5100)[0].position, [-20, 0]);
  const frozenTrace = step(); const frozen = runtime.entities.helpers('P1', 5100)[0];
  assert(frozenTrace.executedControllers.some(value => value.endsWith(':5100:0:pos-freeze')));
  assert.deepEqual([frozen.position, frozen.velocity, frozen.stateTime], [[-20, 0], [3, -2], 1]);

  step(); const moving = runtime.entities.helpers('P1', 5100)[0];
  assert.deepEqual([moving.position, moving.velocity, moving.stateTime], [[-17, -2], [3, -2], 2]);
});

test('G05 keyctrl Helpers consume their root player command stream while ordinary Helpers do not', async () => {
  const commands = parseMugenCommandDocument(await textDocument('g05-keyctrl.cmd', '[Command]\nname="x"\ncommand=x\n'));
  const states = parseMugenStateDocuments([await textDocument('g05-keyctrl.cns', `[Statedef -1]
[State -1, helper command]
type=ChangeState
triggerall=IsHelper
trigger1=command="x"
value=1100
[Statedef 0]
type=S
movetype=I
physics=N
ctrl=1
[State 0, controlled helper]
type=Helper
trigger1=Time=0
persistent=0
id=31
stateno=1000
keyctrl=1
[State 0, ordinary helper]
type=Helper
trigger1=Time=0
persistent=0
id=32
stateno=1000
keyctrl=0
[Statedef 1000]
type=S
movetype=I
physics=N
ctrl=1
[Statedef 1100]
type=S
movetype=A
physics=A
velset=2,-3
ctrl=0
[State 1100, vertical acceleration]
type=VelAdd
trigger1=1
y=.25
`)]);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states, gravity: .5 }, { fighterId: 'P2', commands, states, gravity: .5 }]);
  const inputs = inputBuilder(); const match = createMatch();
  let input = inputs.push([]); match.beginTick(input).startFight(); runtime.step(match, input, inputs.history); match.endTick();
  input = inputs.push(['x']); match.beginTick(input); runtime.step(match, input, inputs.history); match.endTick();
  assert.deepEqual(runtime.entities.helpers('P1').map(helper => [helper.helperId, helper.keyControl, helper.stateNumber]), [[31, true, 1100], [32, false, 1000]]);
  assert.deepEqual(runtime.entities.helpers('P2').map(helper => [helper.helperId, helper.keyControl, helper.stateNumber]), [[31, true, 1000], [32, false, 1000]]);
  assert.deepEqual(runtime.entities.helpers('P1')[0].velocity, [2, -2.25]);
  assert.deepEqual(runtime.entities.helpers('P1')[0].position, [-18, -2.25]);
});

test('G05 official KFM and KFM720 Explod inventories compile without parameter loss', async () => {
  for (const name of ['kfm', 'kfm720']) {
    const source = readFileSync(new URL(`../mugen/charactors/${name}/${name}.cns`, import.meta.url), 'utf8');
    const blocks = source.split(/(?=^\s*\[)/gmu).filter(block => /^\s*\[State\s/iu.test(block) && /^\s*type\s*=\s*Explod\b/imu.test(block)).map((block, index) => block.replace(/^\s*\[[^\]]+\]/u, `[State 0, official-explod-${index}]`));
    const states = parseMugenStateDocuments([await textDocument(`${name}-explod.cns`, `[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\n${blocks.join('\n')}`)]);
    const explods = states.states.find(value => value.number === 0).controllers.filter(value => value.type === 'explod');
    assert.equal(explods.length, 3);
    assert.equal(explods.every(value => value.parameters.anim !== undefined), true);
    assert.equal(explods.filter(value => value.parameters['velocity.0'] !== undefined).length, 2);
    assert.equal(explods[2].literalParameters['anim.owner'], 'fight');
  }
});

test('compiler and VM fail closed on unsupported syntax, references and missing states', async () => {
  assert.equal(isMugenWorkerRequest({ protocol: MUGEN_WORKER_PROTOCOL, version: MUGEN_WORKER_PROTOCOL_VERSION, requestId: 1, generation: 1, kind: 'start', files: [], options: { contentRole: 'local-content', scriptProfile: 'unknown' } }), false);
  await assert.rejects(async () => parseMugenCommandDocument(await textDocument('bad.cmd', '[Command]\nname=x\ncommand=^x\n')), error => error.diagnostics?.[0]?.code === 'E_MUGEN_CMD_SYNTAX');
  await assert.rejects(async () => parseMugenCommandDocument(await textDocument('bad.cmd', '[Remap]\nx=y\n[Command]\nname=x\ncommand=x\n')), error => error.diagnostics?.[0]?.code === 'E_MUGEN_UNSUPPORTED_FEATURE');
  await assert.rejects(async () => parseMugenStateDocuments([await textDocument('bad.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\n[State 0, bad]\ntype=DefinitelyUnsupported\ntrigger1=1\n')]), error => error.diagnostics?.[0]?.code === 'E_MUGEN_UNSUPPORTED_FEATURE');
  const specialStates = parseMugenStateDocuments([await textDocument('special.cns', '[Statedef -3]\n[Statedef -2]\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\n')]); assert.deepEqual(specialStates.states.map(state => state.number), [-3, -2, -1, 0]);
  await assert.rejects(async () => parseMugenStateDocuments([await textDocument('bad.cns', '[Statedef -4]\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\n')]), error => error.diagnostics?.[0]?.code === 'E_MUGEN_UNSUPPORTED_FEATURE');
  const hitPauseProgram = parseMugenStateDocuments([await textDocument('pause.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\n[State 0, allowed by G08-C]\ntype=Null\ntrigger1=1\nignorehitpause=1\n')]);
  assert.equal(hitPauseProgram.states.find(state => state.number === 0).controllers[0].ignoreHitPause, true);
  const staleLabelProgram = parseMugenStateDocuments([await textDocument('stale-label.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\n[State 20005, legacy stale label]\ntype=Null\ntrigger1=1\n')]);
  assert.deepEqual(staleLabelProgram.states.find(state => state.number === 0).controllers.map(controller => [controller.stateNumber, controller.name]), [[0, 'legacy stale label']]);
  await assert.rejects(async () => parseMugenStateDocuments([await textDocument('orphan.cns', '[State 0, orphan]\ntype=Null\ntrigger1=1\n[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\n')]), error => error.diagnostics?.[0]?.code === 'E_MUGEN_CNS_SYNTAX');
  const commands = parseMugenCommandDocument(await textDocument('ok.cmd', '[Command]\nname=x\ncommand=x\n'));
  const states = parseMugenStateDocuments([await textDocument('missing.cns', '[Statedef 0]\ntype=S\nmovetype=I\nphysics=S\n[State 0, missing]\ntype=ChangeState\ntrigger1=1\nvalue=99\n')]);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]);
  const inputs = inputBuilder(); const match = createMatch(); const input = inputs.push([]); match.beginTick(input).startFight();
  assert.throws(() => runtime.step(match, input, inputs.history), /target 99 does not exist/u);
  const compiled = compileMugenCharacterScripts(await scriptGraph()); const budgetRuntime = new MugenScriptRuntime([{ fighterId: 'P1', commands: compiled.commands, states: compiled.states }, { fighterId: 'P2', commands: compiled.commands, states: compiled.states }], 1);
  const budgetInputs = inputBuilder(); const budgetMatch = createMatch(); const budgetInput = budgetInputs.push([]); budgetMatch.beginTick(budgetInput).startFight();
  assert.throws(() => budgetRuntime.step(budgetMatch, budgetInput, budgetInputs.history), /evaluation budget/u);
});

test('official KFM without its declared common-state resource is not silently given synthetic fallback states', { skip: !process.env.MUGEN_KFM_DIR }, async () => {
  const root = process.env.MUGEN_KFM_DIR; const inputs = [];
  const visit = directory => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) visit(path); else if (entry.isFile()) inputs.push({ path: relative(root, path).replaceAll('\\', '/'), bytes: readFileSync(path) }); } };
  visit(root); const graph = await buildMugenImportGraph(await createMugenVfs(inputs), { entryDef: 'kfm.def', entryKind: 'character' });
  const compiled = compileMugenCharacterScripts(graph, 'm09-native-common'); assert.equal(compiled.states.states.some(state => state.number === 0), false);
});

async function runActionTrace() {
  const graph = await scriptGraph(); const compiled = compileMugenCharacterScripts(graph);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands: compiled.commands, states: compiled.states }, { fighterId: 'P2', commands: compiled.commands, states: compiled.states }]);
  const inputs = inputBuilder(); const match = createMatch(); const visited = []; const hashes = []; const executed = [];
  const tick = controls => { const input = inputs.push(controls); match.beginTick(input); if (input.tick === 1) match.startFight(); const trace = runtime.step(match, input, inputs.history); const result = match.endTick(); visited.push(result.state.fighters[0].stateNumber); hashes.push(`${trace.hash}:${result.traceHash}`); executed.push(...trace.executedControllers); return result; };
  tick([]); tick(['right']); tick(['right']); tick([]); tick(['down']); tick(['down']); tick([]); tick(['up']);
  for (let guard = 0; guard < 30 && match.fighter('P1').stateNumber !== 0; guard += 1) tick([]);
  tick(['x']); for (let guard = 0; guard < 10 && match.fighter('P1').stateNumber !== 0; guard += 1) tick([]);
  return Object.freeze({ visited: Object.freeze(visited), hashes: Object.freeze(hashes), executed: Object.freeze(executed), final: match.fighter('P1') });
}

function inputBuilder() {
  const history = new MugenInputHistory(180); let previous = new Set();
  return { history, push(controls) { const held = new Set(controls); const source = { tick: history.tick + 1, players: [sourcePlayer('P1', held, previous), sourcePlayer('P2', new Set(), new Set())] }; const input = history.push(source, { P1: 1, P2: -1 }); previous = held; return input; } };
}

function sourcePlayer(id, held, previous) { return { id, actions: CONTROLS.map(action => ({ action, value: held.has(action) ? 1 : 0, held: held.has(action), pressed: held.has(action) && !previous.has(action), released: !held.has(action) && previous.has(action) })) }; }
function createMatch() { return new MugenHeadlessMatch(matchConfig()); }
function matchConfig() { return { seed: 'g08b', roundsToWin: 1, roundTimeTicks: null, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: SHA, spawn: [-20, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [20, 0], facing: -1, initialControl: true }] }; }
async function scriptGraph(inputs = SCRIPT_INPUTS) { const vfs = await createMugenVfs(inputs); return buildMugenImportGraph(vfs, { entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' }); }
async function textDocument(path, source) { const vfs = await createMugenVfs([{ path, bytes: UTF8.encode(source) }]); return parseMugenTextFile(vfs.require(path), 'utf-8'); }

const CONTROLS = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);
const STATE_MINUS_ONE = `[Statedef -1]\n[State -1, utility]\ntype = ChangeState\ntriggerall = ctrl\ntrigger1 = command = "z"\nvalue = 300\n[State -1, attack]\ntype = ChangeState\ntriggerall = ctrl\ntrigger1 = command = "x"\nvalue = 200\n[State -1, jump]\ntype = ChangeState\ntriggerall = ctrl\ntrigger1 = command = "holdup"\nvalue = 40\n[State -1, crouch]\ntype = ChangeState\ntriggerall = ctrl\ntrigger1 = command = "holddown"\nvalue = 10\n[State -1, forward]\ntype = ChangeState\ntriggerall = ctrl\ntrigger1 = command = "holdfwd"\nvalue = 20\n[State -1, back]\ntype = ChangeState\ntriggerall = ctrl\ntrigger1 = command = "holdback"\nvalue = 21\n`;
const CMD = `[Defaults]\ncommand.time = 15\ncommand.buffer.time = 1\n[Command]\nname = "holdfwd"\ncommand = /$F\n[Command]\nname = "holdback"\ncommand = /$B\n[Command]\nname = "holddown"\ncommand = /$D\n[Command]\nname = "holdup"\ncommand = /$U\n[Command]\nname = "x"\ncommand = x\n[Command]\nname = "z"\ncommand = z\n${STATE_MINUS_ONE}`;
const CNS = `[Statedef 0]\ntype = S\nmovetype = I\nphysics = S\nanim = 0\nvelset = 0, 0\nctrl = 1\n[Statedef 10]\ntype = C\nmovetype = I\nphysics = C\nanim = 10\nvelset = 0, 0\nctrl = 1\n[State 10, stand]\ntype = ChangeState\ntrigger1 = command != "holddown"\nvalue = 0\n[Statedef 20]\ntype = S\nmovetype = I\nphysics = N\nanim = 20\nvelset = 2, 0\nctrl = 1\n[State 20, stand]\ntype = ChangeState\ntrigger1 = command != "holdfwd"\nvalue = 0\n[State 20, metadata]\ntype = StateTypeSet\ntrigger1 = time = 0\nstatetype = S\nmovetype = I\nphysics = N\n[Statedef 21]\ntype = S\nmovetype = I\nphysics = N\nanim = 21\nvelset = -1.5, 0\nctrl = 1\n[State 21, stand]\ntype = ChangeState\ntrigger1 = command != "holdback"\nvalue = 0\n[Statedef 40]\ntype = A\nmovetype = I\nphysics = A\nanim = 40\nvelset = 1, -4\nctrl = 0\n[State 40, land position]\ntype = PosSet\ntrigger1 = pos y >= 0 && time > 0\ny = 0\n[State 40, land]\ntype = ChangeState\ntrigger1 = pos y >= 0 && time > 0\nvalue = 0\n[Statedef 200]\ntype = S\nmovetype = A\nphysics = S\nanim = 200\nvelset = 0, 0\nctrl = 0\n[State 200, initialize]\ntype = VarSet\ntrigger1 = time = 0\npersistent = 0\nv = 0\nvalue = 1\n[State 200, count]\ntype = VarAdd\ntrigger1 = time >= 0\nv = 0\nvalue = 1\n[State 200, animation]\ntype = ChangeAnim\ntrigger1 = time = 1\nvalue = 201\n[State 200, done]\ntype = ChangeState\ntrigger1 = time >= 3\nvalue = 0\n[Statedef 300]\ntype = S\nmovetype = I\nphysics = N\nanim = 300\nvelset = 0, 0\nctrl = 0\n[State 300, velocity set]\ntype = VelSet\ntrigger1 = time = 0\nx = 2\ny = 1\n[State 300, velocity add]\ntype = VelAdd\ntrigger1 = time = 0\nx = 1\ny = 1\n[State 300, velocity multiply]\ntype = VelMul\ntrigger1 = time = 0\nx = 2\ny = 0.5\n[State 300, position add]\ntype = PosAdd\ntrigger1 = time = 0\nx = 3\ny = 4\n[State 300, gravity]\ntype = Gravity\ntrigger1 = time = 0\n[State 300, control]\ntype = CtrlSet\ntrigger1 = time = 0\nvalue = 1\n[State 300, done]\ntype = ChangeState\ntrigger1 = time >= 1\nvalue = 0\n`;
const SCRIPT_INPUTS = Object.freeze([{ path: 'hero.def', bytes: UTF8.encode('[Info]\nname=Fixture\n[Files]\ncmd=hero.cmd\ncns=hero.cns\nst=hero.cns\n') }, { path: 'hero.cmd', bytes: UTF8.encode(CMD) }, { path: 'hero.cns', bytes: UTF8.encode(CNS) }]);
