import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { importMugenStage }, { prepareMugenStageSourceSet }, { validateMugenStageCatalog }, { createMugenStageRenderActors, mugenStageClipRect, transformMugenStageRenderActors }, { MugenStageCamera }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/stage/MugenStageParser.ts'),
  import('../mugen/import/stage/MugenStageDefinitionFallback.ts'),
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
  assert.equal(stage.displayName, expected.name); assert.equal(stage.definitionSource, 'authored'); assert.deepEqual(stage.localCoord, expected.localCoord); assert.deepEqual(stage.camera.horizontalBounds, expected.cameraBounds); assert.equal(stage.backgrounds.length, expected.backgrounds); assert(stage.backgrounds.every(background => stage.spriteByKey.has(`${background.spriteGroup},${background.spriteItem}`))); assert(stage.renderModel.sprites.every(sprite => sprite.id.startsWith(`stage:${expected.id}:`))); assert.match(stage.sourceSetSha256, /^[a-f0-9]{64}$/u);
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
  assert.equal(camera.update([{ id: 'P1', position: [900, 0], moveCamera: [true, true] }]).position[0], 150); assert.equal(camera.constrainX(1000, true), 295); assert.equal(camera.constrainX(1000, false), 310);
});

test('M10 stage renderer expands tiled backgrounds deterministically', async () => {
  const vfs = await createMugenVfs([{ path: 'stage0.def', bytes: bytes('stage0.def') }, { path: 'stage0.sff', bytes: bytes('stage0.sff') }]); const stage = await importMugenStage(vfs, 'training-room', 'stage0.def');
  const camera = new MugenStageCamera({ start: stage.camera.start, horizontalBounds: stage.camera.horizontalBounds, verticalBounds: stage.camera.verticalBounds, localCoord: stage.localCoord, tension: stage.camera.tension, verticalFollow: stage.camera.verticalFollow, floorTension: stage.camera.floorTension, screenMargins: stage.camera.screenMargins, playerBounds: stage.playerBounds });
  const first = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 }); const second = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 });
  assert(first.length >= stage.backgrounds.length); assert.deepEqual(first, second); assert(first.every(value => value.layer === 0 || value.layer === 1));
});

test('M10 stage preview transform zooms around viewport center and applies pan', async () => {
  const vfs = await createMugenVfs([{ path: 'stage0.def', bytes: bytes('stage0.def') }, { path: 'stage0.sff', bytes: bytes('stage0.sff') }]);
  const stage = await importMugenStage(vfs, 'training-room', 'stage0.def');
  const camera = new MugenStageCamera({ start: stage.camera.start, horizontalBounds: stage.camera.horizontalBounds, verticalBounds: stage.camera.verticalBounds, localCoord: stage.localCoord, tension: stage.camera.tension, verticalFollow: stage.camera.verticalFollow, floorTension: stage.camera.floorTension, screenMargins: stage.camera.screenMargins, playerBounds: stage.playerBounds });
  const viewport = { width: 640, height: 480 };
  const source = createMugenStageRenderActors(stage, camera.snapshot(), 0, viewport);
  const transformed = transformMugenStageRenderActors(source, viewport, { scale: 2, offset: [12, -8] });
  assert.equal(transformed[0].actor.snapshot.render.positionX, 320 + (source[0].actor.snapshot.render.positionX - 320) * 2 + 12);
  assert.equal(transformed[0].actor.snapshot.render.positionY, 240 + (source[0].actor.snapshot.render.positionY - 240) * 2 - 8);
  assert.equal(transformed[0].actor.snapshot.render.scaleX, source[0].actor.snapshot.render.scaleX * 2);
  assert.throws(() => transformMugenStageRenderActors(source, viewport, { scale: 0, offset: [0, 0] }));
});

test('M10 stage rendering clips letterboxed pixels to the declared localcoord boundary', () => {
  assert.deepEqual(mugenStageClipRect({ width: 1_000, height: 600 }, [320, 240]), { x: 100, y: 0, width: 800, height: 600 });
  assert.deepEqual(mugenStageClipRect({ width: 600, height: 1_000 }, [320, 240]), { x: 0, y: 275, width: 600, height: 450 });
});

test('M10 stage renderer preserves background masking for the WebGPU blend path', async () => {
  const vfs = await createMugenVfs([{ path: 'kfm.def', bytes: bytes('kfm.def') }, { path: 'kfm.sff', bytes: bytes('kfm.sff') }]);
  const stage = await importMugenStage(vfs, 'mountainside-temple', 'kfm.def');
  const camera = new MugenStageCamera({ start: stage.camera.start, horizontalBounds: stage.camera.horizontalBounds, verticalBounds: stage.camera.verticalBounds, localCoord: stage.localCoord, tension: stage.camera.tension, verticalFollow: stage.camera.verticalFollow, floorTension: stage.camera.floorTension, screenMargins: stage.camera.screenMargins, playerBounds: stage.playerBounds });
  const actors = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 });
  const floor = actors.find(value => value.id.startsWith('BG Floor:'));
  const ceiling = actors.find(value => value.id.startsWith('BG Ceiling:'));
  const wall = actors.find(value => value.id.startsWith('BG Wall:'));
  assert.equal(floor?.actor.mask, false);
  assert.equal(ceiling?.actor.mask, false);
  assert.equal(wall?.actor.mask, true, 'mask=1 window openings must preserve palette-index-zero transparency');
  assert.equal(stage.renderModel.palettes.length, stage.renderModel.rendererPalettes.length);
});

test('M10 lab-clones keeps its full-canvas sprites as masked layers instead of inferred animation frames', { skip: missingOptionalStageCorpus(['lab-clones/lab-clones.def', 'lab-clones/lab-clones.sff', 'lab-clones/Dirty_Sam_OC_ReMix.mp3']) }, async () => {
  const folder = 'lab-clones/';
  const files = ['lab-clones.def', 'lab-clones.sff', 'Dirty_Sam_OC_ReMix.mp3'];
  const vfs = await createMugenVfs(files.map(file => ({ path: file, bytes: bytes(`${folder}${file}`) })));
  const stage = await importMugenStage(vfs, 'lab-clones', 'lab-clones.def');
  assert.equal(stage.definitionSource, 'authored');
  assert.equal(stage.legacyHighResolution, true);
  assert.equal(stage.backgrounds.length, 18);
  assert.equal(stage.backgrounds.filter(background => background.animation !== null).length, 13);
  assert.deepEqual(stage.backgrounds.slice(0, 2).map(background => [background.spriteGroup, background.spriteItem, background.animation]), [[0, 0, null], [0, 1, null]]);
  assert.equal(stage.backgrounds.filter(background => background.mask).length, 16);
  assert.equal(stage.backgrounds.find(background => background.id.startsWith('BG lab-light:'))?.transparency, 'add');
  assert.deepEqual(stage.backgrounds.filter(background => background.layer === 1).map(background => background.spriteGroup), [98, 99]);
  assert.equal(stage.music?.path, 'Dirty_Sam_OC_ReMix.mp3');
  const camera = new MugenStageCamera({ start: stage.camera.start, horizontalBounds: stage.camera.horizontalBounds, verticalBounds: stage.camera.verticalBounds, localCoord: stage.localCoord, tension: stage.camera.tension, verticalFollow: stage.camera.verticalFollow, floorTension: stage.camera.floorTension, screenMargins: stage.camera.screenMargins, playerBounds: stage.playerBounds });
  const actors = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 });
  assert.equal(actors[0]?.actor.snapshot.render.scaleX, 1, 'hires=1 sprites must retain native size in a 640x480 viewport');
  assert.equal(actors[0]?.actor.snapshot.render.positionX, 38, 'hires=1 BG start coordinates must use the legacy 640x480 grid');
  assert.equal(actors[0]?.actor.snapshot.render.positionY, -278);
});

test('M10 Frasco_GGI restores authored parallax, masks, additive lights, and animation groups', { skip: missingOptionalStageCorpus(['Frasco_GGI/Frasco_GGI.def', 'Frasco_GGI/Frasco_GGI.sff', 'Frasco_GGI/QuickSilver.mp3']) }, async () => {
  const folder = 'Frasco_GGI/';
  const files = ['Frasco_GGI.def', 'Frasco_GGI.sff', 'QuickSilver.mp3'];
  const vfs = await createMugenVfs(files.map(file => ({ path: file, bytes: bytes(`${folder}${file}`) })));
  const stage = await importMugenStage(vfs, 'frasco-ggi', 'Frasco_GGI.def');
  assert.equal(stage.definitionSource, 'authored');
  assert.equal(stage.legacyHighResolution, true);
  assert.equal(stage.backgrounds.length, 14);
  assert.equal(stage.backgrounds.filter(background => background.animation !== null).length, 6);
  assert.equal(stage.backgrounds.filter(background => background.mask).length, 12);
  assert.equal(stage.backgrounds.filter(background => background.transparency === 'add').length, 5);
  assert.deepEqual(stage.backgrounds.find(background => background.id.startsWith('BG light-b:'))?.animation?.elements.map(element => element.spriteItem), [6, 7, 8]);
  assert.equal(stage.music?.path, 'QuickSilver.mp3');
  const camera = new MugenStageCamera({ start: stage.camera.start, horizontalBounds: stage.camera.horizontalBounds, verticalBounds: stage.camera.verticalBounds, localCoord: stage.localCoord, tension: stage.camera.tension, verticalFollow: stage.camera.verticalFollow, floorTension: stage.camera.floorTension, screenMargins: stage.camera.screenMargins, playerBounds: stage.playerBounds });
  const actors = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 });
  assert.equal(actors.length, 14);
  assert.equal(actors[0]?.actor.snapshot.render.scaleX, 1);
  assert.deepEqual([actors[0]?.actor.snapshot.render.positionX, actors[0]?.actor.snapshot.render.positionY], [-62, -67]);
});

test('M10 stage parser renders embedded animated backgrounds and exposes uploaded BGM', { skip: missingOptionalStageCorpus(['Academy_Grounds/Academy_Grounds.def', 'Academy_Grounds/Academy_Grounds.sff', 'Academy_Grounds/AcademyGrounds.ogg']) }, async () => {
  const folder = 'Academy_Grounds/';
  const vfs = await createMugenVfs([
    { path: 'Academy_Grounds.def', bytes: bytes(`${folder}Academy_Grounds.def`) },
    { path: 'Academy_Grounds.sff', bytes: bytes(`${folder}Academy_Grounds.sff`) },
    { path: 'AcademyGrounds.ogg', bytes: bytes(`${folder}AcademyGrounds.ogg`) },
  ]);
  const stage = await importMugenStage(vfs, 'academy-grounds', 'Academy_Grounds.def');
  assert.equal(stage.backgrounds.length, 6);
  assert.equal(stage.backgrounds.filter(background => background.animation !== null).length, 4);
  assert.equal(stage.music?.path, 'AcademyGrounds.ogg');
  assert.equal(stage.music?.bytes.byteLength, 1_387_184);
  const camera = new MugenStageCamera({ start: stage.camera.start, horizontalBounds: stage.camera.horizontalBounds, verticalBounds: stage.camera.verticalBounds, localCoord: stage.localCoord, tension: stage.camera.tension, verticalFollow: stage.camera.verticalFollow, floorTension: stage.camera.floorTension, screenMargins: stage.camera.screenMargins, playerBounds: stage.playerBounds });
  const atStart = createMugenStageRenderActors(stage, camera.snapshot(), 0, { width: 640, height: 480 });
  const afterSixTicks = createMugenStageRenderActors(stage, camera.snapshot(), 6, { width: 640, height: 480 });
  const firstGirls = atStart.find(value => value.id.startsWith('BG Girls1:'));
  const animatedGirls = afterSixTicks.find(value => value.id.startsWith('BG Girls1:'));
  assert.equal(firstGirls?.actor.snapshot.element.spriteItem, 0);
  assert.equal(animatedGirls?.actor.snapshot.element.spriteItem, 1);
  assert.notEqual(firstGirls?.actor.snapshot.render.spriteId, animatedGirls?.actor.snapshot.render.spriteId);
});

test('M10 legacy stage folders resolve game-root asset paths and scalar velocity', { skip: missingOptionalStageCorpus(['Cathedral/Cathedral.def', 'Cathedral/Cathedral.sff', 'Cathedral/Dog Carnival.mp3', 'TifaX/TifaX.def', 'TifaX/TifaX.sff', 'TifaX/TifaX.mid']) }, async () => {
  const cases = [
    { folder: 'Cathedral', files: ['Cathedral.def', 'Cathedral.sff', 'Dog Carnival.mp3'], backgrounds: 6, animated: 5, music: 'Dog Carnival.mp3' },
    { folder: 'CVS2k-finalfight', files: ['CVS2k-finalfight.def', 'CVS2k-finalfight.sff'], backgrounds: 26, animated: 0, music: null },
    { folder: 'TifaX', files: ['TifaX.def', 'TifaX.sff', 'TifaX.mid'], backgrounds: 7, animated: 3, music: 'TifaX.mid' },
    { folder: "XX'CLOCK'2'XX", files: ["XX'CLOCK'2'XX.def", "XX'CLOCK'2'XX.sff", "XX'CLOCK'2'XX.mp3"], backgrounds: 19, animated: 3, music: "XX'CLOCK'2'XX.mp3" },
  ];
  for (const expected of cases) {
    const vfs = await createMugenVfs(expected.files.map(file => ({ path: file, bytes: bytes(`${expected.folder}/${file}`) })));
    const stage = await importMugenStage(vfs, expected.folder.toLowerCase().replaceAll(/[^a-z0-9._-]/gu, '-'), expected.files[0]);
    assert.equal(stage.backgrounds.length, expected.backgrounds, expected.folder);
    assert.equal(stage.backgrounds.filter(background => background.animation !== null).length, expected.animated, expected.folder);
    assert.equal(stage.music?.path ?? null, expected.music, expected.folder);
  }
  const clockFolder = cases[3];
  const clockVfs = await createMugenVfs(clockFolder.files.map(file => ({ path: file, bytes: bytes(`${clockFolder.folder}/${file}`) })));
  const clock = await importMugenStage(clockVfs, 'clock-tower', clockFolder.files[0]);
  const velocity = clock.backgrounds.find(background => background.id.startsWith('BG Sky:'))?.velocity;
  assert(Math.abs((velocity?.[0] ?? 0) - .2) < 1e-6);
  assert.equal(velocity?.[1], 0);
  assert.equal(clock.backgrounds.find(background => background.id.startsWith('BG BlimpBack:'))?.transparency, 'sub');
  assert.equal(clock.backgrounds.find(background => background.id.startsWith('BG Blimp:'))?.transparency, 'add');
});

test('M10 automatically completes a deterministic inferred DEF when a stage folder only contains SFF assets', { skip: missingOptionalStageCorpus(['Cathedral/Cathedral.sff', 'Cathedral/Dog Carnival.mp3', 'TifaX/TifaX.sff', 'TifaX/TifaX.mid']) }, async () => {
  const cases = [
    { folder: 'Cathedral', files: ['Cathedral.sff', 'Dog Carnival.mp3'], music: 'Dog Carnival.mp3', localCoord: [640, 480], backgrounds: 6, animated: 5 },
    { folder: 'CVS2k-finalfight', files: ['CVS2k-finalfight.sff'], music: null, localCoord: [320, 240], backgrounds: 25, animated: 2 },
    { folder: 'TifaX', files: ['TifaX.sff', 'TifaX.mid'], music: 'TifaX.mid', localCoord: [320, 240], backgrounds: 7, animated: 3 },
  ];
  for (const expected of cases) {
    const inputs = expected.files.map(file => ({ path: file, bytes: bytes(`${expected.folder}/${file}`) }));
    const first = prepareMugenStageSourceSet(inputs); const second = prepareMugenStageSourceSet(inputs);
    assert.equal(first.generatedEntryDefs.length, 1, expected.folder);
    assert.deepEqual(first, second, `${expected.folder} completion must be deterministic`);
    const stage = await importMugenStage(await createMugenVfs(first.inputs), `inferred-${expected.folder.toLowerCase()}`, first.entryDefs[0]);
    assert.equal(stage.definitionSource, 'inferred', expected.folder);
    assert.deepEqual(stage.localCoord, expected.localCoord, expected.folder);
    assert.equal(stage.backgrounds.length, expected.backgrounds, expected.folder);
    assert.equal(stage.backgrounds.filter(background => background.animation !== null).length, expected.animated, expected.folder);
    assert.equal(stage.music?.path ?? null, expected.music, expected.folder);
  }
});

test('M10 completes unclaimed SFF files without replacing authored stages in a mixed directory', { skip: missingOptionalStageCorpus(['Cathedral/Cathedral.def', 'Cathedral/Cathedral.sff', 'TifaX/TifaX.sff']) }, () => {
  const inputs = [
    { path: 'Cathedral.def', bytes: bytes('Cathedral/Cathedral.def') },
    { path: 'Cathedral.sff', bytes: bytes('Cathedral/Cathedral.sff') },
    { path: 'TifaX.sff', bytes: bytes('TifaX/TifaX.sff') },
  ];
  const prepared = prepareMugenStageSourceSet(inputs);
  assert.deepEqual(prepared.entryDefs, ['Cathedral.def', 'TifaX.haiyue-generated.def']);
  assert.deepEqual(prepared.generatedEntryDefs, ['TifaX.haiyue-generated.def']);
  assert.equal(prepared.inputs.length, inputs.length + 1);
});

function bytes(name) { return new Uint8Array(readFileSync(new URL(`../mugen/stages/${name}`, import.meta.url))); }
function missingOptionalStageCorpus(names) { return names.every(name => existsSync(new URL(`../mugen/stages/${name}`, import.meta.url))) ? false : 'optional external stage corpus is not installed'; }
