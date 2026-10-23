import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzle, pieceCenter, groupCenter, rotateGroup, snapGroup, rotate } from '../jigsaw-puzzle/rules/model.ts';
import { pieceOutline } from '../jigsaw-puzzle/rules/outline.ts';
import { isJigsawPreferences } from '../jigsaw-puzzle/save/preferences.ts';

const puzzle = (rotation = true) => createPuzzle(3, 4, 1.5, rotation, 1042);
const group = (p, id) => p.groups.find(g => g.pieces.includes(id));
const near = (a, b) => { assert.ok(Math.abs(a.x - b.x) < 1e-8); assert.ok(Math.abs(a.y - b.y) < 1e-8); };

test('seeded pieces have flat outside edges and complementary internal curves', () => {
  const p = puzzle(); assert.deepEqual(p, puzzle());
  for (const piece of p.pieces) {
    const { row, col, edges } = piece;
    if (!row) assert.equal(edges[0], 0);
    if (!col) assert.equal(edges[3], 0);
    if (row === p.rows - 1) assert.equal(edges[2], 0);
    else assert.equal(edges[2], -p.pieces[piece.id + p.cols].edges[0]);
    if (col === p.cols - 1) assert.equal(edges[1], 0);
    else assert.equal(edges[1], -p.pieces[piece.id + 1].edges[3]);
    const path = pieceOutline(p.cellWidth, p.cellHeight, edges);
    assert.equal(path.at(-1).type, 'Z');
    assert.equal(path.filter(c => c.type === 'C').length, edges.filter(Boolean).length * 3);
  }
});
test('shared Bezier edges have identical control points when traversed in reverse', () => {
  const curves = edges => {
    const result = []; let previous;
    for (const command of pieceOutline(150, 100, edges)) {
      if (command.type === 'C') result.push([previous, command.a, command.b, command.p]);
      if (command.type !== 'Z') previous = command.p;
    }
    return result;
  };
  for (const sign of [-1, 1]) {
    const right = curves([0, sign, 0, 0]), left = curves([0, 0, 0, -sign]).reverse();
    right.forEach((curve, i) => curve.forEach((p, j) => near(p, { x: left[i][3-j].x + 150, y: left[i][3-j].y })));
    const bottom = curves([0, 0, sign, 0]), top = curves([-sign, 0, 0, 0]).reverse();
    bottom.forEach((curve, i) => curve.forEach((p, j) => near(p, { x: top[i][3-j].x, y: top[i][3-j].y + 100 })));
  }
});
test('snapping requires actual neighbors, common orientation and close transforms', () => {
  const p = puzzle(), a = group(p, 0), b = group(p, 1), far = group(p, 11);
  p.groups.forEach((g, i) => Object.assign(g, { x: 1000 + i * 500, y: 1000, angle: 0 }));
  Object.assign(a, { x: 100, y: 200 }); Object.assign(far, { x: 100, y: 200 });
  assert.equal(snapGroup(p, a, 10), 0);
  Object.assign(b, { x: 105, y: 200, angle: 1 }); assert.equal(snapGroup(p, a, 10), 0);
  b.angle = 0; b.x = 111; assert.equal(snapGroup(p, a, 10), 0);
  b.x = 105; assert.equal(snapGroup(p, a, 10), 1);
  assert.deepEqual(a.pieces, [0, 1]); assert.equal(a.x, 105); assert.equal(p.groups.length, 11);
});
test('groups merge transitively and remain one rigid body through rotations', () => {
  const p = puzzle(); p.groups.forEach(g => Object.assign(g, { x: 200, y: 300, angle: 0 }));
  const a = group(p, 0); assert.equal(snapGroup(p, a, 10), 11); assert.equal(p.groups.length, 1);
  const pivot = groupCenter(p, a), initial = p.pieces.map(piece => pieceCenter(piece, a));
  rotateGroup(p, a, 1); near(groupCenter(p, a), pivot);
  p.pieces.forEach((piece, i) => {
    const offset = rotate({ x: initial[i].x - pivot.x, y: initial[i].y - pivot.y }, 1);
    near(pieceCenter(piece, a), { x: pivot.x + offset.x, y: pivot.y + offset.y });
  });
  for (let i = 0; i < 3; i++) rotateGroup(p, a, 1);
  p.pieces.forEach((piece, i) => near(pieceCenter(piece, a), initial[i]));
  assert.equal(a.pieces.length, 12);
});
test('rotation disabled is enforced in rules, including combined groups', () => {
  const p = puzzle(false); assert.ok(p.groups.every(g => g.angle === 0));
  const a = p.groups[0], before = structuredClone(a); assert.equal(rotateGroup(p, a, 1), false); assert.deepEqual(a, before);
});
test('supported dimensions include single-piece and 144-piece puzzles and reject invalid settings', () => {
  assert.equal(createPuzzle(1, 1, 2, false, 1).groups.length, 1);
  assert.equal(createPuzzle(12, 12, .75, true, 1).pieces.length, 144);
  for (const rows of [0, 13, 1.5, NaN]) assert.throws(() => createPuzzle(rows, 2, 1, false, 1));
  for (const aspect of [0, -1, Infinity]) assert.throws(() => createPuzzle(2, 2, aspect, false, 1));
});
test('saved preferences validate limits and required fields before restoring controls', () => {
  assert.ok(isJigsawPreferences({ rows: 12, cols: 1, allowRotation: true }));
  for (const value of [null, {}, { rows: 0, cols: 2, allowRotation: true }, { rows: 2, cols: 13, allowRotation: false }, { rows: 2, cols: 2, allowRotation: 'yes' }]) assert.equal(isJigsawPreferences(value), false);
});
