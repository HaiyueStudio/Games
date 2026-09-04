import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { resolveMugenDrawScale, mugenCharacterToStageScale, mugenStageViewportTransform } = await import('../mugen/game/MugenCharacterScale.ts');
const { moveMugenCharacterSelection, mugenCharacterGridColumns, mugenCharacterPreviewScale } = await import('../mugen/game/MugenCharacterSelection.ts');
const { initialMugenRoundAudioCues, planMugenRoundAudioCues } = await import('../mugen/game/MugenRoundAudio.ts');

test('M11 character scale follows MUGEN localcoord and CNS [Size]', () => {
  assert.deepEqual(resolveMugenDrawScale({}), [1, 1]);
  assert.deepEqual(resolveMugenDrawScale({ 'size.xscale': .5, 'size.yscale': .5 }), [.5, .5]);
  assert.deepEqual(mugenCharacterToStageScale([320, 240], [320, 240], [.5, .5]), [.5, .5]);
  assert.deepEqual(mugenCharacterToStageScale([320, 240], [1280, 720], [1, 1]), [.25, 1 / 3]);
  assert.throws(() => resolveMugenDrawScale({ 'size.xscale': 0 }), /positive/u);
});

test('M11 viewport keeps stage aspect ratio and centers its render area', () => {
  assert.deepEqual(mugenStageViewportTransform({ width: 1920, height: 1080 }, [320, 240]), { scale: 4.5, offsetX: 240, offsetY: 0 });
  assert.deepEqual(mugenStageViewportTransform({ width: 1280, height: 720 }, [1280, 720]), { scale: 1, offsetX: 0, offsetY: 0 });
});

test('M11 game flow is rendered through Haiyue GUI from title to fight', () => {
  const html = read('../mugen/index.html'); const flow = read('../mugen/game/MugenFlowUi.ts'); const main = read('../mugen/main.ts');
  assert.match(html, /id="flow-canvas"/u);
  for (const text of ['单人模式', '双人模式', 'AI 对战', '设置', '选择角色', '选择舞台', '进入战斗']) assert.match(flow, new RegExp(text, 'u'));
  for (const field of ['p1Life', 'p2Life', 'p1Power', 'p2Power', 'p1Wins', 'p2Wins']) assert.match(flow, new RegExp(`readonly ${field}: number`, 'u'));
  for (const field of ['phase', 'phaseTime', 'roundWinnerId']) assert.match(flow, new RegExp(`readonly ${field}:`, 'u'));
  assert.match(flow, /hudGauge\(root, model\.p1Life, 'left'/u);
  assert.match(flow, /hudGauge\(root, model\.p2Power, 'right'/u);
  for (const text of ['GET READY', 'READY', 'FIGHT!', 'K.O.']) assert.match(flow, new RegExp(text.replace('.', '\\.'), 'u'));
  assert.doesNotMatch(flow, /function gauge\(|█.*░/u);
  assert.match(main, /p1Power: p1 === undefined \? 0 : p1\.power \/ p1\.maxPower/u);
  assert.match(main, /before\.phaseTime >= 120/u);
  assert.match(flow, /HaiyueEngine/u); assert.match(flow, /GuiSystem/u); assert.match(main, /#flowScreen/u); assert.match(main, /mugenCharacterToStageScale/u); assert.match(main, /preview\.action/u);
});

test('M11 character select exposes portraits, two keyboard schemes, and wrapped grid navigation', () => {
  const flow = read('../mugen/game/MugenFlowUi.ts'); const fixture = read('../mugen/game/MugenGameFixture.ts'); const importer = read('../mugen/import/worker/MugenCharacterImport.ts');
  assert.match(flow, /new GuiImage/u); assert.match(flow, /new KeyboardComponent/u);
  assert.match(flow, /onClick: \(\) => queueMicrotask\(\(\) => this\.#callbacks\.selectCharacter/u);
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) assert.match(flow, new RegExp(key, 'u'));
  assert.match(fixture, /loadPreview\(/u); assert.match(fixture, /assetProfile: 'selection-preview'/u); assert.match(importer, /selectionPreviewContributions/u);
  assert.equal(mugenCharacterGridColumns(12), 5);
  assert.equal(moveMugenCharacterSelection(0, 12, 1, 0), 1);
  assert.equal(moveMugenCharacterSelection(0, 12, -1, 0), 4);
  assert.equal(moveMugenCharacterSelection(1, 12, 0, 1), 6);
  assert.equal(moveMugenCharacterSelection(11, 12, 0, 1), 1);
  assert.equal(mugenCharacterPreviewScale(3, [100, 100], { width: 1280, height: 720 }), 3);
  assert.equal(mugenCharacterPreviewScale(1.5, [400, 400], { width: 1280, height: 720 }), .81);
});

test('M11 round audio maps motif announcements and character-specific KO voices', () => {
  assert.deepEqual(initialMugenRoundAudioCues(1).map(cue => [cue.owner, cue.group, cue.item]), [['system', 0, 1]]);
  const fight = planMugenRoundAudioCues(roundAudioState('P1', false, false), [phaseEvent('ready', 'fight')]);
  assert.deepEqual(fight.map(cue => [cue.kind, cue.owner, cue.group, cue.item]), [['fight', 'system', 1, 0]]);

  const ko = planMugenRoundAudioCues(roundAudioState('P1', false, true), [phaseEvent('fight', 'ko')]);
  assert.deepEqual(ko.map(cue => [cue.kind, cue.owner, cue.group, cue.item]), [['ko', 'system', 2, 0], ['character-ko', 'P2', 11, 0]]);

  const doubleKo = planMugenRoundAudioCues(roundAudioState(null, true, true), [phaseEvent('fight', 'ko')]);
  assert.deepEqual(doubleKo.map(cue => [cue.kind, cue.owner]), [['double-ko', 'system'], ['character-ko', 'P1'], ['character-ko', 'P2']]);
});

test('M11 automatic KO voice respects nokosnd and avoids a duplicate scripted 11,0 sound', () => {
  const state = roundAudioState('P1', false, true);
  assert.deepEqual(planMugenRoundAudioCues(state, [phaseEvent('fight', 'ko')], new Set(['P2'])).map(cue => cue.kind), ['ko']);
  assert.deepEqual(planMugenRoundAudioCues(state, [phaseEvent('fight', 'ko'), koSoundEvent('P2')]).map(cue => cue.kind), ['ko']);
});

function roundAudioState(roundWinnerId, p1Ko, p2Ko) { return { roundNumber: 1, roundWinnerId, fighters: [{ id: 'P1', ko: p1Ko }, { id: 'P2', ko: p2Ko }] }; }
function phaseEvent(from, to) { return { id: `phase-${from}-${to}`, tick: 1, sequence: 1, kind: 'round-phase', from, to, roundNumber: 1 }; }
function koSoundEvent(fighterId) { return { id: `ko-${fighterId}`, tick: 1, sequence: 2, kind: 'audio', fighterId, resourceOwner: 'self', operation: 'play', group: 11, item: 0, channel: -1, volume: 255, pan: 0, frequency: 1, loop: false, lowPriority: false }; }

function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
