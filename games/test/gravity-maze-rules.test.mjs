import assert from 'node:assert/strict';
import test from 'node:test';
import {
  floorSegments,
  generateMaze,
  hasWall,
  isHole,
  nextLevelSeed,
  openNeighbors,
} from '../gravity-maze/MazeRules.ts';

test('gravity maze generation is deterministic for a seed', () => {
  const first = generateMaze(12345);
  const second = generateMaze(12345);
  assert.deepEqual([...first.walls], [...second.walls]);
  assert.deepEqual(first.goal, second.goal);
  assert.deepEqual(first.holes, second.holes);
  assert.deepEqual(first.solution, second.solution);
  assert.notDeepEqual([...first.walls], [...generateMaze(54321).walls]);
});

test('generated maze is connected and every wall is symmetric', () => {
  const maze = generateMaze(9917);
  const pending = [maze.start];
  const visited = new Set([key(maze.start)]);
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    for (const next of openNeighbors(maze, current)) {
      const nextKey = key(next);
      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        pending.push(next);
      }
    }
  }
  assert.equal(visited.size, maze.rows * maze.columns);
  for (let row = 0; row < maze.rows; row += 1) {
    for (let column = 0; column < maze.columns; column += 1) {
      const cell = { row, column };
      if (column + 1 < maze.columns) {
        assert.equal(hasWall(maze, cell, 'east'), hasWall(maze, { row, column: column + 1 }, 'west'));
      }
      if (row + 1 < maze.rows) {
        assert.equal(hasWall(maze, cell, 'south'), hasWall(maze, { row: row + 1, column }, 'north'));
      }
    }
  }
});

test('goal is reachable by a hole-free solution and holes remain sparse', () => {
  for (const seed of [1, 2, 3, 77, 99881]) {
    const maze = generateMaze(seed);
    assert.deepEqual(maze.solution[0], maze.start);
    assert.deepEqual(maze.solution.at(-1), maze.goal);
    assert.ok(maze.solution.length > 1);
    assert.ok(maze.holes.length >= 2 && maze.holes.length <= 4);
    for (const hole of maze.holes) assert.equal(maze.solution.some(cell => key(cell) === key(hole)), false);
    for (let index = 1; index < maze.solution.length; index += 1) {
      assert.ok(openNeighbors(maze, maze.solution[index - 1]).some(cell => key(cell) === key(maze.solution[index])));
      assert.equal(isHole(maze, maze.solution[index]), false);
    }
  }
});

test('successive levels derive stable distinct seeds', () => {
  assert.equal(nextLevelSeed(42, 2), nextLevelSeed(42, 2));
  assert.notEqual(nextLevelSeed(42, 1), nextLevelSeed(42, 2));
  assert.throws(() => nextLevelSeed(42, 0), /positive integer/);
});

test('merged floor slabs cover every safe cell and leave every hole unsupported', () => {
  const maze = generateMaze(24680);
  const covered = new Set();
  for (const segment of floorSegments(maze)) {
    assert.ok(segment.startColumn <= segment.endColumn);
    for (let column = segment.startColumn; column <= segment.endColumn; column += 1) {
      const cell = { row: segment.row, column };
      assert.equal(isHole(maze, cell), false);
      assert.equal(covered.has(key(cell)), false, 'floor segments must not overlap logical cells');
      covered.add(key(cell));
    }
  }
  assert.equal(covered.size, maze.rows * maze.columns - maze.holes.length);
  for (const hole of maze.holes) assert.equal(covered.has(key(hole)), false);
});

function key(cell) { return `${cell.row},${cell.column}`; }
