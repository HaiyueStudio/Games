import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandTriggeredSpecials,
  planMatchedClear,
  planSpecialSwap,
} from '../match-3/Match3SpecialRules.ts';
import { MATCH3_GEM_COLORS } from '../match-3/Match3Palette.ts';
import { createLightningSegments } from '../match-3/Match3LightningGeometry.ts';

const ROWS = 8;
const COLUMNS = 8;

test('the six gem colors keep a strong pairwise RGB separation', () => {
  assert.equal(MATCH3_GEM_COLORS.length, 6);
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let first = 0; first < MATCH3_GEM_COLORS.length; first++) {
    for (let second = first + 1; second < MATCH3_GEM_COLORS.length; second++) {
      const a = MATCH3_GEM_COLORS[first];
      const b = MATCH3_GEM_COLORS[second];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      minimumDistance = Math.min(minimumDistance, distance);
    }
  }
  assert.ok(minimumDistance >= 0.58, `minimum palette distance ${minimumDistance} is too small`);
  const red = MATCH3_GEM_COLORS[0];
  const yellow = MATCH3_GEM_COLORS[1];
  const green = MATCH3_GEM_COLORS[2];
  const redYellowDistance = Math.hypot(
    red[0] - yellow[0],
    red[1] - yellow[1],
    red[2] - yellow[2],
  );
  const yellowGreenDistance = Math.hypot(
    yellow[0] - green[0],
    yellow[1] - green[1],
    yellow[2] - green[2],
  );
  assert.ok(redYellowDistance >= 0.9, `red/yellow distance ${redYellowDistance} is too small`);
  assert.ok(yellowGreenDistance >= 0.85, `yellow/green distance ${yellowGreenDistance} is too small`);
});

test('rainbow lightning batches deterministic jagged bolts as independent segments', () => {
  const targets = [
    { id: 7, position: [3, 0, 0] },
    { id: 11, position: [0, 4, 0] },
  ];
  const first = createLightningSegments([0, 0, 0.5], targets, 3, 0, 0.5, 4);
  const sameFrame = createLightningSegments([0, 0, 0.5], targets, 3, 0, 0.5, 4);
  const nextFrame = createLightningSegments([0, 0, 0.5], targets, 3, 1, 0.5, 4);
  assert.equal(first.length, 2 * 4 * 2 * 3);
  assert.deepEqual(first, sameFrame);
  assert.notDeepEqual(first, nextFrame);
  assert.deepEqual([...first.slice(0, 3)], [0, 0, 0.5]);
  assert.deepEqual([...first.slice(21, 24)], [3, 0, 0.5]);
  assert.deepEqual([...first.slice(45, 48)], [0, 4, 0.5]);
});

test('four in a line retains the preferred cell as a colored bomb', () => {
  const grid = emptyGrid();
  for (let column = 2; column <= 5; column++) grid[3][column] = normal(2);
  const plan = planMatchedClear(grid, [{ row: 3, column: 5 }]);
  assert.equal(plan.matchedCellCount, 4);
  assert.equal(plan.clear.size, 3);
  assert.deepEqual(plan.spawns, [{
    position: { row: 3, column: 5 },
    special: 'bomb',
    color: 2,
    matchedCellCount: 4,
  }]);
});

test('five or more in a straight line creates a rainbow tile', () => {
  const grid = emptyGrid();
  for (let column = 1; column <= 6; column++) grid[4][column] = normal(4);
  const plan = planMatchedClear(grid, [{ row: 4, column: 4 }]);
  assert.equal(plan.matchedCellCount, 6);
  assert.equal(plan.clear.size, 5);
  assert.equal(plan.spawns[0]?.special, 'rainbow');
  assert.equal(plan.spawns[0]?.color, null);
  assert.deepEqual(plan.spawns[0]?.position, { row: 4, column: 4 });
});

test('an L/T/cross group of five or more creates a super bomb', () => {
  const grid = emptyGrid();
  grid[2][2] = normal(1);
  grid[2][3] = normal(1);
  grid[2][4] = normal(1);
  grid[3][2] = normal(1);
  grid[4][2] = normal(1);
  const plan = planMatchedClear(grid);
  assert.equal(plan.matchedCellCount, 5);
  assert.equal(plan.clear.size, 4);
  assert.deepEqual(plan.spawns[0], {
    position: { row: 2, column: 2 },
    special: 'super-bomb',
    color: 1,
    matchedCellCount: 5,
  });
});

test('bomb and super-bomb use radius one/two and recursively chain', () => {
  const bombGrid = filledGrid();
  bombGrid[3][3] = { color: 0, special: 'bomb' };
  assert.equal(expandTriggeredSpecials(bombGrid, new Set([indexOf(3, 3)])).size, 9);

  const superGrid = filledGrid();
  superGrid[3][3] = { color: 0, special: 'super-bomb' };
  assert.equal(expandTriggeredSpecials(superGrid, new Set([indexOf(3, 3)])).size, 25);

  const chainGrid = filledGrid();
  chainGrid[2][2] = { color: 0, special: 'bomb' };
  chainGrid[3][3] = { color: 1, special: 'super-bomb' };
  const chained = expandTriggeredSpecials(chainGrid, new Set([indexOf(2, 2)]));
  assert.equal(chained.has(indexOf(5, 5)), true);
});

test('bomb and super-bomb blasts cannot clear rainbow tiles', () => {
  const bombGrid = filledGrid();
  bombGrid[3][3] = { color: 0, special: 'bomb' };
  bombGrid[3][4] = { color: null, special: 'rainbow' };
  const bombClear = expandTriggeredSpecials(bombGrid, new Set([indexOf(3, 3)]));
  assert.equal(bombClear.has(indexOf(3, 4)), false);
  assert.equal(bombClear.size, 8);

  const superGrid = filledGrid();
  superGrid[3][3] = { color: 0, special: 'super-bomb' };
  superGrid[4][4] = { color: null, special: 'rainbow' };
  const superClear = expandTriggeredSpecials(superGrid, new Set([indexOf(3, 3)]));
  assert.equal(superClear.has(indexOf(4, 4)), false);
  assert.equal(superClear.size, 24);
});

test('an existing bomb inside a four-match is cleared instead of retained as the spawn', () => {
  const grid = emptyGrid();
  grid[3][2] = { color: 5, special: 'bomb' };
  grid[3][3] = normal(5);
  grid[3][4] = normal(5);
  grid[3][5] = normal(5);
  const plan = planMatchedClear(grid, [{ row: 3, column: 2 }]);
  assert.equal(plan.clear.has(indexOf(3, 2)), true);
  assert.notDeepEqual(plan.spawns[0]?.position, { row: 3, column: 2 });
});

test('rainbow plus a normal tile clears that color and triggers colored bombs', () => {
  const grid = filledGrid();
  grid[0][0] = { color: null, special: 'rainbow' };
  grid[0][1] = normal(3);
  grid[4][4] = { color: 3, special: 'bomb' };
  grid[5][5] = { color: null, special: 'rainbow' };
  const plan = planSpecialSwap(grid, { row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(plan?.kind, 'rainbow-color');
  assert.equal(plan?.targetColor, 3);
  assert.equal(plan?.clear.has(indexOf(0, 0)), true);
  assert.equal(plan?.clear.has(indexOf(4, 4)), true);
  assert.equal(plan?.clear.has(indexOf(5, 5)), false);
});

test('rainbow plus a bomb converts every matching color and explodes all neighborhoods', () => {
  const grid = filledGrid();
  grid[0][0] = { color: null, special: 'rainbow' };
  grid[0][1] = { color: 2, special: 'bomb' };
  grid[4][4] = normal(2);
  const expectedColorIndexes = allIndexes(grid, cell => cell.color === 2);
  const plan = planSpecialSwap(grid, { row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(plan?.kind, 'rainbow-bomb');
  assert.equal(plan?.conversion?.special, 'bomb');
  assert.deepEqual(plan?.conversion?.indexes, expectedColorIndexes);
  assert.equal(plan?.clear.has(indexOf(4, 5)), true);
  assert.equal(plan?.clear.has(indexOf(5, 4)), true);
});

test('rainbow plus a super bomb converts every matching color into super bombs and explodes radius two', () => {
  const grid = filledGrid();
  grid[0][0] = { color: null, special: 'rainbow' };
  grid[0][1] = { color: 4, special: 'super-bomb' };
  grid[4][4] = normal(4);
  grid[7][7] = { color: null, special: 'rainbow' };
  const expectedColorIndexes = allIndexes(grid, cell => cell.color === 4);
  const plan = planSpecialSwap(grid, { row: 0, column: 0 }, { row: 0, column: 1 });
  assert.equal(plan?.kind, 'rainbow-super-bomb');
  assert.equal(plan?.conversion?.special, 'super-bomb');
  assert.deepEqual(plan?.conversion?.indexes, expectedColorIndexes);
  assert.equal(plan?.clear.has(indexOf(4, 6)), true);
  assert.equal(plan?.clear.has(indexOf(6, 4)), true);
  assert.equal(plan?.clear.has(indexOf(7, 7)), false);
});

test('two swapped rainbow tiles clear every non-rainbow tile but preserve other rainbows', () => {
  const grid = filledGrid();
  grid[3][3] = { color: null, special: 'rainbow' };
  grid[3][4] = { color: null, special: 'rainbow' };
  grid[6][6] = { color: null, special: 'rainbow' };
  const plan = planSpecialSwap(grid, { row: 3, column: 3 }, { row: 3, column: 4 });
  assert.equal(plan?.kind, 'rainbow-rainbow');
  assert.equal(plan?.clear.has(indexOf(3, 3)), true);
  assert.equal(plan?.clear.has(indexOf(3, 4)), true);
  assert.equal(plan?.clear.has(indexOf(6, 6)), false);
  assert.equal(plan?.clear.size, 63);
});

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(null));
}

function filledGrid() {
  return Array.from({ length: ROWS }, (_, row) => Array.from(
    { length: COLUMNS },
    (_, column) => normal((row * 3 + column * 2) % 6),
  ));
}

function normal(color) {
  return { color, special: 'normal' };
}

function indexOf(row, column) {
  return row * COLUMNS + column;
}

function allIndexes(grid, predicate) {
  const indexes = new Set();
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const cell = grid[row][column];
      if (cell && predicate(cell)) indexes.add(indexOf(row, column));
    }
  }
  return indexes;
}
