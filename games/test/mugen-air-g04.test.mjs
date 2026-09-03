import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [
  { MugenImportFailure },
  { parseMugenTextFile },
  { buildMugenImportGraph },
  { createMugenVfs },
  { parseMugenAir },
  { importMugenActionContributions },
  { MugenAirActionPlayer, createMugenAirDebugOverlay, evaluateMugenAirAction },
  { importMugenPackage },
] = await Promise.all([
  import('../mugen/import/diagnostics.ts'),
  import('../mugen/import/text/MugenTextParser.ts'),
  import('../mugen/import/text/DependencyGraph.ts'),
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/air/AirParser.ts'),
  import('../mugen/import/air/MugenActionPackage.ts'),
  import('../mugen/import/air/MugenAirRuntime.ts'),
  import('../mugen/package/importer.ts'),
]);

const UTF8 = new TextEncoder();
const FIXTURE_MANIFEST = JSON.parse(readFileSync(new URL('../mugen/fixtures/g04-generated-air-v1.fixture.json', import.meta.url), 'utf8'));
const GOLDEN_AIR = `[Begin Action 0]
Clsn2Default: 2
Clsn2[0] = 10, 0, -10, -20
Clsn2[1] = -4, -30, 4, -20
0, 0, 0, 0, 4, , AS256D0, 1, 1, 0
Clsn1: 1
Clsn1[0] = -2, -12, 8, -4
Interpolate Offset
Interpolate Scale
Interpolate Angle
Interpolate Blend
0, 1, 8, -4, 2, H, AS128D128, 2, 0.5, 90
LoopStart
0, 2, 0, 0, 3, V, S, 1, 1, 0

[Begin Action 10]
0, 0, 0, 0, 0
-1, -1, 0, 0, -1
`;

const SPRITES = new Map([
  ['0,0', Object.freeze({ id: 'hero.sff#sprite:0', axisX: 11, axisY: 22 })],
  ['0,1', Object.freeze({ id: 'hero.sff#sprite:1', axisX: 12, axisY: 23 })],
  ['0,2', Object.freeze({ id: 'hero.sff#sprite:2', axisX: 13, axisY: 24 })],
]);

test('AIR parser preserves action timing, LoopStart, transforms, blend and collision inheritance', async () => {
  const bank = await parseAir(GOLDEN_AIR, (group, item) => SPRITES.get(`${group},${item}`) ?? null);
  assert.deepEqual(bank.actions.map(action => action.number), [0, 10]);
  assert.deepEqual({ elements: bank.elementCount, boxes: bank.collisionBoxCount }, { elements: 5, boxes: 7 });

  const action = bank.actions[0];
  assert.deepEqual(
    { loopStart: action.loopStart, totalTicks: action.totalTicks, preLoopTicks: action.preLoopTicks, loopTicks: action.loopTicks },
    { loopStart: 2, totalTicks: 9, preLoopTicks: 6, loopTicks: 3 },
  );
  assert.deepEqual(action.elements.map(element => element.spriteId), [...SPRITES.values()].map(sprite => sprite.id));
  assert.deepEqual(action.elements[0].clsn2.map(box => [box.left, box.top, box.right, box.bottom]), [[-10, -20, 10, 0], [-4, -30, 4, -20]]);
  assert.equal(action.elements[0].clsn1.length, 0);
  assert.deepEqual(action.elements[1].clsn1.map(box => [box.left, box.top, box.right, box.bottom]), [[-2, -12, 8, -4]]);
  assert.equal(action.elements[2].clsn1.length, 0, 'one-shot Clsn1 must not leak into the next element');
  assert.equal(action.elements.every(element => element.clsn2.length === 2), true, 'Clsn2Default must be inherited');
  assert.deepEqual(action.elements[1].interpolateToThis, ['offset', 'scale', 'angle', 'blend']);
  assert.deepEqual(
    { flipX: action.elements[1].flipX, flipY: action.elements[1].flipY, blend: action.elements[1].blend, scaleX: action.elements[1].scaleX, scaleY: action.elements[1].scaleY, angle: action.elements[1].angleDegrees },
    { flipX: true, flipY: false, blend: { mode: 'add', sourceAlpha: 128, destinationAlpha: 128 }, scaleX: 2, scaleY: 0.5, angle: 90 },
  );

  const infinite = bank.actions[1];
  assert.deepEqual({ totalTicks: infinite.totalTicks, loopTicks: infinite.loopTicks }, { totalTicks: null, loopTicks: null });
  assert.equal(evaluateMugenAirAction(infinite, 1_000_000, { x: 0, y: 0 }).frameIndex, 1, 'zero-duration element is skipped and final -1 holds forever');
});

test('AIR runtime keeps collision state tick-bound while rendering interpolates independently', async () => {
  const bank = await parseAir(GOLDEN_AIR, (group, item) => SPRITES.get(`${group},${item}`) ?? null);
  const action = bank.actions[0];
  const spriteById = id => [...SPRITES.values()].find(sprite => sprite.id === id) ?? null;
  const base = { x: 100, y: 200, facing: 1, coordinateScale: 2, spriteById };
  const at30Hz = evaluateMugenAirAction(action, 2, { ...base, renderFraction: 0 });
  const at120Hz = evaluateMugenAirAction(action, 2, { ...base, renderFraction: 0.75 });

  assert.equal(at30Hz.frameIndex, 0);
  assert.deepEqual(at30Hz.clsn1, at120Hz.clsn1);
  assert.deepEqual(at30Hz.clsn2, at120Hz.clsn2, 'render sampling must not mutate hit state');
  assert.notDeepEqual(at30Hz.render, at120Hz.render);
  assert.deepEqual(
    pick(at30Hz.render, ['positionX', 'positionY', 'scaleX', 'scaleY', 'interpolationProgress', 'blend']),
    { positionX: 108, positionY: 196, scaleX: 3, scaleY: 1.5, interpolationProgress: 0.5, blend: { mode: 'add', sourceAlpha: 192, destinationAlpha: 64 } },
  );
  assert.ok(Math.abs(at30Hz.render.rotationRadians - Math.PI / 4) < 1e-6);
  assert.deepEqual(at30Hz.clsn2[0], { kind: 'clsn2', sourceIndex: 0, left: 80, top: 160, right: 120, bottom: 200 });
  assert.deepEqual([at30Hz.render.axisX, at30Hz.render.axisY], [11, 22]);

  const override = evaluateMugenAirAction(action, 4, base);
  assert.equal(override.frameIndex, 1);
  assert.deepEqual(override.clsn1[0], { kind: 'clsn1', sourceIndex: 0, left: 96, top: 176, right: 116, bottom: 192 });
  assert.equal(evaluateMugenAirAction(action, 6, base).frameIndex, 2);
  const looped = evaluateMugenAirAction(action, 9, base);
  assert.deepEqual({ frame: looped.frameIndex, frameTick: looped.frameTick, loops: looped.completedLoops }, { frame: 2, frameTick: 0, loops: 1 });

  const mirrored = evaluateMugenAirAction(action, 4, { ...base, facing: -1 });
  assert.deepEqual(mirrored.clsn1[0], { kind: 'clsn1', sourceIndex: 0, left: 84, top: 176, right: 104, bottom: 192 });
  assert.equal(mirrored.render.flipX, false, 'element H flip XOR facing mirror');
  assert.ok(Math.abs(mirrored.render.rotationRadians + Math.PI / 2) < 1e-6);
});

test('AIR player defines seek, restart and action-change semantics; debug data is hash-excluded', async () => {
  const bank = await parseAir(GOLDEN_AIR, (group, item) => SPRITES.get(`${group},${item}`) ?? null);
  const player = new MugenAirActionPlayer(bank, 0);
  player.advance(5);
  assert.deepEqual([player.actionTick, player.snapshot({ x: 0, y: 0 }).frameIndex], [5, 1]);
  player.seek(9);
  assert.equal(player.snapshot({ x: 0, y: 0 }).completedLoops, 1);
  player.restart();
  assert.deepEqual([player.actionTick, player.generation], [0, 1]);
  player.changeAction(10);
  assert.deepEqual([player.actionNumber, player.actionTick, player.generation], [10, 0, 2]);
  player.changeAction(10, { restartIfSame: false });
  assert.equal(player.generation, 2);

  player.changeAction(0);
  const snapshot = player.snapshot({ x: 10, y: 20 });
  const overlay = createMugenAirDebugOverlay(snapshot);
  assert.equal(overlay.hashExcluded, true);
  assert.match(overlay.label, /^action=0 frame=0 frameTick=0 tick=0$/);
  assert.equal(overlay.lines.filter(line => line.kind === 'clsn2').length, 8);
  assert.equal(overlay.lines.filter(line => line.kind === 'axis').length, 2);
  assert.throws(() => player.seek(-1), RangeError);
  assert.throws(() => player.changeAction(999), RangeError);
});

test('AIR parser emits missing-sprite warnings but treats blank elements as deliberate', async () => {
  const bank = await parseAir('[Begin Action 0]\n5, 9, 0, 0, 1\n-1, -1, 0, 0, 1\n', () => null);
  assert.equal(bank.diagnostics.length, 1);
  assert.equal(bank.diagnostics[0].code, 'E_MUGEN_AIR_SPRITE_MISSING');
  assert.deepEqual(bank.actions[0].elements.map(element => element.spriteId), [null, null]);
  assert.equal(evaluateMugenAirAction(bank.actions[0], 0, { x: 0, y: 0 }).render.missingSprite, true);
  assert.equal(evaluateMugenAirAction(bank.actions[0], 1, { x: 0, y: 0 }).render.missingSprite, false);
});

test('AIR normalizes legacy A2 through A9 transparency spellings to additive blending', async () => {
  const bank = await parseAir('[Begin Action 0]\n0,0,0,0,1,,A2\u00ff\n0,0,0,0,1,,A3\n0,0,0,0,1,,A7\n');
  assert.deepEqual(bank.actions[0].elements.map(element => element.blend), [
    { mode: 'add', sourceAlpha: 256, destinationAlpha: 256 },
    { mode: 'add', sourceAlpha: 256, destinationAlpha: 256 },
    { mode: 'add', sourceAlpha: 256, destinationAlpha: 256 },
  ]);
});

test('AIR ignores an uncommented non-ASCII legacy annotation with a warning', async () => {
  const bank = await parseAir('[Begin Action 15600]\n15600,0,0,0,1\n○三角木馬\n[Begin Action 15920]\n15920,0,0,0,1\n');
  assert.deepEqual(bank.actions.map(action => action.number), [15600, 15920]);
  assert.deepEqual(bank.diagnostics.map(item => ({ code: item.code, severity: item.severity, recovery: item.recovery, group: item.group })), [{
    code: 'E_MUGEN_AIR_ANNOTATION_IGNORED',
    severity: 'warning',
    recovery: 'ignore',
    group: 15600,
  }]);
  await assertDiagnostic(
    () => parseAir('[Begin Action 0]\n0,0,0,0,1\nunknown directive\n'),
    'E_MUGEN_AIR_ELEMENT_INVALID',
  );
});

test('AIR canonicalizes legacy negative sprite identifiers to a blank element', async () => {
  const bank = await parseAir('[Begin Action 0]\n-10,5,0,0,8\n');
  assert.deepEqual(
    { group: bank.actions[0].elements[0].spriteGroup, item: bank.actions[0].elements[0].spriteItem, spriteId: bank.actions[0].elements[0].spriteId },
    { group: -1, item: 5, spriteId: null },
  );
});

test('AIR normalizes legacy zero-duration elements with a displaced flip field', async () => {
  const bank = await parseAir('[Begin Action 0]\n0,0,0,0,0,0,,\n0,1,0,0,0,0,,H\n0,2,0,0,1\n');
  assert.deepEqual(bank.actions[0].elements.map(element => ({ duration: element.durationTicks, flipX: element.flipX, flipY: element.flipY })), [
    { duration: 0, flipX: false, flipY: false },
    { duration: 0, flipX: true, flipY: false },
    { duration: 1, flipX: false, flipY: false },
  ]);
});

test('AIR evaluates legacy literal arithmetic in sprite identifiers and offsets without relaxing other fields', async () => {
  const bank = await parseAir('[Begin Action 168120]\n504-5,15,-1-1,2+3,10\n');
  assert.deepEqual(
    { group: bank.actions[0].elements[0].spriteGroup, item: bank.actions[0].elements[0].spriteItem, x: bank.actions[0].elements[0].offsetX, y: bank.actions[0].elements[0].offsetY, duration: bank.actions[0].elements[0].durationTicks },
    { group: 499, item: 15, x: -2, y: 5, duration: 10 },
  );
  await assertDiagnostic(
    () => parseAir('[Begin Action 0]\n1*2,0,0,0,1\n'),
    'E_MUGEN_AIR_ELEMENT_INVALID',
  );
  await assertDiagnostic(
    () => parseAir('[Begin Action 0]\n0,0,0,0,1+1\n'),
    'E_MUGEN_AIR_ELEMENT_INVALID',
  );
});

test('AIR sprite resolution selects the last SFF source record for a duplicate key', async () => {
  const base = fakeSpriteBank();
  const duplicateBank = Object.freeze({
    ...base,
    sprites: Object.freeze([
      Object.freeze({ ...base.sprites[0], sourceIndex: 0, group: 7, item: 9 }),
      Object.freeze({ ...base.sprites[1], sourceIndex: 1, group: 7, item: 9 }),
    ]),
  });
  const vfs = await createMugenVfs(characterInputs('[Begin Action 0]\n7,9,0,0,1\n'));
  const graph = await buildMugenImportGraph(vfs, { encoding: 'utf-8' });
  const result = importMugenActionContributions(graph, { spriteBanks: [duplicateBank] });
  assert.equal(result.banks[0].actions[0].elements[0].spriteId, 'hero.sff#sprite:1');
  assert.equal(result.banks[0].diagnostics.length, 0);
});

test('AIR duplicate actions keep the first definition with an official-compatibility warning', async () => {
  const bank = await parseAir('[Begin Action 50]\n0,1,0,0,1\n[Begin Action 50]\n0,2,0,0,1\n');
  assert.equal(bank.actions.length, 1);
  assert.equal(bank.actions[0].elements[0].spriteItem, 1);
  assert.deepEqual(bank.diagnostics.map(item => ({ code: item.code, severity: item.severity, recovery: item.recovery, details: item.details })), [{
    code: 'E_MUGEN_AIR_ACTION_DUPLICATE',
    severity: 'warning',
    recovery: 'ignore',
    details: { firstLine: 1, duplicateLine: 3 },
  }]);
});

test('AIR accepts legacy blank placeholders and discards frames after the first infinite hold', async () => {
  const bank = await parseAir([
    '[Begin Action 20070]',
    '-1,-1,0,0,0',
    '[Begin Action 7290]',
    '9000,2,0,0,1',
    '9000,2,0,0,-1',
    '9000,2,0,0,-1',
    '[Begin Action 7291]',
    '9000,2,0,0,1',
    '9000,2,0,0,-1',
    '9000,3,0,0,5',
    '',
  ].join('\n'));

  const placeholder = bank.actions.find(action => action.number === 20070);
  assert.equal(placeholder.totalTicks, 1);
  assert.equal(placeholder.loopTicks, 1);
  assert.equal(placeholder.elements[0].durationTicks, 1);

  const repeatedInfinite = bank.actions.find(action => action.number === 7290);
  assert.equal(repeatedInfinite.elements.length, 2);
  assert.deepEqual(repeatedInfinite.elements.map(element => element.durationTicks), [1, -1]);
  assert.equal(evaluateMugenAirAction(repeatedInfinite, 1_000_000, { x: 0, y: 0 }).frameIndex, 1);

  const abandonedTail = bank.actions.find(action => action.number === 7291);
  assert.equal(abandonedTail.elements.length, 2);
  assert.deepEqual(abandonedTail.elements.map(element => element.durationTicks), [1, -1]);
});

test('AIR collision count remains authoritative for Elecbyte KFM mislabeled box assignments', async () => {
  const bank = await parseAir('[Begin Action 0]\nClsn1: 1\nClsn2[0] = 8, -4, -2, 6\n0,0,0,0,1\n');
  assert.deepEqual(bank.actions[0].elements[0].clsn1.map(box => [box.left, box.top, box.right, box.bottom]), [[-2, -4, 8, 6]]);
  assert.equal(bank.actions[0].elements[0].clsn2.length, 0);
});

test('AIR normalizes a complete one-based legacy collision block', async () => {
  const bank = await parseAir('[Begin Action 0]\nClsn1: 2\nClsn1[1]=0,0,1,1\nClsn1[2]=2,2,3,3\n0,0,0,0,1\n');
  assert.deepEqual(bank.actions[0].elements[0].clsn1.map(box => ({ index: box.index, left: box.left })), [
    { index: 0, left: 0 },
    { index: 1, left: 2 },
  ]);
});

test('AIR recovers a legacy skipped final collision index positionally', async () => {
  const bank = await parseAir('[Begin Action 0]\nClsn2: 2\nClsn2[0]=0,0,1,1\nClsn2[2]=2,2,3,3\n0,0,0,0,1\n');
  assert.deepEqual(bank.actions[0].elements[0].clsn2.map(box => ({ index: box.index, left: box.left })), [
    { index: 0, left: 0 },
    { index: 1, left: 2 },
  ]);
});

test('AIR accepts legacy all-stage collision coordinates while retaining a finite safety bound', async () => {
  const bank = await parseAir('[Begin Action 0]\nClsn1: 1\nClsn1[0] = -9999999, -9999999, 9999999, 9999999\n0,0,0,0,1\n');
  assert.deepEqual(bank.actions[0].elements[0].clsn1.map(box => [box.left, box.top, box.right, box.bottom]), [[-9_999_999, -9_999_999, 9_999_999, 9_999_999]]);
  await assertDiagnostic(
    () => parseAir('[Begin Action 0]\nClsn1: 1\nClsn1[0] = -16777217, 0, 1, 1\n0,0,0,0,1\n'),
    'E_MUGEN_AIR_ELEMENT_INVALID',
  );
});

test('AIR normalizes legacy visible all-zero placeholder actions to one observable tick', async () => {
  const bank = await parseAir('[Begin Action 5977]\n5977,0,0,0,0\n');
  const action = bank.actions[0];
  assert.deepEqual(
    { totalTicks: action.totalTicks, loopTicks: action.loopTicks, durations: action.elements.map(element => element.durationTicks) },
    { totalTicks: 1, loopTicks: 1, durations: [1] },
  );
});

test('AIR parser fails closed on malformed actions, elements, collision declarations and interpolation', async () => {
  const cases = [
    ['E_MUGEN_AIR_ELEMENT_INVALID', '[Begin Action 0]\n0,0,0,0\n'],
    ['E_MUGEN_AIR_ELEMENT_INVALID', '[Begin Action 0]\n0,0,0,0,1,Q\n'],
    ['E_MUGEN_AIR_ELEMENT_INVALID', '[Begin Action 0]\n0,0,0,0,1,,AS257D0\n'],
    ['E_MUGEN_AIR_ELEMENT_INVALID', '[Begin Action 0]\n0,0,0,0,1,,,1025\n'],
    ['E_MUGEN_AIR_CLSN_COUNT', '[Begin Action 0]\nClsn1: 1\n0,0,0,0,1\n'],
    ['E_MUGEN_AIR_CLSN_COUNT', '[Begin Action 0]\nClsn1: 2\nClsn1[0]=0,0,1,1\nClsn1[0]=0,0,1,1\n0,0,0,0,1\n'],
    ['E_MUGEN_LIMIT_EXCEEDED', '[Begin Action 0]\nClsn1: 257\n'],
    ['E_MUGEN_AIR_ELEMENT_INVALID', '[Begin Action 0]\nInterpolate Offset\n'],
    ['E_MUGEN_AIR_ELEMENT_INVALID', '[Begin Action 0]\nLoopStart\n'],
    ['E_MUGEN_AIR_ELEMENT_INVALID', '[Begin Action 0]\n0,0,0,0,1\nInterpolate Blend\n0,1,0,0,1,,S\n'],
  ];
  for (const [code, source] of cases) await assertDiagnostic(() => parseAir(source), code);
});

test('AIR recovers common legacy placeholder, timing, optional-field and concatenated-frame spellings', async () => {
  const bank = await parseAir([
    '[Begin Action 1]',
    '[Begin Action 2]',
    '0,0,0,0,-4',
    '[Begin Action 3]',
    '0,0,0,0,-.1',
    '[Begin Action 4]',
    '0,0,0,0,2H',
    '[Begin Action 5]',
    '0,0,0,0,1,A',
    '[Begin Action 6]',
    '0,0,0,0,1,H,,A0',
    '[Begin Action 7]',
    '0,0,0,0,1,,, ,A1',
    '[Begin Action 8]',
    '0,0,0,0,1,H1,0,0,0,2,H',
    '[Begin Action 9]',
    '0,,.,,1',
    '[Begin Action 10]',
    '0,0,0,0,2',
    'LoopStart',
    '0,0,0,0,0',
    '[Begin Action 11]',
    '0,0,0,-8-,1',
    '[Begin Action 12]',
    '0,0,0,0,1,,H',
    '[Begin Action 13]',
    '0,0,0,0,1,V,H',
    '[Begin Action 14]',
    '0,20,,0,0,3',
    '[Begin Action 15]',
    '0,0,0,\u0081@0,3\u0081@\u0081@',
    '[Begin Action 16]',
    'Clsn2Defalut: 1',
    'Clsn2[0]=0,0,1,1',
    'lootstart',
    '0,0,0,0,1,,A12',
    '[Begin Action 17]',
    'ƒoƒXƒ^[ legacy annotation',
    '[Begin Action 18]',
    '0,0,0,0,1,,aa',
    '[Begin Action 19]',
    '0,0,0,0,1,,0X0A12',
    '[Begin Action 20]',
    '0,0,0,0,1,,A125D120',
    '',
  ].join('\n'));

  assert.equal(bank.actions.find(action => action.number === 1).elements[0].spriteId, null);
  assert.equal(bank.actions.find(action => action.number === 2).elements[0].durationTicks, -1);
  assert.equal(bank.actions.find(action => action.number === 3).elements[0].durationTicks, -1);
  assert.equal(bank.actions.find(action => action.number === 4).elements[0].flipX, true);
  assert.equal(bank.actions.find(action => action.number === 5).elements[0].blend.mode, 'add');
  assert.equal(bank.actions.find(action => action.number === 6).elements[0].blend.mode, 'add');
  assert.equal(bank.actions.find(action => action.number === 7).elements[0].blend.destinationAlpha, 128);
  assert.equal(bank.actions.find(action => action.number === 8).elements.length, 2);
  assert.deepEqual(
    { item: bank.actions.find(action => action.number === 9).elements[0].spriteItem, x: bank.actions.find(action => action.number === 9).elements[0].offsetX, y: bank.actions.find(action => action.number === 9).elements[0].offsetY },
    { item: 0, x: 0, y: 0 },
  );
  assert.equal(bank.actions.find(action => action.number === 10).loopTicks, 1);
  assert.equal(bank.actions.find(action => action.number === 11).elements[0].offsetY, -8);
  assert.equal(bank.actions.find(action => action.number === 12).elements[0].flipX, true);
  assert.deepEqual(
    { flipX: bank.actions.find(action => action.number === 13).elements[0].flipX, flipY: bank.actions.find(action => action.number === 13).elements[0].flipY },
    { flipX: true, flipY: true },
  );
  assert.equal(bank.actions.find(action => action.number === 14).elements[0].durationTicks, 3);
  assert.deepEqual(
    { y: bank.actions.find(action => action.number === 15).elements[0].offsetY, duration: bank.actions.find(action => action.number === 15).elements[0].durationTicks },
    { y: 0, duration: 3 },
  );
  assert.equal(bank.actions.find(action => action.number === 16).elements[0].blend.mode, 'add');
  assert.equal(bank.actions.find(action => action.number === 16).loopStart, 0);
  assert.equal(bank.actions.find(action => action.number === 17).elements[0].spriteId, null);
  assert.equal(bank.actions.find(action => action.number === 18).elements[0].blend.mode, 'add');
  assert.equal(bank.actions.find(action => action.number === 19).elements[0].blend.mode, 'add');
  assert.deepEqual(bank.actions.find(action => action.number === 20).elements[0].blend, { mode: 'add', sourceAlpha: 125, destinationAlpha: 120 });
  assert(bank.diagnostics.some(item => item.code === 'E_MUGEN_AIR_ACTION_EMPTY'));
  assert(bank.diagnostics.some(item => item.code === 'E_MUGEN_AIR_TIMING_RECOVERED'));
});

test('AIR parser survives deterministic text mutation fuzz without leaking native errors', async () => {
  let state = 0x41495234;
  const random = maximum => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) % maximum;
  };
  const original = UTF8.encode(GOLDEN_AIR);
  for (let index = 0; index < 192; index++) {
    const bytes = original.slice();
    const changes = 1 + random(6);
    for (let change = 0; change < changes; change++) bytes[random(bytes.length)] ^= 1 << random(7);
    try {
      await parseAir(new TextDecoder().decode(bytes));
    } catch (error) {
      assert.ok(error instanceof MugenImportFailure, `fuzz case ${index} leaked ${error?.constructor?.name ?? typeof error}: ${error}`);
      assert.ok(error.diagnostics.length > 0);
    }
  }
});

test('G04 action package contribution is byte-deterministic and references stable G03 sprite ids', async () => {
  const inputs = characterInputs(GOLDEN_AIR);
  const firstVfs = await createMugenVfs(inputs);
  const firstGraph = await buildMugenImportGraph(firstVfs, { encoding: 'utf-8' });
  const firstActions = importMugenActionContributions(firstGraph, { spriteBanks: [fakeSpriteBank()] });
  const contributions = {
    ...firstActions.contributions,
    sprites: [...SPRITES.values()].map((sprite, index) => Object.freeze({ id: sprite.id, kind: 'test-sprite-v1', sourceIndex: index })),
  };
  const first = await importMugenPackage(firstVfs, { contentRole: 'formal-fixture', encoding: 'utf-8', contributions });

  const secondVfs = await createMugenVfs([...inputs].reverse());
  const secondGraph = await buildMugenImportGraph(secondVfs, { encoding: 'utf-8' });
  const secondActions = importMugenActionContributions(secondGraph, { spriteBanks: [fakeSpriteBank()] });
  const second = await importMugenPackage(secondVfs, {
    contentRole: 'formal-fixture',
    encoding: 'utf-8',
    contributions: { ...secondActions.contributions, sprites: contributions.sprites },
  });

  assert.equal(first.encoded.packageSha256, second.encoded.packageSha256);
  assert.equal(first.encoded.packageSha256, FIXTURE_MANIFEST.expected.packageSha256);
  assert.deepEqual(
    { actions: firstActions.actionCount, elements: firstActions.elementCount, boxes: firstActions.collisionBoxCount },
    { actions: FIXTURE_MANIFEST.expected.actions, elements: FIXTURE_MANIFEST.expected.elements, boxes: FIXTURE_MANIFEST.expected.collisionBoxes },
  );
  assert.equal(first.package.tables.actions[0].elements[0].spriteId, 'hero.sff#sprite:0');
  assert.equal(first.package.featureUsage.includes('g04.air.interpolate.offset'), true);
  const encodedText = new TextDecoder().decode(first.encoded.bytes);
  assert.equal(encodedText.includes('[Begin Action'), false);
  assert.equal(encodedText.includes('hashExcluded'), false);
});

const localKfm = new URL('../../../.g04-reference/official/mugen-1.1b1/chars/kfm/kfm.air', import.meta.url);
test('local frozen KFM oracle parses with expected AIR inventory', { skip: !existsSync(localKfm) }, async () => {
  const bytes = new Uint8Array(readFileSync(localKfm));
  const vfs = await createMugenVfs([{ path: 'kfm.air', bytes }]);
  const bank = parseMugenAir(parseMugenTextFile(vfs.require('kfm.air'), 'utf-8'));
  assert.deepEqual(
    { sourceSha256: bank.sourceSha256, actions: bank.actions.length, elements: bank.elementCount, boxes: bank.collisionBoxCount },
    {
      sourceSha256: FIXTURE_MANIFEST.expected.officialKfmAirSha256,
      actions: FIXTURE_MANIFEST.expected.officialKfmActions,
      elements: FIXTURE_MANIFEST.expected.officialKfmElements,
      boxes: FIXTURE_MANIFEST.expected.officialKfmCollisionBoxes,
    },
  );
});

async function parseAir(source, spriteResolver) {
  const vfs = await createMugenVfs([{ path: 'hero.air', bytes: UTF8.encode(source) }]);
  const document = parseMugenTextFile(vfs.require('hero.air'), 'utf-8');
  return parseMugenAir(document, spriteResolver === undefined ? {} : { spriteResolver });
}

function characterInputs(air) {
  return [
    { path: 'hero.def', bytes: UTF8.encode('[Files]\ncmd=hero.cmd\nsprite=hero.sff\nanim=hero.air\n') },
    { path: 'hero.cmd', bytes: UTF8.encode('[Command]\nname=x\n') },
    { path: 'hero.sff', bytes: Uint8Array.of(0) },
    { path: 'hero.air', bytes: UTF8.encode(air) },
  ];
}

function fakeSpriteBank() {
  return Object.freeze({
    canonicalPath: 'hero.sff',
    sourceSha256: '0'.repeat(64),
    version: '2.01',
    sprites: Object.freeze([...SPRITES.values()].map((sprite, sourceIndex) => Object.freeze({
      sourceIndex,
      group: 0,
      item: sourceIndex,
      width: 1,
      height: 1,
      axisX: sprite.axisX,
      axisY: sprite.axisY,
      colorDepth: 8,
      pixelFormat: 'indexed8',
      compression: 'raw-indexed',
      pixels: Uint8Array.of(0),
      linkedToSourceIndex: null,
      paletteSourceIndex: null,
    }))),
    palettes: Object.freeze([]),
    diagnostics: Object.freeze([]),
    decodedSpriteBytes: 3,
    decodedPaletteBytes: 0,
  });
}

function pick(value, keys) { return Object.fromEntries(keys.map(key => [key, value[key]])); }

async function assertDiagnostic(operation, code) {
  await assert.rejects(operation, error => {
    assert.ok(error instanceof MugenImportFailure, `expected MugenImportFailure, got ${error}`);
    assert.equal(error.diagnostics[0]?.code, code);
    return true;
  });
}
