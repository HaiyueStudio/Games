import {
  TRIANGLE_CALENDAR_PIECES,
  type OrientedTriangleCell,
  type Point2D,
  type PositionedTriangleCell,
  type TriangleBoardCell,
  type TrianglePieceDefinition,
  createDateTargetKeys,
  createTriangleCalendarBoard,
  findBestPiecePlacement,
  orientTrianglePiece,
  positionBoardCells,
  triangleHeight,
  triangleVertices,
} from './triangleCalendarLogic';
import { requiredItemAt } from '../arrayAccess';

interface PieceState {
  definition: TrianglePieceDefinition;
  rotation: number;
  flipped: boolean;
  pivotX: number;
  pivotY: number;
  placed: boolean;
  occupiedKeys: string[];
  element: SVGGElement;
}

interface DragState {
  piece: PieceState;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface BoardVisual {
  polygon: SVGPolygonElement;
  label: SVGTextElement;
}

interface EdgeRecord {
  start: Point2D;
  end: Point2D;
  count: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 760;
const SIDE = 62;
const BOARD_ORIGIN = Object.freeze({ x: 600, y: 154 });
const SNAP_DISTANCE = 39;
const PIECE_HOMES: readonly Point2D[] = Object.freeze([
  Object.freeze({ x: 110, y: 180 }),
  Object.freeze({ x: 285, y: 180 }),
  Object.freeze({ x: 108, y: 335 }),
  Object.freeze({ x: 282, y: 335 }),
  Object.freeze({ x: 195, y: 525 }),
  Object.freeze({ x: 915, y: 180 }),
  Object.freeze({ x: 1080, y: 180 }),
  Object.freeze({ x: 915, y: 335 }),
  Object.freeze({ x: 1080, y: 335 }),
  Object.freeze({ x: 915, y: 520 }),
  Object.freeze({ x: 1080, y: 520 }),
]);

const MONTH_NAMES = [
  '1 月', '2 月', '3 月', '4 月', '5 月', '6 月',
  '7 月', '8 月', '9 月', '10 月', '11 月', '12 月',
];
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export class TriangleCalendarPuzzleGame {
  private readonly svg: SVGSVGElement;
  private readonly board = createTriangleCalendarBoard();
  private readonly positionedBoard: PositionedTriangleCell[];
  private readonly boardByKey = new Map<string, TriangleBoardCell>();
  private readonly boardVisuals = new Map<string, BoardVisual>();
  private readonly occupancy = new Map<string, string>();
  private readonly pieces: PieceState[] = [];
  private readonly pieceLayer: SVGGElement;
  private readonly monthSelect: HTMLSelectElement;
  private readonly daySelect: HTMLSelectElement;
  private readonly weekdaySelect: HTMLSelectElement;
  private readonly status: HTMLElement;
  private readonly completion: HTMLElement;
  private selectedPiece: PieceState | null = null;
  private drag: DragState | null = null;
  private targetKeys = new Set<string>();
  private selectedMonth = new Date().getMonth() + 1;
  private selectedDay = new Date().getDate();
  private selectedWeekday = new Date().getDay();

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    this.positionedBoard = positionBoardCells(this.board, BOARD_ORIGIN, SIDE);
    this.monthSelect = requiredElement('month-select', HTMLSelectElement);
    this.daySelect = requiredElement('day-select', HTMLSelectElement);
    this.weekdaySelect = requiredElement('weekday-select', HTMLSelectElement);
    this.status = requiredElement('game-status', HTMLElement);
    this.completion = requiredElement('completion', HTMLElement);
    for (const cell of this.board) this.boardByKey.set(cell.key, cell);

    this.buildBoard();
    this.pieceLayer = svgElement('g');
    this.pieceLayer.classList.add('piece-layer');
    this.svg.appendChild(this.pieceLayer);
    this.buildPieces();
    this.setupControls();
    this.bindPointerInput();
    this.updateDateTargets(true);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private buildBoard(): void {
    const backing = svgElement('path');
    backing.classList.add('board-backing');
    backing.setAttribute('d', this.boardOutlinePath());
    this.svg.appendChild(backing);

    const cells = svgElement('g');
    cells.classList.add('board-cells');
    for (let index = 0; index < this.board.length; index++) {
      const cell = requiredItemAt(this.board, index, 'triangle calendar board');
      const positioned = requiredItemAt(
        this.positionedBoard,
        index,
        'positioned triangle calendar board',
      );
      const polygon = svgElement('polygon');
      polygon.setAttribute(
        'points',
        pointsAttribute(triangleVertices(positioned, cell.up, SIDE - 2.4)),
      );
      polygon.classList.add('board-cell', `board-${cell.kind}`);
      polygon.dataset.key = cell.key;
      const label = svgElement('text');
      label.setAttribute('x', format(positioned.x));
      label.setAttribute('y', format(positioned.y + 1));
      label.classList.add('board-label', `label-${cell.kind}`);
      label.textContent = cell.label;
      cells.append(polygon, label);
      this.boardVisuals.set(cell.key, { polygon, label });
    }
    this.svg.appendChild(cells);

    const monthDivider = svgElement('line');
    monthDivider.classList.add('region-divider', 'month-divider');
    monthDivider.setAttribute('x1', format(BOARD_ORIGIN.x - SIDE * 2.5));
    monthDivider.setAttribute('x2', format(BOARD_ORIGIN.x + SIDE * 2.5));
    monthDivider.setAttribute('y1', format(BOARD_ORIGIN.y + triangleHeight(SIDE) * 2));
    monthDivider.setAttribute('y2', format(BOARD_ORIGIN.y + triangleHeight(SIDE) * 2));
    const weekdayDivider = svgElement('line');
    weekdayDivider.classList.add('region-divider', 'weekday-divider');
    weekdayDivider.setAttribute('x1', format(BOARD_ORIGIN.x - SIDE * 2.5));
    weekdayDivider.setAttribute('x2', format(BOARD_ORIGIN.x + SIDE * 1.5));
    weekdayDivider.setAttribute('y1', format(BOARD_ORIGIN.y + triangleHeight(SIDE) * 5));
    weekdayDivider.setAttribute('y2', format(BOARD_ORIGIN.y + triangleHeight(SIDE) * 5));
    this.svg.append(monthDivider, weekdayDivider);
  }

  private boardOutlinePath(): string {
    const h = triangleHeight(SIDE);
    const x = BOARD_ORIGIN.x;
    const y = BOARD_ORIGIN.y;
    const points: Point2D[] = [
      { x: x - SIDE * 1.5, y },
      { x: x + SIDE * 1.5, y },
      { x: x + SIDE * 2, y: y + h },
      { x: x + SIDE * 2.5, y: y + h * 2 },
      { x: x + SIDE * 3, y: y + h * 3 },
      { x: x + SIDE * 3, y: y + h * 5 },
      { x: x + SIDE * 1.5, y: y + h * 5 },
      { x: x + SIDE, y: y + h * 6 },
      { x: x - SIDE * 2, y: y + h * 6 },
      { x: x - SIDE * 2.5, y: y + h * 5 },
      { x: x - SIDE * 3, y: y + h * 5 },
      { x: x - SIDE * 3, y: y + h * 3 },
      { x: x - SIDE * 2.5, y: y + h * 2 },
      { x: x - SIDE * 2, y: y + h },
    ];
    return `M ${points.map(point => `${format(point.x)} ${format(point.y)}`).join(' L ')} Z`;
  }

  private buildPieces(): void {
    for (const definition of TRIANGLE_CALENDAR_PIECES) {
      const element = svgElement('g');
      element.classList.add('puzzle-piece');
      element.dataset.pieceId = definition.id;
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', `${definition.name}拼图块`);
      const piece: PieceState = {
        definition,
        rotation: 0,
        flipped: false,
        pivotX: 0,
        pivotY: 0,
        placed: false,
        occupiedKeys: [],
        element,
      };
      element.addEventListener('pointerdown', event => this.beginDrag(event, piece));
      element.addEventListener('dblclick', event => {
        event.preventDefault();
        this.selectPiece(piece);
        this.rotateSelected();
      });
      element.addEventListener('contextmenu', event => {
        event.preventDefault();
        this.selectPiece(piece);
        this.flipSelected();
      });
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.selectPiece(piece);
          this.rotateSelected();
        }
      });
      this.pieces.push(piece);
      this.pieceLayer.appendChild(element);
      this.renderPieceShape(piece);
    }
  }

  private setupControls(): void {
    this.fillSelect(
      this.monthSelect,
      MONTH_NAMES.map((label, index) => ({ label, value: index + 1 })),
    );
    this.fillSelect(
      this.weekdaySelect,
      WEEKDAY_NAMES.map((label, value) => ({ label, value })),
    );
    this.monthSelect.value = String(this.selectedMonth);
    this.weekdaySelect.value = String(this.selectedWeekday);
    this.refreshDayOptions();

    this.monthSelect.addEventListener('change', () => {
      this.selectedMonth = Number(this.monthSelect.value);
      this.refreshDayOptions();
      this.updateDateTargets(true);
    });
    this.daySelect.addEventListener('change', () => {
      this.selectedDay = Number(this.daySelect.value);
      this.updateDateTargets(true);
    });
    this.weekdaySelect.addEventListener('change', () => {
      this.selectedWeekday = Number(this.weekdaySelect.value);
      this.updateDateTargets(true);
    });
    requiredElement('today-button', HTMLButtonElement).addEventListener('click', () => {
      const today = new Date();
      this.selectedMonth = today.getMonth() + 1;
      this.selectedDay = today.getDate();
      this.selectedWeekday = today.getDay();
      this.monthSelect.value = String(this.selectedMonth);
      this.weekdaySelect.value = String(this.selectedWeekday);
      this.refreshDayOptions();
      this.updateDateTargets(true);
    });
    requiredElement('reset-button', HTMLButtonElement).addEventListener(
      'click',
      () => this.resetPieces(),
    );
    requiredElement('rotate-button', HTMLButtonElement).addEventListener(
      'click',
      () => this.rotateSelected(),
    );
    requiredElement('flip-button', HTMLButtonElement).addEventListener(
      'click',
      () => this.flipSelected(),
    );
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private bindPointerInput(): void {
    this.svg.addEventListener('pointermove', event => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const point = this.eventPoint(event);
      this.drag.piece.pivotX = point.x - this.drag.offsetX;
      this.drag.piece.pivotY = point.y - this.drag.offsetY;
      this.clampPiece(this.drag.piece);
      this.updatePieceTransform(this.drag.piece);
      this.previewPiece(this.drag.piece);
    });
    const release = (event: PointerEvent): void => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const piece = this.drag.piece;
      this.drag = null;
      if (this.svg.hasPointerCapture(event.pointerId)) {
        this.svg.releasePointerCapture(event.pointerId);
      }
      piece.element.classList.remove('dragging', 'invalid-drop', 'valid-drop');
      this.snapPiece(piece);
      this.updateStatus();
    };
    this.svg.addEventListener('pointerup', release);
    this.svg.addEventListener('pointercancel', release);
    this.svg.addEventListener('pointerdown', event => {
      if (event.target === this.svg) this.selectPiece(null);
    });
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement
      || event.target instanceof HTMLSelectElement
      || event.target instanceof HTMLTextAreaElement) return;
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      this.rotateSelected();
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.flipSelected();
    }
  };

  private beginDrag(event: PointerEvent, piece: PieceState): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.eventPoint(event);
    this.selectPiece(piece);
    this.clearPieceOccupancy(piece);
    this.pieceLayer.appendChild(piece.element);
    piece.element.classList.add('dragging');
    this.drag = {
      piece,
      pointerId: event.pointerId,
      offsetX: point.x - piece.pivotX,
      offsetY: point.y - piece.pivotY,
    };
    this.svg.setPointerCapture(event.pointerId);
  }

  private selectPiece(piece: PieceState | null): void {
    if (this.selectedPiece === piece) return;
    this.selectedPiece?.element.classList.remove('selected');
    this.selectedPiece = piece;
    piece?.element.classList.add('selected');
    this.updateStatus();
  }

  private rotateSelected(): void {
    const piece = this.selectedPiece;
    if (!piece) {
      this.status.textContent = '先点选一个拼图块，再旋转。';
      return;
    }
    this.clearPieceOccupancy(piece);
    piece.rotation = (piece.rotation + 1) % 6;
    this.renderPieceShape(piece);
    this.clampPiece(piece);
    this.updatePieceTransform(piece);
    this.snapPiece(piece);
    this.updateStatus();
  }

  private flipSelected(): void {
    const piece = this.selectedPiece;
    if (!piece) {
      this.status.textContent = '先点选一个拼图块，再翻转。';
      return;
    }
    this.clearPieceOccupancy(piece);
    piece.flipped = !piece.flipped;
    this.renderPieceShape(piece);
    this.clampPiece(piece);
    this.updatePieceTransform(piece);
    this.snapPiece(piece);
    this.updateStatus();
  }

  private renderPieceShape(piece: PieceState): void {
    piece.element.replaceChildren();
    const oriented = this.orientedCells(piece);
    const edges = new Map<string, EdgeRecord>();
    for (const cell of oriented) {
      const center = { x: cell.offsetX, y: cell.offsetY };
      const vertices = triangleVertices(center, cell.up, SIDE - 2.2);
      const polygon = svgElement('polygon');
      polygon.setAttribute('points', pointsAttribute(vertices));
      polygon.setAttribute('fill', piece.definition.color);
      polygon.classList.add('piece-cell');
      piece.element.appendChild(polygon);
      this.collectEdges(edges, triangleVertices(center, cell.up, SIDE), SIDE);
    }
    const boundary = svgElement('path');
    boundary.classList.add('piece-boundary');
    boundary.setAttribute('d', [...edges.values()]
      .filter(edge => edge.count === 1)
      .map(edge => `M ${format(edge.start.x)} ${format(edge.start.y)} L ${format(edge.end.x)} ${format(edge.end.y)}`)
      .join(' '));
    piece.element.appendChild(boundary);
    piece.element.classList.toggle('flipped', piece.flipped);
    piece.element.dataset.rotation = String(piece.rotation);
    this.updatePieceTransform(piece);
  }

  private collectEdges(
    edges: Map<string, EdgeRecord>,
    vertices: readonly Point2D[],
    scale: number,
  ): void {
    for (let index = 0; index < vertices.length; index++) {
      const start = requiredItemAt(vertices, index, 'triangle edge vertices');
      const end = requiredItemAt(
        vertices,
        (index + 1) % vertices.length,
        'triangle edge vertices',
      );
      const startKey = pointKey(start, scale);
      const endKey = pointKey(end, scale);
      const key = startKey < endKey
        ? `${startKey}|${endKey}`
        : `${endKey}|${startKey}`;
      const existing = edges.get(key);
      if (existing) existing.count++;
      else edges.set(key, { start, end, count: 1 });
    }
  }

  private orientedCells(piece: PieceState): OrientedTriangleCell[] {
    return orientTrianglePiece(
      piece.definition,
      piece.rotation,
      piece.flipped,
      SIDE,
    );
  }

  private snapPiece(piece: PieceState): boolean {
    const placement = findBestPiecePlacement(
      this.orientedCells(piece),
      { x: piece.pivotX, y: piece.pivotY },
      this.positionedBoard,
      this.targetKeys,
      new Set(this.occupancy.keys()),
      SNAP_DISTANCE,
    );
    if (!placement) {
      piece.placed = false;
      piece.occupiedKeys = [];
      piece.element.classList.remove('placed');
      return false;
    }
    piece.pivotX = placement.pivotX;
    piece.pivotY = placement.pivotY;
    piece.placed = true;
    piece.occupiedKeys = placement.cellKeys;
    for (const key of placement.cellKeys) this.occupancy.set(key, piece.definition.id);
    piece.element.classList.add('placed');
    this.updatePieceTransform(piece);
    this.checkCompletion();
    return true;
  }

  private previewPiece(piece: PieceState): void {
    const oriented = this.orientedCells(piece);
    const first = oriented[0];
    const nearBoard = first && this.positionedBoard.some(cell => (
      cell.up === first.up
      && Math.hypot(cell.x - piece.pivotX, cell.y - piece.pivotY) <= SNAP_DISTANCE
    ));
    const valid = !!findBestPiecePlacement(
      oriented,
      { x: piece.pivotX, y: piece.pivotY },
      this.positionedBoard,
      this.targetKeys,
      new Set(this.occupancy.keys()),
      SNAP_DISTANCE,
    );
    piece.element.classList.toggle('valid-drop', valid);
    piece.element.classList.toggle('invalid-drop', !!nearBoard && !valid);
  }

  private clearPieceOccupancy(piece: PieceState): void {
    for (const key of piece.occupiedKeys) {
      if (this.occupancy.get(key) === piece.definition.id) this.occupancy.delete(key);
    }
    piece.occupiedKeys = [];
    piece.placed = false;
    piece.element.classList.remove('placed');
    this.completion.classList.remove('visible');
  }

  private resetPieces(): void {
    this.occupancy.clear();
    this.completion.classList.remove('visible');
    this.selectPiece(null);
    for (let index = 0; index < this.pieces.length; index++) {
      const piece = requiredItemAt(this.pieces, index, 'triangle puzzle pieces');
      piece.rotation = 0;
      piece.flipped = false;
      piece.placed = false;
      piece.occupiedKeys = [];
      piece.element.classList.remove(
        'placed',
        'dragging',
        'invalid-drop',
        'valid-drop',
      );
      this.renderPieceShape(piece);
      this.movePieceToCenter(
        piece,
        requiredItemAt(PIECE_HOMES, index, 'triangle puzzle piece homes'),
      );
    }
    this.updateStatus();
  }

  private movePieceToCenter(piece: PieceState, center: Point2D): void {
    const bounds = this.pieceBounds(piece, 0, 0);
    piece.pivotX = center.x - (bounds.minX + bounds.maxX) * 0.5;
    piece.pivotY = center.y - (bounds.minY + bounds.maxY) * 0.5;
    this.clampPiece(piece);
    this.updatePieceTransform(piece);
  }

  private clampPiece(piece: PieceState): void {
    const bounds = this.pieceBounds(piece, piece.pivotX, piece.pivotY);
    const margin = 10;
    if (bounds.minX < margin) piece.pivotX += margin - bounds.minX;
    if (bounds.maxX > VIEW_WIDTH - margin) {
      piece.pivotX -= bounds.maxX - (VIEW_WIDTH - margin);
    }
    if (bounds.minY < 112) piece.pivotY += 112 - bounds.minY;
    if (bounds.maxY > VIEW_HEIGHT - margin) {
      piece.pivotY -= bounds.maxY - (VIEW_HEIGHT - margin);
    }
  }

  private pieceBounds(
    piece: PieceState,
    pivotX: number,
    pivotY: number,
  ): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const cell of this.orientedCells(piece)) {
      const vertices = triangleVertices({
        x: pivotX + cell.offsetX,
        y: pivotY + cell.offsetY,
      }, cell.up, SIDE);
      for (const vertex of vertices) {
        minX = Math.min(minX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxX = Math.max(maxX, vertex.x);
        maxY = Math.max(maxY, vertex.y);
      }
    }
    return { minX, minY, maxX, maxY };
  }

  private updatePieceTransform(piece: PieceState): void {
    piece.element.setAttribute(
      'transform',
      `translate(${format(piece.pivotX)} ${format(piece.pivotY)})`,
    );
  }

  private updateDateTargets(resetPieces: boolean): void {
    this.targetKeys = createDateTargetKeys(
      this.selectedMonth,
      this.selectedDay,
      this.selectedWeekday,
    );
    for (const [key, visual] of this.boardVisuals) {
      const target = this.targetKeys.has(key);
      visual.polygon.classList.toggle('target-cell', target);
      visual.label.classList.toggle('target-label', target);
    }
    if (resetPieces) this.resetPieces();
    this.updateStatus();
  }

  private refreshDayOptions(): void {
    const maximum = new Date(new Date().getFullYear(), this.selectedMonth, 0)
      .getDate();
    this.selectedDay = Math.min(this.selectedDay, maximum);
    this.fillSelect(
      this.daySelect,
      Array.from({ length: maximum }, (_, index) => ({
        label: `${index + 1} 日`,
        value: index + 1,
      })),
    );
    this.daySelect.value = String(this.selectedDay);
  }

  private fillSelect(
    select: HTMLSelectElement,
    options: ReadonlyArray<{ label: string; value: number }>,
  ): void {
    select.replaceChildren(...options.map(option => {
      const element = document.createElement('option');
      element.value = String(option.value);
      element.textContent = option.label;
      return element;
    }));
  }

  private checkCompletion(): void {
    const complete = this.pieces.every(piece => piece.placed)
      && this.occupancy.size === this.board.length - this.targetKeys.size;
    this.completion.classList.toggle('visible', complete);
    if (complete) {
      this.completion.textContent = `${this.selectedMonth} 月 ${this.selectedDay} 日 · ${WEEKDAY_NAMES[this.selectedWeekday]} 完成！`;
    }
  }

  private updateStatus(): void {
    const placed = this.pieces.filter(piece => piece.placed).length;
    const selected = this.selectedPiece
      ? ` · 已选「${this.selectedPiece.definition.name}」`
      : '';
    this.status.textContent = `已吸附 ${placed}/${this.pieces.length}${selected} · R 旋转 / F 翻转`;
  }

  private eventPoint(event: PointerEvent): Point2D {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * VIEW_WIDTH / rect.width,
      y: (event.clientY - rect.top) * VIEW_HEIGHT / rect.height,
    };
  }
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function pointsAttribute(points: readonly Point2D[]): string {
  return points.map(point => `${format(point.x)},${format(point.y)}`).join(' ');
}

function pointKey(point: Point2D, scale: number): string {
  return `${Math.round(point.x / scale * 10_000)},${Math.round(point.y / scale * 10_000)}`;
}

function format(value: number): string {
  return value.toFixed(3);
}

function requiredElement<T extends Element>(
  id: string,
  constructor: { new (...args: never[]): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Triangle Calendar Puzzle is missing #${id}.`);
  }
  return element;
}

const svg = document.getElementById('puzzle-board');
if (!(svg instanceof SVGSVGElement)) {
  throw new Error('Triangle Calendar Puzzle requires #puzzle-board.');
}
new TriangleCalendarPuzzleGame(svg);
