import { BasicMaterial, Camera3D, CartesianTransform3D, ColorSRGB, Entity, Mesh3D, HaiyueEngine, World, createPlane3D } from '@haiyue/engine';
import { type CssMaterialStyle } from '@haiyue/engine/material';
import { Render3DSystem } from '@haiyue/engine/systems';
import { requireEngineCanvas } from '@haiyue/engine/experimental';
import {
  GuiButton,
  GuiRadio,
  GuiRoot,
  GuiSelect,
  GuiSystem,
} from '@haiyue/engine/gui';
import { requiredItemAt } from '../arrayAccess';
import { SingleSlotGameSave, isFiniteNumber, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

type CellKind = 'month' | 'day' | 'weekday';
type DoubleClickAction = 'rotate' | 'flip';

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoardCell {
  row: number;
  col: number;
  key: string;
  label: string;
  kind: CellKind;
}

interface PieceDef {
  id: string;
  name: string;
  color: string;
  cells: Point[];
}

interface TileVisual {
  entity: Entity;
  transform: CartesianTransform3D;
  material: BasicMaterial;
}

interface TextVisual {
  material: BasicMaterial;
  rect: Rect;
  text: string;
  style: CssMaterialStyle;
}

interface PieceState {
  def: PieceDef;
  rotation: number;
  flipped: boolean;
  layer: number;
  x: number;
  y: number;
  placed: boolean;
  row: number;
  col: number;
  visuals: TileVisual[];
  styleKey: string;
}

interface CalendarPuzzleSaveData {
  month: number;
  day: number;
  weekday: number;
  pieces: Array<Pick<PieceState, 'rotation' | 'flipped' | 'layer' | 'x' | 'y' | 'placed' | 'row' | 'col'>>;
}

function isCalendarPuzzleSaveData(value: unknown): value is CalendarPuzzleSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.month) && value.month >= 1 && value.month <= 12
    && isNonNegativeInteger(value.day) && value.day >= 1 && value.day <= 31
    && isNonNegativeInteger(value.weekday) && value.weekday <= 6
    && Array.isArray(value.pieces)
    && value.pieces.every(piece => isRecord(piece)
      && isNonNegativeInteger(piece.rotation)
      && typeof piece.flipped === 'boolean'
      && isNonNegativeInteger(piece.layer)
      && isFiniteNumber(piece.x) && isFiniteNumber(piece.y)
      && typeof piece.placed === 'boolean'
      && Number.isSafeInteger(piece.row) && Number.isSafeInteger(piece.col));
}

interface DragState {
  piece: PieceState;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
}

interface LastPieceClick {
  piece: PieceState;
  time: number;
  x: number;
  y: number;
}

const CANVAS_W = 1200;
const CANVAS_H = 720;
const VIEW_W = 12;
const VIEW_H = CANVAS_H / CANVAS_W * VIEW_W;
const CELL = 48;
const GAP = 5;
const PITCH = CELL + GAP;
const BOARD_ROWS = 8;
const BOARD_COLS = 7;
const BOARD_LEFT = 392;
const BOARD_TOP = 132;
const BOARD_PAD = 16;
const WORK_AREA = { x: 28, y: 104, width: 1144, height: 590 };
const SNAP_DISTANCE = 28;
const PIECE_HOME_POSITIONS: Point[] = [
  { x: 54, y: 130 },
  { x: 54, y: 310 },
  { x: 54, y: 510 },
  { x: 245, y: 120 },
  { x: 245, y: 310 },
  { x: 245, y: 500 },
  { x: 820, y: 122 },
  { x: 820, y: 315 },
  { x: 820, y: 470 },
  { x: 560, y: 620 },
];

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const BOARD_CELLS: BoardCell[] = [
  ...MONTHS.slice(0, 6).map((label, index) => ({ row: 0, col: index, key: `m${index + 1}`, label, kind: 'month' as const })),
  ...MONTHS.slice(6).map((label, index) => ({ row: 1, col: index, key: `m${index + 7}`, label, kind: 'month' as const })),
  ...Array.from({ length: 28 }, (_, index) => {
    const day = index + 1;
    return { row: 2 + Math.floor(index / 7), col: index % 7, key: `d${day}`, label: String(day), kind: 'day' as const };
  }),
  { row: 6, col: 0, key: 'd29', label: '29', kind: 'day' },
  { row: 6, col: 1, key: 'd30', label: '30', kind: 'day' },
  { row: 6, col: 2, key: 'd31', label: '31', kind: 'day' },
  { row: 6, col: 3, key: 'w1', label: '周一', kind: 'weekday' },
  { row: 6, col: 4, key: 'w2', label: '周二', kind: 'weekday' },
  { row: 6, col: 5, key: 'w3', label: '周三', kind: 'weekday' },
  { row: 6, col: 6, key: 'w4', label: '周四', kind: 'weekday' },
  { row: 7, col: 4, key: 'w5', label: '周五', kind: 'weekday' },
  { row: 7, col: 5, key: 'w6', label: '周六', kind: 'weekday' },
  { row: 7, col: 6, key: 'w0', label: '周日', kind: 'weekday' },
];

const PIECES: PieceDef[] = [
  { id: 'a', name: 'A', color: '#ef6f6c', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }] },
  { id: 'b', name: 'B', color: '#f59f42', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] },
  { id: 'c', name: 'C', color: '#f4c95d', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }] },
  { id: 'd', name: 'D', color: '#70c1b3', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }] },
  { id: 'e', name: 'E', color: '#3fb8af', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }] },
  { id: 'f', name: 'F', color: '#4d96d7', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] },
  { id: 'g', name: 'G', color: '#7c6ee6', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }] },
  { id: 'h', name: 'H', color: '#b86adf', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  { id: 'i', name: 'I', color: '#e86aa7', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }] },
  { id: 'j', name: 'J', color: '#8bc34a', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
];

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function normalizeCells(cells: Point[]): Point[] {
  const minX = Math.min(...cells.map(cell => cell.x));
  const minY = Math.min(...cells.map(cell => cell.y));
  return cells
    .map(cell => ({ x: cell.x - minX, y: cell.y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export class CalendarPuzzleGame {
  private readonly saves = new SingleSlotGameSave<CalendarPuzzleSaveData>({
    gameId: 'calendar-puzzle',
    name: 'Calendar Puzzle 自动存档',
    validateData: isCalendarPuzzleSaveData,
  });
  private engine!: HaiyueEngine;
  private scene!: ReturnType<HaiyueEngine['createScene']>;
  private world!: World;
  private validCells = new Map<string, BoardCell>();
  private boardMats = new Map<string, TextVisual>();
  private pieces: PieceState[] = [];
  private occupancy = new Map<string, string>();
  private selectedPiece: PieceState | null = null;
  private drag: DragState | null = null;
  private lastPieceClick: LastPieceClick | null = null;
  private pieceLayerCounter = 0;
  private doubleClickAction: DoubleClickAction = 'rotate';
  private guiHitRects: Rect[] = [];
  private targetKeys = new Set<string>();
  private currentDate = new Date();
  private selectedMonth = this.currentDate.getMonth() + 1;
  private selectedDay = this.currentDate.getDate();
  private selectedWeekday = this.currentDate.getDay();
  private monthSelect!: GuiSelect<number>;
  private daySelect!: GuiSelect<number>;
  private weekdaySelect!: GuiSelect<number>;
  private readonly keydownHandler = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === 'r') {
      event.preventDefault();
      this.rotateSelected();
    } else if (key === 'f') {
      event.preventDefault();
      this.flipSelected();
    }
  };

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.92, g: 0.96, b: 0.92, a: 1 },
    });
    await this.engine.init();

    this.scene = this.engine.createScene({
      name: 'CalendarPuzzle',
      render3D: false,
      render2D: false,
      gui: false,
    });
    this.scene.clear({ keepCamera: false });
    this.world = this.scene.world;
    this.setupScene();
    this.buildStaticUI();
    this.buildBoard();
    this.buildPieces();
    this.setupGui();
    this.bindInput(canvas);
    await this.loadOrStart();

    this.engine.switchScene(this.scene);
    this.engine.on('update', ({ detail: { time } }) => {
      this.updateSelectionPulse(time);
    });
    this.engine.run();
  }

  stop(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    this.engine?.destroy();
  }

  private setupScene(): void {
    const camera = new Camera3D({
      type: 'orthographic',
      near: 0.1,
      far: 100,
      left: -VIEW_W / 2,
      right: VIEW_W / 2,
      top: VIEW_H / 2,
      bottom: -VIEW_H / 2,
    });
    const transform = new CartesianTransform3D({ position: [0, 8, 0] });
    transform.setRotation(-Math.PI / 2, 0, 0);

    const camEntity = new Entity('Camera');
    camEntity.addComponent(camera);
    camEntity.addComponent(transform);
    // Keep the Scene RenderView and the manually installed Render3DSystem on the
    // same camera. The default scene camera was removed by clear(), so merely
    // adding this entity to the World leaves RenderIntegration rendering from
    // the detached default camera.
    this.scene.setCamera(camEntity);
    this.scene.addSystem(new Render3DSystem(this.engine, camEntity, { loadOp: 'clear', transparentSort: false }));
  }

  private buildStaticUI(): void {
    this.createText('Background', '', { x: 0, y: 0, width: CANVAS_W, height: CANVAS_H }, {
      backgroundColor: '#eef6f1',
      borderColor: '#eef6f1',
      borderWidth: 0,
      borderRadius: 0,
    }, 0.01);
    this.createText('Title', '日历拼图', { x: 54, y: 28, width: 190, height: 48 }, this.labelStyle(40, '#22313a', 900, 'left'), 0.2);
    this.createText('Subtitle', '空出月份、日期、星期三格；拖拽拼图块到棋盘附近自动吸附。', { x: 54, y: 74, width: 520, height: 30 }, this.labelStyle(16, '#63717c', 800, 'left'), 0.2);

    this.createText('BoardBack', '', {
      x: BOARD_LEFT - 12,
      y: BOARD_TOP - 12,
      width: BOARD_COLS * PITCH - GAP + BOARD_PAD * 2 + 24,
      height: BOARD_ROWS * PITCH - GAP + BOARD_PAD * 2 + 24,
    }, this.cardStyle('#c9904f', '#8a5b2b', 7), 0.05);

  }

  private buildBoard(): void {
    for (const cell of BOARD_CELLS) this.validCells.set(cellKey(cell.row, cell.col), cell);
    const origin = this.boardOrigin();
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const item = this.validCells.get(cellKey(row, col));
        if (!item) continue;
        const mat = this.createText(`Cell_${row}_${col}`, item.label, {
          x: origin.x + col * PITCH,
          y: origin.y + row * PITCH,
          width: CELL,
          height: CELL,
        }, this.cellStyle(false), 0.12);
        this.boardMats.set(cellKey(row, col), mat);
      }
    }
  }

  private buildPieces(): void {
    this.pieces = PIECES.map((def, index) => ({
      def,
      rotation: 0,
      flipped: false,
      layer: index,
      x: 0,
      y: 0,
      placed: false,
      row: -1,
      col: -1,
      visuals: [],
      styleKey: '',
    }));
    this.layoutTray();
  }

  private setupGui(): void {
    const rootEntity = new Entity('CalendarPuzzleGui');
    const guiRoot = new GuiRoot({
      theme: {
        fontSize: 24,
        radius: 8,
        colors: {
          text: '#26323a',
          textMuted: '#6d7b86',
          primary: '#0f766e',
          danger: '#dc2626',
          background: '#fffaf0',
          surface: '#f4d7a1',
          border: '#c7924e',
          hover: '#f0c878',
          active: '#e5b765',
          disabled: '#94a3b8',
        },
      },
    });

    const monthRect = { x: 656, y: 28, width: 120, height: 42 };
    const dayRect = { x: 786, y: 28, width: 120, height: 42 };
    const weekdayRect = { x: 916, y: 28, width: 120, height: 42 };
    const todayRect = { x: 1046, y: 28, width: 94, height: 42 };
    const resetRect = { x: 656, y: 78, width: 120, height: 36 };
    const rotateRadioRect = { x: 800, y: 82, width: 88, height: 30 };
    const flipRadioRect = { x: 902, y: 82, width: 88, height: 30 };
    this.guiHitRects = [todayRect, resetRect, rotateRadioRect, flipRadioRect];

    this.monthSelect = guiRoot.add(new GuiSelect<number>({
      x: monthRect.x,
      y: 28,
      width: monthRect.width,
      height: monthRect.height,
      value: this.selectedMonth,
      options: this.monthOptions(),
      optionHeight: 34,
      maxVisibleOptions: 6,
      onChange: (value) => this.onMonthSelected(value),
    }));
    this.daySelect = guiRoot.add(new GuiSelect<number>({
      x: dayRect.x,
      y: dayRect.y,
      width: dayRect.width,
      height: dayRect.height,
      value: this.selectedDay,
      options: this.dayOptions(this.selectedMonth),
      optionHeight: 34,
      maxVisibleOptions: 7,
      onChange: (value) => this.onDaySelected(value),
    }));
    this.weekdaySelect = guiRoot.add(new GuiSelect<number>({
      x: weekdayRect.x,
      y: weekdayRect.y,
      width: weekdayRect.width,
      height: weekdayRect.height,
      value: this.selectedWeekday,
      options: this.weekdayOptions(),
      optionHeight: 34,
      maxVisibleOptions: 7,
      onChange: (value) => this.onWeekdaySelected(value),
    }));
    guiRoot.add(new GuiButton({
      x: todayRect.x,
      y: todayRect.y,
      width: todayRect.width,
      height: todayRect.height,
      text: '今天',
      variant: 'default',
      onClick: () => this.setToday(),
    }));
    guiRoot.add(new GuiButton({
      x: resetRect.x,
      y: resetRect.y,
      width: resetRect.width,
      height: resetRect.height,
      text: '重置',
      variant: 'default',
      onClick: () => this.resetPieces(),
    }));
    guiRoot.add(new GuiRadio<DoubleClickAction>({
      x: rotateRadioRect.x,
      y: rotateRadioRect.y,
      width: rotateRadioRect.width,
      height: rotateRadioRect.height,
      label: '旋转',
      group: 'double-click-action',
      value: 'rotate',
      checked: this.doubleClickAction === 'rotate',
      onChange: (value) => {
        this.lastPieceClick = null;
        this.doubleClickAction = value;
      },
    }));
    guiRoot.add(new GuiRadio<DoubleClickAction>({
      x: flipRadioRect.x,
      y: flipRadioRect.y,
      width: flipRadioRect.width,
      height: flipRadioRect.height,
      label: '翻转',
      group: 'double-click-action',
      value: 'flip',
      checked: this.doubleClickAction === 'flip',
      onChange: (value) => {
        this.lastPieceClick = null;
        this.doubleClickAction = value;
      },
    }));

    rootEntity.addComponent(guiRoot);
    this.world.addEntity(rootEntity);
    this.scene.addSystem(new GuiSystem(this.engine, { loadOp: 'load' }));
  }

  private monthOptions(): Array<{ label: string; value: number }> {
    return Array.from({ length: 12 }, (_, index) => {
      const value = index + 1;
      return { label: `${value}月`, value };
    });
  }

  private dayOptions(month: number): Array<{ label: string; value: number }> {
    return Array.from({ length: this.daysInSelectedMonth(month) }, (_, index) => {
      const value = index + 1;
      return { label: `${value}日`, value };
    });
  }

  private weekdayOptions(): Array<{ label: string; value: number }> {
    return WEEKDAYS.map((label, value) => ({ label, value }));
  }

  private onMonthSelected(month: number): void {
    this.selectedMonth = month;
    const maxDay = this.daysInSelectedMonth(month);
    this.daySelect.options = this.dayOptions(month);
    if (this.selectedDay > maxDay) this.selectedDay = 1;
    this.daySelect.setValue(this.selectedDay, false);
    this.daySelect.markDirty();
    this.applySelectedDate(true);
  }

  private onDaySelected(day: number): void {
    this.selectedDay = day;
    this.applySelectedDate(true);
  }

  private onWeekdaySelected(weekday: number): void {
    this.selectedWeekday = weekday;
    this.applySelectedDate(true);
  }

  private setToday(): void {
    const today = new Date();
    this.selectedMonth = today.getMonth() + 1;
    this.selectedDay = today.getDate();
    this.selectedWeekday = today.getDay();
    this.monthSelect.setValue(this.selectedMonth, false);
    this.daySelect.options = this.dayOptions(this.selectedMonth);
    this.daySelect.setValue(this.selectedDay, false);
    this.weekdaySelect.setValue(this.selectedWeekday, false);
    this.applySelectedDate(true);
  }

  private daysInSelectedMonth(month: number): number {
    return new Date(this.currentDate.getFullYear(), month, 0).getDate();
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (event) => {
      if (this.isGuiPointerEvent(event)) return;
      const point = this.canvasPoint(event);

      const piece = this.pickPiece(point);
      if (!piece) {
        this.setSelectedPiece(null);
        return;
      }
      event.preventDefault();
      this.setSelectedPiece(piece);
      this.bringPieceToFront(piece);
      this.clearPieceOccupancy(piece);
      this.drag = {
        piece,
        pointerId: event.pointerId,
        offsetX: point.x - piece.x,
        offsetY: point.y - piece.y,
        startX: point.x,
        startY: point.y,
      };
      // Synthetic pointer events are used when this game is embedded in PadOS.
      // They are not eligible for native pointer capture, but PadOS already
      // forwards the complete gesture to this canvas.
      if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const point = this.canvasPoint(event);
      this.setPiecePosition(this.drag.piece, point.x - this.drag.offsetX, point.y - this.drag.offsetY);
      this.previewDrop(this.drag.piece);
    });

    const release = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const point = this.canvasPoint(event);
      const piece = this.drag.piece;
      const moved = Math.hypot(point.x - this.drag.startX, point.y - this.drag.startY);
      this.drag = null;
      if (event.isTrusted && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!this.snapPiece(piece)) {
        this.syncPieceStyle(piece);
        this.updateStatus();
      }
      if (moved <= 6) this.handlePieceClick(piece, point);
      this.saveState();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    window.addEventListener('keydown', this.keydownHandler);
  }

  private canvasPoint(event: PointerEvent | MouseEvent): Point {
    const rect = requireEngineCanvas(this.engine).getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * CANVAS_W / rect.width,
      y: (event.clientY - rect.top) * CANVAS_H / rect.height,
    };
  }

  private isGuiPointerEvent(event: PointerEvent | MouseEvent): boolean {
    const point = this.canvasPoint(event);
    return this.isInGuiElement(this.monthSelect, point) ||
      this.isInGuiElement(this.daySelect, point) ||
      this.isInGuiElement(this.weekdaySelect, point) ||
      this.guiHitRects.some(guiRect => contains(guiRect, point));
  }

  private isInGuiElement(select: GuiSelect<number>, point: Point): boolean {
    if (contains(select.rect, point)) return true;
    if (!select.open) return false;
    return contains(select.popupRect, point);
  }

  private handlePieceClick(piece: PieceState, point: Point): void {
    const now = performance.now();
    const last = this.lastPieceClick;
    const doubleClick = !!last &&
      last.piece === piece &&
      now - last.time <= 320 &&
      Math.hypot(point.x - last.x, point.y - last.y) <= 14;
    if (doubleClick) {
      this.lastPieceClick = null;
      if (this.doubleClickAction === 'flip') {
        this.flipSelected();
      } else {
        this.rotateSelected();
      }
      return;
    }
    this.lastPieceClick = { piece, time: now, x: point.x, y: point.y };
  }

  private updateSelectionPulse(time: number): void {
    if (!this.selectedPiece) return;
    const pulse = 0.14 + (Math.sin(time * 0.006) + 1) * 0.13;
    this.syncPieceStyle(this.selectedPiece, false, pulse);
  }

  private boardOrigin(): Point {
    return { x: BOARD_LEFT + BOARD_PAD, y: BOARD_TOP + BOARD_PAD };
  }

  private applySelectedDate(resetPieces: boolean): void {
    this.targetKeys = new Set([
      this.findMonthCell(this.selectedMonth),
      this.findDayCell(this.selectedDay),
      this.findWeekdayCell(this.selectedWeekday),
    ]);
    this.updateBoardTargets();
    if (resetPieces) this.resetPieces();
  }

  private async loadOrStart(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved || saved.pieces.length !== this.pieces.length) {
      this.applySelectedDate(true);
      this.saveState();
      return;
    }
    this.selectedMonth = saved.month;
    this.selectedDay = Math.min(saved.day, this.daysInSelectedMonth(saved.month));
    this.selectedWeekday = saved.weekday;
    this.monthSelect.setValue(this.selectedMonth, false);
    this.daySelect.options = this.dayOptions(this.selectedMonth);
    this.daySelect.setValue(this.selectedDay, false);
    this.weekdaySelect.setValue(this.selectedWeekday, false);
    this.applySelectedDate(false);
    this.occupancy.clear();
    saved.pieces.forEach((data, index) => {
      const piece = requiredItemAt(this.pieces, index, 'calendar puzzle pieces');
      piece.rotation = data.rotation % 4;
      piece.flipped = data.flipped;
      piece.layer = data.layer;
      piece.row = data.row;
      piece.col = data.col;
      piece.placed = data.placed && this.canPlace(piece, data.row, data.col);
      this.rebuildPieceVisuals(piece);
      this.setPiecePosition(piece, data.x, data.y);
      if (piece.placed) this.occupyPiece(piece);
      this.syncPieceStyle(piece);
    });
    this.updateStatus();
    this.checkWin();
  }

  private saveState(): void {
    this.saves.save({
      month: this.selectedMonth,
      day: this.selectedDay,
      weekday: this.selectedWeekday,
      pieces: this.pieces.map(piece => ({
        rotation: piece.rotation,
        flipped: piece.flipped,
        layer: piece.layer,
        x: piece.x,
        y: piece.y,
        placed: piece.placed,
        row: piece.row,
        col: piece.col,
      })),
    });
  }

  private findMonthCell(month: number): string {
    const cell = BOARD_CELLS.find(item => item.key === `m${month}`);
    if (!cell) throw new Error(`Invalid month ${month}`);
    return cellKey(cell.row, cell.col);
  }

  private findDayCell(day: number): string {
    const cell = BOARD_CELLS.find(item => item.kind === 'day' && item.label === String(day));
    if (!cell) throw new Error(`Invalid day ${day}`);
    return cellKey(cell.row, cell.col);
  }

  private findWeekdayCell(weekday: number): string {
    const cell = BOARD_CELLS.find(item => item.key === `w${weekday}`);
    if (!cell) throw new Error(`Invalid weekday ${weekday}`);
    return cellKey(cell.row, cell.col);
  }

  private updateBoardTargets(): void {
    for (const [key, visual] of this.boardMats) this.setTextStyle(visual, this.cellStyle(this.targetKeys.has(key)));
  }

  private orientedCells(piece: PieceState): Point[] {
    let cells = piece.def.cells.map(cell => ({ ...cell }));
    if (piece.flipped) cells = cells.map(cell => ({ x: -cell.x, y: cell.y }));
    for (let i = 0; i < piece.rotation % 4; i++) {
      cells = cells.map(cell => ({ x: cell.y, y: -cell.x }));
    }
    return normalizeCells(cells);
  }

  private pieceBounds(piece: PieceState): { width: number; height: number } {
    const cells = this.orientedCells(piece);
    return {
      width: Math.max(...cells.map(cell => cell.x)) + 1,
      height: Math.max(...cells.map(cell => cell.y)) + 1,
    };
  }

  private layoutTray(): void {
    this.occupancy.clear();
    this.resetPieceLayers();
    for (let index = 0; index < this.pieces.length; index++) {
      const piece = requiredItemAt(this.pieces, index, 'calendar puzzle pieces');
      this.clearPieceOccupancy(piece);
      piece.rotation = 0;
      piece.flipped = false;
      this.rebuildPieceVisuals(piece);
      const home = PIECE_HOME_POSITIONS[index] ?? this.randomPiecePosition(piece);
      this.setPiecePosition(piece, home.x, home.y);
      piece.row = -1;
      piece.col = -1;
      piece.placed = false;
    }
    this.updateStatus('拖动拼图块到棋盘附近会自动吸附。');
  }

  private resetPieces(): void {
    this.layoutTray();
    this.saveState();
  }

  private shufflePieces(): void {
    this.occupancy.clear();
    this.resetPieceLayers();
    for (const piece of this.pieces) {
      this.clearPieceOccupancy(piece);
      piece.rotation = Math.floor(Math.random() * 4);
      piece.flipped = Math.random() > 0.5;
      this.rebuildPieceVisuals(piece);
      const position = this.randomPiecePosition(piece);
      this.setPiecePosition(piece, position.x, position.y);
      piece.row = -1;
      piece.col = -1;
      piece.placed = false;
    }
    this.updateStatus();
  }

  private randomPiecePosition(piece: PieceState): Point {
    const bounds = this.pieceBounds(piece);
    const width = bounds.width * PITCH - GAP;
    const height = bounds.height * PITCH - GAP;
    const boardRect = {
      x: BOARD_LEFT - 24,
      y: BOARD_TOP - 24,
      width: BOARD_COLS * PITCH + BOARD_PAD * 2 + 48,
      height: BOARD_ROWS * PITCH + BOARD_PAD * 2 + 48,
    };
    for (let attempt = 0; attempt < 80; attempt++) {
      const point = {
        x: WORK_AREA.x + Math.random() * Math.max(1, WORK_AREA.width - width),
        y: WORK_AREA.y + Math.random() * Math.max(1, WORK_AREA.height - height),
      };
      const rect = { x: point.x, y: point.y, width, height };
      if (!this.overlaps(rect, boardRect)) return point;
    }
    return { x: WORK_AREA.x + 12, y: WORK_AREA.y + 12 };
  }

  private overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private rotateSelected(): void {
    this.lastPieceClick = null;
    if (!this.selectedPiece) return;
    this.clearPieceOccupancy(this.selectedPiece);
    this.selectedPiece.rotation = (this.selectedPiece.rotation + 1) % 4;
    this.rebuildPieceVisuals(this.selectedPiece);
    if (!this.snapPiece(this.selectedPiece)) {
      this.syncPieceStyle(this.selectedPiece);
      this.updateStatus();
    }
    this.saveState();
  }

  private flipSelected(): void {
    this.lastPieceClick = null;
    if (!this.selectedPiece) return;
    this.clearPieceOccupancy(this.selectedPiece);
    this.selectedPiece.flipped = !this.selectedPiece.flipped;
    this.rebuildPieceVisuals(this.selectedPiece);
    if (!this.snapPiece(this.selectedPiece)) {
      this.syncPieceStyle(this.selectedPiece);
      this.updateStatus();
    }
    this.saveState();
  }

  private setSelectedPiece(piece: PieceState | null): void {
    const previous = this.selectedPiece;
    this.selectedPiece = piece;
    if (previous) this.syncPieceStyle(previous);
    if (piece) this.syncPieceStyle(piece);
  }

  private clearPieceOccupancy(piece: PieceState): void {
    if (!piece.placed) return;
    for (const cell of this.orientedCells(piece)) this.occupancy.delete(cellKey(piece.row + cell.y, piece.col + cell.x));
    piece.placed = false;
  }

  private canPlace(piece: PieceState, row: number, col: number): boolean {
    for (const cell of this.orientedCells(piece)) {
      const key = cellKey(row + cell.y, col + cell.x);
      if (!this.validCells.has(key) || this.targetKeys.has(key)) return false;
      const occupiedBy = this.occupancy.get(key);
      if (occupiedBy && occupiedBy !== piece.def.id) return false;
    }
    return true;
  }

  private occupyPiece(piece: PieceState): void {
    for (const cell of this.orientedCells(piece)) this.occupancy.set(cellKey(piece.row + cell.y, piece.col + cell.x), piece.def.id);
  }

  private snapPiece(piece: PieceState): boolean {
    const origin = this.boardOrigin();
    const approxCol = Math.round((piece.x - origin.x) / PITCH);
    const approxRow = Math.round((piece.y - origin.y) / PITCH);
    const snapX = origin.x + approxCol * PITCH;
    const snapY = origin.y + approxRow * PITCH;
    const distance = Math.hypot(piece.x - snapX, piece.y - snapY);
    if (distance > SNAP_DISTANCE || !this.canPlace(piece, approxRow, approxCol)) return false;
    piece.row = approxRow;
    piece.col = approxCol;
    piece.placed = true;
    this.occupyPiece(piece);
    this.setPiecePosition(piece, snapX, snapY);
    this.syncPieceStyle(piece);
    this.checkWin();
    return true;
  }

  private previewDrop(piece: PieceState): void {
    const origin = this.boardOrigin();
    const col = Math.round((piece.x - origin.x) / PITCH);
    const row = Math.round((piece.y - origin.y) / PITCH);
    const distance = Math.hypot(piece.x - (origin.x + col * PITCH), piece.y - (origin.y + row * PITCH));
    const invalid = distance <= SNAP_DISTANCE && !this.canPlace(piece, row, col);
    this.syncPieceStyle(piece, invalid);
  }

  private checkWin(): void {
    const required = [...this.validCells.keys()].filter(key => !this.targetKeys.has(key)).length;
    if (this.occupancy.size === required && this.pieces.every(piece => piece.placed)) {
      this.updateStatus('完成！目标日期被正确空出。');
    } else {
      this.updateStatus();
    }
  }

  private updateStatus(_message?: string): void {
  }

  private pickPiece(point: Point): PieceState | null {
    const orderedPieces = [...this.pieces].sort((a, b) => b.layer - a.layer);
    for (const piece of orderedPieces) {
      for (const cell of this.orientedCells(piece)) {
        if (contains({ x: piece.x + cell.x * PITCH, y: piece.y + cell.y * PITCH, width: CELL, height: CELL }, point)) return piece;
      }
    }
    return null;
  }

  private rebuildPieceVisuals(piece: PieceState): void {
    for (const visual of piece.visuals) this.world.removeEntity(visual.entity);
    piece.visuals = [];
    piece.styleKey = '';
    const cells = this.orientedCells(piece);
    for (const _cell of cells) {
      const visual = this.createTile(piece);
      piece.visuals.push(visual);
    }
    this.setPiecePosition(piece, piece.x, piece.y);
    this.syncPieceStyle(piece);
  }

  private setPiecePosition(piece: PieceState, x: number, y: number): void {
    const bounds = this.pieceBounds(piece);
    const width = bounds.width * PITCH - GAP;
    const height = bounds.height * PITCH - GAP;
    piece.x = Math.max(8, Math.min(CANVAS_W - width - 8, x));
    piece.y = Math.max(8, Math.min(CANVAS_H - height - 8, y));
    const cells = this.orientedCells(piece);
    for (let i = 0; i < piece.visuals.length; i++) {
      const cell = requiredItemAt(cells, i, 'calendar piece cells');
      const rect = { x: piece.x + cell.x * PITCH, y: piece.y + cell.y * PITCH, width: CELL, height: CELL };
      requiredItemAt(piece.visuals, i, 'calendar piece visuals').transform.setPosition(...this.rectToWorld(rect, this.pieceRenderLayer(piece)));
    }
  }

  private bringPieceToFront(piece: PieceState): void {
    piece.layer = ++this.pieceLayerCounter;
    this.normalizePieceLayers();
    this.movePieceVisualsToRenderFront(piece);
    this.setPiecePosition(piece, piece.x, piece.y);
  }

  private movePieceVisualsToRenderFront(piece: PieceState): void {
    for (const visual of piece.visuals) {
      this.world.removeEntity(visual.entity);
      this.world.addEntity(visual.entity);
    }
  }

  private resetPieceLayers(): void {
    for (let index = 0; index < this.pieces.length; index++) requiredItemAt(this.pieces, index, 'calendar puzzle pieces').layer = index;
    this.pieceLayerCounter = this.pieces.length;
  }

  private normalizePieceLayers(): void {
    const orderedPieces = [...this.pieces].sort((a, b) => a.layer - b.layer);
    for (let index = 0; index < orderedPieces.length; index++) requiredItemAt(orderedPieces, index, 'ordered calendar pieces').layer = index;
    this.pieceLayerCounter = orderedPieces.length;
  }

  private pieceRenderLayer(piece: PieceState): number {
    return 0.32 + piece.layer * 0.004 + (piece === this.selectedPiece ? 0.04 : 0);
  }

  private syncPieceStyle(piece: PieceState, invalid = false, pulse = 0.12): void {
    const selected = piece === this.selectedPiece;
    const color = invalid ? '#ef8d79' : selected ? this.lightenHex(piece.def.color, pulse) : piece.def.color;
    const styleKey = `${color}_${selected ? 1 : 0}_${invalid ? 1 : 0}`;
    if (piece.styleKey === styleKey) {
      this.setPiecePosition(piece, piece.x, piece.y);
      return;
    }
    piece.styleKey = styleKey;
    for (const visual of piece.visuals) {
      visual.material.color = ColorSRGB.fromHex(color);
    }
    this.setPiecePosition(piece, piece.x, piece.y);
  }

  private createTile(piece: PieceState): TileVisual {
    const material = new BasicMaterial({
      color: ColorSRGB.fromHex(piece.def.color),
      blending: 'normal',
      depthWrite: false,
      cullMode: null,
    });
    const transform = new CartesianTransform3D({ position: [0, 0.3, 0] });
    const entity = new Entity(`Piece_${piece.def.id}`);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createPlane3D({
      width: CELL / CANVAS_W * VIEW_W,
      height: CELL / CANVAS_H * VIEW_H,
      normal: 'y',
    }), material));
    this.world.addEntity(entity);
    return { entity, transform, material };
  }

  private createText(name: string, text: string, rect: Rect, style: CssMaterialStyle, layer: number): TextVisual {
    const resolvedStyle = {
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height)),
      resolutionScale: 2,
      ...style,
    };
    const material = new BasicMaterial({
      texture: this.drawTextTexture(text, resolvedStyle),
      blending: 'normal',
      depthWrite: false,
      cullMode: null,
    });
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D({ position: this.rectToWorld(rect, layer) }));
    entity.addComponent(new Mesh3D(createPlane3D({
      width: rect.width / CANVAS_W * VIEW_W,
      height: rect.height / CANVAS_H * VIEW_H,
      normal: 'y',
    }), material));
    this.world.addEntity(entity);
    return { material, rect, text, style: resolvedStyle };
  }

  private setText(visual: TextVisual, text: string): void {
    if (visual.text === text) return;
    visual.text = text;
    visual.material.texture = this.drawTextTexture(visual.text, visual.style);
  }

  private setTextStyle(visual: TextVisual, style: CssMaterialStyle): void {
    visual.style = {
      width: Math.max(1, Math.floor(visual.rect.width)),
      height: Math.max(1, Math.floor(visual.rect.height)),
      resolutionScale: 2,
      ...style,
    };
    visual.material.texture = this.drawTextTexture(visual.text, visual.style);
  }

  private drawTextTexture(text: string, style: CssMaterialStyle): HTMLCanvasElement {
    const width = Math.max(1, Math.floor(style.width ?? 1));
    const height = Math.max(1, Math.floor(style.height ?? 1));
    const dpr = Math.max(1, Math.min(4, style.resolutionScale ?? 2));
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);

    const backgroundColor = style.backgroundColor ?? 'rgba(255,255,255,0)';
    const borderColor = style.borderColor ?? 'rgba(255,255,255,0)';
    const borderWidth = Math.max(0, style.borderWidth ?? 0);
    const radius = Math.max(0, style.borderRadius ?? 0);
    if (backgroundColor !== 'transparent' || borderWidth > 0) {
      this.roundedRect(context, borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth, radius);
      if (backgroundColor !== 'transparent') {
        context.fillStyle = backgroundColor;
        context.fill();
      }
      if (borderWidth > 0) {
        context.strokeStyle = borderColor;
        context.lineWidth = borderWidth;
        context.stroke();
      }
    }

    if (!text) return canvas;
    const padding = this.normalizePadding(style.padding ?? 0);
    const contentX = padding[3];
    const contentY = padding[0];
    const contentWidth = Math.max(1, width - padding[1] - padding[3]);
    const contentHeight = Math.max(1, height - padding[0] - padding[2]);
    const fontSize = Math.max(1, style.fontSize ?? 16);
    const lineHeight = Math.max(1, typeof style.lineHeight === 'number' && style.lineHeight < 4 ? fontSize * style.lineHeight : style.lineHeight ?? fontSize * 1.2);
    const fontWeight = style.fontWeight ?? 400;
    const fontFamily = style.fontFamily ?? 'Arial, Helvetica, sans-serif';
    context.font = `${style.fontStyle ?? 'normal'} ${fontWeight} ${fontSize}px ${fontFamily}`;
    context.fillStyle = style.color ?? '#000000';
    context.textBaseline = 'middle';
    context.textAlign = style.textAlign ?? 'center';

    const lines = (style.whiteSpace === 'pre-line' ? text.split(/\r?\n/) : [text]).filter(line => line.length > 0);
    let y = contentY;
    const textHeight = lines.length * lineHeight;
    if ((style.verticalAlign ?? 'middle') === 'middle') y += Math.max(0, (contentHeight - textHeight) / 2);
    else if (style.verticalAlign === 'bottom') y += Math.max(0, contentHeight - textHeight);
    y += lineHeight / 2;
    const x = context.textAlign === 'left'
      ? contentX
      : context.textAlign === 'right'
        ? contentX + contentWidth
        : contentX + contentWidth / 2;
    for (const line of lines) {
      context.fillText(line, x, y, contentWidth);
      y += lineHeight;
    }
    return canvas;
  }

  private normalizePadding(padding: CssMaterialStyle['padding']): [number, number, number, number] {
    if (typeof padding === 'number') return [padding, padding, padding, padding];
    if (Array.isArray(padding) && padding.length === 2) return [padding[0], padding[1], padding[0], padding[1]];
    if (Array.isArray(padding) && padding.length === 4) return padding;
    return [0, 0, 0, 0];
  }

  private roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  private rectToWorld(rect: Rect, layer: number): [number, number, number] {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    return [
      (centerX / CANVAS_W - 0.5) * VIEW_W,
      layer,
      (centerY / CANVAS_H - 0.5) * VIEW_H,
    ];
  }

  private labelStyle(fontSize: number, color: string, weight: number, align: 'left' | 'center' | 'right'): CssMaterialStyle {
    return {
      backgroundColor: 'rgba(255,255,255,0)',
      borderColor: 'rgba(255,255,255,0)',
      borderWidth: 0,
      padding: 0,
      textAlign: align,
      verticalAlign: 'middle',
      fontSize,
      lineHeight: 1.1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: weight,
      color,
    };
  }

  private cardStyle(backgroundColor: string, borderColor: string, radius: number): CssMaterialStyle {
    return {
      backgroundColor,
      borderColor,
      borderWidth: 2,
      borderRadius: radius * 2,
      padding: 0,
      color: '#26323a',
      fontSize: 1,
    };
  }

  private cellStyle(target: boolean): CssMaterialStyle {
    return {
      backgroundColor: target ? '#ecfeff' : '#fff4d5',
      borderColor: target ? '#0ea5a3' : 'rgba(65,48,24,0.16)',
      borderWidth: target ? 4 : 2,
      borderRadius: 7,
      padding: 0,
      textAlign: 'center',
      verticalAlign: 'middle',
      fontSize: 18,
      lineHeight: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 900,
      color: target ? '#0f766e' : 'rgba(38,50,58,0.66)',
    };
  }

  private lightenHex(hex: string, amount: number): string {
    const color = ColorSRGB.fromHex(hex);
    color.r = Math.min(1, color.r + (1 - color.r) * amount);
    color.g = Math.min(1, color.g + (1 - color.g) * amount);
    color.b = Math.min(1, color.b + (1 - color.b) * amount);
    return color.toHex();
  }
}

const standaloneCanvas = document.querySelector<HTMLCanvasElement>('[data-calendar-puzzle-game]');
if (standaloneCanvas) {
  const game = new CalendarPuzzleGame();
  void game.init(standaloneCanvas).catch(error => console.error(error));
}
