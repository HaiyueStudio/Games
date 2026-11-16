import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { decodeMetadata, parseMetadata, readBabaLevel } = await import('../dafeiyu/levels/baba-format.ts');
const { INTRO, OVERWORLD, builtinPack, localPacks } = await import('../dafeiyu/levels/pack.ts');
const { Campaign } = await import('../dafeiyu/rules/campaign.ts');
const { Puzzle } = await import('../dafeiyu/rules/game.ts');
const { readRules } = await import('../dafeiyu/rules/syntax.ts');
hook.deregister();

const buffer = bytes => Uint8Array.from(bytes).buffer;
const read = name => readFile(new URL('../dafeiyu/levels/' + name, import.meta.url));
async function fixture(id) {
  return readBabaLevel(buffer(await read(id + '.l')), (await read(id + '.ld')).toString(), id);
}
const sequences = ['rrrrrrr', 'rrdddrrrrruuu', 'rrrdrdd', 'rrrrrrrr', 'rrrrrrrduur'];
const direction = { r: 0, u: 1, l: 2, d: 3, '.': 'wait' };

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
  const level = await fixture(OVERWORLD[0]);
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
