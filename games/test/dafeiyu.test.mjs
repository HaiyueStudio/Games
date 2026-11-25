import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { buildGameImageAtlas, gameImageAtlasPlugin } from '../../scripts/game-image-atlas.mjs';
import { decodePng } from '../../scripts/png-rgba.mjs';
import { installSceneRenderProbe } from '../dafeiyu/verification/render-probe.mjs';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { decodeMetadata, parseMetadata, readBabaLevel } = await import('../dafeiyu/levels/baba-format.ts');
const { INTRO, OVERWORLD, builtinPack, localPacks } = await import('../dafeiyu/levels/pack.ts');
const { islandOverworld } = await import('../dafeiyu/levels/island.ts');
const { Campaign } = await import('../dafeiyu/rules/campaign.ts');
const { Puzzle } = await import('../dafeiyu/rules/game.ts');
const { readRules, RuleComplexityError } = await import('../dafeiyu/rules/syntax.ts');
const { WorldEditor, isWorldDraft, newDraft, packFromDraft } = await import('../dafeiyu/levels/editor.ts');
const { mapRoutes } = await import('../dafeiyu/rendering/map-routes.ts');
const { LatestAutosave } = await import('../dafeiyu/app/autosave.ts');
const { restoreRooms } = await import('../dafeiyu/app/restore.ts');
const { RetryAudioAsset } = await import('../dafeiyu/audio/retry-asset.ts');
const { levelLimits, LevelCapacityError } = await import('../dafeiyu/levels/limits.ts');
const { slots } = await import('../dafeiyu/levels/catalog.ts');
const { isOfficialProgress } = await import('../dafeiyu/rules/progress.ts');
hook.deregister();

const buffer = bytes => Uint8Array.from(bytes).buffer;
const read = name => readFile(new URL('../dafeiyu/levels/' + name, import.meta.url));
async function fixture(id) {
  return readBabaLevel(buffer(await read(id + '.l')), (await read(id + '.ld')).toString(), id);
}
const sequences = ['rrrrrrr', 'rrdddrrrrruuu', 'rrrdrdd', 'rrrrrrrr', 'rrrrrrrduur'];
const direction = { r: 0, u: 1, l: 2, d: 3, '.': 'wait' };

test('the render probe observes cached scene bundles only after their own command buffer is submitted', async () => {
  class Pass { setPipeline() {} draw() {} executeBundles() {} }
  class Encoder { beginRenderPass() { return new Pass(); } finish() { return {}; } }
  class Queue { submit() {} async onSubmittedWorkDone() {} }
  const mocks = { GPURenderPassEncoder: Pass, GPUCommandEncoder: Encoder, GPUQueue: Queue };
  const original = Object.fromEntries(Object.keys(mocks).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const nativeSubmit = Queue.prototype.submit;
  Object.assign(globalThis, mocks);
  const probe = installSceneRenderProbe();
  try {
    const queue = new Queue(), cached = { label: 'Dafeiyu 2D puzzle' };
    const record = bundle => {
      const encoder = new Encoder(); encoder.beginRenderPass().executeBundles([bundle]); return encoder.finish();
    };
    const sceneBuffer = record(cached);
    assert.equal(probe.stats().sceneSubmissions, 0, 'encoding alone is not a rendered frame');
    queue.submit([record({ label: 'GUI' })]);
    assert.equal(probe.stats().sceneSubmissions, 0, 'an unrelated submission is not a scene frame');
    queue.submit([sceneBuffer]);
    assert.equal(probe.stats().sceneSubmissions, 1);
    queue.submit([record(cached)]);
    assert.equal(probe.stats().sceneSubmissions, 2, 'the same cached bundle still renders on its next submission');
    const encoder = new Encoder(), pass = encoder.beginRenderPass();
    pass.setPipeline({ label: 'Dafeiyu 2D puzzle.pipeline.main' }); pass.draw(6);
    queue.submit([encoder.finish()]);
    await probe.completed();
    assert.deepEqual(probe.stats(), { sceneSubmissions: 3, bundles: 2, draws: 1 });
  } finally {
    probe.dispose();
    assert.equal(Queue.prototype.submit, nativeSubmit);
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('audio retries are bounded, coalesce concurrent requests and keep successful assets', async () => {
  let now = 0, attempts = 0, release;
  const errors = [];
  const asset = new RetryAudioAsset(() => {
    attempts++;
    if (attempts === 1) throw Error('HTTP 503');
    return new Promise(resolve => { release = resolve; });
  }, error => errors.push(error.message), () => now);
  await asset.prepare();
  for (let i = 0; i < 30; i++) asset.prepare();
  assert.equal(attempts, 1, 'gestures during the cooldown cannot spam the endpoint');
  assert.deepEqual(errors, ['HTTP 503']);
  now = 1000;
  const next = asset.prepare();
  assert.equal(asset.prepare(), next, 'one in-flight request');
  release(); await next;
  now = 50000; await asset.prepare();
  assert.equal(attempts, 2, 'a successful asset is not fetched on every resume');
  assert.deepEqual(asset.snapshot(), { status: 'ready', attempts: 2 });
});

test('disposing pending audio prevents retries and late failure reporting', async () => {
  let reject, now = 0;
  const errors = [];
  const asset = new RetryAudioAsset(() => new Promise((_, fail) => { reject = fail; }), error => errors.push(error), () => now);
  const job = asset.prepare();
  asset.dispose(); reject(Error('aborted')); await job;
  now = 50000; assert.equal(asset.prepare(), undefined);
  assert.equal(asset.snapshot().attempts, 1);
  assert.deepEqual(errors, []);
});

function denseRoom(counts) {
  const word = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const dword = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const code = slots.find(([, , name]) => name === 'baba')[1];
  const layers = Buffer.concat([word(counts.length), ...counts.map(count => {
    const grid = Buffer.alloc(128 * 128 * 2, 255);
    for (let i = 0; i < count; i++) grid.writeUInt16LE(code, i * 2);
    const compressed = deflateSync(grid);
    return Buffer.concat([dword(128), dword(128), Buffer.alloc(33), Buffer.from('MAIN'), dword(compressed.length), compressed]);
  })]);
  return buffer(Buffer.concat([Buffer.from('ACHTUNG!'), word(0x0105), Buffer.from('LAYR'), dword(layers.length), layers]));
}

test('small compressed and multilayer imports cannot expand past the shared unit budget', async () => {
  const tiny = denseRoom([16384]);
  assert.ok(tiny.byteLength < 256);
  await assert.rejects(readBabaLevel(tiny, '[general]\n', 'dense'), LevelCapacityError);
  await assert.rejects(readBabaLevel(denseRoom([6001, 6000]), '[general]\n', 'layered'), LevelCapacityError);
  const level = await readBabaLevel(denseRoom([levelLimits.units]), '[general]\n', 'boundary');
  const puzzle = new Puzzle(level);
  assert.equal(puzzle.state.units.length, levelLimits.units);
  const saved = { campaign: { completed: [], bonuses: [], conversions: [] }, rooms: [{ id: level.id, state: puzzle.state }] };
  assert.ok(isOfficialProgress(saved), 'an accepted board also fits the persistence contract');
  const oversized = { ...level, tiles: [...level.tiles, level.tiles[0]] };
  assert.throws(() => new Puzzle(oversized), LevelCapacityError, 'programmatic levels cannot bypass import validation');
  const map = { ...level, metadata: { general: { leveltype: '1', selectorx: '1', selectory: '1' } }, links: [
    { id: 'child', x: 1, y: 1, dir: 0, state: 2, style: 2, number: '1' },
  ] };
  assert.throws(() => new Puzzle(map), LevelCapacityError, 'markers and the selector need room too');
});

test('a turn that would exceed the unit budget preserves the board and its history', async () => {
  const base = await fixture('first-dive');
  const words = ['baba', 'is', 'more'].map((word, x) => ({ ...base.catalog.get('text_' + word), x: x + 1, y: 1, dir: 0 }));
  const level = { ...base, tiles: [...words, { name: 'baba', type: -1, layer: 16, x: 3, y: 4, dir: 0 },
    ...Array.from({ length: levelLimits.units - 4 }, () => ({ name: 'rock', type: -1, layer: 16, x: 8, y: 6, dir: 0 }))] };
  const puzzle = new Puzzle(level), before = puzzle.state;
  assert.throws(() => puzzle.move('wait'), LevelCapacityError);
  assert.equal(puzzle.state, before);
  assert.equal(puzzle.canUndo || puzzle.canRedo, false);
});

test('an oversized map conversion can be rolled back and retried without losing earlier replacements', async () => {
  const base = await fixture('first-dive');
  const level = { ...base, metadata: { general: { leveltype: '1', selectorx: '1', selectory: '1' } },
    tiles: Array.from({ length: levelLimits.units - 3 }, () => ({ name: 'rock', type: -1, layer: 16, x: 8, y: 6, dir: 0 })),
    links: ['a', 'b'].map((id, i) => ({ id, x: 2 + i, y: 4, dir: 0, state: 2, style: 2, number: String(i) })) };
  const campaign = new Campaign({ title: 'test', initial: 0, entries: [{ id: level.id, title: 'map', map: true, children: ['a', 'b'] }] });
  const puzzle = new Puzzle(level, undefined, campaign), before = puzzle.state, paths = puzzle.openPaths;
  campaign.replace(level.id, 'a', ['rock']);
  const prior = campaign.progress();
  const rollback = campaign.replace(level.id, 'b', ['flag', 'flag']);
  assert.throws(() => puzzle.refreshMap(), LevelCapacityError);
  assert.equal(puzzle.state, before);
  assert.equal(puzzle.openPaths, paths);
  rollback();
  assert.deepEqual(campaign.progress(), prior);
  campaign.replace(level.id, 'b', ['flag']);
  puzzle.refreshMap();
  assert.ok(puzzle.state.units.some(unit => unit.link === 'a' && unit.name === 'rock'));
  assert.ok(puzzle.state.units.some(unit => unit.link === 'b' && unit.name === 'flag'));
  assert.equal(puzzle.state.units.length, levelLimits.units);
});

test('autosave coalesces active writes and flushes the newest checkpoint', async () => {
  const writes = [];
  let release;
  const saver = new LatestAutosave(async value => {
    writes.push(value);
    if (value === 1) await new Promise(resolve => { release = resolve; });
  }, 10000);
  saver.checkpoint(1);
  saver.schedule(2);
  saver.schedule(3);
  saver.checkpoint(4);
  saver.schedule(5);
  assert.deepEqual(writes, [1], 'a running write is not duplicated');
  release();
  await saver.flush();
  assert.deepEqual(writes, [1, 5]);
  saver.schedule(6);
  saver.schedule(7);
  await saver.flush();
  assert.deepEqual(writes, [1, 5, 7]);
});

test('autosave retains failed progress for explicit retry without a background loop', async () => {
  const writes = [];
  let fail = true;
  const error = new Error('quota');
  const saver = new LatestAutosave(async data => { writes.push(data); if (fail) throw error; });
  saver.checkpoint(50);
  await assert.rejects(saver.flush(), error);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(writes, [50], 'failure stops background retries');
  fail = false;
  await saver.flush();
  assert.deepEqual(writes, [50, 50], 'retry needs no new edit');
  await saver.flush();
  assert.deepEqual(writes, [50, 50], 'a durable snapshot is not written again');
});

test('autosave retries the newest queued snapshot after failure and accepts later edits', async () => {
  const writes = [];
  let reject;
  const saver = new LatestAutosave(data => {
    writes.push(data);
    return data === 1 ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve();
  });
  saver.checkpoint(1);
  saver.schedule(2);
  const flush = saver.flush();
  reject(new Error('storage unavailable'));
  await assert.rejects(flush, /storage unavailable/);
  await saver.flush();
  assert.deepEqual(writes, [1, 2]);
  saver.schedule(3);
  await saver.flush();
  assert.deepEqual(writes, [1, 2, 3]);
});

test('autosave also retains a snapshot when the writer throws synchronously', async () => {
  let fail = true, value;
  const saver = new LatestAutosave(data => {
    if (fail) throw Error('unavailable');
    value = data;
    return Promise.resolve();
  });
  saver.checkpoint(4);
  await assert.rejects(saver.flush(), /unavailable/);
  fail = false;
  await saver.flush();
  assert.equal(value, 4);
});

test('saved room restoration rejects partial loads and retries the original nested board', async () => {
  const level = await fixture('first-dive');
  const parent = { ...level, id: 'map', metadata: { general: { leveltype: '1' } } };
  const puzzle = new Puzzle(level);
  puzzle.move(0);
  const saved = { campaign: { completed: [], bonuses: [], conversions: [] }, rooms: [
    { id: 'map', state: new Puzzle(parent).state, entrance: 'nested-entrance' },
    { id: level.id, state: { ...puzzle.state, turn: 50 } },
  ] };
  const original = structuredClone(saved);
  for (const unavailable of [parent.id, level.id]) {
    let fail = true;
    const pack = { title: 'test', initial: 0, entries: [parent, level].map(room => ({
      id: room.id, title: room.title, read: async () => {
        if (fail && room.id === unavailable) throw Error('HTTP 503');
        return room;
      },
    })) };
    const campaign = new Campaign(pack, saved.campaign), signal = new AbortController().signal;
    await assert.rejects(restoreRooms(pack, saved, campaign, signal), /HTTP 503/);
    assert.deepEqual(saved, original);
    fail = false;
    const rooms = await restoreRooms(pack, saved, campaign, signal);
    assert.deepEqual(rooms.map(room => room.puzzle.level.id), ['map', level.id]);
    assert.equal(rooms[0].entrance, 'nested-entrance');
    assert.deepEqual(rooms[1].puzzle.state, original.rooms[1].state);
  }
});

test('saved room restoration never substitutes an initial board for missing or incompatible rooms', async () => {
  const level = await fixture('first-dive');
  const pack = { title: 'test', initial: 0, entries: [{ id: level.id, title: level.title, read: async () => level }] };
  const campaign = new Campaign(pack), signal = new AbortController().signal;
  const saved = { campaign: campaign.progress(), rooms: [{ id: 'removed', state: new Puzzle(level).state }] };
  await assert.rejects(restoreRooms(pack, saved, campaign, signal), /missing/);
  saved.rooms[0].id = level.id;
  saved.rooms[0].state.units[0].x = level.width;
  await assert.rejects(restoreRooms(pack, saved, campaign, signal), /does not fit/);
});

test('the release image atlas fits the sprite sheets with transparent separation', async () => {
  const config = resolve(import.meta.dirname, '../dafeiyu/atlas.config.json');
  const { png, info } = buildGameImageAtlas(config);
  const { width, height, data } = decodePng(png);
  assert.ok(width <= 1600 && height <= 1600);
  assert.match(info.url, /^\.\/assets\/atlas\.build\.png\?v=[a-f0-9]{16}$/);
  const loose = await Promise.all(Object.keys(info.frames).map(file => readFile(new URL('../dafeiyu/assets/' + file, import.meta.url))));
  assert.ok(png.length < loose.reduce((sum, file) => sum + file.length, 0));
  const dimensions = { 'tiles.png': [768, 768], 'box.png': [224, 224], 'fungus.png': [224, 224], 'rule-boxes.png': [384, 256],
    'brick.png': [160, 160], 'pillar.png': [160, 160],
    'whale-walk/atlas.png': [640, 640], 'luna-walk/atlas.png': [640, 640] };
  const entries = Object.entries(info.frames);
  assert.deepEqual(Object.keys(info.frames).sort(), Object.keys(dimensions).sort());
  for (const [name, frame] of entries) {
    assert.deepEqual([frame.width, frame.height], dimensions[name]);
    assert.ok(frame.x >= 1 && frame.y >= 1 && frame.x + frame.width < width && frame.y + frame.height < height);
    const alpha = (x, y) => data[(y * width + x) * 4 + 3];
    assert.equal(alpha(frame.x - 1, frame.y + frame.height / 2), 0);
    assert.equal(alpha(frame.x + frame.width / 2, frame.y - 1), 0);
    for (const [otherName, other] of entries) if (otherName !== name) {
      assert.ok(frame.x + frame.width < other.x || other.x + other.width < frame.x ||
        frame.y + frame.height < other.y || other.y + other.height < frame.y);
    }
  }
  const dev = gameImageAtlasPlugin(config, true);
  const context = { addWatchFile: () => {}, emitFile: () => assert.fail('Development emits no image atlas') };
  assert.equal(dev.load.call(context, dev.resolveId('virtual:game-image-atlas')), 'export default null;');
});

test('redo restores exact turn states and clears when choosing another move or restarting', async () => {
  const puzzle = new Puzzle(await fixture('first-dive'));
  const states = [puzzle.state];
  for (let i = 0; i < 7; i++) { puzzle.move(0); states.push(puzzle.state); }
  assert.ok(puzzle.state.won);
  puzzle.undo(); puzzle.undo();
  assert.deepEqual(puzzle.state, states[5]);
  assert.ok(puzzle.canRedo);
  puzzle.redo();
  assert.deepEqual(puzzle.state, states[6]);
  puzzle.redo();
  assert.deepEqual(puzzle.state, states[7]);
  assert.equal(puzzle.canRedo, false);
  puzzle.undo();
  puzzle.move(1);
  const branch = puzzle.state;
  assert.equal(puzzle.canRedo, false);
  puzzle.redo();
  assert.equal(puzzle.state, branch);
  puzzle.undo();
  assert.ok(puzzle.canRedo);
  puzzle.reset();
  assert.equal(puzzle.canUndo || puzzle.canRedo, false);
  assert.deepEqual(puzzle.state, states[0]);
});

test('editor maps, nested rooms and stacked pieces survive draft JSON and play through the ordinary rule engine', async () => {
  const editor = new WorldEditor(newDraft());
  assert.ok(editor.addRoom(true));
  assert.ok(editor.paint({ x: 5, y: 4 }));
  assert.ok(editor.paint({ x: 3, y: 4 }, '@secret'));
  assert.ok(editor.paint({ x: 4, y: 4 }, '@secret'));
  editor.select(2);
  assert.ok(editor.addRoom(false));
  assert.ok(editor.paint({ x: 2, y: 4 }, '@link'));
  editor.select(3);
  assert.ok(editor.paint({ x: 3, y: 3 }, 'box'));
  assert.ok(!editor.paint({ x: 3, y: 3 }, 'box'));
  assert.ok(editor.paint({ x: 3, y: 3 }, 'box', true));
  assert.ok(editor.paint({ x: 3, y: 3 }, '@erase'));
  assert.ok(editor.undo());
  const draft = JSON.parse(JSON.stringify(editor.project));
  assert.ok(isWorldDraft(draft));
  const pack = packFromDraft(draft);
  const campaign = new Campaign(pack);
  const map = new Puzzle(await pack.entries[0].read(), undefined, campaign);
  assert.equal(map.selectedLink(), 'room-1');
  map.move(0);
  assert.equal(map.selectedLink(), 'room-1');
  const first = new Puzzle(await pack.entries[1].read(), undefined, campaign);
  for (let i = 0; i < 6; i++) first.move(0);
  assert.ok(first.state.won);
  campaign.completed.add(first.level.id);
  map.refreshMap();
  for (let i = 0; i < 3; i++) map.move(0);
  assert.equal(map.selectedLink(), 'room-2');
  const nested = new Puzzle(await pack.entries[2].read(), undefined, campaign);
  assert.equal(nested.selectedLink(), 'room-3');
  assert.equal((await pack.entries[3].read()).tiles.length, 2);
  draft.rooms[0].links[1].target = 'missing';
  assert.equal(isWorldDraft(draft), false);
});

test('all five original-format tutorial puzzles are solvable and support deterministic undo and restart', async () => {
  for (const [i, [id, title]] of INTRO.entries()) {
    const level = await fixture(id);
    assert.equal(level.title, title);
    assert.equal(level.unknown.length, 0);
    const puzzle = new Puzzle(level);
    const initial = puzzle.state;
    const route = sequences[i];
    for (const key of route) puzzle.move(direction[key]);
    assert.equal(puzzle.state.won, true, id);
    const solved = puzzle.state;
    puzzle.undo();
    assert.equal(puzzle.state.won, false, id);
    puzzle.move(direction[route.at(-1)]);
    assert.deepEqual(puzzle.state, solved, id);
    puzzle.reset();
    assert.deepEqual(puzzle.state, initial, id);
    assert.equal(puzzle.canUndo, false);
  }
});

test('the built-in map uses native links and reveals each route only after the preceding puzzle is solved', async () => {
  const pack = builtinPack(new AbortController().signal);
  assert.deepEqual(pack.entries.slice(0, pack.initial).map(entry => entry.id), INTRO.map(([id]) => id));
  assert.equal(pack.entries[pack.initial].id, OVERWORLD[0]);
  const level = islandOverworld(await fixture(OVERWORLD[0]), 'coral');
  assert.deepEqual(level.unknown, []);
  assert.deepEqual(level.links.map(link => link.id), INTRO.map(([id]) => id));
  const campaign = new Campaign(pack);
  const map = new Puzzle(level, undefined, campaign);
  assert.equal(map.openPaths.length, 0);
  map.move(direction.r);
  const travel = ['rrr', 'uuu', 'rrr', 'ddd'];
  for (const [index, [id]] of INTRO.entries()) {
    assert.equal(map.selectedLink(), id);
    assert.equal(campaign.parentOf(id), pack.initial);
    const puzzle = new Puzzle(await fixture(id), undefined, campaign);
    for (const command of sequences[index]) puzzle.move(direction[command]);
    assert.ok(puzzle.state.won, id);
    campaign.completed.add(id);
    map.refreshMap();
    assert.equal(map.openPaths.length, Math.min(index + 1, travel.length) * 2);
    for (const command of travel[index] ?? '') map.move(direction[command]);
    assert.equal(new Puzzle(level, map.state, campaign).selectedLink(), map.selectedLink());
  }
  assert.deepEqual(map.state.units.filter(unit => unit.marker).map(unit => unit.state), [3, 3, 3, 3, 3]);
});

test('an island shore uses rule-driven water and upgrades older map saves without resetting progress', async () => {
  const base = await fixture(OVERWORLD[0]);
  const tile = (name, x, y) => ({ ...base.catalog.get(name), x, y, dir: 0 });
  const original = { ...base, tiles: [...base.tiles, tile('baba', 4, 1),
    ...['text_baba', 'text_is', 'text_you'].map((name, i) => tile(name, 2 + i, 5))] };
  const level = islandOverworld(original, 'coral');
  assert.equal(level.edges.size, 0);
  assert.equal(level.links, original.links);
  assert.equal(level.paths, original.paths);
  const campaign = new Campaign({ entries: [] });
  campaign.completed.add('first-dive');
  const previous = new Puzzle(original, undefined, campaign);
  previous.move(direction.r);
  const saved = JSON.parse(JSON.stringify(previous.state));
  const map = new Puzzle(level, saved, campaign);
  const unit = name => map.state.units.find(unit => unit.name === name);
  const sea = map.context.at(4, 0).find(unit => unit.name === 'water');
  assert.ok(map.context.has(sea, 'stop'));
  assert.equal(map.state.turn, saved.turn);
  assert.equal(unit('cursor').x, saved.units.find(unit => unit.name === 'cursor').x);
  assert.deepEqual(map.openPaths, previous.openPaths);
  assert.ok(level.paths.every(({ x, y }) => !map.context.at(x, y).some(unit => unit.name === 'water')));
  map.move(direction.u);
  assert.equal(unit('baba').y, 1);

  const waterOnPath = { ...sea, id: map.state.nextId, x: 4, y: 6 };
  const flooded = { ...map.state, units: [...map.state.units, waterOnPath], nextId: map.state.nextId + 1 };
  const blocked = new Puzzle(level, flooded, campaign);
  blocked.move(direction.r);
  assert.equal(blocked.state.units.find(unit => unit.name === 'cursor').x, 3);
  const withoutStop = new Puzzle(level, { ...flooded, units: flooded.units.filter(unit => unit.name !== 'text_stop') }, campaign);
  withoutStop.move(direction.r);
  assert.equal(withoutStop.state.units.find(unit => unit.name === 'cursor').x, 4);
  withoutStop.move(direction.u);
  assert.equal(withoutStop.state.units.find(unit => unit.name === 'baba').y, 0);
});

test('native INI object overrides, map links, trailing equals and multiple file input are preserved', async () => {
  const metadata = '\uFEFF[GENERAL]\r\nname=Another=Title\r\nleveltype=1\r\nselectorX=3\r\nselectorY=4\r\n' +
    '[tiles]\r\nobject000_name=fofo\r\n[levels]\r\n0file=entry\r\n0X=3\r\n0Y=4\r\n0style=2\r\n0state=2\r\n' +
    '[paths]\r\n0object=object002\r\n0X=4\r\n0Y=4\r\n[specials]\r\n0data=sign,Hello=hi\r\n';
  const source = await read('first-dive.l');
  const level = await readBabaLevel(buffer(deflateSync(source)), metadata, 'map');
  assert.equal(level.title, 'Another=Title');
  assert.ok(level.tiles.some(tile => tile.name === 'fofo' && tile.type === -1));
  assert.equal(level.links[0].style, 2);
  assert.equal(level.paths[0].name, 'rock');
  assert.equal(level.metadata.specials['0data'], 'sign,Hello=hi');
  assert.equal(new Puzzle(level).selectedLink(), 'entry');
  assert.equal(parseMetadata(decodeMetadata(buffer(Buffer.from([0xff, 0xfe, ...Buffer.from(metadata.slice(1), 'utf16le')])))).general.name, 'Another=Title');
  const local = (name, contents) => ({ name, webkitRelativePath: 'Worlds/sample/' + name, arrayBuffer: async () => buffer(contents) });
  const packs = await localPacks([local('world_data.txt', Buffer.from('[general]\nname=Sample\nstart=Map\n')), local('Map.L', source),
    local('Map.LD', Buffer.from(metadata)), local('entry.l', source), local('entry.ld', Buffer.from('[general]\nname=entry\n')), local('lonely.l', source)]);
  assert.equal(packs[0].title, 'Sample');
  assert.equal(packs[0].entries.length, 2);
  assert.equal((await packs[0].entries[packs[0].initial].read()).id, 'map');
  await assert.rejects(readBabaLevel(buffer(source.subarray(0, 80)), metadata, 'truncated'), /Invalid Baba/);
});

test('native map counts bound entries and winning opens paths without bypassing gates', async () => {
  const source = await read('first-dive.l');
  const sidecar = '[general]\nleveltype=1\nselectorx=2\nselectory=4\nlevels=2\npaths=2\nspecials=0\n' +
    '[levels]\n0file=Intro\n0x=2\n0y=4\n0state=2\n1file=Next\n1x=4\n1y=4\n1state=1\n2file=Stale\n2x=2\n2y=4\n2state=2\n' +
    '[paths]\n0x=3\n0y=4\n1x=5\n1y=4\n1style=1\n1gate=1\n1requirement=2\n2x=1\n2y=4\n2style=1\n' +
    '[specials]\n0data=level,Stale\n0x=2\n0y=4\n';
  const level = await readBabaLevel(buffer(source), sidecar, 'map');
  assert.deepEqual(level.links.map(link => link.id), ['intro', 'next']);
  assert.equal(level.paths.length, 2);
  assert.equal(level.specials.length, 0);
  const campaign = new Campaign({ entries: [] });
  const map = new Puzzle(level, undefined, campaign);
  assert.equal(map.selectedLink(), 'intro');
  map.move(0);
  assert.equal(map.selectedLink(), 'intro');
  campaign.completed.add('intro');
  map.refreshMap();
  map.move(0);
  map.move(0);
  assert.equal(map.selectedLink(), 'next');
  map.move(0);
  assert.equal(map.selectedLink(), 'next');
  campaign.completed.add('next');
  map.refreshMap();
  map.move(0);
  assert.equal(map.state.units.find(unit => unit.name === 'cursor').x, 5);
});

test('map routes preview cardinal connections and become solid as rooms and gates unlock', async () => {
  const base = await fixture(OVERWORLD[0]);
  const path = (x, y, style = 0, gate = 0) => ({ ...base.paths[0], x, y, style, gate, requirement: 2 });
  const link = (id, x, y, state) => ({ ...base.links[0], id, entrance: `test:${x},${y}`, x, y, state });
  const level = { ...base, width: 10, height: 8, tiles: [], edges: new Set([26]),
    metadata: { general: { leveltype: '1', selectorx: '2', selectory: '2' } },
    links: [link('intro', 2, 2, 2), link('adjacent', 2, 1, 0), link('bend', 4, 4, 1), link('east', 7, 3, 0)],
    paths: [path(1, 2, 1), path(5, 0, 1), path(6, 2, 1), path(3, 2), path(4, 2), path(4, 1),
      path(4, 3), path(5, 3, 0, 1), path(6, 3)] };
  const campaign = new Campaign({ entries: [] });
  const map = new Puzzle(level, undefined, campaign);
  const cell = ({ x, y }) => `${x},${y}`;
  const segments = open => mapRoutes(map).segments.filter(segment => segment.open === open)
    .map(({ from, to }) => `${cell(from)}-${cell(to)}`).sort();
  const beyondGate = ['4,3-5,3', '5,3-6,3', '6,3-7,3'];
  assert.deepEqual(segments(true), ['1,2-2,2']);
  assert.deepEqual(segments(false), ['2,1-2,2', '2,2-3,2', '3,2-4,2', '4,1-4,2', '4,2-4,3', '4,3-4,4', ...beyondGate]);
  assert.equal(mapRoutes(map).paths.some(point => point.gate), false);

  campaign.completed.add('intro');
  map.refreshMap();
  assert.deepEqual(segments(true), ['1,2-2,2', '2,1-2,2', '2,2-3,2', '3,2-4,2', '4,1-4,2', '4,2-4,3', '4,3-4,4']);
  assert.deepEqual(segments(false), beyondGate);
  assert.deepEqual(mapRoutes(map).paths.filter(point => point.gate).map(cell), ['5,3']);
  for (const move of [direction.r, direction.r, direction.d, direction.r]) map.move(move);
  assert.equal(cell(map.state.units.find(unit => unit.name === 'cursor')), '4,3');

  campaign.completed.add('bend');
  map.refreshMap();
  assert.deepEqual(segments(true).slice(-3), beyondGate);
  assert.deepEqual(segments(false), []);
  assert.equal(mapRoutes(map).paths.some(point => point.gate), false);
  for (let i = 0; i < 3; i++) map.move(direction.r);
  assert.equal(map.selectedLink(), 'east');
});

test('native flower thresholds award one area flower and gate types use their own progress totals', async () => {
  const base = await fixture(OVERWORLD[0]);
  const link = (id, x, state = 2) => ({ ...base.links[0], id, entrance: `test:${x}`, x, y: 4, state });
  const gate = (type, x) => ({ ...base.paths[0], x, y: 4, style: 1, gate: type, requirement: 2 });
  const region = { ...base, id: 'region', links: [link('one', 2), link('two', 4), link('one', 5), link('optional-map', 6)], paths: [] };
  const root = { ...base, id: 'root', links: [link('region', 2), link('far', 4, 1)],
    paths: [gate(2, 3), gate(1, 7), gate(3, 8)] };
  region.paths = [gate(4, 3)];
  const pack = { title: 'Test campaign', initial: 0, entries: [
    { id: 'root', map: true, children: ['region', 'far'] },
    { id: 'region', map: true, children: ['one', 'two', 'one', 'optional-map'], clearCount: 2 },
    { id: 'optional-map', map: true, children: ['other'], clearCount: 1 },
  ] };
  const campaign = new Campaign(pack);
  ['one', 'optional-map'].forEach(id => campaign.completed.add(id));
  campaign.bonuses.set('one', 1);
  assert.deepEqual(campaign.access(region).flower, { petals: 1, totalPetals: 1, required: 2, flowers: 0 });
  assert.deepEqual(campaign.access(region).gates.map(({ path, collected }) => [path.gate, collected]), [[4, 1]]);
  assert.deepEqual(campaign.access(root).gates.map(({ path, collected }) => [path.gate, collected]), [[2, 0], [1, 1], [3, 1]]);
  campaign.completed.add('two');
  const reopened = new Campaign(pack, campaign.progress());
  const firstFlower = reopened.access(root);
  assert.deepEqual(firstFlower.states, [3, 1]);
  assert.deepEqual(firstFlower.gates.map(({ path, collected }) => [path.gate, collected]), [[2, 1], [3, 1]]);
  assert.deepEqual(reopened.access(region).gates, []);
  reopened.completed.add('other');
  const secondFlower = reopened.access(root);
  assert.deepEqual(secondFlower.states, [3, 2]);
  assert.equal(secondFlower.flower.flowers, 2);
  assert.deepEqual(secondFlower.gates.map(({ path }) => path.gate), [3]);
});

test('duplicate room links retain independent entrances after restoring a legacy map', async () => {
  const level = await fixture(OVERWORLD[0]);
  const [origin] = level.links;
  level.links = [{ ...origin, id: 'shared', entrance: 'near', state: 2 },
    { ...origin, id: 'shared', entrance: 'far', x: origin.x + 3, state: 1 }];
  level.paths = [];
  const pack = { title: 'Test', initial: 0, entries: [{ id: level.id, map: true, children: ['shared'] }, { id: 'shared' }] };
  const campaign = new Campaign(pack);
  const old = new Puzzle(level, undefined, campaign).state;
  for (const unit of old.units) delete unit.entrance;
  const map = new Puzzle(level, old, campaign);
  assert.equal(map.selectedEntrance().entrance, 'near');
  assert.deepEqual(map.state.units.filter(unit => unit.marker).map(({ entrance, state }) => [entrance, state]), [['near', 2], ['far', 1]]);
  campaign.replace(level.id, 'shared', ['rock'], 'near');
  const reloadedCampaign = new Campaign(pack, campaign.progress());
  const reloaded = new Puzzle(level, undefined, reloadedCampaign);
  assert.deepEqual(reloaded.state.units.filter(unit => unit.marker).map(({ entrance, name }) => [entrance, name]),
    [['near', 'rock'], ['far', 'level']]);
});

test('editing a gate and flower count preserves the old draft and uses native progression in playtest', async () => {
  const editor = new WorldEditor(newDraft());
  const original = editor.project;
  assert.ok(editor.setClearCount(1));
  assert.ok(editor.paint({ x: 3, y: 4 }, '@path'));
  assert.ok(editor.setPathGate(2, 1));
  assert.equal(original.rooms[0].clearCount, undefined);
  assert.equal(original.rooms[0].paths.length, 0);
  assert.equal(editor.project.rooms[1], original.rooms[1], 'untouched room is shared');
  const authored = JSON.parse(JSON.stringify(editor.project));
  assert.equal(isWorldDraft(authored), true);
  const pack = packFromDraft(authored);
  const campaign = new Campaign(pack);
  const puzzle = new Puzzle(await pack.entries[pack.initial].read(), undefined, campaign);
  assert.equal(puzzle.openPaths.length, 0);
  assert.equal(puzzle.gates[0].path.requirement, 1);
  campaign.completed.add('room-1');
  puzzle.refreshMap();
  assert.equal(puzzle.flower.flowers, 1);
  assert.equal(puzzle.openPaths.length, 1);
  assert.ok(editor.undo());
  assert.equal(editor.room.paths[0].condition, undefined);
  assert.deepEqual(authored.rooms[0].paths[0].condition, { gate: 2, requirement: 1 });
});

test('whole-room conversion replaces its own map marker and survives resetting the map', async () => {
  const level = await fixture('first-dive');
  level.tiles = ['level', 'is', 'baba'].map((word, index) => ({
    name: 'text_' + word, type: word === 'is' ? 1 : 0, x: index + 1, y: 1, dir: 0, layer: 20,
  }));
  const puzzle = new Puzzle(level);
  puzzle.move('wait');
  assert.deepEqual(puzzle.state.conversion, ['baba']);
  const parent = { ...level, id: 'map', tiles: [], links: [{ id: level.id, x: 3, y: 4, dir: 0, state: 2 }],
    metadata: { general: { leveltype: '1', selectorx: '3', selectory: '4' } } };
  const campaign = new Campaign({ entries: [] });
  const map = new Puzzle(parent, undefined, campaign);
  assert.equal(map.selectedLink(), level.id);
  campaign.replace(parent.id, level.id, puzzle.state.conversion);
  map.refreshMap();
  for (let pass = 0; pass < 2; pass++) {
    assert.equal(map.selectedLink(), undefined);
    assert.deepEqual(map.state.units.filter(unit => unit.name === 'baba').map(({ link, x, y }) => [link, x, y]), [[level.id, 3, 4]]);
    map.reset();
  }
  campaign.completed.add(level.id);
  campaign.bonuses.set(level.id, 1);
  campaign.replace(parent.id, level.id, ['baba', 'rock']);
  map.reset();
  const saved = JSON.parse(JSON.stringify({ state: map.state, campaign: campaign.progress() }));
  const restoredCampaign = new Campaign({ entries: [] }, saved.campaign);
  const restored = new Puzzle(parent, saved.state, restoredCampaign);
  assert.deepEqual(restored.state, map.state);
  assert.deepEqual(restoredCampaign.progress(), saved.campaign);
  restored.reset();
  assert.deepEqual(restored.state, map.state);
});

test('the automatic movement phase uses the rules from the start of the turn', async () => {
  const level = await fixture('first-dive');
  level.tiles = [[1, 1, 'baba', 'is', 'you'], [1, 3, 'hand', 'is', 'move']].flatMap(([x, y, ...words]) =>
    words.map((word, offset) => ({ ...level.catalog.get('text_' + word), x: x + offset, y, dir: 0 })));
  level.tiles.push({ name: 'baba', type: -1, x: 3, y: 4, dir: 0, layer: 16 },
    { name: 'hand', type: -1, x: 5, y: 4, dir: 0, layer: 16 });
  const puzzle = new Puzzle(level);
  puzzle.move(1);
  assert.equal(puzzle.state.units.find(unit => unit.name === 'hand').x, 6);
  assert.ok(!puzzle.context.rules.some(rule => rule.label === 'HAND IS MOVE'));
  puzzle.move('wait');
  assert.equal(puzzle.state.units.find(unit => unit.name === 'hand').x, 6);
});

async function movementBoard(sentences, pieces) {
  const level = await fixture('first-dive');
  const words = sentences.flatMap(([x, y, sentence]) => sentence.split(' ').map((word, offset) => ({
    ...level.catalog.get('text_' + word), x: x + offset, y, dir: 0,
  })));
  return { ...level, width: 14, height: 12, edges: new Set(),
    tiles: [...words, ...pieces.map(([name, x, y, dir = 0]) => ({ name, x, y, dir, type: -1, layer: 16 }))] };
}

test('defeat reports only units it destroys at their impact cells and replays the event on redo', async () => {
  const level = await movementBoard([[1, 1, 'baba is you'], [5, 1, 'keke is you and safe'], [1, 2, 'skull is defeat'],
    [5, 2, 'water is sink'], [1, 3, 'baba has fungus']], [
    ['baba', 3, 5], ['skull', 4, 5], ['keke', 3, 6], ['skull', 4, 6], ['baba', 3, 7], ['water', 4, 7],
  ]);
  const puzzle = new Puzzle(level);
  puzzle.move(0);
  const expected = [['baba', 4, 5]];
  const impacts = () => puzzle.defeated.map(({ name, x, y }) => [name, x, y]);
  assert.deepEqual(impacts(), expected);
  assert.ok(puzzle.state.units.some(unit => unit.name === 'fungus' && unit.x === 4 && unit.y === 5));
  assert.ok(puzzle.state.units.some(unit => unit.name === 'keke' && unit.x === 4 && unit.y === 6));
  assert.ok(!puzzle.state.units.some(unit => unit.name === 'baba'));
  assert.deepEqual(new Puzzle(level, puzzle.state).defeated, []);
  puzzle.undo();
  assert.deepEqual(impacts(), []);
  puzzle.redo();
  assert.deepEqual(impacts(), expected);
  puzzle.move('wait');
  assert.deepEqual(impacts(), []);
  puzzle.reset();
  assert.deepEqual(impacts(), []);
});

test('a shift enters a cell vacated by a perpendicular shift and faces the arriving units', async () => {
  const level = await movementBoard([[1, 1, 'belt is shift'], [5, 1, 'skull and rock is push'], [1, 2, 'wall is stop']], [
    ['belt', 2, 4], ['baba', 2, 4], ['rock', 2, 4],
    ['belt', 3, 4, 3], ['skull', 3, 4], ['wall', 4, 4],
  ]);
  for (const tiles of [level.tiles, level.tiles.toReversed()]) {
    const puzzle = new Puzzle({ ...level, tiles });
    puzzle.move('wait');
    for (const [name, x, y] of [['baba', 3, 4], ['rock', 3, 4], ['skull', 3, 5]]) {
      const unit = puzzle.state.units.find(unit => unit.name === name);
      assert.deepEqual([unit.x, unit.y, unit.dir], [x, y, 3], name);
    }
  }
});

test('shift facing respects the source sleep state and floating plane', async () => {
  const level = await movementBoard([[1, 1, 'belt is shift'], [1, 2, 'sword is shift and sleep'], [1, 3, 'rock is float']], [
    ['belt', 2, 5], ['baba', 2, 5], ['belt', 3, 5, 3], ['rock', 3, 5, 1],
    ['belt', 2, 7], ['box', 2, 7], ['sword', 3, 7, 3],
  ]);
  const puzzle = new Puzzle(level);
  puzzle.move('wait');
  for (const [name, x, y, dir] of [['baba', 3, 5, 3], ['rock', 3, 5, 1], ['box', 3, 7, 0]]) {
    const unit = puzzle.state.units.find(unit => unit.name === name);
    assert.deepEqual([unit.x, unit.y, unit.dir], [x, y, dir], name);
  }
});

test('a shut object consumes the first matching key from each open stack', async () => {
  const level = await movementBoard([[1, 1, 'door is shut'], [5, 1, 'key is open'], [9, 1, 'rock is open'],
    [1, 2, 'flag is open and float'], [1, 3, 'door has skull']], [
    ['door', 3, 5], ['key', 3, 5, 1], ['rock', 3, 5, 2], ['key', 3, 5, 2], ['rock', 3, 5, 1], ['flag', 3, 5],
  ]);
  const puzzle = new Puzzle(level);
  const initial = puzzle.state;
  puzzle.move('wait');
  const after = puzzle.state;
  assert.deepEqual(puzzle.context.at(3, 5).map(({ name, dir }) => [name, dir]),
    [['key', 2], ['rock', 1], ['flag', 0], ['skull', 0]]);
  puzzle.undo();
  assert.deepEqual(puzzle.state, initial);
  puzzle.move('wait');
  assert.deepEqual(puzzle.state, after);
});

test('a pushed box pulls the star behind it under a condition established before the move', async () => {
  const level = await movementBoard([[1, 1, 'baba is you'], [5, 1, 'box is push'], [1, 2, 'star on baba is pull']], [
    ['baba', 3, 3], ['star', 3, 3], ['box', 3, 4],
  ]);
  const puzzle = new Puzzle(level);
  puzzle.move(3);
  for (const [name, y] of [['baba', 4], ['star', 4], ['box', 5]]) {
    assert.equal(puzzle.state.units.find(unit => unit.name === name).y, y, name);
  }
});

test('a pulled star can push a box, and a blocked pull leaves the entire optional chain in place', async () => {
  const level = await movementBoard([[1, 1, 'baba is you'], [5, 1, 'star is pull'], [9, 1, 'wall is stop'],
    [1, 2, 'box on baba is push']], [['star', 3, 3], ['baba', 3, 4], ['box', 3, 4]]);
  for (const blocked of [false, true]) {
    const wall = { name: 'wall', x: 3, y: 4, dir: 0, type: -1, layer: 16 };
    const puzzle = new Puzzle(blocked ? { ...level, tiles: [...level.tiles, wall] } : level);
    puzzle.move(3);
    for (const [name, y] of [['baba', 5], ['star', blocked ? 3 : 4], ['box', blocked ? 4 : 5]]) {
      assert.equal(puzzle.state.units.find(unit => unit.name === name).y, y, name);
    }
  }
});

test('orthogonal and stacked words, conjunctions, NOT, and spelled words produce the intended rules', () => {
  function words(grid) {
    return grid.flatMap(([x, y, ...stack]) => stack.map(word => {
      const [name, type] = word.split(':');
      return { x, y, name: 'text_' + name, type: Number(type), layer: 20, dir: 0 };
    })).map((unit, id) => ({ ...unit, id }));
  }
  const units = words([[2, 1, 'baba:0'], [2, 2, 'is:1'], [2, 3, 'you:2', 'push:2'],
    [3, 1, 'and:6'], [4, 1, 'rock:0'], [5, 1, 'is:1'], [6, 1, 'not:4'], [7, 1, 'stop:2'],
    [0, 5, 'f:5'], [1, 5, 'l:5'], [2, 5, 'a:5'], [3, 5, 'g:5'], [4, 5, 'is:1'], [5, 5, 'win:2'],
    [0, 7, 'not:4'], [1, 7, 'baba:0'], [2, 7, 'is:1'], [3, 7, 'you:2']]);
  const rules = readRules(units, 10, 10);
  for (const label of ['BABA IS YOU', 'BABA IS PUSH', 'BABA IS NOT STOP', 'ROCK IS NOT STOP', 'FLAG IS WIN', 'NOT BABA IS YOU']) {
    assert.ok(rules.some(rule => rule.label === label), label);
  }
  assert.equal(rules.find(rule => rule.label === 'BABA IS YOU').ids.length, 3);
});

test('duplicate stacked words preserve every subject, rule and source ID regardless of order', () => {
  const words = ['baba', 'is', 'you', 'and', 'push', 'and', 'stop', 'and', 'win', 'and', 'float'];
  const types = { baba: 0, rock: 0, is: 1, you: 2, and: 6, push: 2, stop: 2, win: 2, float: 2 };
  let id = 0;
  const units = words.flatMap((word, x) => (x ? [word, word] : ['baba', 'rock']).map(name =>
    ({ id: id++, name: 'text_' + name, type: types[name], x, y: 1, dir: 0, layer: 20 })));
  const expected = ['BABA', 'ROCK'].flatMap(subject => ['YOU', 'PUSH', 'STOP', 'WIN', 'FLOAT'].map(target => `${subject} IS ${target}`)).sort();
  for (const order of [units, units.toReversed()]) {
    const rules = readRules(order, 14, 4);
    assert.deepEqual(rules.map(rule => rule.label).sort(), expected);
    for (const rule of rules) {
      assert.deepEqual(rule.ids.toSorted((a, b) => a - b),
        units.filter(unit => unit.x || unit.name === 'text_' + rule.subject.name).map(unit => unit.id));
    }
  }
});

test('genuinely excessive rule branches reject the board instead of returning partial rules', async () => {
  const level = await fixture('first-dive');
  const rows = ['baba', 'is', ...Array.from({ length: 10 }, () => ['you', 'and']).flat().slice(0, -1)];
  const units = rows.flatMap((word, x) => (word === 'you' ? ['you', 'push'] : [word]).map(name =>
    ({ ...level.catalog.get('text_' + name), x, y: 1, dir: 0 }))).map((tile, id) => ({ ...tile, id }));
  const complex = { ...level, width: 30, tiles: units };
  assert.throws(() => readRules(units, 30, level.height), RuleComplexityError);
  assert.throws(() => new Puzzle(complex), RuleComplexityError);
  const preview = Puzzle.preview(complex);
  assert.equal(preview.state.units.length, units.length, 'the editor can still render and erase every tile');
  assert.deepEqual(preview.context.rules, []);
});

test('a rejected rule update leaves the board and undo/redo history intact', async () => {
  const level = await fixture('first-dive');
  let fail = false;
  const puzzle = new Puzzle(level, undefined, undefined, (units, extra) => {
    if (fail) throw new RuleComplexityError();
    return readRules(units, level.width, level.height, extra);
  });
  puzzle.move(0);
  const saved = structuredClone(puzzle.state);
  puzzle.undo();
  const before = puzzle.state, context = puzzle.context;
  fail = true;
  assert.throws(() => puzzle.redo(), RuleComplexityError);
  assert.equal(puzzle.state, before);
  assert.equal(puzzle.context, context);
  assert.equal(puzzle.canUndo, false);
  assert.equal(puzzle.canRedo, true);
  assert.throws(() => puzzle.move(0), RuleComplexityError);
  assert.equal(puzzle.state, before);
  assert.equal(puzzle.canRedo, true);
  fail = false;
  puzzle.redo();
  assert.deepEqual(puzzle.state, saved);
  fail = true;
  assert.throws(() => puzzle.undo(), RuleComplexityError);
  assert.deepEqual(puzzle.state, saved);
  assert.equal(puzzle.canUndo, true);
});

test('mimic copies an object rule and a negative property overrides the copied grant', async () => {
  const level = await fixture('first-dive');
  const properties = [
    [1, 3, ['rock', 'mimic', 'baba']],
    [1, 2, ['rock', 'is', 'not', 'push']],
  ];
  for (const [x, y, words] of properties) for (const [offset, word] of words.entries()) {
    const name = 'text_' + word;
    level.tiles.push({ name, x: x + offset, y, layer: 20, dir: 0, type: word === 'mimic' ? 1 : level.catalog.get(name).type });
  }
  const puzzle = new Puzzle(level);
  const rocks = puzzle.state.units.filter(unit => unit.name === 'rock');
  assert.ok(rocks.every(unit => puzzle.context.has(unit, 'you')));
  assert.ok(rocks.every(unit => !puzzle.context.has(unit, 'push')));
  puzzle.move(0);
  assert.deepEqual(puzzle.state.units.filter(unit => unit.name === 'rock').map(unit => unit.x), rocks.map(unit => unit.x + 1));
});
