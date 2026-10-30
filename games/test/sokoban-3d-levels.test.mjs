import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSasquatch, prepareLevelMap } from '../sokoban-3d/rules/levels.ts';
import { LEVEL_SET_VERSION, isCompatibleLevel, validSavedBoard } from '../sokoban-3d/rules/save.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(repositoryRoot, ...parts), 'utf8');
const levelsFile = JSON.parse(read('games', 'sokoban-3d', 'levels.json'));
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function pointKey(x, y) {
  return `${x},${y}`;
}

function parseLevel(level) {
  const walls = new Set();
  const targets = new Set();
  const boxes = [];
  let player = null;
  level.map.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const key = pointKey(x, y);
      if (cell === '#') walls.add(key);
      if (cell === '.' || cell === '*' || cell === '+') targets.add(key);
      if (cell === '$' || cell === '*') boxes.push([x, y]);
      if (cell === '@' || cell === '+') player = [x, y];
    });
  });
  return { walls, targets, boxes, player };
}

function reachableCells(start, walls, boxKeys) {
  const reachable = new Set([pointKey(...start)]);
  const queue = [start];
  let cursor = 0;
  while (cursor < queue.length) {
    const [x, y] = queue[cursor++];
    for (const [dx, dy] of directions) {
      const next = [x + dx, y + dy];
      const key = pointKey(...next);
      if (walls.has(key) || boxKeys.has(key) || reachable.has(key)) continue;
      reachable.add(key);
      queue.push(next);
    }
  }
  return reachable;
}

function isCornerDeadlock(box, walls, targets) {
  const [x, y] = box;
  if (targets.has(pointKey(x, y))) return false;
  const horizontalWall = walls.has(pointKey(x - 1, y)) || walls.has(pointKey(x + 1, y));
  const verticalWall = walls.has(pointKey(x, y - 1)) || walls.has(pointKey(x, y + 1));
  return horizontalWall && verticalWall;
}

function isSolvable(level, stateLimit = 1_000_000) {
  const { walls, targets, boxes, player } = parseLevel(level);
  const encode = (reachable, nextBoxes) => `${[...reachable].sort()[0]}|${nextBoxes.map(box => pointKey(...box)).sort().join(';')}`;
  const queue = [{ player, boxes }];
  const initialBoxKeys = new Set(boxes.map(box => pointKey(...box)));
  const visited = new Set([encode(reachableCells(player, walls, initialBoxKeys), boxes)]);
  let cursor = 0;

  while (cursor < queue.length && visited.size <= stateLimit) {
    const state = queue[cursor++];
    const boxKeys = new Set(state.boxes.map(box => pointKey(...box)));
    if (state.boxes.every(box => targets.has(pointKey(...box)))) return true;
    const reachable = reachableCells(state.player, walls, boxKeys);

    for (const box of state.boxes) {
      for (const [dx, dy] of directions) {
        const playerStand = [box[0] - dx, box[1] - dy];
        if (!reachable.has(pointKey(...playerStand))) continue;
        const boxDestination = [box[0] + dx, box[1] + dy];
        const destinationKey = pointKey(...boxDestination);
        if (walls.has(destinationKey) || boxKeys.has(destinationKey)) continue;
        if (isCornerDeadlock(boxDestination, walls, targets)) continue;
        const boxKey = pointKey(...box);
        const nextBoxes = state.boxes.map(candidate => pointKey(...candidate) === boxKey ? boxDestination : candidate);
        const nextPlayer = box;
        const nextBoxKeys = new Set(nextBoxes.map(candidate => pointKey(...candidate)));
        const nextReachable = reachableCells(nextPlayer, walls, nextBoxKeys);
        const key = encode(nextReachable, nextBoxes);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ player: nextPlayer, boxes: nextBoxes });
      }
    }
  }
  return false;
}

test('Sokoban 3D preserves sixteen starter levels and imports all fifty original Sasquatch III maps', () => {
  assert.equal(levelsFile.designReference.license, 'Apache-2.0');
  assert.match(levelsFile.designReference.url, /google-deepmind\/boxoban-levels/);
  assert.equal(levelsFile.levels.length, 66);
  assert.equal(new Set(levelsFile.levels.map(level => level.name)).size, levelsFile.levels.length);
  assert.deepEqual(levelsFile.levels.slice(0, 2).map(level => level.difficulty), ['beginner', 'beginner']);
  assert.ok(levelsFile.levels.slice(2, 10).every(level => level.difficulty === 'medium'));
  assert.ok(levelsFile.levels.slice(10, 16).every(level => level.difficulty === 'hard'));
  assert.deepEqual(levelsFile.levels.slice(2, 10).map(level => level.source.level), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(levelsFile.levels.slice(2, 10).every(level => level.source.file === 'medium/valid/003.txt'));
  assert.deepEqual(levelsFile.levels.slice(10, 16).map(level => level.source.level), [0, 1, 2, 3, 4, 5]);
  assert.ok(levelsFile.levels.slice(10, 16).every(level => level.source.file === 'hard/000.txt'));
  assert.equal(levelsFile.expansion.author, 'David W. Skinner');
  assert.equal(levelsFile.expansion.email, 'sasquatch@bentonrea.com');
  const raw = read('games', 'sokoban-3d', levelsFile.expansion.sourceFile);
  const hash = createHash('sha256').update(raw).digest('hex');
  assert.equal(hash, 'f975a40b00ba1fdf355f81521c7447ef40cf9395fa0f6858e00060c44d24e96f');
  assert.equal(hash, levelsFile.expansion.sha256);
  const source = parseSasquatch(raw);
  assert.equal(source.length, 50);
  levelsFile.levels.slice(16).forEach((level, index) => {
    assert.deepEqual(level.map, source[index].map, 'author map rows and exterior spaces remain unchanged');
    assert.equal(level.source.level, index + 1);
    assert.equal(level.source.collection, 'Sasquatch III');
    assert.equal(level.source.file, levelsFile.expansion.sourceFile);
    assert.equal(level.difficulty, 'hard');
  });
  assert.equal(new Set(levelsFile.levels.map(level => level.map.join('\n'))).size, 66, 'every layout is distinct');

  for (const level of levelsFile.levels) {
    const map = prepareLevelMap(level.map), width = map[0].length;
    assert.ok(width >= 6, `${level.name} should have a playable width`);
    assert.ok(map.every(row => row.length === width), `${level.name} runtime grid should be rectangular`);
    assert.ok(map[0].split('').every(cell => cell === '#' || cell === '_'), `${level.name} should have a closed top edge`);
    assert.ok(map.at(-1).split('').every(cell => cell === '#' || cell === '_'), `${level.name} should have a closed bottom edge`);
    assert.ok(map.every(row => '#_'.includes(row[0]) && '#_'.includes(row.at(-1))), `${level.name} should have closed side edges`);
    assert.ok(level.map.every(row => /^[# .$@*+]+$/.test(row)), `${level.name} should use standard Sokoban symbols`);

    const joined = level.map.join('');
    const players = [...joined].filter(cell => cell === '@' || cell === '+').length;
    const boxes = [...joined].filter(cell => cell === '$' || cell === '*').length;
    const targets = [...joined].filter(cell => cell === '.' || cell === '*' || cell === '+').length;
    assert.equal(players, 1, `${level.name} should contain one player`);
    assert.ok(boxes > 0, `${level.name} should contain boxes`);
    assert.equal(boxes, targets, `${level.name} should balance boxes and targets`);
    // Imported expert puzzles have up to 152 crates. Verify exact source fidelity above,
    // rather than treating a bounded toy solver's search limit as proof of impossibility.
    if (!level.source?.collection) assert.ok(isSolvable(level), `${level.name} should have a solution within the search budget`);
  }
});

test('Sokoban 3D level GUI persists completion and uses green completed buttons', () => {
  const source = read('games', 'sokoban-3d', 'app/bootstrap.ts');
  const page = read('games', 'sokoban-3d', 'index.html');

  assert.match(source, /GuiButton, GuiElement/);
  assert.match(source, /new SokobanHud/);
  assert.match(read('games','shared','ui/GameHud.ts'), /new GuiSystem/);
  assert.match(source, /completedLevels: \[\.\.\.this\.completedLevels\]\.sort/);
  assert.match(source, /this\.completedLevels\.add\(this\.levelIndex\)/);
  assert.equal(LEVEL_SET_VERSION, 3);
  assert.match(source, /levelSetVersion: LEVEL_SET_VERSION/);
  assert.match(source, /completed \? '#15803d'/, 'completed level buttons should use a green background');
  assert.match(page, /src="\.\/bundle\.js"/);
});

test('ragged XSB exterior spaces never become floor and invalid open boards are rejected', () => {
  const raw = [' ####', ' #@ #', ' #$.#', ' ####'];
  assert.deepEqual(prepareLevelMap(raw), ['_####', '_#@ #', '_#$.#', '_####']);
  assert.deepEqual(raw, [' ####', ' #@ #', ' #$.#', ' ####']);
  assert.throws(() => prepareLevelMap(['#####', '#@$. ', '#####']), /open boundary/);
  assert.throws(() => prepareLevelMap(['#####', '#@@.#', '#####']), /count/);
  assert.throws(() => prepareLevelMap(['#####', '#@x.#', '#####']), /symbols/);
  const last = prepareLevelMap(levelsFile.levels.at(-1).map);
  assert.equal(last[0].length, 29);
  assert.ok(last.some(row => row.includes('_')));
});

test('version-three migration preserves old core progress and discards replaced workshop board states', () => {
  assert.equal(isCompatibleLevel(15, 2), true);
  assert.equal(isCompatibleLevel(16, 2), false);
  assert.equal(isCompatibleLevel(31, 2), false);
  assert.equal(isCompatibleLevel(65, 3), true);
  assert.equal(isCompatibleLevel(1, undefined), true);
  assert.equal(isCompatibleLevel(2, undefined), false);
  assert.deepEqual([0, 1, 8, 15, 16, 31].filter(index => isCompatibleLevel(index, 2)), [0, 1, 8, 15]);
  const floor = new Set(['1,1', '2,1', '3,1']);
  assert.equal(validSavedBoard({ x: 1, y: 1 }, [{ x: 2, y: 1 }], 1, floor), true);
  assert.equal(validSavedBoard({ x: 0, y: 0 }, [{ x: 2, y: 1 }], 1, floor), false);
  assert.equal(validSavedBoard({ x: 1, y: 1 }, [{ x: 1, y: 1 }], 1, floor), false);
  assert.equal(validSavedBoard({ x: 1, y: 1 }, [{ x: 2, y: 1 }, { x: 2, y: 1 }], 2, floor), false);
});
