import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ parseMugenCommandDocument }, { parseMugenStateDocuments }, { parseMugenTextFile }, { createMugenVfs }, { MugenInputHistory }, { MugenHeadlessMatch }, { MugenScriptRuntime }, { MugenOutputAuthority, mugenAfterImageColorMatrix, mugenPaletteColorMatrix, mugenShakeOffset }, { MugenBrowserOutput }, { applyMugenOutputTransform }] = await Promise.all([
  import('../mugen/import/cmd/index.ts'), import('../mugen/import/cns/index.ts'), import('../mugen/import/text/MugenTextParser.ts'), import('../mugen/import/vfs/MugenVfs.ts'), import('../mugen/runtime/input/index.ts'), import('../mugen/runtime/match/index.ts'), import('../mugen/runtime/script/index.ts'), import('../mugen/runtime/effects/index.ts'), import('../mugen/game/MugenBrowserOutput.ts'),
  import('../mugen/game/MugenOutputRender.ts'),
]);

const UTF8 = new TextEncoder();
const TYPES = ['assert-special', 'after-image', 'after-image-time', 'append-to-clipboard', 'bg-pal-fx', 'display-to-clipboard', 'env-shake', 'fall-env-shake', 'force-feedback', 'game-make-anim', 'make-dust', 'pal-fx', 'screen-bound', 'trans'];

test('G06-A parses and executes all fourteen Petra output controller types through deterministic authority', async () => {
  const commands = parseMugenCommandDocument(await document('g06a.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await document('g06a.cns', SOURCE)]);
  assert.deepEqual(states.states.find(state => state.number === 0).controllers.map(controller => controller.type), TYPES);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]);
  const history = new MugenInputHistory(); const match = createMatch(); const input = history.push({ tick: 1, players: [player('P1'), player('P2')] }, { P1: 1, P2: -1 });
  match.beginTick(input).startFight(); const trace = runtime.step(match, input, history); const result = match.endTick(); assert.equal(result.state.roundTimeRemainingTicks, 60);
  assert.equal(trace.outputHash, trace.output.hash); assert.deepEqual(trace.output.entities.map(entity => entity.entityId), ['P1', 'P2']);
  const p1 = trace.output.entities[0]; assert.deepEqual(p1.assertions, ['invisible', 'nofg', 'timerfreeze']); assert.equal(p1.palette.remainingTicks, 3); assert.equal(p1.afterImage.remainingTicks, 12); assert.equal(p1.transparency.mode, 'addalpha'); assert.deepEqual(p1.transparency.alpha, [0, 256]); assert.deepEqual(p1.screenBound, { bound: true, moveCamera: [false, true] });
  assert.deepEqual(trace.output.backgroundPalette.add, [1, 2, 3]); assert.equal(trace.output.cameraShake.remainingTicks, 8); assert.equal(trace.output.events.length, 10);
  assert.equal(trace.output.events.filter(event => event.kind === 'force-feedback').length, 2); assert.equal(trace.output.events.filter(event => event.kind === 'clipboard-debug').length, 4); assert(trace.output.events.every(event => event.kind !== 'clipboard-debug' || event.policy === 'internal-debug-buffer'));
  const snapshot = runtime.executionSnapshot(); const restored = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]); restored.restoreExecution(JSON.parse(JSON.stringify(snapshot))); assert.deepEqual(restored.executionSnapshot(), snapshot);
});

test('G06-A output authority resets one-tick flags and advances timed effects exactly once per tick', () => {
  const authority = new MugenOutputAuthority(); authority.beginTick(1).assert('P1', ['invisible']).setCameraShake({ remainingTicks: 2, elapsedTicks: 0, frequency: 90, amplitude: 4, phase: 0 }).setPalette('P1', { remainingTicks: 2, elapsedTicks: 0, add: [1, 2, 3], multiply: [256, 256, 256], sineAdd: [0, 0, 0, 1], invertAll: false, color: 256 });
  const first = authority.snapshot(); assert.equal(mugenShakeOffset(first.cameraShake), 0); authority.beginTick(2); const second = authority.snapshot(); assert.deepEqual(second.entities[0].assertions, []); assert.equal(second.entities[0].palette.remainingTicks, 1); assert.equal(second.cameraShake.remainingTicks, 1); assert.equal(mugenShakeOffset(second.cameraShake), 4); authority.beginTick(3); assert.equal(authority.snapshot().cameraShake, null); assert.equal(authority.snapshot().entities[0].palette, null);
});

test('G08 PalFX lowers to a deterministic RGB affine matrix for indexed-sprite rendering', () => {
  const matrix = mugenPaletteColorMatrix({ remainingTicks: 5, elapsedTicks: 0, add: [10, 20, 30], multiply: [128, 256, 64], sineAdd: [0, 0, 0, 1], invertAll: false, color: 256 });
  assert.deepEqual(matrix, [0.5, 0, 0, Math.fround(10 / 255 * .5), 0, 1, 0, Math.fround(20 / 255), 0, 0, .25, Math.fround(30 / 255 * .25)]);
  const grayscale = mugenPaletteColorMatrix({ remainingTicks: 1, elapsedTicks: 0, add: [0, 0, 0], multiply: [256, 256, 256], sineAdd: [0, 0, 0, 1], invertAll: false, color: 0 }); assert.deepEqual(grayscale, Array.from({ length: 12 }, (_, index) => index % 4 === 3 ? 0 : Math.fround(1 / 3)));
  const inverted = mugenPaletteColorMatrix({ remainingTicks: 1, elapsedTicks: 0, add: [0, 0, 0], multiply: [256, 256, 256], sineAdd: [0, 0, 0, 1], invertAll: true, color: 256 }); assert.deepEqual(inverted, [-1, 0, 0, 1, 0, -1, 0, 1, 0, 0, -1, 1]);
  const trail = mugenAfterImageColorMatrix({ remainingTicks: 4, length: 4, paletteColor: 256, paletteInvertAll: false, paletteBright: [0, 0, 0], paletteContrast: [256, 256, 256], palettePostBright: [0, 0, 0], paletteAdd: [10, 20, 30], paletteMultiply: [.5, .5, .5], timeGap: 1, frameGap: 1, transparency: 'add' }, 1); assert.deepEqual(trail, [.5, 0, 0, Math.fround(10 / 255 * .5), 0, .5, 0, Math.fround(20 / 255 * .5), 0, 0, .5, Math.fround(30 / 255 * .5)]);
  const olderTrail = mugenAfterImageColorMatrix({ remainingTicks: 4, length: 4, paletteColor: 256, paletteInvertAll: false, paletteBright: [1, 2, 3], paletteContrast: [256, 256, 256], palettePostBright: [4, 5, 6], paletteAdd: [10, 20, 30], paletteMultiply: [.5, .5, .5], timeGap: 1, frameGap: 1, transparency: 'add' }, 2); assert.deepEqual(olderTrail, [.25, 0, 0, Math.fround(25 / 255 * .25), 0, .25, 0, Math.fround(47 / 255 * .25), 0, 0, .25, Math.fround(69 / 255 * .25)]);
});

test('G06-A browser adapter keeps clipboard diagnostics internal and reports unavailable rumble', () => {
  const authority = new MugenOutputAuthority(); authority.beginTick(1).emit({ kind: 'clipboard-debug', policy: 'internal-debug-buffer', entityId: 'P1', mode: 'replace', text: 'Mode:%d', paramsSource: 'var(59)' }).emit({ kind: 'force-feedback', policy: 'browser-gamepad-best-effort', entityId: 'P1', rootId: 'P1', target: 'self', waveform: 'sine', time: 6, frequency: [128, 0, 0, 0], amplitude: [128, 0, 0, 0] });
  const adapter = new MugenBrowserOutput(); const stats = adapter.consume(authority.snapshot()); assert.deepEqual(stats, { tick: 1, forceFeedbackEvents: 1, forceFeedbackApplied: 0, clipboardDiagnostics: 1 }); assert.equal(adapter.debugText('P1'), 'Mode:%d [params: var(59)]');
});

test('G08 executes the remaining official drawing, global palette, environment, quote and pan controllers', async () => {
  const commands = parseMugenCommandDocument(await document('g08-output.cmd', '[Command]\nname="dummy"\ncommand=s\n'));
  const states = parseMugenStateDocuments([await document('g08-output.cns', G08_OUTPUT_SOURCE)]);
  assert.deepEqual(states.states.find(value => value.number === 0).controllers.map(value => value.type), ['all-pal-fx', 'angle-set', 'angle-add', 'angle-mul', 'angle-draw', 'offset', 'env-color', 'clear-clipboard', 'victory-quote', 'play-snd', 'snd-pan']);
  const runtime = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]);
  const history = new MugenInputHistory(); const match = createMatch(); const input = history.push({ tick: 1, players: [player('P1'), player('P2')] }, { P1: 1, P2: -1 });
  match.beginTick(input).startFight(); const trace = runtime.step(match, input, history); const result = match.endTick();
  const p1 = trace.output.entities.find(value => value.entityId === 'P1');
  assert.deepEqual(p1.displayOffset, [3, -4]); assert.equal(p1.drawingAngle, 50); assert.deepEqual(p1.drawingTransform, { angle: 50, scale: [.5, 2] }); assert.equal(p1.victoryQuote, 7);
  assert.equal(trace.output.allPalette.remainingTicks, 4); assert.deepEqual(trace.output.allPalette.add, [1, 2, 3]); assert.deepEqual(trace.output.environmentColor, { remainingTicks: 3, color: [12, 34, 56], under: true });
  assert.equal(trace.output.events.filter(value => value.kind === 'clipboard-debug' && value.mode === 'clear').length, 2);
  const pans = result.events.filter(value => value.kind === 'audio' && value.operation === 'pan'); assert.deepEqual(pans.map(value => [value.fighterId, value.channel, value.pan]), [['P1', 2, 40], ['P2', 2, 40]]);
  const plays = result.events.filter(value => value.kind === 'audio' && value.operation === 'play'); assert.deepEqual(plays.map(value => [value.fighterId, value.volume, value.pan, value.lowPriority]), [['P1', 127.5, -10, true], ['P2', 127.5, 10, true]]);
  const snapshot = runtime.executionSnapshot(); const restored = new MugenScriptRuntime([{ fighterId: 'P1', commands, states }, { fighterId: 'P2', commands, states }]); restored.restoreExecution(JSON.parse(JSON.stringify(snapshot))); assert.deepEqual(restored.executionSnapshot(), snapshot);
});

test('G08 SndPan fails closed unless exactly one pan coordinate is supplied', async () => {
  for (const body of ['channel=1', 'channel=1\npan=0\nabspan=0']) await assert.rejects(() => document('invalid-sndpan.cns', `[Statedef 0]\ntype=S\nmovetype=I\nphysics=N\n[State 0, invalid]\ntype=SndPan\ntrigger1=1\n${body}\n`).then(value => parseMugenStateDocuments([value])), /exactly one of pan or abspan/u);
});

test('G08 ClearClipboard clears only the internal diagnostic buffer', () => {
  const authority = new MugenOutputAuthority(); const adapter = new MugenBrowserOutput();
  authority.beginTick(1).emit({ kind: 'clipboard-debug', policy: 'internal-debug-buffer', entityId: 'P1', mode: 'replace', text: 'before', paramsSource: '' }); adapter.consume(authority.snapshot()); assert.equal(adapter.debugText('P1'), 'before');
  authority.beginTick(2).emit({ kind: 'clipboard-debug', policy: 'internal-debug-buffer', entityId: 'P1', mode: 'clear', text: '', paramsSource: '' }); adapter.consume(authority.snapshot()); assert.equal(adapter.debugText('P1'), '');
});

test('G08 Offset and AngleDraw alter rendering while collision authority remains unchanged', () => {
  const snapshot = Object.freeze({ actionNumber: 0, actionTick: 0, frameIndex: 0, frameTick: 0, completedLoops: 0, generation: 0, element: Object.freeze({}), clsn1: Object.freeze([{ kind: 'clsn1', sourceIndex: 0, left: 1, top: 2, right: 3, bottom: 4 }]), clsn2: Object.freeze([]), render: Object.freeze({ spriteId: '0,0', spriteGroup: 0, spriteItem: 0, missingSprite: false, positionX: 100, positionY: 200, axisX: 0, axisY: 0, flipX: false, flipY: false, scaleX: 2, scaleY: 3, rotationRadians: .25, blend: Object.freeze({ mode: 'none', sourceAlpha: 256, destinationAlpha: 0 }), interpolationProgress: 0, interpolated: Object.freeze([]) }) });
  const output = Object.freeze({ displayOffset: [3, -4], drawingTransform: Object.freeze({ angle: 90, scale: [.5, 2] }) }); const transformed = applyMugenOutputTransform(snapshot, output, 2, -1);
  assert.deepEqual([transformed.render.positionX, transformed.render.positionY, transformed.render.scaleX, transformed.render.scaleY], [106, 192, 1, 6]); assert(Math.abs(transformed.render.rotationRadians - (.25 - Math.PI / 2)) < 1e-6); assert.strictEqual(transformed.clsn1, snapshot.clsn1);
});

async function document(path, source) { const vfs = await createMugenVfs([{ path, bytes: UTF8.encode(source) }]); return parseMugenTextFile(vfs.require(path), 'utf-8'); }
function player(id) { return { id, actions: CONTROLS.map(action => ({ action, value: 0, held: false, pressed: false, released: false })) }; }
function createMatch() { return new MugenHeadlessMatch({ seed: 'g06a', roundsToWin: 1, roundTimeTicks: 60, maxEventsPerTick: 512, fighters: [{ id: 'P1', displayName: 'P1', packageSha256: 'a'.repeat(64), spawn: [-20, 0], facing: 1, initialControl: true }, { id: 'P2', displayName: 'P2', packageSha256: 'b'.repeat(64), spawn: [20, 0], facing: -1, initialControl: true }] }); }
const CONTROLS = Object.freeze(['up', 'down', 'left', 'right', 'a', 'b', 'c', 'x', 'y', 'z', 'start']);
const SOURCE = `[StateDef 0]
type=S
movetype=I
physics=N
ctrl=1
[State 0, assert]
type=AssertSpecial
trigger1=1
flag=invisible
flag2=noFG
flag3=TimerFreeze
[State 0, after]
type=AfterImage
trigger1=1
time=20
length=10
palbright=0,0,0
palcontrast=175,175,175
paladd=0,0,0
palmul=1,1,1
timegap=1
framegap=5
trans=add1
[State 0, after time]
type=AfterImageTime
trigger1=1
time=12
[State 0, append]
type=AppendToClipboard
trigger1=1
text="append %d"
params=var(0)
[State 0, bg]
type=BGPalFX
trigger1=1
time=2
add=1,2,3
color=128
[State 0, display]
type=DisplayToClipboard
trigger1=1
text="display"
[State 0, shake]
type=EnvShake
trigger1=1
time=8
freq=90
ampl=4
phase=0
[State 0, fall shake]
type=FallEnvShake
trigger1=1
[State 0, feedback]
type=ForceFeedback
trigger1=1
waveform=sinesquare
time=6
ampl=128,-3,-.2,.005
[State 0, game anim]
type=GameMakeAnim
trigger1=1
value=60
under=1
pos=1,2
[State 0, dust]
type=MakeDust
trigger1=1
pos=-5,-2
pos2=5,-2
spacing=1
[State 0, pal]
type=PalFX
trigger1=1
time=3
add=128,128,128
[State 0, screen]
type=ScreenBound
trigger1=1
value=1
movecamera=0,1
[State 0, trans]
type=Trans
trigger1=1
trans=addalpha
alpha=-14,300
`;

const G08_OUTPUT_SOURCE = `[StateDef 0]
type=S
movetype=I
physics=N
ctrl=1
[State 0, all palette]
type=AllPalFX
trigger1=1
time=4
add=1,2,3
[State 0, set angle]
type=AngleSet
trigger1=1
value=20
[State 0, add angle]
type=AngleAdd
trigger1=1
value=5
[State 0, multiply angle]
type=AngleMul
trigger1=1
value=2
[State 0, draw angle]
type=AngleDraw
trigger1=1
scale=.5,2
[State 0, offset]
type=Offset
trigger1=1
x=3
y=-4
[State 0, environment]
type=EnvColor
trigger1=1
value=12,34,56
time=3
under=1
[State 0, clear]
type=ClearClipboard
trigger1=1
[State 0, quote]
type=VictoryQuote
trigger1=1
value=7
[State 0, pan]
type=PlaySnd
trigger1=1
value=2,3
channel=2
volumescale=50
lowpriority=1
pan=10
[State 0, update pan]
type=SndPan
trigger1=1
channel=2
abspan=40
`;
