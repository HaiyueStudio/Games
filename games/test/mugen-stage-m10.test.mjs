import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { importMugenStage }, { validateMugenStageCatalog }, { createMugenStageRenderActors }, { MugenStageCamera }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/stage/MugenStageParser.ts'),
  import('../mugen/game/MugenStageCatalog.ts'),
  import('../mugen/game/MugenStageRenderer.ts'),
  import('../mugen/runtime/stage/MugenStageCamera.ts'),
]);

for (const expected of [
  { def: 'kfm.def', sff: 'kfm.sff', id: 'mountainside-temple', name: 'Mountainside Temple', localCoord: [320, 240], backgrounds: 7, cameraBounds: [-150, 150] },
  { def: 'stage0.def', sff: 'stage0.sff', id: 'training-room', name: 'Training Room', localCoord: [320, 240], backgrounds: 2, cameraBounds: [-125, 125] },
  { def: 'stage0-720.def', sff: 'stage0-720.sff', id: 'training-room-720', name: 'Training Room', localCoord: [1280, 720], backgrounds: 2, cameraBounds: [-500, 500] },
]) test(`M10 stage parser imports ${expected.def} and its SFF backgrounds`, async () => {
  const vfs = await createMugenVfs([{ path: expected.def, bytes: bytes(expected.def) }, { path: expected.sff, bytes: bytes(expected.sff) }]);
  const stage = await importMugenStage(vfs, expected.id, expected.def);
  assert.equal(stage.displayName, expected.name); assert.deepEqual(stage.localCoord, expected.localCoord); assert.deepEqual(stage.camera.horizontalBounds, expected.cameraBounds); assert.equal(stage.backgrounds.length, expected.backgrounds); assert(stage.backgrounds.every(background => stage.spriteByKey.has(`${background.spriteGroup},${background.spriteItem}`))); assert(stage.renderModel.sprites.every(sprite => sprite.id.startsWith(`stage:${expected.id}:`))); assert.match(stage.sourceSetSha256, /^[a-f0-9]{64}$/u);
});

test('M10 stage catalog permits nested stage directories but rejects traversal and duplicates', () => {
  assert.deepEqual(validateMugenStageCatalog({ schemaVersion: 1, entries: [{ id: 'night-temple', displayName: 'Night Temple', def: 'temple/night/stage.def' }] }), [{ id: 'night-temple', displayName: 'Night Temple', def: 'temple/night/stage.def' }]);
  assert.throws(() => validateMugenStageCatalog({ schemaVersion: 1, entries: [{ id: 'escape', displayName: 'Escape', def: '../stage.def' }] }));
  assert.throws(() => validateMugenStageCatalog({ schemaVersion: 1, entries: [{ id: 'same', displayName: 'One', def: 'a.def' }, { id: 'same', displayName: 'Two', def: 'b.def' }] }), /重复/u);
});

test('M10 camera follows its dead-zone and keeps fighters inside the visible stage', () => {
  const camera = new MugenStageCamera({ start: [0, 0], horizontalBounds: [-150, 150], verticalBounds: [-25, 0], localCoord: [320, 240], tension: 50, verticalFollow: .2, floorTension: 0, screenMargins: [15, 15], playerBounds: [-1000, 1000] });
  assert.deepEqual(camera.snapshot(), { position: [0, 0], screenBounds: [-145, 145], visibleBounds: [-160, 160] });
  assert.equal(camera.update([{ id: 'P1', position: [30, 0], moveCamera: [true, true] }, { id: 'P2', position: [130, 0], moveCamera: [true, true] }]).position[0], 80);
  assert.deepEqual(camera.snapshot().screenBounds, [-65, 225]); assert.equal(camera.constrainX(1000, true), 225);
  assert.equal(camera.update([{ id: 'P1', position: [900, 0], moveCamera: [true, true] }]).position[0], 150); assert.equal(camera.constrainX(1000, true), 295); assert.equal(camera.constrainX(1000, false), 1000);
});

test('M10 stage renderer expands tiled backgrounds deterministically', async () => {
  const vfs = await createMugenVfs([{ path: 'stage0.def', bytes: bytes('stage0.def') }, { path: 'stage0.sff', bytes: bytes('stage0.sff') }]); const stage = await importMugenStage(vfs, 'training-room', 'stage0.def');
  const camera = new MugenStageCamera({ start: stage.camera.start, horizontalBounds: stage.camera.horizontalBounds, verticalBounds: stage.camera.verticalBounds, localCoord: stage.localCoord, tension: stage.camera.tension, verticalFollow: stage.camera.verticalFollow, floorTension: stage.camera.floorTension, screenMargins: stage.camera.screenMargins, playerBounds: stage.playerBounds });
  const first = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 }); const second = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 });
  assert(first.length >= stage.backgrounds.length); assert.deepEqual(first, second); assert(first.every(value => value.layer === 0 || value.layer === 1));
});

function bytes(name) { return new Uint8Array(readFileSync(new URL(`../mugen/stages/${name}`, import.meta.url))); }
