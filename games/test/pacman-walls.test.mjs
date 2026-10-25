import assert from 'node:assert/strict';
import test from 'node:test';
import { PACMAN_MAZE_LAYOUT } from '../pacman/rules/PacmanRules.ts';
import { buildWallSections } from '../pacman/rendering/wallLayout.ts';

const contains = (sections, row, column) => sections.some(section => (
  Math.abs(row - section.row) <= section.depth / 2 + 1e-9
  && Math.abs(column - section.column) <= section.width / 2 + 1e-9
));

for (const [layer, insetX, insetZ] of [['body', 0.06, 0.09], ['cap', 0.1, 0.15]]) {
  test(`Pac-Man ${layer} connects every adjacent wall without filling paths or gates`, () => {
    for (const cells of [PACMAN_MAZE_LAYOUT, ['### #', '# # #', '# ###'], [' # ', '###', ' # ']]) {
      const sections = buildWallSections(cells, insetX, insetZ);
      for (let row = 0; row < cells.length; row += 1) {
        for (let column = 0; column < cells[row].length; column += 1) {
          const wall = cells[row][column] === '#';
          assert.equal(contains(sections, row, column), wall, `${row},${column}`);
          if (!wall) continue;
          // Sample the full connector, including its sides, across each shared edge.
          for (const [dr, dc] of [[1, 0], [0, 1]]) {
            if (cells[row + dr]?.[column + dc] !== '#') continue;
            for (const along of [0.4, 0.45, 0.5, 0.55, 0.6]) {
              for (const across of [-0.49, 0, 0.49]) {
                const r = row + dr * along + dc * across * (1 - 2 * insetZ);
                const c = column + dc * along + dr * across * (1 - 2 * insetX);
                assert.ok(contains(sections, r, c), `gap at ${r},${c}`);
              }
            }
          }
        }
      }
      // Every rectangle stays inside wall tiles, including the outer boundary.
      for (const section of sections) {
        for (const dz of [-0.499, 0, 0.499]) {
          for (const dx of [-0.499, 0, 0.499]) {
            const row = Math.round(section.row + dz * section.depth);
            const column = Math.round(section.column + dx * section.width);
            assert.equal(cells[row]?.[column], '#');
          }
        }
      }
    }
  });
  test(`Pac-Man isolated ${layer} keeps its original silhouette`, () => {
    const [section] = buildWallSections(['#'], insetX, insetZ);
    assert.equal(section.row, 0);
    assert.equal(section.column, 0);
    assert.ok(Math.abs(section.width - (1 - 2 * insetX)) < 1e-9);
    assert.ok(Math.abs(section.depth - (1 - 2 * insetZ)) < 1e-9);
  });
  test(`Pac-Man straight ${layer} walls merge along both axes`, () => {
    const vertical = buildWallSections(['#', '#', '#'], insetX, insetZ);
    const horizontal = buildWallSections(['###'], insetX, insetZ);
    assert.equal(vertical.length, 1);
    assert.equal(horizontal.length, 1);
    assert.ok(Math.abs(vertical[0].depth - (3 - 2 * insetZ)) < 1e-9);
    assert.ok(Math.abs(horizontal[0].width - (3 - 2 * insetX)) < 1e-9);
  });
}
