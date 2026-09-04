import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [
  { createMugenVfs },
  { importMugenCharacter },
  { createMugenCharacterModel, discoverMugenCharacterDefCandidates, spriteReferenceResolver },
  { MugenViewerController },
  { MugenViewerAudio, cueOccurrences },
] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/worker/MugenCharacterImport.ts'),
  import('../mugen/viewer/MugenCharacterModel.ts'),
  import('../mugen/viewer/MugenViewerController.ts'),
  import('../mugen/viewer/MugenViewerAudio.ts'),
]);

const UTF8 = new TextEncoder();

test('viewer candidate discovery matches root-first dependency entry semantics', () => {
  const bytes = new Uint8Array();
  assert.deepEqual(discoverMugenCharacterDefCandidates([
    { path: 'sub/other.def', bytes }, { path: 'Hero.DEF', bytes }, { path: 'alt.def', bytes }, { path: 'readme.txt', bytes },
  ]), ['alt.def', 'Hero.DEF']);
  assert.deepEqual(discoverMugenCharacterDefCandidates([{ path: 'chars/kfm/kfm.def', bytes }, { path: 'chars/ryu/ryu.def', bytes }]), ['chars/kfm/kfm.def', 'chars/ryu/ryu.def']);
  assert.deepEqual(discoverMugenCharacterDefCandidates([{ path: 'hero.air', bytes }]), []);

  const characterDef = UTF8.encode('[Info]\nname = Kung Fu Man\n[Files]\nsprite = kfm.sff\nanim = kfm.air\ncmd = kfm.cmd\ncns = kfm.cns\n');
  const storyboardDef = UTF8.encode('[SceneDef]\nspr = intro.sff\n[Scene 0]\nend.time = 120\n');
  assert.deepEqual(discoverMugenCharacterDefCandidates([
    { path: 'ending.def', bytes: storyboardDef },
    { path: 'intro.def', bytes: storyboardDef },
    { path: 'kfm.def', bytes: characterDef },
  ]), ['kfm.def']);
});

test('character Worker pipeline composes SFF/ACT/AIR, metadata and deterministic package bytes', async () => {
  const inputs = characterFixtureInputs();
  const first = await importMugenCharacter(await createMugenVfs(inputs), { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });
  const second = await importMugenCharacter(await createMugenVfs([...inputs].reverse()), { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });
  assert.equal(first.encoded.packageSha256, second.encoded.packageSha256);
  assert.deepEqual(first.encoded.bytes, second.encoded.bytes);
  assert.deepEqual(first.metadata, {
    name: 'Viewer Fighter', displayName: 'Viewer Fighter EX', author: 'Haiyue Fixture', mugenVersion: '1.1', localCoord: [640, 360], entryDef: 'hero.def', dependencies: ['hero.act', 'hero.air', 'hero.cmd', 'hero.def', 'hero.sff'],
  });
  assert.deepEqual({ sprites: first.package.tables.sprites.length, palettes: first.package.tables.palettes.length, actions: first.package.tables.actions.length }, { sprites: 2, palettes: 2, actions: 2 });
  assert.equal(first.package.featureUsage.includes('g03.sff.1.0'), true);
  assert.equal(first.package.featureUsage.includes('g04.air.action'), true);
  assert.equal(first.report.diagnostics.some(value => value.code === 'E_MUGEN_AIR_SPRITE_MISSING'), true);
});

test('committed G05 browser fixture matches its byte-exact golden manifest', async () => {
  const fixtureManifest = JSON.parse(readFileSync(new URL('../mugen/fixtures/g05-viewer-v1.fixture.json', import.meta.url), 'utf8'));
  const inputs = Object.keys(fixtureManifest.files).map(path => {
    const bytes = new Uint8Array(readFileSync(new URL(`../mugen/fixtures/g05-viewer-v1/${path}`, import.meta.url)));
    assert.deepEqual({ bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }, fixtureManifest.files[path]);
    return { path, bytes };
  });
  const first = await importMugenCharacter(await createMugenVfs(inputs), { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });
  const second = await importMugenCharacter(await createMugenVfs([...inputs].reverse()), { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });
  const model = createMugenCharacterModel(first.package, first.metadata);
  assert.equal(first.encoded.packageSha256, fixtureManifest.expected.packageSha256);
  assert.equal(second.encoded.packageSha256, fixtureManifest.expected.packageSha256);
  assert.deepEqual(first.encoded.bytes, second.encoded.bytes);
  const local = await importMugenCharacter(await createMugenVfs(inputs), { contentRole: 'local-content', entryDef: 'hero.def', entryKind: 'character' });
  assert.equal(local.encoded.packageSha256, fixtureManifest.expected.browserLocalPackageSha256);
  const expectedInventory = Object.fromEntries(Object.entries(fixtureManifest.expected).filter(([key]) => !key.toLowerCase().endsWith('packagesha256')));
  assert.deepEqual({
    actions: model.actions.length,
    elements: model.actions.reduce((sum, value) => sum + value.elementCount, 0),
    sprites: model.sprites.length,
    rendererSprites: model.rendererSprites.length,
    referencedSprites: model.referencedSpriteCount,
    missingSpriteReferences: model.missingSpriteReferenceCount,
    palettes: model.palettes.length,
    diagnostics: model.diagnostics.length,
  }, expectedInventory);
});

const localKfmDirectory = process.env.MUGEN_KFM_DIR;
test('local official KFM directory imports through the complete viewer pipeline', { skip: !localKfmDirectory || !existsSync(localKfmDirectory) }, async () => {
  const inputs = readdirSync(localKfmDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => ({ path: entry.name, bytes: new Uint8Array(readFileSync(join(localKfmDirectory, entry.name))) }));
  assert.deepEqual(discoverMugenCharacterDefCandidates(inputs), ['kfm.def']);
  const imported = await importMugenCharacter(await createMugenVfs(inputs), { contentRole: 'local-content', entryDef: 'kfm.def', entryKind: 'character' });
  const model = createMugenCharacterModel(imported.package, imported.metadata);
  assert.deepEqual({ actions: model.actions.length, sprites: model.sprites.length, palettes: model.palettes.length }, { actions: 117, sprites: 281, palettes: 7 });
});

test('viewer model resolves linked sprite data once and reports catalog inventory exactly', async () => {
  const imported = await importMugenCharacter(await createMugenVfs(characterFixtureInputs()), { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });
  const model = createMugenCharacterModel(imported.package, imported.metadata);
  assert.deepEqual({ actions: model.actions.length, sprites: model.sprites.length, rendererSprites: model.rendererSprites.length, palettes: model.palettes.length, used: model.referencedSpriteCount, missing: model.missingSpriteReferenceCount }, { actions: 2, sprites: 2, rendererSprites: 1, palettes: 2, used: 2, missing: 1 });
  assert.equal(model.sprites[1].renderSpriteId, model.sprites[0].renderSpriteId);
  assert.strictEqual(model.sprites[1].pixels, model.sprites[0].pixels);
  assert.deepEqual(model.actions.map(value => [value.action.number, value.elementCount, value.action.totalTicks, value.warningCount, value.visualStatus]), [[0, 3, 6, 1, 'partial'], [10, 2, null, 0, 'drawable']]);
  assert.deepEqual(spriteReferenceResolver(model)(model.sprites[1].id), { id: model.sprites[1].id, axisX: 7, axisY: -8 });
});

test('viewer playback is fixed-tick across 30/60/120 Hz and defines seek/loop/step boundaries', async () => {
  const imported = await importMugenCharacter(await createMugenVfs(characterFixtureInputs()), { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });
  const model = createMugenCharacterModel(imported.package, imported.metadata);
  const action = model.actions[0];
  const states = [30, 60, 120].map(rate => {
    const controller = new MugenViewerController(action);
    for (let frame = 0; frame < rate; frame++) controller.advanceSeconds(1 / rate);
    const snapshot = controller.snapshot({ x: 100, y: 200, coordinateScale: 2, renderFraction: 0, spriteById: spriteReferenceResolver(model) });
    return { state: controller.state(), frame: snapshot.frameIndex, spriteId: snapshot.render.spriteId, clsn1: snapshot.clsn1, clsn2: snapshot.clsn2 };
  });
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[1], states[2]);

  const controller = new MugenViewerController(action);
  controller.setLoop(false); controller.advanceSeconds(10);
  assert.deepEqual({ tick: controller.tick, playing: controller.playing }, { tick: 5, playing: false });
  controller.first(); controller.stepElement(1); assert.equal(controller.tick, 2);
  controller.stepElement(1); assert.equal(controller.tick, 4);
  controller.stepElement(-1); assert.equal(controller.tick, 2);
  controller.last(); assert.equal(controller.tick, 5);
  controller.select(model.actions[1]); controller.last(); assert.equal(controller.tick, 0, 'zero-time elements are skipped before the infinite final frame');
  assert.deepEqual(cueOccurrences(action, 2, 0, 14), [2, 6, 10, 14], 'audio cues inside LoopStart repeat on every visual loop');
  assert.deepEqual(cueOccurrences(action, 2, 0, 14, false), [2], 'state-time audio cues do not repeat with the AIR loop');
});

test('viewer audio sends identifier-safe events for action ids containing paths and fragments', async () => {
  const requests = [];
  const mixer = {
    setMasterVolume() {}, async unlock() {}, async resume() {}, async suspend() {}, stop() { return 0; }, removeBuffer() { return true; },
    async decodeAndInstall() {}, play(request) { requests.push(request); return 'voice:1'; }, dispose() {},
  };
  const audio = new MugenViewerAudio(mixer);
  const sound = { id: 'kfm.snd#sound:0', group: 0, item: 0, encodedSha256: 'a'.repeat(64), encodedBase64: 'UklGRgAAAAAAAAAA' };
  const action = { id: 'characters/kfm/kfm.air#action:200', audioCues: [{ sound, tick: 0, channel: -1, volume: 1, pan: 0, frequency: 1, loop: false, repeatOnLoop: false }] };
  audio.select(action, false); audio.playAtTick(action, 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 1);
  assert.match(requests[0].eventId, /^[A-Za-z0-9_.:-]+$/u);
  assert.doesNotMatch(requests[0].eventId, /[/#]/u);
  assert.match(requests[0].channel, /^[A-Za-z0-9_.:-]+$/u);
  audio.dispose();
});

test('viewer product is manifest-backed and exposes required controls without private Engine imports', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const entry = manifest.entries.find(value => value.id === 'mugen');
  assert.equal(entry.entry, 'mugen/main.ts');
  assert.equal(entry.capabilities.includes('experimental-indexed-sprite'), true);
  const html = readFileSync(new URL('../mugen/charactorPreview.html', import.meta.url), 'utf8');
  for (const id of ['directory-input', 'entry-select', 'action-search', 'action-filter', 'timeline', 'palette-select', 'debug-clsn1', 'debug-clsn2', 'viewer-canvas', 'visual-notice']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /href="\.\/index\.html"/u);
  const htmlRevision = html.match(/dist\/charactorPreview\.js\?v=([A-Za-z0-9._-]+)/u)?.[1];
  assert.ok(htmlRevision, 'preview HTML must version its module entry');
  assert.match(html, /<hy-virtual-list[^>]+id="action-list"[^>]+item-height="58"[^>]+overscan="4"/u);
  for (const id of ['entry-select', 'action-filter', 'speed-select', 'palette-select', 'background-select']) assert.match(html, new RegExp(`<hy-select[^>]+id="${id}"`));
  const previewSource = readFileSync(new URL('../mugen/charactorPreview.ts', import.meta.url), 'utf8');
  assert.match(previewSource, /value: 'audio', label: '携带音频'/u);
  assert.match(previewSource, /filter === 'audio' && value\.audioCues\.length === 0/u);
  assert.match(previewSource, /value: 'blank', label: '逻辑空动作'/u);
  assert.match(previewSource, /value: 'missing', label: '当前 SFF 无素材'/u);
  for (const id of ['loop-toggle', 'debug-origin', 'debug-axis', 'debug-bounds', 'debug-clsn1', 'debug-clsn2']) assert.match(html, new RegExp(`<hy-checkbox[^>]+id="${id}"`));
  assert.match(html, /<hy-range[^>]+id="volume-control"/u);
  assert.doesNotMatch(html, /<select\b|type="checkbox"/u);
  const source = readFileSync(new URL('../mugen/charactorPreview.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:\/src\/|\.\.\/\.\.\/Engine|localStorage|sessionStorage|fetch\s*\()/);
  assert.match(source, /createMugenImportWorkerClient/);
  const sourceRevision = source.match(/VIEWER_BUILD_REVISION = '([A-Za-z0-9._-]+)'/u)?.[1];
  assert.ok(sourceRevision, 'preview source must declare its build revision');
  assert.equal(htmlRevision, sourceRevision, 'preview HTML and Worker cache revisions must stay synchronized');
  assert.match(source, /url\.searchParams\.set\('v', VIEWER_BUILD_REVISION\)/u);
  assert(source.indexOf('this.#bindImportControls()') < source.indexOf('await this.#view.init()'), 'directory import must remain available when WebGPU initialization fails');
  assert.match(source, /from '@haiyue\/ui\/virtual-list'/u);
  assert.match(source, /from '@haiyue\/ui\/(?:select|checkbox|range)'/u);
  assert.match(source, /MugenViewerAudio/u);
  assert.match(source, /scriptProfile: 'none'/u);
  assert.doesNotMatch(source, /scriptProfile: 'g08-minimal'/u);
  assert.match(source, /this\.#actionList\.items = actions/u);
  assert.match(source, /this\.#actionList\.items = actions;\s*(?:\/\/[\s\S]*?\n\s*)*this\.#actionList\.refresh\(\)/u);
  assert(source.indexOf('this.#renderModel(result.packageSha256)') < source.indexOf('await this.#view.install(model, abortController.signal)'), 'action catalog must be committed before optional GPU atlas upload');
  assert.match(source, /if \(this\.#view\.model === model\)/u);
  assert.match(source, /Virtual action window became empty/u);
  assert.match(source, /Action data exists but the virtual window has no rows/u);
  assert.match(source, /console\.error\('\[MUGEN viewer\] Operation failed\.'/u);
  assert.match(source, /console\.error\('\[MUGEN viewer\] Preview initialization failed\.'/u);
  assert.match(source, /console\.error\('\[MUGEN viewer\] WebGPU initialization failed/u);
  assert.doesNotMatch(source, /querySelectorAll<MugenActionListItem>\('mugen-action-list-item'\)/u);
  const selectActionSource = source.match(/#selectAction\(action: MugenViewerAction\): void \{[\s\S]*?\n {2}\}/u)?.[0] ?? '';
  assert.doesNotMatch(selectActionSource, /actionList\.refresh\(\)/u, 'selection must not rebuild the focused virtual window');
  assert.doesNotMatch(source, /for \(const action of actions\).*append/u);
  const itemSource = readFileSync(new URL('../mugen/viewer/MugenActionListItem.ts', import.meta.url), 'utf8');
  assert.match(itemSource, /class MugenActionListItem extends HTMLElement/u);
  assert.match(itemSource, /const selection: \{ current: MugenActionListItem \| null \} = \{ current: null \}/u);
  assert.match(itemSource, /this\.#button\.addEventListener\('click', \(\) => this\.select\(\)\)/u);
  assert.match(itemSource, /selection\.current\.deselect\(\)/u);
  assert.match(itemSource, /if \(selection\.current === this\) selection\.current = null/u);
  assert.match(itemSource, /attachShadow\(\{ mode: 'open' \}\)/u);
  assert.match(itemSource, /set selected\(value: boolean\)/u);
  assert.match(itemSource, /customElements\.define\(ELEMENT_NAME, MugenActionListItem\)/u);
  const virtualListSource = readFileSync(new URL('../../node_modules/@haiyue/ui/dist/virtual-list.js', import.meta.url), 'utf8');
  assert.doesNotMatch(virtualListSource, /row\.slot\s*=\s*['"]items['"]/u, 'virtual rows must not use asynchronously distributed light DOM slots');
  assert.match(virtualListSource, /this\._window\.replaceChildren\(\.\.\.rows\)/u, 'virtual rows must be replaced synchronously inside the shadow window');
  const preferences = readFileSync(new URL('../mugen/viewer/MugenViewerPreferences.ts', import.meta.url), 'utf8');
  assert.match(preferences, /SingleSlotGameSave/);
  assert.doesNotMatch(preferences, /entryDef|sourcePath|packageBytes/);
});

function characterFixtureInputs() {
  const act = new Uint8Array(768);
  for (let index = 0; index < act.length; index++) act[index] = index & 255;
  return [
    input('hero.def', '[Info]\nname = "Viewer Fighter"\ndisplayname = "Viewer Fighter EX"\nauthor = "Haiyue Fixture"\nmugenversion = 1.1\nlocalcoord = 640,360\n[Files]\ncmd=hero.cmd\nsprite=hero.sff\nanim=hero.air\npal1=hero.act\n'),
    input('hero.cmd', '[Command]\nname=x\ncommand=x\n'),
    { path: 'hero.sff', bytes: buildLinkedSffV1() },
    { path: 'hero.act', bytes: act },
    input('hero.air', `[Begin Action 0]
Clsn2Default: 1
Clsn2[0] = -5,-10,5,0
0,0,0,0,2
LoopStart
1,0,3,-2,2,H,AS256D0
Clsn1: 1
Clsn1[0] = 0,-8,8,-2
99,0,0,0,2

[Begin Action 10]
0,0,0,0,0
1,0,0,0,-1
`),
  ];
}

function buildLinkedSffV1() {
  const palette = new Uint8Array(768);
  palette.set([20, 100, 220], 3);
  const first = pcx8(2, 1, Uint8Array.of(0, 1), palette);
  const records = [
    { group: 0, item: 0, axisX: 3, axisY: 4, link: 0, shared: false, data: first },
    { group: 1, item: 0, axisX: 7, axisY: -8, link: 0, shared: true, data: null },
  ];
  const output = new Uint8Array(512 + records.reduce((sum, record) => sum + 32 + (record.data?.byteLength ?? 0), 0));
  output.set(UTF8.encode('ElecbyteSpr\0'));
  output.set([0, 0, 0, 1], 12);
  const view = new DataView(output.buffer);
  view.setUint32(20, records.length, true); view.setUint32(24, 512, true);
  let offset = 512;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const next = index + 1 < records.length ? offset + 32 + (record.data?.byteLength ?? 0) : 0;
    view.setUint32(offset, next, true); view.setUint32(offset + 4, record.data?.byteLength ?? 0, true);
    view.setInt16(offset + 8, record.axisX, true); view.setInt16(offset + 10, record.axisY, true);
    view.setUint16(offset + 12, record.group, true); view.setUint16(offset + 14, record.item, true); view.setUint16(offset + 16, record.link, true);
    output[offset + 18] = record.shared ? 1 : 0;
    if (record.data) output.set(record.data, offset + 32);
    offset = next;
  }
  return output;
}

function pcx8(width, height, pixels, palette) {
  const output = new Uint8Array(128 + pixels.byteLength + 769);
  const view = new DataView(output.buffer);
  output.set([10, 5, 0, 8], 0); view.setUint16(8, width - 1, true); view.setUint16(10, height - 1, true);
  output[65] = 1; view.setUint16(66, width, true); output.set(pixels, 128);
  output[128 + pixels.byteLength] = 0x0c; output.set(palette, 129 + pixels.byteLength);
  return output;
}

function input(path, source) { return { path, bytes: UTF8.encode(source) }; }
