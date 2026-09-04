import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { buildMugenImportGraph }, { scanMugenViewerAudioCues }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/text/DependencyGraph.ts'),
  import('../mugen/import/audio/MugenViewerAudioCueScanner.ts'),
]);

const UTF8 = new TextEncoder();

test('viewer audio scan survives unsupported battle controllers and preserves static PlaySnd timing', async () => {
  const graph = await buildMugenImportGraph(await createMugenVfs([
    input('hero.def', '[Info]\nname=Audio Scan\n[Files]\ncns=hero.cns\n'),
    input('hero.cns', [
      '[Statedef 200]', 'type=S', 'movetype=A', 'physics=N', 'anim=200',
      '[State 200, unsupported battle behavior]', 'type=NotYetImplementedController', 'trigger1=1', 'value=999',
      '[State 200, voice]', 'type=PlaySnd', 'trigger1=Time = 3', 'value=S10,2', 'channel=4', 'volume=128', 'pan=-64', 'freqmul=1.5',
      '[State 200, hit]', 'type=PlaySnd', 'trigger1=AnimElem = 2', 'value=11,0',
      '[State 200, character hit sound]', 'type=HitDef', 'trigger1=AnimElem = 4', 'hitsound=S5, ifelse(Random < 333, 0, ifelse(Random < 666, 1, 2))',
      '[State 200, shared hit sound]', 'type=HitDef', 'trigger1=AnimElem = 5', 'hitsound=5,2',
      '[State 200, shared fight sound]', 'type=PlaySnd', 'trigger1=Time = 1', 'value=F0,1',
      '[Statedef 210]', 'type=S', 'movetype=A', 'physics=N',
      '[State 800, initial animation]', 'type=ChangeAnim', 'trigger1=Time = 0', 'value=211',
      '[State -2, mislabeled voice]', 'type=PlaySnd', 'trigger1=AnimElem = 3', 'value=S12,4',
    ].join('\n')),
  ]), { entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });

  assert.deepEqual(scanMugenViewerAudioCues(graph), [
    { actionNumber: 200, group: 10, item: 2, timing: { kind: 'tick', value: 3 }, channel: 4, volume: 128 / 255, pan: -64 / 127, frequency: 1.5, loop: false, sourcePath: 'hero.cns', sourceLine: 10 },
    { actionNumber: 200, group: 11, item: 0, timing: { kind: 'element', value: 2 }, channel: -1, volume: 1, pan: 0, frequency: 1, loop: false, sourcePath: 'hero.cns', sourceLine: 18 },
    { actionNumber: 200, group: 5, item: 0, timing: { kind: 'element', value: 4 }, channel: -1, volume: 1, pan: 0, frequency: 1, loop: false, sourcePath: 'hero.cns', sourceLine: 22 },
    { actionNumber: 211, group: 12, item: 4, timing: { kind: 'element', value: 3 }, channel: -1, volume: 1, pan: 0, frequency: 1, loop: false, sourcePath: 'hero.cns', sourceLine: 42 },
  ]);
});

test('viewer audio scan associates global hurt voices with every explicitly selected animation', async () => {
  const graph = await buildMugenImportGraph(await createMugenVfs([
    input('hero.def', '[Info]\nname=Global Hurt Audio\n[Files]\ncns=hero.cns\n'),
    input('hero.cns', [
      '[Statedef -2]', 'type=S',
      '[State -2, light hurt voice]', 'type=PlaySnd',
      'triggerall=Time = 1 && Alive && Random < 333',
      'triggerall=StateNo = 5000 || StateNo = 5010',
      'trigger1=Anim = 5000 || Anim = 5010 || Anim = 5020',
      'value=S5000, IfElse(Random < 500, 0, IfElse(Random < 750, 10, 20))',
      '[State -2, attack voice]', 'type=PlaySnd', 'trigger1=StateNo = 200 || StateNo = 205', 'value=S200,0',
    ].join('\n')),
  ]), { entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });

  assert.deepEqual(scanMugenViewerAudioCues(graph).map(cue => ({ action: cue.actionNumber, group: cue.group, item: cue.item, timing: cue.timing })), [
    { action: 200, group: 200, item: 0, timing: { kind: 'tick', value: 0 } },
    { action: 205, group: 200, item: 0, timing: { kind: 'tick', value: 0 } },
    { action: 5000, group: 5000, item: 0, timing: { kind: 'tick', value: 1 } },
    { action: 5010, group: 5000, item: 0, timing: { kind: 'tick', value: 1 } },
    { action: 5020, group: 5000, item: 0, timing: { kind: 'tick', value: 1 } },
  ]);
});

test('viewer audio scan expands standard get-hit states across available AIR variants without stacking exclusive voices', async () => {
  const actions = [5000, 5001, 5002, 5005, 5007, 5030, 5040, 5051, 5070, 5080, 5090, 5100, 5101, 5160, 5172, 5200];
  const graph = await buildMugenImportGraph(await createMugenVfs([
    input('hero.def', '[Info]\nname=GetHit Families\n[Files]\ncns=hero.cns\nanim=hero.air\n'),
    input('hero.air', actions.map(action => `[Begin Action ${action}]\n0,0,0,0,1`).join('\n')),
    input('hero.cns', [
      '[Statedef -3]', 'type=S',
      '[State -3]', 'type=PlaySnd', 'triggerall=Time=1', 'triggerall=GetHitVar(animtype)=0', 'trigger1=StateNo=5000', 'trigger2=StateNo=5010', 'trigger3=StateNo=5020', 'value=S10,0', 'channel=0',
      '[State -3]', 'type=PlaySnd', 'triggerall=Time=1', 'triggerall=GetHitVar(animtype)=1', 'trigger1=StateNo=5000', 'trigger2=StateNo=5010', 'trigger3=StateNo=5020', 'value=S10,0', 'channel=0',
      '[State -3]', 'type=PlaySnd', 'triggerall=Time=1', 'triggerall=GetHitVar(animtype)!=[0,1]', 'trigger1=StateNo=5000', 'trigger2=StateNo=5010', 'trigger3=StateNo=5020', 'value=S10,1', 'channel=0',
      '[State -3]', 'type=PlaySnd', 'triggerall=Time=1', 'trigger1=StateNo=5070', 'value=S10,1', 'channel=0',
      '[State -3]', 'type=PlaySnd', 'triggerall=Time=1', 'trigger1=StateNo=5100', 'value=S10,2', 'channel=0',
      '[State -3]', 'type=PlaySnd', 'triggerall=Time=1', 'trigger1=StateNo=5000', 'trigger2=StateNo=5010', 'trigger3=StateNo=5020', 'trigger4=StateNo=5070', 'value=S10,3', 'channel=0',
    ].join('\n')),
  ]), { entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });

  assert.deepEqual(scanMugenViewerAudioCues(graph).map(cue => [cue.actionNumber, cue.item]), [
    [5000, 0], [5001, 0], [5002, 1], [5005, 0], [5007, 1], [5030, 1], [5040, 1], [5051, 1],
    [5070, 1], [5080, 1], [5090, 1], [5100, 2], [5101, 2], [5160, 2], [5172, 2],
  ]);
});

test('viewer audio scan follows DEF state-script roles when legacy scripts use custom extensions', async () => {
  const graph = await buildMugenImportGraph(await createMugenVfs([
    input('hero.def', '[Info]\nname=Custom Script Extensions\n[Files]\ncmd=hero.mai\ncns=hero.teo\nst1=attacks.ini\n'),
    input('hero.mai', '[Statedef -1]\ntype=S\n[State -1, command voice]\ntype=PlaySnd\ntrigger1=Anim = 100\nvalue=S10,0\n'),
    input('hero.teo', '[Statedef 200]\ntype=S\nanim=200\n[State 200, voice]\ntype=PlaySnd\ntrigger1=Time = 2\nvalue=S20,0\n'),
    input('attacks.ini', '[Statedef 300]\ntype=S\nanim=300\n[State 300, voice]\ntype=PlaySnd\ntrigger1=AnimElem = 3\nvalue=S30,0\n'),
  ]), { entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });

  assert.deepEqual(scanMugenViewerAudioCues(graph).map(cue => ({ action: cue.actionNumber, group: cue.group, timing: cue.timing })), [
    { action: 100, group: 10, timing: { kind: 'tick', value: 0 } },
    { action: 200, group: 20, timing: { kind: 'tick', value: 2 } },
    { action: 300, group: 30, timing: { kind: 'element', value: 3 } },
  ]);
});

test('viewer audio scan associates PlaySnd with every static IfElse animation branch', async () => {
  const graph = await buildMugenImportGraph(await createMugenVfs([
    input('hero.def', '[Info]\nname=Branched Anim Audio\n[Files]\ncns=hero.cns\n'),
    input('hero.cns', [
      '[Statedef 400]', 'type=S',
      '[State 400, mode animation]', 'type=ChangeAnim', 'trigger1=Time=0', 'value=IfElse((var(59)=2||var(59)=5),400,401)',
      '[State 400, voice]', 'type=PlaySnd', 'trigger1=AnimElem=3', 'value=S103,0',
      '[Statedef 410]', 'type=A',
      '[State 410, nested mode animation]', 'type=ChangeAnim', 'trigger1=Time=0', 'value=IfElse(var(59)=2,410,IfElse(var(59)=5,415,418))',
      '[State 410, voice]', 'type=PlaySnd', 'trigger1=AnimElem=7', 'value=S103,1',
    ].join('\n')),
  ]), { entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });

  assert.deepEqual(scanMugenViewerAudioCues(graph).map(cue => [cue.actionNumber, cue.group, cue.item, cue.timing]), [
    [400, 103, 0, { kind: 'element', value: 3 }],
    [401, 103, 0, { kind: 'element', value: 3 }],
    [410, 103, 1, { kind: 'element', value: 7 }],
    [415, 103, 1, { kind: 'element', value: 7 }],
    [418, 103, 1, { kind: 'element', value: 7 }],
  ]);
});

test('viewer audio scan carries an entry sound through an immediate ChangeState dispatcher', async () => {
  const graph = await buildMugenImportGraph(await createMugenVfs([
    input('hero.def', '[Info]\nname=State Dispatcher Audio\n[Files]\ncns=hero.cns\n'),
    input('hero.cns', [
      '[Statedef 370]', 'type=A',
      '[State 370, entry sound]', 'type=PlaySnd', 'trigger1=Time=0', 'value=S2,0',
      '[State 370, down branch]', 'type=ChangeState', 'trigger1=command="down"', 'value=374',
      '[State 370, back branch]', 'type=ChangeState', 'trigger1=command="back"', 'value=375',
      '[State 370, delayed exit]', 'type=ChangeState', 'trigger1=AnimTime=0', 'value=999',
      '[Statedef 374]', 'type=A',
      '[State 374, animation]', 'type=ChangeAnim', 'trigger1=Time=0', 'value=373',
      '[Statedef 375]', 'type=A',
      '[State 375, animation]', 'type=ChangeAnim', 'trigger1=Time=0', 'value=374',
      '[Statedef 999]', 'type=S', 'anim=999',
    ].join('\n')),
  ]), { entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });

  assert.deepEqual(scanMugenViewerAudioCues(graph).map(cue => [cue.actionNumber, cue.group, cue.item, cue.timing]), [
    [373, 2, 0, { kind: 'tick', value: 0 }],
    [374, 2, 0, { kind: 'tick', value: 0 }],
  ]);
});

function input(path, source) { return { path, bytes: UTF8.encode(source) }; }
