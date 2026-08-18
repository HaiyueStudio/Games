import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRIANGLE_CALENDAR_PIECES,
  createDateTargetKeys,
  createTriangleCalendarBoard,
  findBestPiecePlacement,
  matchPieceAtAnchor,
  orientTrianglePiece,
  positionBoardCells,
  triangleCellsAreAdjacent,
} from '../triangle-calendar-puzzle/triangleCalendarLogic.ts';

test('triangle calendar maps 12 months, 31 days, and 7 weekdays to 50 cells', () => {
  const board = createTriangleCalendarBoard();
  assert.equal(board.length, 50);
  assert.equal(board.filter(cell => cell.kind === 'month').length, 12);
  assert.equal(board.filter(cell => cell.kind === 'day').length, 31);
  assert.equal(board.filter(cell => cell.kind === 'weekday').length, 7);
  assert.equal(new Set(board.map(cell => cell.key)).size, board.length);
  assert.deepEqual([...createDateTargetKeys(7, 29, 3)], [
    'month:7',
    'day:29',
    'weekday:3',
  ]);
});

test('eleven connected polyiamonds cover exactly the 47 non-date cells', () => {
  assert.equal(TRIANGLE_CALENDAR_PIECES.length, 11);
  assert.equal(
    TRIANGLE_CALENDAR_PIECES.reduce((total, piece) => total + piece.cells.length, 0),
    47,
  );
  for (const piece of TRIANGLE_CALENDAR_PIECES) {
    assert.equal(new Set(piece.cells.map(cell => `${cell.q},${cell.r}`)).size, piece.cells.length);
    const reached = new Set([0]);
    for (let pass = 0; pass < piece.cells.length; pass++) {
      for (let index = 0; index < piece.cells.length; index++) {
        if (reached.has(index)) continue;
        if ([...reached].some(candidate => triangleCellsAreAdjacent(
          piece.cells[candidate],
          piece.cells[index],
        ))) reached.add(index);
      }
    }
    assert.equal(reached.size, piece.cells.length, `${piece.id} must be edge-connected`);
  }
});

test('six 60-degree rotations return to the original orientation', () => {
  const piece = TRIANGLE_CALENDAR_PIECES[1];
  const initial = orientTrianglePiece(piece, 0, false, 64);
  const fullTurn = orientTrianglePiece(piece, 6, false, 64);
  assert.deepEqual(fullTurn, initial);

  const signatures = new Set(Array.from({ length: 6 }, (_, rotation) => (
    orientationSignature(orientTrianglePiece(piece, rotation, false, 64))
  )));
  assert.ok(signatures.size >= 3, 'an asymmetric piece exposes distinct rotations');
});

test('flipping changes a chiral piece while a second flip restores it', () => {
  const piece = TRIANGLE_CALENDAR_PIECES[2];
  const original = orientTrianglePiece(piece, 0, false, 64);
  const flipped = orientTrianglePiece(piece, 0, true, 64);
  assert.notEqual(orientationSignature(flipped), orientationSignature(original));
  assert.deepEqual(orientTrianglePiece(piece, 6, false, 64), original);
});

test('position snapping matches lattice cells and rejects target or occupied cells', () => {
  const board = positionBoardCells(createTriangleCalendarBoard(), { x: 600, y: 150 }, 62);
  const piece = TRIANGLE_CALENDAR_PIECES.at(-1);
  const oriented = orientTrianglePiece(piece, 0, false, 62);
  const empty = new Set();
  let anchor = null;
  let matched = null;
  for (const candidate of board) {
    const placement = matchPieceAtAnchor(oriented, candidate, board, empty, empty);
    if (placement) {
      anchor = candidate;
      matched = placement;
      break;
    }
  }
  assert.ok(anchor);
  assert.ok(matched);
  assert.equal(matched.length, piece.cells.length);

  const snapped = findBestPiecePlacement(
    oriented,
    { x: anchor.x + 9, y: anchor.y - 7 },
    board,
    empty,
    empty,
    20,
  );
  assert.equal(snapped?.anchorKey, anchor.key);
  assert.deepEqual(snapped?.cellKeys, matched);

  assert.equal(
    matchPieceAtAnchor(oriented, anchor, board, new Set([matched[0]]), empty),
    null,
  );
  assert.equal(
    matchPieceAtAnchor(oriented, anchor, board, empty, new Set([matched[1]])),
    null,
  );
});

test('reference and boundary dates have complete snapped layouts', () => {
  for (const [month, day, weekday] of [
    [6, 19, 0],
    [3, 8, 2],
    [7, 29, 3],
    [1, 1, 4],
    [12, 31, 6],
  ]) {
    assert.equal(
      hasCompleteLayout(month, day, weekday),
      true,
      `${month}/${day} weekday ${weekday} must be playable`,
    );
  }
});

test('invalid date targets are rejected instead of producing silent holes', () => {
  assert.throws(() => createDateTargetKeys(0, 1, 1), /month/);
  assert.throws(() => createDateTargetKeys(1, 32, 1), /day/);
  assert.throws(() => createDateTargetKeys(1, 1, 7), /weekday/);
});

function orientationSignature(cells) {
  return cells
    .map(cell => `${Math.round(cell.offsetX * 1e6)},${Math.round(cell.offsetY * 1e6)},${cell.up ? 1 : 0}`)
    .sort()
    .join('|');
}

function hasCompleteLayout(month, day, weekday) {
  const boardCells = createTriangleCalendarBoard();
  const board = positionBoardCells(boardCells, { x: 0, y: 0 }, 62);
  const blocked = createDateTargetKeys(month, day, weekday);
  const indexByKey = new Map(board.map((cell, index) => [cell.key, index]));
  const requiredMask = board.reduce((mask, cell, index) => (
    blocked.has(cell.key) ? mask : mask | (1n << BigInt(index))
  ), 0n);
  const placements = [];
  for (let pieceIndex = 0; pieceIndex < TRIANGLE_CALENDAR_PIECES.length; pieceIndex++) {
    const piece = TRIANGLE_CALENDAR_PIECES[pieceIndex];
    const seen = new Set();
    for (const flipped of [false, true]) {
      for (let rotation = 0; rotation < 6; rotation++) {
        const oriented = orientTrianglePiece(piece, rotation, flipped, 62);
        for (const anchor of board) {
          const keys = matchPieceAtAnchor(oriented, anchor, board, blocked, new Set());
          if (!keys) continue;
          const signature = [...keys].sort().join('|');
          if (seen.has(signature)) continue;
          seen.add(signature);
          placements.push({
            pieceIndex,
            mask: keys.reduce((mask, key) => (
              mask | (1n << BigInt(indexByKey.get(key)))
            ), 0n),
          });
        }
      }
    }
  }
  const placementsByCell = Array.from({ length: board.length }, () => []);
  for (const placement of placements) {
    for (let index = 0; index < board.length; index++) {
      if (placement.mask & (1n << BigInt(index))) {
        placementsByCell[index].push(placement);
      }
    }
  }

  return hasExactCover(requiredMask, 0n, 0, placementsByCell);
}

function hasExactCover(requiredMask, occupiedMask, usedPieces, placementsByCell) {
  if (occupiedMask === requiredMask) return true;
  let firstEmpty = -1;
  for (let index = 0; index < placementsByCell.length; index++) {
    const bit = 1n << BigInt(index);
    if ((requiredMask & bit) && !(occupiedMask & bit)) {
      firstEmpty = index;
      break;
    }
  }
  if (firstEmpty < 0) return false;
  for (const placement of placementsByCell[firstEmpty]) {
    const pieceBit = 1 << placement.pieceIndex;
    if ((usedPieces & pieceBit) || (occupiedMask & placement.mask)) continue;
    if (hasExactCover(
      requiredMask,
      occupiedMask | placement.mask,
      usedPieces | pieceBit,
      placementsByCell,
    )) return true;
  }
  return false;
}
