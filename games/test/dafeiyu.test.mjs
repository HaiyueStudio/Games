import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { buildGameImageAtlas, gameImageAtlasPlugin } from '../../scripts/game-image-atlas.mjs';
import { decodePng } from '../../scripts/png-rgba.mjs';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { decodeMetadata, parseMetadata, readBabaLevel } = await import('../dafeiyu/levels/baba-format.ts');
const { INTRO, OVERWORLD, builtinPack, localPacks } = await import('../dafeiyu/levels/pack.ts');
const { islandOverworld } = await import('../dafeiyu/levels/island.ts');
const { Campaign } = await import('../dafeiyu/rules/campaign.ts');
const { Puzzle } = await import('../dafeiyu/rules/game.ts');
const { readRules } = await import('../dafeiyu/rules/syntax.ts');
const { WorldEditor, isWorldDraft, newDraft, packFromDraft } = await import('../dafeiyu/levels/editor.ts');
const { mapRoutes } = await import('../dafeiyu/rendering/map-routes.ts');
hook.deregister();

const buffer = bytes => Uint8Array.from(bytes).buffer;
const read = name => readFile(new URL('../dafeiyu/levels/' + name, import.meta.url));
async function fixture(id) {
  return readBabaLevel(buffer(await read(id + '.l')), (await read(id + '.ld')).toString(), id);
}
const sequences = ['rrrrrrr', 'rrdddrrrrruuu', 'rrrdrdd', 'rrrrrrrr', 'rrrrrrrduur'];
const direction = { r: 0, u: 1, l: 2, d: 3, '.': 'wait' };

test('the release image atlas fits the sprite sheets with transparent separation', async () => {
  const config = resolve(import.meta.dirname, '../dafeiyu/atlas.config.json');
  const { png, info } = buildGameImageAtlas(config);
  const { width, height, data } = decodePng(png);
  assert.ok(width <= 1536 && height <= 1536);
  assert.match(info.url, /^\.\/assets\/atlas\.build\.png\?v=[a-f0-9]{16}$/);
  const loose = await Promise.all(Object.keys(info.frames).map(file => readFile(new URL('../dafeiyu/assets/' + file, import.meta.url))));
  assert.ok(png.length < loose.reduce((sum, file) => sum + file.length, 0));
  const dimensions = { 'tiles.png': [768, 768], 'box.png': [224, 224], 'rule-boxes.png': [384, 256],
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
  const link = (id, x, y, state) => ({ ...base.links[0], id, x, y, state });
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
