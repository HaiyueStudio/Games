export type TriangleCellKind = 'month' | 'day' | 'weekday';

export interface Point2D {
  x: number;
  y: number;
}

export interface TriangleGridCoordinate {
  q: number;
  r: number;
}

export interface TriangleBoardCell extends TriangleGridCoordinate {
  key: string;
  label: string;
  kind: TriangleCellKind;
  up: boolean;
}

export interface TrianglePieceDefinition {
  id: string;
  name: string;
  color: string;
  cells: readonly TriangleGridCoordinate[];
}

export interface OrientedTriangleCell {
  sourceIndex: number;
  offsetX: number;
  offsetY: number;
  up: boolean;
}

export interface PositionedTriangleCell {
  key: string;
  x: number;
  y: number;
  up: boolean;
}

export interface TrianglePlacement {
  anchorKey: string;
  pivotX: number;
  pivotY: number;
  cellKeys: string[];
  distance: number;
}

const SQRT_THREE = Math.sqrt(3);
const BOARD_ROWS = Object.freeze([
  Object.freeze({ qStart: -3, count: 5, kind: 'month' as const }),
  Object.freeze({ qStart: -4, count: 7, kind: 'month' as const }),
  Object.freeze({ qStart: -5, count: 9, kind: 'day' as const }),
  Object.freeze({ qStart: -6, count: 11, kind: 'day' as const }),
  Object.freeze({ qStart: -6, count: 11, kind: 'day' as const }),
  Object.freeze({ qStart: -5, count: 7, kind: 'weekday' as const }),
]);

const MONTH_LABELS = Object.freeze([
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.',
  'Jul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
]);
const WEEKDAY_LABELS = Object.freeze([
  'Mon.', 'Tues.', 'Wed.', 'Thur.', 'Fri.', 'Sat.', 'Sun.',
]);

export const TRIANGLE_CALENDAR_PIECES: readonly TrianglePieceDefinition[] =
  Object.freeze([
    piece('ember', '赤焰', '#ef3d2f', [
      [-3, 0], [-2, 0], [-4, 1], [-3, 1], [-2, 1],
    ]),
    piece('ruby', '绯红', '#d92f2a', [
      [0, 0], [1, 0], [1, 1], [2, 1],
    ]),
    piece('sun', '暖阳', '#f7bd23', [
      [-1, 1], [0, 1], [-2, 2], [-1, 2], [0, 2],
    ]),
    piece('lagoon', '湖青', '#38b7ad', [
      [-5, 2], [-4, 2], [-3, 2], [-5, 3],
    ]),
    piece('coral', '珊瑚', '#f0643a', [
      [-6, 3], [-6, 4], [-5, 4], [-5, 5],
    ]),
    piece('cobalt', '钴蓝', '#2f65d5', [
      [-4, 3], [-3, 3], [-4, 4], [-3, 4], [-3, 5],
    ]),
    piece('leaf', '叶绿', '#2f9b49', [
      [-2, 3], [-1, 3], [-2, 4],
    ]),
    piece('forest', '青林', '#21843d', [
      [1, 2], [1, 3], [2, 3],
    ]),
    piece('aqua', '碧水', '#42c2bd', [
      [0, 3], [0, 4], [1, 4], [2, 4], [1, 5],
    ]),
    piece('indigo', '靛青', '#2857bd', [
      [3, 2], [3, 3], [4, 3], [3, 4], [4, 4],
    ]),
    piece('flame', '丹霞', '#ef512d', [
      [-1, 4], [-2, 5], [-1, 5], [0, 5],
    ]),
  ]);

export function createTriangleCalendarBoard(): TriangleBoardCell[] {
  const result: TriangleBoardCell[] = [];
  let month = 0;
  let day = 1;
  let weekday = 0;
  for (const [r, row] of BOARD_ROWS.entries()) {
    for (let index = 0; index < row.count; index++) {
      const q = row.qStart + index;
      if (row.kind === 'month') {
        const value = month + 1;
        result.push({
          q,
          r,
          up: isUpTriangle(q, r),
          key: `month:${value}`,
          label: requiredArrayItem(MONTH_LABELS, month, 'month labels'),
          kind: row.kind,
        });
        month++;
      } else if (row.kind === 'day') {
        result.push({
          q,
          r,
          up: isUpTriangle(q, r),
          key: `day:${day}`,
          label: String(day),
          kind: row.kind,
        });
        day++;
      } else {
        const value = weekday === 6 ? 0 : weekday + 1;
        result.push({
          q,
          r,
          up: isUpTriangle(q, r),
          key: `weekday:${value}`,
          label: requiredArrayItem(WEEKDAY_LABELS, weekday, 'weekday labels'),
          kind: row.kind,
        });
        weekday++;
      }
    }
  }
  return result;
}

export function createDateTargetKeys(
  month: number,
  day: number,
  weekday: number,
): Set<string> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Triangle calendar month must be an integer in [1, 12].');
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError('Triangle calendar day must be an integer in [1, 31].');
  }
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new RangeError('Triangle calendar weekday must be an integer in [0, 6].');
  }
  return new Set([
    `month:${month}`,
    `day:${day}`,
    `weekday:${weekday}`,
  ]);
}

export function isUpTriangle(q: number, r: number): boolean {
  return Math.abs(q + r) % 2 === 1;
}

export function triangleHeight(side: number): number {
  return side * SQRT_THREE * 0.5;
}

export function triangleCenter(
  coordinate: TriangleGridCoordinate,
  side: number,
): Point2D {
  const up = isUpTriangle(coordinate.q, coordinate.r);
  const height = triangleHeight(side);
  return {
    x: (coordinate.q + 1) * side * 0.5,
    y: (coordinate.r + (up ? 2 / 3 : 1 / 3)) * height,
  };
}

export function triangleVertices(
  center: Point2D,
  up: boolean,
  side: number,
): [Point2D, Point2D, Point2D] {
  const half = side * 0.5;
  const height = triangleHeight(side);
  return up
    ? [
        { x: center.x, y: center.y - height * 2 / 3 },
        { x: center.x + half, y: center.y + height / 3 },
        { x: center.x - half, y: center.y + height / 3 },
      ]
    : [
        { x: center.x - half, y: center.y - height / 3 },
        { x: center.x + half, y: center.y - height / 3 },
        { x: center.x, y: center.y + height * 2 / 3 },
      ];
}

export function orientTrianglePiece(
  definition: TrianglePieceDefinition,
  rotation: number,
  flipped: boolean,
  side: number,
): OrientedTriangleCell[] {
  const normalizedRotation = positiveModulo(Math.trunc(rotation), 6);
  const angle = normalizedRotation * Math.PI / 3;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const transformed = definition.cells.map((cell, sourceIndex) => {
    const center = triangleCenter(cell, side);
    const reflectedX = flipped ? -center.x : center.x;
    return {
      sourceIndex,
      x: reflectedX * cosine - center.y * sine,
      y: reflectedX * sine + center.y * cosine,
      up: normalizedRotation % 2 === 0
        ? isUpTriangle(cell.q, cell.r)
        : !isUpTriangle(cell.q, cell.r),
    };
  });
  const anchor = transformed[0];
  if (!anchor) return [];
  return transformed.map(cell => ({
    sourceIndex: cell.sourceIndex,
    offsetX: cleanFloat(cell.x - anchor.x),
    offsetY: cleanFloat(cell.y - anchor.y),
    up: cell.up,
  }));
}

export function positionBoardCells(
  board: readonly TriangleBoardCell[],
  origin: Point2D,
  side: number,
): PositionedTriangleCell[] {
  return board.map(cell => {
    const center = triangleCenter(cell, side);
    return {
      key: cell.key,
      x: origin.x + center.x,
      y: origin.y + center.y,
      up: cell.up,
    };
  });
}

export function matchPieceAtAnchor(
  orientedCells: readonly OrientedTriangleCell[],
  anchor: PositionedTriangleCell,
  board: readonly PositionedTriangleCell[],
  blockedKeys: ReadonlySet<string>,
  occupiedKeys: ReadonlySet<string>,
  tolerance = 0.01,
): string[] | null {
  const first = orientedCells[0];
  if (!first || first.up !== anchor.up) {
    return null;
  }
  const result: string[] = [];
  const claimed = new Set<string>();
  for (const cell of orientedCells) {
    const expectedX = anchor.x + cell.offsetX;
    const expectedY = anchor.y + cell.offsetY;
    let match: PositionedTriangleCell | null = null;
    for (const candidate of board) {
      if (candidate.up !== cell.up) continue;
      if (Math.hypot(candidate.x - expectedX, candidate.y - expectedY) <= tolerance) {
        match = candidate;
        break;
      }
    }
    if (!match
      || blockedKeys.has(match.key)
      || occupiedKeys.has(match.key)
      || claimed.has(match.key)) {
      return null;
    }
    claimed.add(match.key);
    result.push(match.key);
  }
  return result;
}

export function findBestPiecePlacement(
  orientedCells: readonly OrientedTriangleCell[],
  pivot: Point2D,
  board: readonly PositionedTriangleCell[],
  blockedKeys: ReadonlySet<string>,
  occupiedKeys: ReadonlySet<string>,
  snapDistance: number,
): TrianglePlacement | null {
  const first = orientedCells[0];
  if (!first) return null;
  let best: TrianglePlacement | null = null;
  for (const anchor of board) {
    if (anchor.up !== first.up) continue;
    const distance = Math.hypot(pivot.x - anchor.x, pivot.y - anchor.y);
    if (distance > snapDistance || (best && distance >= best.distance)) continue;
    const cellKeys = matchPieceAtAnchor(
      orientedCells,
      anchor,
      board,
      blockedKeys,
      occupiedKeys,
    );
    if (!cellKeys) continue;
    best = {
      anchorKey: anchor.key,
      pivotX: anchor.x,
      pivotY: anchor.y,
      cellKeys,
      distance,
    };
  }
  return best;
}

export function triangleCellsAreAdjacent(
  first: TriangleGridCoordinate,
  second: TriangleGridCoordinate,
): boolean {
  if (first.r === second.r && Math.abs(first.q - second.q) === 1) {
    return true;
  }
  if (first.q !== second.q) return false;
  return isUpTriangle(first.q, first.r)
    ? second.r === first.r + 1
    : second.r === first.r - 1;
}

function piece(
  id: string,
  name: string,
  color: string,
  cells: ReadonlyArray<readonly [number, number]>,
): TrianglePieceDefinition {
  return Object.freeze({
    id,
    name,
    color,
    cells: Object.freeze(cells.map(([q, r]) => Object.freeze({ q, r }))),
  });
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function cleanFloat(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

function requiredArrayItem<T>(
  values: readonly T[],
  index: number,
  label: string,
): T {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`Triangle calendar ${label} is missing index ${index}.`);
  }
  return value;
}
