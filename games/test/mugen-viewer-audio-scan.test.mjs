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

function input(path, source) { return { path, bytes: UTF8.encode(source) }; }
