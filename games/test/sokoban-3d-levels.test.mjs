import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

function isSolvable(level, stateLimit = 300_000) {
  const { walls, targets, boxes, player } = parseLevel(level);
  const encode = (nextPlayer, nextBoxes) => `${pointKey(...nextPlayer)}|${nextBoxes.map(box => pointKey(...box)).sort().join(';')}`;
  const queue = [{ player, boxes }];
  const visited = new Set([encode(player, boxes)]);
  let cursor = 0;

  while (cursor < queue.length && visited.size <= stateLimit) {
    const state = queue[cursor++];
    const boxKeys = new Set(state.boxes.map(box => pointKey(...box)));
    if (state.boxes.every(box => targets.has(pointKey(...box)))) return true;

    for (const [dx, dy] of directions) {
      const nextPlayer = [state.player[0] + dx, state.player[1] + dy];
      const nextKey = pointKey(...nextPlayer);
      if (walls.has(nextKey)) continue;
      let nextBoxes = state.boxes;
      if (boxKeys.has(nextKey)) {
        const boxDestination = [nextPlayer[0] + dx, nextPlayer[1] + dy];
        const destinationKey = pointKey(...boxDestination);
        if (walls.has(destinationKey) || boxKeys.has(destinationKey)) continue;
        nextBoxes = state.boxes.map(box => pointKey(...box) === nextKey ? boxDestination : box);
      }
      const key = encode(nextPlayer, nextBoxes);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ player: nextPlayer, boxes: nextBoxes });
    }
  }
  return false;
}

test('Sokoban 3D ships a validated sixteen-level progression', () => {
  assert.equal(levelsFile.designReference.license, 'Apache-2.0');
  assert.match(levelsFile.designReference.url, /google-deepmind\/boxoban-levels/);
  assert.equal(levelsFile.levels.length, 16);
  assert.equal(new Set(levelsFile.levels.map(level => level.name)).size, levelsFile.levels.length);

  for (const level of levelsFile.levels) {
    const width = level.map[0].length;
    assert.ok(width >= 6, `${level.name} should have a playable width`);
    assert.ok(level.map.every(row => row.length === width), `${level.name} should be rectangular`);
    assert.ok(level.map[0].split('').every(cell => cell === '#'), `${level.name} should have a closed top edge`);
    assert.ok(level.map.at(-1).split('').every(cell => cell === '#'), `${level.name} should have a closed bottom edge`);
    assert.ok(level.map.every(row => row[0] === '#' && row.at(-1) === '#'), `${level.name} should have closed side edges`);
    assert.ok(level.map.every(row => /^[# .$@*+]+$/.test(row)), `${level.name} should use standard Sokoban symbols`);

    const joined = level.map.join('');
    const players = [...joined].filter(cell => cell === '@' || cell === '+').length;
    const boxes = [...joined].filter(cell => cell === '$' || cell === '*').length;
    const targets = [...joined].filter(cell => cell === '.' || cell === '*' || cell === '+').length;
    assert.equal(players, 1, `${level.name} should contain one player`);
    assert.ok(boxes > 0, `${level.name} should contain boxes`);
    assert.equal(boxes, targets, `${level.name} should balance boxes and targets`);
    assert.ok(isSolvable(level), `${level.name} should have a solution within the search budget`);
  }
});

test('Sokoban 3D level GUI persists completion and uses green completed buttons', () => {
  const source = read('games', 'sokoban-3d', 'main.ts');
  const page = read('games', 'sokoban-3d', 'index.html');

  assert.match(source, /GuiButton, GuiElement, GuiRoot, GuiSystem/);
  assert.match(source, /completedLevels: \[\.\.\.this\.completedLevels\]\.sort/);
  assert.match(source, /this\.completedLevels\.add\(this\.levelIndex\)/);
  assert.match(source, /completed \? '#15803d'/, 'completed level buttons should use a green background');
  assert.match(page, /bundle\.js\?v=sokoban-3d-levels-gui-v2/);
});
