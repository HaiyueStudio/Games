import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PACMAN_MAZE_LAYOUT,
  availableDirections,
  chooseGhostDirection,
  ghostTarget,
  isWalkable,
  parseMaze,
  stepFrom,
} from '../pacman/PacmanRules.ts';

test('the Pac-Man maze is rectangular and every pellet is reachable', () => {
  const maze = parseMaze(PACMAN_MAZE_LAYOUT);
  assert.equal(maze.rows, 21);
  assert.equal(maze.columns, 25);
  assert.equal(maze.pelletCount, 204);

  const pending = [maze.pacmanStart];
  const visited = new Set([`${maze.pacmanStart.row},${maze.pacmanStart.column}`]);
  for (let index = 0; index < pending.length; index += 1) {
    const point = pending[index];
    assert.ok(point);
    for (const direction of availableDirections(maze, point)) {
      const next = stepFrom(maze, point, direction);
      const key = `${next.row},${next.column}`;
      if (!visited.has(key)) {
        visited.add(key);
        pending.push(next);
      }
    }
  }

  let reachedPellets = 0;
  for (let row = 0; row < maze.rows; row += 1) {
    for (let column = 0; column < maze.columns; column += 1) {
      const cell = maze.cells[row]?.charAt(column);
      if (cell === '.' || cell === 'o') {
        assert.equal(visited.has(`${row},${column}`), true, `unreachable pellet at ${row},${column}`);
        reachedPellets += 1;
      }
    }
  }
  assert.equal(reachedPellets, maze.pelletCount);
});

test('only ghosts can cross the ghost-house gate', () => {
  const maze = parseMaze(PACMAN_MAZE_LAYOUT);
  assert.equal(isWalkable(maze, 8, 12), false);
  assert.equal(isWalkable(maze, 8, 12, true), true);
});

test('the tunnel wraps deterministically in both directions', () => {
  const maze = parseMaze(PACMAN_MAZE_LAYOUT);
  assert.deepEqual(stepFrom(maze, { row: 9, column: 0 }, 'left'), { row: 9, column: 24 });
  assert.deepEqual(stepFrom(maze, { row: 9, column: 24 }, 'right'), { row: 9, column: 0 });
});

test('ghost routing approaches its target without reversing at a junction', () => {
  const maze = parseMaze(PACMAN_MAZE_LAYOUT);
  const direction = chooseGhostDirection({
    maze,
    position: { row: 3, column: 12 },
    current: 'right',
    target: { row: 1, column: 12 },
  });
  assert.equal(direction, 'up');
});

test('frightened routing uses the same stable priority while moving away', () => {
  const maze = parseMaze(PACMAN_MAZE_LAYOUT);
  const direction = chooseGhostDirection({
    maze,
    position: { row: 3, column: 12 },
    current: 'right',
    target: { row: 1, column: 12 },
    frightened: true,
  });
  assert.equal(direction, 'right');
});

test('each ghost personality produces its characteristic chase target', () => {
  const maze = parseMaze(PACMAN_MAZE_LAYOUT);
  const pacman = { row: 10, column: 10 };
  const blinky = { row: 7, column: 8 };
  assert.deepEqual(ghostTarget('blinky', { row: 2, column: 2 }, pacman, 'right', blinky, false, maze), pacman);
  assert.deepEqual(ghostTarget('pinky', { row: 2, column: 2 }, pacman, 'right', blinky, false, maze), { row: 10, column: 14 });
  assert.deepEqual(ghostTarget('inky', { row: 2, column: 2 }, pacman, 'right', blinky, false, maze), { row: 13, column: 16 });
  assert.deepEqual(ghostTarget('clyde', { row: 10, column: 11 }, pacman, 'right', blinky, false, maze), { row: 20, column: 0 });
});
