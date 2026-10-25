import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeGroups, createPuzzle, pieceCenter, groupCenter, puzzleBounds, rotateGroup, snapGroup, rotate } from '../jigsaw-puzzle/rules/model.ts';
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
    assert.equal(path.filter(c => c.type === 'C').length, edges.filter(Boolean).length * 6);
    assert.equal(path.filter(c => c.type === 'L').length, edges.filter(edge => !edge).length);
  }
});
test('shared Bezier edges have identical control points when traversed in reverse', () => {
  const curves = (width, height, edges) => {
    const result = []; let previous;
    for (const command of pieceOutline(width, height, edges)) {
      if (command.type === 'C') result.push([previous, command.a, command.b, command.p]);
      if (command.type !== 'Z') previous = command.p;
    }
    return result;
  };
  for (const [width, height] of [[100, 100], [150, 100], [100, 150], [600, 37.5], [37.5, 600]]) for (const sign of [-1, 1]) {
    const right = curves(width, height, [0, sign, 0, 0]), left = curves(width, height, [0, 0, 0, -sign]).reverse();
    right.forEach((curve, i) => curve.forEach((p, j) => near(p, { x: left[i][3-j].x + width, y: left[i][3-j].y })));
    const bottom = curves(width, height, [0, 0, sign, 0]), top = curves(width, height, [-sign, 0, 0, 0]).reverse();
    bottom.forEach((curve, i) => curve.forEach((p, j) => near(p, { x: top[i][3-j].x, y: top[i][3-j].y + height })));
  }
});
test('shoulders, neck and bulb stay smooth and inside the texture padding', () => {
  for (const [width, height] of [[100, 100], [600, 37.5], [37.5, 600]]) for (const sign of [-1, 1]) {
    const path = pieceOutline(width, height, [sign, -sign, sign, -sign]);
    const padding = Math.min(width, height) * .3;
    let previous = path[0].p, last;
    for (const command of path.slice(1)) {
      if (command.type !== 'C') continue;
      if (last && last % 6 !== 0) {
        const a = { x: previous.x - path[last].b.x, y: previous.y - path[last].b.y };
        const b = { x: command.a.x - previous.x, y: command.a.y - previous.y };
        assert.ok(Math.abs(a.x * b.y - a.y * b.x) < 1e-8, 'tangents meet without a kink');
        assert.ok(a.x * b.x + a.y * b.y > 0, 'tangents continue in the same direction');
      }
      for (const p of [command.a, command.b, command.p]) {
        assert.ok(p.x >= -padding && p.x <= width + padding);
        assert.ok(p.y >= -padding && p.y <= height + padding);
      }
      previous = command.p; last = (last ?? 0) + 1;
    }
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

test('arranging recovers faraway pieces and repeated clicks keep exactly the same bounded layout', () => {
  const p = puzzle(), identities = [...p.groups];
  p.groups.forEach((g, i) => { g.x = (i - 5) * 1e6; g.y = (5 - i) * 1e6; });
  p.moves = 37;
  const properties = p.groups.map(({ x, y, ...g }) => structuredClone(g));
  arrangeGroups(p);
  const arranged = structuredClone(p.groups), bounds = puzzleBounds(p);
  assert.ok(bounds.maxX - bounds.minX < 5000 && bounds.maxY - bounds.minY < 5000);
  for (let i = 0; i < 30; i++) { arrangeGroups(p); assert.deepEqual(p.groups, arranged); }
  assert.deepEqual(p.groups.map(({ x, y, ...g }) => g), properties);
  assert.ok(p.groups.every((g, i) => g === identities[i])); assert.equal(p.moves, 37);
});

test('arranging preserves joined rotated groups as rigid bodies', () => {
  const p = puzzle(); p.groups.forEach((g, i) => Object.assign(g, { x: i * 1000, y: 1000, angle: 0 }));
  const a = group(p, 0);
  for (const id of [1, 4]) Object.assign(group(p, id), { x: a.x, y: a.y });
  assert.equal(snapGroup(p, a, 1), 2); rotateGroup(p, a, 1);
  const members = [...a.pieces], before = a.pieces.map(id => pieceCenter(p.pieces[id], a)), moves = p.moves;
  arrangeGroups(p, .6);
  const after = a.pieces.map(id => pieceCenter(p.pieces[id], a));
  const delta = { x: after[0].x - before[0].x, y: after[0].y - before[0].y };
  before.forEach((p, i) => near(after[i], { x: p.x + delta.x, y: p.y + delta.y }));
  assert.deepEqual(a.pieces, members); assert.equal(a.angle, 1); assert.equal(p.moves, moves);
});

test('arranged group bounds do not overlap, including 144 pieces and extreme rectangular pieces', () => {
  for (const [rows, cols, aspect] of [[12, 12, 1.5], [1, 12, .1], [12, 1, 10]]) {
    const p = createPuzzle(rows, cols, aspect, true, 1042);
    arrangeGroups(p, .6);
    const padding = Math.min(p.cellWidth, p.cellHeight) * .3;
    const bounds = p.groups.map(g => {
      const centers = g.pieces.map(id => pieceCenter(p.pieces[id], g)), odd = g.angle % 2;
      const hw = (odd ? p.cellHeight : p.cellWidth) / 2 + padding, hh = (odd ? p.cellWidth : p.cellHeight) / 2 + padding;
      return { left: Math.min(...centers.map(c => c.x)) - hw, right: Math.max(...centers.map(c => c.x)) + hw,
        top: Math.min(...centers.map(c => c.y)) - hh, bottom: Math.max(...centers.map(c => c.y)) + hh };
    });
    for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j];
      assert.ok(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top, `groups ${i} and ${j} overlap`);
    }
    const arranged = structuredClone(p.groups); arrangeGroups(p, .6); assert.deepEqual(p.groups, arranged);
  }
});

test('arranging a completed puzzle centers it without separating or rotating pieces', () => {
  const p = puzzle(); p.groups.forEach(g => Object.assign(g, { x: 200, y: 300, angle: 0 }));
  const a = p.groups[0]; snapGroup(p, a, 1); rotateGroup(p, a, 1);
  arrangeGroups(p); near(a, { x: 0, y: 0 });
  assert.equal(a.angle, 1); assert.equal(p.groups.length, 1); assert.equal(a.pieces.length, 12);
  const arranged = structuredClone(p); arrangeGroups(p); assert.deepEqual(p, arranged);
});
