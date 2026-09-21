import { CalendarRewardView, REWARD_COPY, REWARD_GLYPHS } from './reward-ui';
import type { CalendarRewards } from './rewards';
import { CalendarPurchaseView, PURCHASE_COPY, PURCHASE_GLYPHS } from './purchase-ui';
import { canPlayCalendarDate, type CalendarPurchases } from './purchases';
import { CalendarAudio, type CalendarAudioBackend } from './audio/CalendarAudio';
import { CalendarBrowserAudio } from './audio/BrowserAudio';
import { BasicMaterial, Camera3D, CartesianTransform3D, ColorSRGB, Entity, Mesh3D, HaiyueEngine, World, createPlane3D } from '@haiyue/engine';
import { type MaterialTextureSource, type CssMaterialStyle } from '@haiyue/engine/material';
import { Render3DSystem } from '@haiyue/engine/systems';
import { requireEngineCanvas } from '@haiyue/engine/experimental';
import {
  type GuiFontOptions,
  GuiButton,
  GuiImage,
  GuiElement,
  GuiLabel,
  GuiRoot,
  GuiSelect,
  GuiSystem,
} from '@haiyue/engine/gui';
import type { GameSaveBackend } from '@haiyue/engine/save';
import { calendarLayout, calendarViewport, calendarPointer } from './viewport';
import { calendarTray, calendarOrientedCells, calendarPieceContains } from './tray';
import { CalendarSolverClient, type CalendarSolverWorker } from './solver-client';
import { CalendarPieceGesture } from './piece-gesture';
import { CalendarRasterSurface } from './raster-surface';
import { type CalendarPlacement } from './solver';
import { CalendarHintOverlay, calendarIconSource } from './hint-ui';
import { calendarMotionCells, type CalendarPiecePose } from './motion';
import { CALENDAR_STYLE } from './calendar-style';
import { CalendarHistoryView } from './calendar-ui';
import { CalendarCelebration } from './celebration';
import { calendarDateKey, calendarDaysInMonth, calendarWeekday, recordCalendarCompletion, recordCalendarResult } from './model';
import { CALENDAR_COPY, CALENDAR_GLYPHS, type CalendarLanguage } from './locale';
import { requiredItemAt } from '../arrayAccess';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import {
  CALENDAR_LANGUAGES,
  CALENDAR_BOARD_CELLS as BOARD_CELLS,
  CALENDAR_PIECES as PIECES,
  calendarCellKey as cellKey,
  isCalendarPuzzleSaveData,
  type CalendarBoardCell as BoardCell,
  type CalendarPieceDefinition as PieceDef,
  type CalendarPoint as Point,
  type CalendarPuzzleSaveData,
} from './model';


interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}


interface TileVisual {
  entity: Entity;
  transform: CartesianTransform3D;
  material: BasicMaterial;
}

interface TextVisual {
  key: string;
  transform: CartesianTransform3D;
  initialRect: Rect;
  material: BasicMaterial;
  rect: Rect;
  text: string;
  style: CssMaterialStyle;
}

interface PieceState {
  def: PieceDef;
  scale: number;
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

interface DragState {
  piece: PieceState;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  started: boolean;
  original: { x: number; y: number; scale: number; placed: boolean; row: number; col: number };
}

const CANVAS_W = 1200;
const CANVAS_H = 720;
const VIEW_W = 12;
const VIEW_H = CANVAS_H / CANVAS_W * VIEW_W;
const CELL = 64;
const GAP = 10;
const PITCH = CELL + GAP;
const BOARD_ROWS = 8;
const BOARD_COLS = 7;
const SNAP_DISTANCE = 36;

function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export interface CalendarPuzzlePlatform {
  purchases?: CalendarPurchases;
  rewards?: CalendarRewards;
  /** Wake a host-owned demand loop after input or asynchronous state changes. */
  requestRender?: () => void;
  engine?: HaiyueEngine;
  autoRun?: boolean;
  keyboard?: boolean;
  touchControls?: boolean;
  guiFont?: GuiFontOptions;
  createCanvas2D?: (width: number, height: number) => HTMLCanvasElement;
  textureFromCanvas?: (canvas: HTMLCanvasElement, key: string) => MaterialTextureSource;
  saveBackend?: GameSaveBackend;
  createSolverWorker?: () => CalendarSolverWorker;
  audioBackend?: CalendarAudioBackend;
}

/** Design coordinates share one scale with world picking and the orthographic camera. */
class CalendarGuiRoot extends GuiRoot {
  override layout(width: number, height: number): void {
    const view = calendarViewport(width, height);
    if (this.viewport.width !== width || this.viewport.height !== height) this.root.markDirty();
    this.viewport = { x: 0, y: 0, width, height };
    this.theme.fontSize = 25 * view.scale;
    this.root.layout({ x: 0, y: 0, width: view.width, height: view.height });
    const scaleElement = (element: GuiElement): void => {
      const r = element.rect;
      element.rect = { x: r.x * view.scale, y: r.y * view.scale, width: r.width * view.scale, height: r.height * view.scale };
      if (element instanceof GuiSelect) element.optionHeight = 56 * view.scale;
      for (const child of element.children) scaleElement(child);
    };
    for (const child of this.root.children) scaleElement(child);
    this.root.rect = this.viewport;
  }
}

export class CalendarPuzzleGame {
  private readonly saves: SingleSlotGameSave<CalendarPuzzleSaveData>;
  private readonly removeInput: Array<() => void> = [];
  private disposed = false;
  private camera!: Camera3D;
  private statusVisual?: TextVisual;
  private titleVisual?: TextVisual;
  private historyView!: CalendarHistoryView;
  private celebration!: CalendarCelebration;
  private historyOpen = false;
  private completedDates: string[] = [];
  private starredDates: string[] = [];
  private hintUsed = false;
  private won = false;
  private layout = calendarLayout(1600, 720);
  private readonly textLayouts = new Map<TextVisual, () => Rect>();
  private language: CalendarLanguage = 'zh';
  private settingsOpen = false;
  private languageSelect?: GuiSelect<CalendarLanguage>;
  private purchaseView?: CalendarPurchaseView;
  private rewardView?: CalendarRewardView;
  private hintBadge?: GuiLabel;
  private guiRoot!: CalendarGuiRoot;
  private readonly mainControls: GuiElement[] = [];
  private readonly settingControls: GuiElement[] = [];
  private readonly ui = new Map<string, GuiElement>();
  private readonly localized: Array<() => void> = [];
  private shuffleSeed = 20260919;
  private readonly audio: CalendarAudio;
  private readonly solver: CalendarSolverClient;
  private readonly textSurface: CalendarRasterSurface;
  private hintOverlay!: CalendarHintOverlay;
  private hintBusy = false;
  private hintRevision = 0;
  private hintCompatible = true;
  private readonly motions = new Map<PieceState, { from: CalendarPiecePose; to: CalendarPiecePose; start: number; duration: number; lift: number }>();
  private get copy() { return CALENDAR_COPY[this.language]; }
  private readonly updateFrame = ({ detail: { time } }: { detail: { time: number } }): void => {
    this.resizeView();
    this.updateSelectionPulse(time);
    this.celebration?.update();
    this.hintOverlay?.update(time);
    this.updateMotions();
    this.audio.update();
  };
  constructor(private readonly platform: CalendarPuzzlePlatform = {}) {
    this.textSurface = new CalendarRasterSurface((w, h) => platform.createCanvas2D?.(w, h) ?? document.createElement('canvas'), !!platform.textureFromCanvas);
    this.audio = new CalendarAudio(platform.audioBackend ?? new CalendarBrowserAudio());
    this.solver = new CalendarSolverClient(platform.createSolverWorker);
    this.saves = new SingleSlotGameSave<CalendarPuzzleSaveData>({
      gameId: 'calendar-puzzle', name: '日历拼图 自动存档', validateData: isCalendarPuzzleSaveData,
      ...(platform.saveBackend ? { backend: platform.saveBackend } : {}),
    });
  }
  private engine!: HaiyueEngine;
  private scene!: ReturnType<HaiyueEngine['createScene']>;
  private world!: World;
  private validCells = new Map<string, BoardCell>();
  private boardMats = new Map<string, TextVisual>();
  private pieces: PieceState[] = [];
  private occupancy = new Map<string, string>();
  private selectedPiece: PieceState | null = null;
  private selectionPulseUntil = 0;
  private drag: DragState | null = null;
  private readonly pieceGesture = new CalendarPieceGesture();
  private pieceLayerCounter = 0;
  private targetKeys = new Set<string>();
  private currentDate = new Date();
  private selectedYear = this.currentDate.getFullYear();
  private selectedMonth = this.currentDate.getMonth() + 1;
  private selectedDay = this.currentDate.getDate();
  private selectedWeekday = this.currentDate.getDay();
  private readonly keydownHandler = (event: KeyboardEvent): void => {
    this.platform.requestRender?.();
    const key = event.key.toLowerCase();
    if (key === 'escape') { if (this.platform.rewards?.snapshot().busy) return; this.toggleRewards(false); this.togglePurchase(false); this.toggleSettings(false); this.closeCelebration(false); this.toggleHistory(false); return; }
    if (this.rewardView?.visible || this.purchaseView?.visible || this.settingsOpen || this.historyOpen || this.celebration?.visible) return;
    if (key === 'r') {
      event.preventDefault();
      this.rotateSelected();
    } else if (key === 'h') {
      event.preventDefault(); void this.requestHint();
    } else if (key === 'f') {
      event.preventDefault();
      this.flipSelected();
    }
  };

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = this.platform.engine ?? new HaiyueEngine({
      canvas,
      clearColor: { r: 0.92, g: 0.96, b: 0.92, a: 1 },
      msaaSamples: 4,
      defaults: { assetManager: { texture: { format: 'rgba8unorm-srgb' } } },
    });
    if (!this.platform.engine) await this.engine.init();

    await this.audio.load();
    this.layout = calendarLayout(this.engine.displayWidth, this.engine.displayHeight);
    this.scene = this.engine.createScene({
      name: 'CalendarPuzzle',
      defaults: { assetManager: { texture: { format: 'rgba8unorm-srgb' } } },
      view: { clearColor: { r: 0.9, g: 0.94, b: 0.92, a: 1 } },
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
    if (this.platform.purchases) {
      let entitled = this.platform.purchases.snapshot().entitled;
      this.removeInput.push(this.platform.purchases.subscribe(() => {
        const next = this.platform.purchases!.snapshot().entitled;
        if (entitled && !next) {
          this.cancelHint(); this.cancelInteraction();
          if (!this.canPlayDate()) this.togglePurchase(true);
        }
        entitled = next;
        this.platform.rewards?.refresh();
        this.purchaseView?.refresh(); this.platform.requestRender?.();
      }));
      if (!this.canPlayDate()) this.togglePurchase(true);
    }

    if (this.platform.rewards) this.removeInput.push(this.platform.rewards.subscribe(() => this.refreshRewards()));
    this.refreshRewards();
    this.engine.switchScene(this.scene);
    this.resizeView();
    this.engine.on('update', this.updateFrame);
    if (this.platform.autoRun !== false) this.engine.run();
  }

  stop(): void { this.dispose(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelInteraction(); this.cancelHint(); this.solver.dispose(); this.finishMotions(); this.audio.dispose();
    this.textSurface.dispose();
    this.hintOverlay?.dispose();
    this.purchaseView?.dispose();
    for (const remove of this.removeInput.splice(0)) remove();
    this.engine?.off('update', this.updateFrame);
    this.world?.destroy();
    if (!this.platform.engine) this.engine?.destroy();
  }
  async flushSave(): Promise<void> { await this.saves.flush(); }
  needsAnimationFrame(): boolean {
    return !this.disposed && (this.motions.size > 0 || this.celebration?.isAnimating === true
      || (!!this.selectedPiece && performance.now() < this.selectionPulseUntil)
      || this.hintOverlay?.isAnimating === true || this.audio.hasPending);
  }
  snapshot() {
    return { solver: this.solver.snapshot(), rewards: this.platform.rewards?.snapshot(), rewardOpen: this.rewardView?.visible ?? false, languageMenu: this.languageSelect ? { open: this.languageSelect.open, popup: this.languageSelect.popupRect, optionHeight: this.languageSelect.optionHeight, scrollY: this.languageSelect.scrollY, values: this.languageSelect.options.map(option => option.value) } : null, purchases: this.platform.purchases?.snapshot(), purchaseOpen: this.purchaseView?.visible ?? false, audio: this.audio.snapshot(), hintBusy: this.hintBusy, hint: this.hintOverlay.placement, hintCompatible: this.hintCompatible, animating: this.motions.size, language: this.language, settingsOpen: this.settingsOpen, historyOpen: this.historyOpen, history: this.historyView.snapshot(), completedDates: [...this.completedDates], starredDates: [...this.starredDates], hintUsed: this.hintUsed, celebrating: this.celebration.visible, year: this.selectedYear, board: this.layout.board, tray: this.layout.tray,
      ui: Object.fromEntries([...this.ui].map(([key, value]) => [key, { ...value.rect, hovered: value.hovered, pressed: value.pressed, focused: value.focused }])),
      month: this.selectedMonth, day: this.selectedDay, weekday: this.selectedWeekday,
      dragging: !!this.drag, placed: this.pieces.filter(piece => piece.placed).length,
      occupied: this.occupancy.size, pieces: this.pieces.map(piece => ({ id: piece.def.id,
        x: piece.x, y: piece.y, scale: piece.scale, cells: this.orientedCells(piece), rotation: piece.rotation, flipped: piece.flipped, placed: piece.placed })) };
  }
  suspendAudio(): void { this.audio.suspend(); }
  cancelInteraction(): void {
    const drag = this.drag;
    this.drag = null;
    this.pieceGesture.cancel();
    if (!drag) return;
    this.engine.canvas?.releasePointerCapture?.(drag.pointerId);
    Object.assign(drag.piece, drag.original);
    if (drag.original.placed) {
      for (const cell of this.orientedCells(drag.piece)) {
        this.occupancy.set(cellKey(drag.piece.row + cell.y, drag.piece.col + cell.x), drag.piece.def.id);
      }
    }
    this.setPiecePosition(drag.piece, drag.original.x, drag.original.y);
    this.syncPieceStyle(drag.piece);
  }
  private resizeView(): void {
    const next = calendarLayout(this.engine.displayWidth, this.engine.displayHeight);
    if (next.width !== this.layout.width || next.height !== this.layout.height) {
      this.cancelInteraction(); this.finishMotions();
      this.layout = next;
      for (const [visual, rect] of this.textLayouts) this.resizeText(visual, rect());
      const homes = calendarTray(next.tray.width, next.tray.height, this.shuffleSeed, this.pieces);
      this.pieces.forEach((piece, i) => {
        const home = homes[i]!;
        if (piece.placed) this.setPiecePosition(piece, next.board.x + piece.col * PITCH, next.board.y + piece.row * PITCH);
        else { piece.scale = home.scale; this.setPiecePosition(piece, next.tray.x + home.x, next.tray.y + home.y); }
      });
      this.guiRoot?.root.markDirty();
    }
    this.camera.orthoLeft = -next.width / 200; this.camera.orthoRight = next.width / 200;
    this.camera.orthoTop = next.height / 200; this.camera.orthoBottom = -next.height / 200;
  }
  private resizeText(visual: TextVisual, rect: Rect): void {
    const changed = rect.width !== visual.rect.width || rect.height !== visual.rect.height;
    visual.rect = rect;
    visual.transform.setPosition(...this.rectToWorld(rect, visual.key.startsWith('Cell_') ? 0.12 : visual.key === 'Background' ? 0.01 : visual.key === 'BoardBack' ? 0.05 : 0.2));
    visual.transform.setScale(rect.width / visual.initialRect.width, 1, rect.height / visual.initialRect.height);
    if (changed) this.setTextStyle(visual, visual.style);
  }
  private responsiveText(name: string, text: string, rect: () => Rect, style: CssMaterialStyle, layer: number): TextVisual {
    const visual = this.createText(name, text, rect(), style, layer);
    this.textLayouts.set(visual, rect);
    return visual;
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
    this.camera = camera;
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
    this.scene.addSystem(new Render3DSystem(this.engine, camEntity, { loadOp: 'clear', transparentSort: false, toneMapping: 'none' }));
  }

  private buildStaticUI(): void {
    this.responsiveText('Background', '', () => ({ x: 0, y: 0, width: this.layout.width, height: this.layout.height }),
      { backgroundColor: '#f4f8f5', borderWidth: 0, resolutionScale: 1 }, 0.01);
    this.titleVisual = this.responsiveText('Title', this.copy.title, () => ({ x: this.layout.edge, y: 24, width: this.layout.tray.width - 324, height: 56 }), this.labelStyle(40, '#183c3b', 800, 'left'), 0.2);
    this.statusVisual = this.responsiveText('Subtitle', this.copy.help, () => ({ x: this.layout.edge, y: this.layout.height - 64, width: this.layout.tray.width, height: 34 }), this.labelStyle(19, '#52716a', 500, 'left'), 0.2);
    this.responsiveText('BoardBack', '', () => ({ x: this.layout.board.x - 14, y: this.layout.board.y - 14, width: 536, height: 610 }), this.cardStyle(CALENDAR_STYLE.panel.background, CALENDAR_STYLE.panel.border, CALENDAR_STYLE.panel.radius / 2), 0.05);
  }

  private buildBoard(): void {
    for (const cell of BOARD_CELLS) this.validCells.set(cellKey(cell.row, cell.col), cell);
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const item = this.validCells.get(cellKey(row, col));
        if (!item) continue;
        const mat = this.responsiveText(`Cell_${row}_${col}`, this.cellLabel(item), () => ({
          x: this.layout.board.x + col * PITCH, y: this.layout.board.y + row * PITCH, width: CELL, height: CELL,
        }), this.cellStyle(false), 0.12);
        this.boardMats.set(cellKey(row, col), mat);
      }
    }
  }

  private buildPieces(): void {
    this.pieces = PIECES.map((def, index) => ({
      def,
      scale: 1,
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
    const root = this.guiRoot = new CalendarGuiRoot({ theme: { fontSize: 25, radius: 10, colors: {
      text: '#183c3b', textMuted: '#52716a', primary: '#17847b', danger: '#d14d58', background: '#f4f8f5',
      surface: '#ffffff', border: '#b7d6c8', hover: '#d9eee6', active: '#bde0d3', disabled: '#91a39d',
    } } });
    const panel = () => ({ x: (this.layout.width - 780) / 2, y: (this.layout.height - 420) / 2, width: 780, height: 420 });
    const place = <T extends GuiElement>(id: string, element: T, rect: () => Rect, setting = false): T => {
      element.layout = () => { element.rect = rect(); };
      root.add(element); this.ui.set(id, element);
      (setting ? this.settingControls : this.mainControls).push(element);
      element.setVisible(!setting);
      return element;
    };
    const button = (id: string, caption: () => string, rect: () => Rect, action: () => void, setting = false) => {
      const element = place(id, new GuiButton({ text: caption(), onClick: action }), rect, setting);
      this.localized.push(() => { element.text = caption(); element.markDirty(); }); return element;
    };
    const label = (id: string, caption: () => string, rect: () => Rect, size = 22) => {
      const element = place(id, new GuiLabel({ text: caption(), style: { color: '#52716a' } }), rect, true);
      element.layout = () => { element.rect = rect(); element.setFontSize(size * this.layout.scale); };
      this.localized.push(() => element.setText(caption()));
    };
    const settingsRect = () => ({ x: this.layout.width - this.layout.edge - 56, y: 12, width: 56, height: 56 });
    button('settings', () => '', settingsRect, () => this.toggleSettings(true));
    const raster = { canvas: (w: number, h: number) => this.platform.createCanvas2D?.(w, h) ?? document.createElement('canvas'), texture: this.platform.textureFromCanvas };
    place('settingsIcon', new GuiImage({ source: calendarIconSource('settings', raster), disabled: true }), () => ({ x: settingsRect().x + 8, y: settingsRect().y + 8, width: 40, height: 40 }));
    for (const [index, id, action] of [
      [0, 'rotate', () => this.rotateSelected()], [1, 'flip', () => this.flipSelected()],
      [2, 'hint', () => { void this.requestHint(); }], [3, 'shuffle', () => this.resetPieces(true)],
    ] as const) {
      const rect = () => ({ x: this.layout.tray.x + this.layout.tray.width - 304 + index * 70 + (id === 'shuffle' ? 38 : 0), y: 24, width: 56, height: 56 });
      button(id, () => '', rect, action);
      place(id + 'Icon', new GuiImage({ source: calendarIconSource(id, raster), disabled: true }), () => ({ x: rect().x + 8, y: rect().y + 8, width: 40, height: 40 }));
    }
    place('shuffleDivider', new GuiElement({ disabled: true, style: { backgroundColor: '#b7d6c8', radius: 0 } }),
      () => ({ x: this.layout.tray.x + this.layout.tray.width - 83, y: 36, width: 2, height: 32 }));
    if (this.platform.rewards) {
      this.hintBadge = place('hintCount', new GuiLabel({text:'',textAlign:'center',disabled:true,style:{color:'#17847b',backgroundColor:'#ffffff',radius:9}}),
        () => ({x:this.layout.tray.x+this.layout.tray.width-122,y:64,width:28,height:20}));
      const badgeLayout = this.hintBadge.layout;
      this.hintBadge.layout = r => {badgeLayout(r);this.hintBadge!.setFontSize(15*this.layout.scale);};
    }
    this.hintOverlay = new CalendarHintOverlay(root, () => this.layout, raster);
    button('calendar', () => `${this.copy.calendar} · ${this.selectedYear}/${this.selectedMonth}/${this.selectedDay}`, () => ({ x: this.layout.board.x, y: 12, width: this.layout.board.width - 76, height: 56 }), () => this.toggleHistory(!this.historyOpen));
    this.historyView = new CalendarHistoryView({ root, layout: () => this.layout, language: () => this.language, register: (id, element) => this.ui.set(id, element), choose: (year, month, day) => this.chooseDate(year, month, day), close: () => this.toggleHistory(false) });
    place('backdrop', new GuiElement({ style: { backgroundColor: 'rgba(22,51,47,0.24)', radius: 0 }, onClick: () => this.toggleSettings(false) }), () => ({ x: 0, y: 0, width: this.layout.width, height: this.layout.height }), true);
    place('panel', new GuiElement({ style: { backgroundColor: '#f8fcf9', radius: 22 } }), panel, true);
    label('settingsTitle', () => this.copy.settings, () => ({ x: panel().x + 38, y: panel().y + 24, width: 600, height: 52 }), 34);
    label('languageLabel', () => this.copy.language, () => ({ x: panel().x + 38, y: panel().y + 106, width: 600, height: 36 }));
    const languageSelect = this.languageSelect = place('languageSelect', new GuiSelect<CalendarLanguage>({
      value: this.language, options: CALENDAR_LANGUAGES.map(option => ({ ...option })),
      optionHeight: 56, maxVisibleOptions: 6, onChange: language => this.setLanguage(language),
    }), () => ({ x: panel().x + 38, y: panel().y + 140, width: 692, height: 64 }), true);
    this.localized.push(() => languageSelect.setValue(this.language));
    if (this.platform.purchases) button('settingsPurchases', () => PURCHASE_COPY[this.language].title, () => ({ x: panel().x + 38, y: panel().y + 240, width: this.platform.rewards ? 334 : 692, height: 54 }), () => this.togglePurchase(true), true);
    if (this.platform.rewards) button('rewardPrivacy', () => REWARD_COPY[this.language].privacy, () => ({x:panel().x+388,y:panel().y+240,width:342,height:54}), () => {void this.platform.rewards!.privacy();}, true);
    button('settingsCalendar', () => this.copy.history, () => ({ x: panel().x + 38, y: panel().y + 312, width: 300, height: 66 }), () => { this.toggleSettings(false, false); this.toggleHistory(true); }, true);
    button('done', () => this.copy.done, () => ({ x: panel().x + 512, y: panel().y + 312, width: 218, height: 66 }), () => this.toggleSettings(false), true);
    this.celebration = new CalendarCelebration({ root, layout: () => this.layout, language: () => this.language, canvas: (w, h) => this.platform.createCanvas2D?.(w, h) ?? document.createElement('canvas'), texture: this.platform.textureFromCanvas, register: (id, element) => this.ui.set(id, element), close: history => this.closeCelebration(history) });
    if (this.platform.purchases) this.purchaseView = new CalendarPurchaseView({
      root, raster, layout: () => this.layout, language: () => this.language, purchases: this.platform.purchases,
      register: (id, element) => this.ui.set(id, element), close: () => this.togglePurchase(false),
      today: () => { this.togglePurchase(false); const today = new Date(); this.chooseDate(today.getFullYear(), today.getMonth() + 1, today.getDate()); },
    });
    if (this.platform.rewards) this.rewardView = new CalendarRewardView({
      root, layout:()=>this.layout, language:()=>this.language, rewards:this.platform.rewards,
      register:(id,element)=>this.ui.set(id,element), close:()=>this.toggleRewards(false),
      use:()=>{this.toggleRewards(false);void this.requestHint();}, buy:()=>{this.toggleRewards(false);this.togglePurchase(true);},
    });
    rootEntity.addComponent(root); this.world.addEntity(rootEntity);
    this.scene.addSystem(new GuiSystem(this.engine, { loadOp: 'load', font: { ...this.platform.guiFont, chars: [...new Set(CALENDAR_GLYPHS + PURCHASE_GLYPHS + REWARD_GLYPHS + JSON.stringify(CALENDAR_LANGUAGES))].join(''), fontSize: 40, atlasSize: 2048 } }));
    this.refreshLanguage();
  }
  private canPlayDate(year = this.selectedYear, month = this.selectedMonth, day = this.selectedDay): boolean {
    return !this.platform.purchases || canPlayCalendarDate(this.platform.purchases.snapshot().entitled, year, month, day);
  }
  private allowPlay(): boolean {
    if (this.rewardView?.visible || this.platform.rewards?.snapshot().busy || this.purchaseView?.visible) return false;
    if (this.canPlayDate()) return true;
    this.togglePurchase(true); return false;
  }
  private refreshRewards(): void {
    const state=this.platform.rewards?.snapshot();
    if (!state) return;
    this.hintBadge?.setText(state.unlimited ? '∞' : String(state.free+state.credits));
    this.rewardView?.refresh();
    this.ui.get('rewardPrivacy')?.setVisible(this.settingsOpen && state.privacyRequired);
    this.platform.requestRender?.();
  }
  private toggleRewards(open: boolean): void {
    if (!this.rewardView || this.platform.rewards?.snapshot().busy) return;
    this.cancelInteraction(); this.cancelHint(); this.finishMotions();
    for (const control of this.mainControls) control.setVisible(!open);
    this.rewardView.setVisible(open); this.updateStatus(); this.platform.requestRender?.();
  }
  private togglePurchase(open: boolean): void {
    if (!this.purchaseView) return;
    this.cancelInteraction(); this.cancelHint(); this.finishMotions();
    if (open) { this.toggleSettings(false, false); this.toggleHistory(false, false); this.celebration?.hide(); }
    for (const control of this.mainControls) control.setVisible(!open);
    this.purchaseView.setVisible(open); this.platform.requestRender?.();
  }
  private toggleSettings(open: boolean, feedback = true): void {
    this.languageSelect?.setOpen(false);
    if (feedback && open !== this.settingsOpen) this.audio.cue(open ? 'settings' : 'back');
    this.cancelInteraction(); this.cancelHint(); this.finishMotions(); this.settingsOpen = open;
    this.historyView.setVisible(this.historyOpen && !open);
    for (const control of this.mainControls) control.setVisible(!open);
    for (const control of this.settingControls) control.setVisible(open);
    this.refreshRewards();
  }
  private setLanguage(language: CalendarLanguage): void {
    if (language !== this.language) this.audio.cue('settings');
    this.language = language; this.refreshLanguage(); this.saveState();
  }
  private refreshLanguage(): void {
    this.refreshRewards();
    this.purchaseView?.refresh();
    for (const localize of this.localized) localize();
    this.historyView.refresh();
    if (this.titleVisual) this.setText(this.titleVisual, this.copy.title);
    for (const cell of BOARD_CELLS) { const visual = this.boardMats.get(cellKey(cell.row, cell.col)); if (visual) this.setText(visual, this.cellLabel(cell)); }
    this.updateStatus();
  }
  private cellLabel(cell: BoardCell): string {
    return cell.kind === 'month' ? this.copy.months[Number(cell.key.slice(1)) - 1]! : cell.kind === 'weekday' ? this.copy.weekdays[Number(cell.key.slice(1))]! : cell.label;
  }

  private toggleHistory(open: boolean, feedback = true): void {
    if (feedback && open !== this.historyOpen) this.audio.cue(open ? 'settings' : 'back');
    this.cancelInteraction(); this.cancelHint(); this.finishMotions(); this.historyOpen = open;
    if (open) this.historyView.open(this.selectedYear, this.selectedMonth, this.selectedDay, this.completedDates, this.starredDates);
    else this.historyView.setVisible(false);
    this.updateStatus();
  }
  private chooseDate(year: number, month: number, day: number): void {
    if (!this.canPlayDate(year, month, day)) { this.togglePurchase(true); return; }
    const changed = year !== this.selectedYear || month !== this.selectedMonth || day !== this.selectedDay;
    this.selectedYear = year; this.selectedMonth = month; this.selectedDay = day;
    this.selectedWeekday = calendarWeekday(year, month, day);
    this.audio.cue('date'); this.toggleHistory(false, false);
    if (changed) this.applySelectedDate(true);
    this.refreshLanguage(); this.saveState();
  }
  private closeCelebration(history: boolean): void {
    this.celebration?.hide();
    for (const control of this.mainControls) control.setVisible(!this.settingsOpen);
    this.audio.cue('back');
    if (history) this.toggleHistory(true, false);
  }
  private daysInSelectedMonth(month: number): number { return calendarDaysInMonth(this.selectedYear, month); }

  private bindInput(canvas: HTMLCanvasElement): void {
    const listen = (type: string, handler: (event: PointerEvent) => void): void => {
      const wake = (event: PointerEvent) => { this.platform.requestRender?.(); handler(event); };
      canvas.addEventListener(type, wake as EventListener);
      this.removeInput.push(() => canvas.removeEventListener(type, wake as EventListener));
    };
    listen('pointerdown', (event) => {
      this.audio.unlock();
      if (this.drag || this.motions.size) return;
      if (this.isGuiPointerEvent(event)) { this.pieceGesture.cancel(); return; }
      if (!this.allowPlay()) return;
      const point = this.canvasPoint(event);

      const piece = this.pickPiece(point);
      if (!piece) {
        this.pieceGesture.cancel();
        this.setSelectedPiece(null);
        return;
      }
      event.preventDefault();
      this.cancelHint(piece);
      this.setSelectedPiece(piece);
      this.bringPieceToFront(piece);
      const original = { x: piece.x, y: piece.y, scale: piece.scale, placed: piece.placed, row: piece.row, col: piece.col };
      const offsetX = (point.x - piece.x) / piece.scale, offsetY = (point.y - piece.y) / piece.scale;
      this.pieceGesture.begin(piece.def.id, { clientX: event.clientX, clientY: event.clientY }, performance.now(), event.pointerType || 'mouse');
      this.drag = {
        original,
        piece,
        pointerId: event.pointerId,
        offsetX, offsetY,
        started: false,
      };
      // Synthetic pointer events are used when this game is embedded in PadOS.
      // They are not eligible for native pointer capture, but PadOS already
      // forwards the complete gesture to this canvas.
      if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    });

    listen('pointermove', (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      if (!this.allowPlay()) { this.cancelInteraction(); return; }
      if (this.pieceGesture.move(event)) this.moveDraggedPiece(this.drag, this.canvasPoint(event));
    });

    const release = (event: PointerEvent) => {
      if (this.drag && !this.allowPlay()) { this.cancelInteraction(); return; }
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const action = this.pieceGesture.end(event, performance.now());
      const piece = drag.piece;
      if (action === 'drag') this.moveDraggedPiece(drag, this.canvasPoint(event));
      this.drag = null;
      if (event.isTrusted && canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (action !== 'drag') {
        // A tap keeps the tray scale and board occupancy intact throughout both presses.
        if (action === 'double-tap') this.rotateSelected();
        this.saveState();
        return;
      }
      this.audio.cue('place');
      if (!this.snapPiece(piece)) {
        if (piece.x < this.layout.board.x - 30) piece.scale = this.trayScale();
        this.syncPieceStyle(piece);
        this.updateStatus();
      }
      this.saveState();
    };
    listen('pointerup', release);
    listen('pointercancel', () => this.cancelInteraction());
    if (typeof document !== 'undefined' && document.addEventListener) {
      const visibility = () => { if (document.hidden) this.audio.suspend(); };
      document.addEventListener('visibilitychange', visibility);
      this.removeInput.push(() => document.removeEventListener('visibilitychange', visibility));
    }
    if (this.platform.keyboard !== false && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keydownHandler);
      this.removeInput.push(() => window.removeEventListener('keydown', this.keydownHandler));
    }
  }

  private canvasPoint(event: PointerEvent | MouseEvent): Point {
    const rect = requireEngineCanvas(this.engine).getBoundingClientRect();
    return calendarPointer(event.clientX, event.clientY, rect);
  }

  private isGuiPointerEvent(event: PointerEvent | MouseEvent): boolean {
    if (this.rewardView?.visible || this.purchaseView?.visible || this.settingsOpen || this.historyOpen || this.celebration.visible) return true;
    const rect = requireEngineCanvas(this.engine).getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    return this.mainControls.some(control => control.visible && contains(control.rect, point));
  }

  private moveDraggedPiece(drag: DragState, point: Point): void {
    if (!drag.started) {
      drag.started = true;
      this.clearPieceOccupancy(drag.piece);
      drag.piece.scale = 1;
    }
    this.setPiecePosition(drag.piece, point.x - drag.offsetX, point.y - drag.offsetY);
    this.previewDrop(drag.piece);
  }

  private updateSelectionPulse(time: number): void {
    if (!this.selectedPiece) return;
    const pulse = time < this.selectionPulseUntil ? 0.14 + (Math.sin(time * 0.006) + 1) * 0.13 : 0.2;
    this.syncPieceStyle(this.selectedPiece, false, pulse, false);
  }

  private boardOrigin(): Point {
    return { x: this.layout.board.x, y: this.layout.board.y };
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
    this.language = saved.language ?? 'zh';
    this.completedDates = recordCalendarCompletion(saved.completedDates ?? [], '');
    this.starredDates = recordCalendarCompletion(saved.starredDates ?? [], '').filter(date => this.completedDates.includes(date));
    // Old saves did not track assistance, so they cannot establish a clean win.
    this.hintUsed = saved.hintUsed ?? true;
    this.selectedYear = saved.year ?? this.currentDate.getFullYear();
    this.selectedMonth = saved.month;
    this.selectedDay = Math.min(saved.day, this.daysInSelectedMonth(saved.month));
    this.selectedWeekday = calendarWeekday(this.selectedYear, this.selectedMonth, this.selectedDay);
    this.applySelectedDate(false);
    this.occupancy.clear();
    saved.pieces.forEach((data, index) => { const piece = this.pieces[index]!; piece.rotation = data.rotation % 4; piece.flipped = data.flipped; piece.placed = false; });
    const homes = calendarTray(this.layout.tray.width, this.layout.tray.height, this.shuffleSeed, this.pieces);
    const sameLayout = saved.layoutVersion === 2 && saved.layoutWidth === this.layout.width && saved.layoutHeight === this.layout.height;
    saved.pieces.forEach((data, index) => {
      const piece = requiredItemAt(this.pieces, index, 'calendar puzzle pieces');
      piece.rotation = data.rotation % 4;
      piece.flipped = data.flipped;
      piece.layer = data.layer;
      piece.row = data.row;
      piece.col = data.col;
      piece.placed = data.placed && this.canPlace(piece, data.row, data.col);
      this.rebuildPieceVisuals(piece);
      const home = homes[index]!;
      piece.scale = piece.placed ? 1 : sameLayout ? data.scale ?? home.scale : home.scale;
      this.setPiecePosition(piece, piece.placed ? this.layout.board.x + piece.col * PITCH : sameLayout ? data.x : this.layout.tray.x + home.x,
        piece.placed ? this.layout.board.y + piece.row * PITCH : sameLayout ? data.y : this.layout.tray.y + home.y);
      if (piece.placed) this.occupyPiece(piece);
      this.syncPieceStyle(piece);
    });
    this.refreshLanguage();
    this.updateStatus();
    this.checkWin(false);
  }

  private saveState(): void {
    this.saves.save({
      year: this.selectedYear, completedDates: [...this.completedDates],
      starredDates: [...this.starredDates], hintUsed: this.hintUsed,
      language: this.language, layoutVersion: 2, layoutWidth: this.layout.width, layoutHeight: this.layout.height,
      month: this.selectedMonth,
      day: this.selectedDay,
      weekday: this.selectedWeekday,
      pieces: this.pieces.map(piece => ({
        scale: piece.scale,
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
    return calendarOrientedCells(piece.def.cells, piece.rotation, piece.flipped);
  }

  private pieceBounds(piece: PieceState): { width: number; height: number } {
    const cells = this.orientedCells(piece);
    return {
      width: Math.max(...cells.map(cell => cell.x)) + 1,
      height: Math.max(...cells.map(cell => cell.y)) + 1,
    };
  }

  private trayScale(): number { return calendarTray(this.layout.tray.width, this.layout.tray.height, this.shuffleSeed, this.pieces)[0]!.scale; }
  private layoutTray(animate = false): void {
    this.cancelHint(); this.finishMotions();
    const previous = this.pieces.map(piece => this.piecePose(piece));
    this.cancelInteraction(); this.selectedPiece = null; this.won = false; this.celebration?.hide();
    this.occupancy.clear(); this.resetPieceLayers();
    const homes = calendarTray(this.layout.tray.width, this.layout.tray.height, this.shuffleSeed);
    this.pieces.forEach((piece, index) => {
      const home = homes[index]!;
      piece.rotation = home.rotation; piece.flipped = home.flipped; piece.scale = home.scale;
      piece.placed = false; piece.row = -1; piece.col = -1;
      this.rebuildPieceVisuals(piece);
      this.setPiecePosition(piece, this.layout.tray.x + home.x, this.layout.tray.y + home.y);
      if (animate) this.animatePiece(piece, previous[index]!, 420, index * 14, 30);
    });
    this.updateStatus();
  }
  private resetPieces(animate = false): void { if (animate && !this.allowPlay()) return; if (animate && (this.settingsOpen || this.historyOpen || this.motions.size)) return; if (animate) this.audio.cue('shuffle'); this.hintUsed = false; this.shuffleSeed++; this.layoutTray(animate); this.saveState(); }

  private rotateSelected(): void { if (this.allowPlay()) this.transformSelected(false); }
  private flipSelected(): void { if (this.allowPlay()) this.transformSelected(true); }
  private transformSelected(flip: boolean): void {
    this.pieceGesture.cancel();
    const piece = this.selectedPiece;
    if (!piece || this.settingsOpen || this.historyOpen || this.motions.size) return;
    this.audio.cue(flip ? 'flip' : 'rotate');
    this.cancelHint(piece);
    const from = this.piecePose(piece);
    this.clearPieceOccupancy(piece);
    if (flip) piece.flipped = !piece.flipped; else piece.rotation = (piece.rotation + 1) % 4;
    this.rebuildPieceVisuals(piece);
    if (!this.snapPiece(piece)) { this.syncPieceStyle(piece); this.updateStatus(); }
    this.animatePiece(piece, from, flip ? 300 : 240);
    this.saveState();
  }
  private piecePose(piece: PieceState): CalendarPiecePose { return { x: piece.x, y: piece.y, scale: piece.scale, rotation: piece.rotation, flipped: piece.flipped }; }
  private animatePiece(piece: PieceState, from: CalendarPiecePose, duration: number, delay = 0, lift = 0): void {
    this.platform.requestRender?.();
    this.motions.set(piece, { from, to: this.piecePose(piece), start: performance.now() + delay, duration, lift });
    this.updateMotions();
  }
  private finishMotions(): void {
    for (const [piece] of this.motions) { piece.visuals.forEach(v => v.transform.setRotation(0,0,0)); this.setPiecePosition(piece, piece.x, piece.y); }
    this.motions.clear();
  }
  private updateMotions(): void {
    const now = performance.now();
    for (const [piece, motion] of this.motions) {
      const t = Math.max(0, (now - motion.start) / motion.duration);
      if (t >= 1) { this.motions.delete(piece); piece.visuals.forEach(v => v.transform.setRotation(0,0,0)); this.setPiecePosition(piece,piece.x,piece.y); continue; }
      const cells = calendarMotionCells(piece.def.cells, motion.from, motion.to, t, motion.lift);
      cells.forEach((cell, i) => { const v = piece.visuals[i]!; v.transform.setScale(cell.scaleX, 1, cell.scale); v.transform.setRotation(0, cell.angle, 0); v.transform.setPosition(...this.rectToWorld({x:cell.x,y:cell.y,width:CELL*cell.scale,height:CELL*cell.scale},this.pieceRenderLayer(piece))); });
    }
  }
  private cancelHint(keep?: PieceState): void {
    this.hintRevision++; this.solver.cancel(); this.hintBusy = false;
    if (!keep || this.hintOverlay?.placement?.piece !== this.pieces.indexOf(keep)) this.hintOverlay?.hide();
  }
  private async requestHint(): Promise<void> {
    if (this.platform.purchases && !this.platform.purchases.snapshot().entitled && !this.platform.rewards) { this.togglePurchase(true); return; }
    if (!this.allowPlay()) return;
    if (this.hintBusy || this.drag || this.motions.size || this.settingsOpen || this.historyOpen || this.won) return;
    if (this.hintOverlay.placement) { this.platform.requestRender?.(); return; }
    const fixed = this.pieces.flatMap((p,piece) => p.placed ? [{piece,row:p.row,col:p.col,rotation:p.rotation,flipped:p.flipped}] : []);
    const input = { month:this.selectedMonth,day:this.selectedDay,weekday:this.selectedWeekday,fixed };
    const cached = this.solver.cached(input);
    const allowance = this.platform.rewards?.snapshot();
    // A cached, already delivered result can still be redisplayed for free.
    // Never launch a search just to discover that a new hint needs a reward.
    if (!cached && allowance && !allowance.unlimited && allowance.free + allowance.credits === 0) {
      this.toggleRewards(true); return;
    }
    this.cancelHint(); const revision = this.hintRevision;
    this.hintBusy = true; this.updateStatus();
    try {
      const result = cached ?? await this.solver.solve(input);
      if (!result || revision !== this.hintRevision || this.disposed) return;
      if (!this.canPlayDate()) { this.cancelHint(); return; }
      this.hintBusy = false;
      if (result.status !== 'solved') { this.updateStatus(result.status === 'unsolvable' ? this.copy.hintNone : this.copy.hintUnavailable); return; }
      const sameCells = (p: PieceState, target: CalendarPlacement) => {
        const key = (cells: Point[], row: number, col: number) => cells.map(c => `${row+c.y},${col+c.x}`).sort().join(';');
        return p.placed && key(this.orientedCells(p),p.row,p.col) === key(calendarOrientedCells(p.def.cells,target.rotation,target.flipped),target.row,target.col);
      };
      const choices = result.solution.filter(target => result.compatible ? !this.pieces[target.piece]!.placed : this.pieces[target.piece]!.placed && !sameCells(this.pieces[target.piece]!,target));
      const target = choices.find(p => this.pieces[p.piece] === this.selectedPiece) ?? choices[0];
      if (!target) { this.updateStatus(); return; }
      const resultKey = `${this.selectedYear}/${this.selectedMonth}/${this.selectedDay}:${target.piece}:${target.row}:${target.col}:${target.rotation}:${target.flipped}`;
      if (this.platform.rewards && !this.platform.rewards.consume(resultKey)) { this.toggleRewards(true); return; }
      this.hintCompatible = result.compatible;
      this.setSelectedPiece(this.pieces[target.piece]!); this.hintOverlay.show(target); this.updateStatus();
      this.hintUsed = true;
      this.saveState();
    } catch { if (revision === this.hintRevision && !this.disposed) { this.hintBusy=false; this.updateStatus(this.copy.hintUnavailable); } }
  }

  private setSelectedPiece(piece: PieceState | null): void {
    this.selectionPulseUntil = piece ? performance.now() + 900 : 0;
    this.platform.requestRender?.();
    const previous = this.selectedPiece;
    this.selectedPiece = piece;
    if (previous) this.syncPieceStyle(previous);
    if (piece) this.syncPieceStyle(piece);
  }

  private clearPieceOccupancy(piece: PieceState): void {
    if (!piece.placed) return;
    for (const cell of this.orientedCells(piece)) this.occupancy.delete(cellKey(piece.row + cell.y, piece.col + cell.x));
    piece.placed = false; this.won = false;
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
    if (piece.scale !== 1) return false;
    const approxCol = Math.round((piece.x - origin.x) / PITCH);
    const approxRow = Math.round((piece.y - origin.y) / PITCH);
    const snapX = origin.x + approxCol * PITCH;
    const snapY = origin.y + approxRow * PITCH;
    const distance = Math.hypot(piece.x - snapX, piece.y - snapY);
    if (distance > SNAP_DISTANCE || !this.canPlace(piece, approxRow, approxCol)) return false;
    piece.scale = 1;
    piece.row = approxRow;
    piece.col = approxCol;
    piece.placed = true;
    this.occupyPiece(piece);
    this.setPiecePosition(piece, snapX, snapY);
    this.syncPieceStyle(piece);
    if (this.hintOverlay.placement?.piece === this.pieces.indexOf(piece)) this.cancelHint();
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

  private checkWin(celebrate = true): void {
    const required = [...this.validCells.keys()].filter(key => !this.targetKeys.has(key)).length;
    if (this.occupancy.size === required && this.pieces.every(piece => piece.placed)) {
      if (!this.won) {
        this.won = true;
        const result = recordCalendarResult(this.completedDates, this.starredDates, calendarDateKey(this.selectedYear, this.selectedMonth, this.selectedDay), this.hintUsed);
        this.completedDates = result.completedDates;
        this.starredDates = result.starredDates;
        this.saveState();
        if (celebrate) { this.audio.cue('win'); this.setSelectedPiece(null); this.mainControls.forEach(control => control.setVisible(false)); this.celebration.show(); }
      }
      this.updateStatus(this.copy.won);
    } else {
      this.updateStatus();
    }
  }

  private updateStatus(message?: string): void {
    this.platform.requestRender?.();
    const count = this.pieces.filter(piece => piece.placed).length;
    if (this.statusVisual) this.setText(this.statusVisual, message ?? (this.hintBusy ? this.copy.solving : this.hintOverlay?.placement ? this.hintCompatible ? this.copy.hintPlace : this.copy.hintAdjust : this.historyOpen ? this.copy.chooseDate : this.won ? this.copy.won : count ? `${this.copy.progress} ${count} / ${PIECES.length}` : this.copy.help));
  }

  private pickPiece(point: Point): PieceState | null {
    const orderedPieces = [...this.pieces].sort((a, b) => b.layer - a.layer);
    for (const piece of orderedPieces) {
      const local = { x: (point.x - piece.x) / piece.scale, y: (point.y - piece.y) / piece.scale };
      if (calendarPieceContains(this.orientedCells(piece), local, CELL, GAP)) return piece;
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
    const width = (bounds.width * PITCH - GAP) * piece.scale;
    const height = (bounds.height * PITCH - GAP) * piece.scale;
    piece.x = Math.max(8, Math.min(this.layout.width - width - 8, x));
    piece.y = Math.max(8, Math.min(this.layout.height - height - 8, y));
    const cells = this.orientedCells(piece);
    for (let i = 0; i < piece.visuals.length; i++) {
      const cell = requiredItemAt(cells, i, 'calendar piece cells');
      const rect = { x: piece.x + cell.x * PITCH * piece.scale, y: piece.y + cell.y * PITCH * piece.scale, width: CELL * piece.scale, height: CELL * piece.scale };
      requiredItemAt(piece.visuals, i, 'calendar piece visuals').transform.setScale(piece.scale, 1, piece.scale);
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

  private syncPieceStyle(piece: PieceState, invalid = false, pulse = 0.12, updatePosition = true): void {
    const selected = piece === this.selectedPiece;
    const color = invalid ? '#ef8d79' : selected ? this.lightenHex(piece.def.color, pulse) : piece.def.color;
    const styleKey = `${color}_${selected ? 1 : 0}_${invalid ? 1 : 0}`;
    if (piece.styleKey === styleKey) {
      if (updatePosition) this.setPiecePosition(piece, piece.x, piece.y);
      return;
    }
    piece.styleKey = styleKey;
    for (const visual of piece.visuals) {
      visual.material.color = ColorSRGB.fromHex(color);
    }
    if (updatePosition) this.setPiecePosition(piece, piece.x, piece.y);
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
      texture: this.drawTextTexture(text, resolvedStyle, name),
      blending: 'normal',
      depthWrite: false,
      cullMode: null,
    });
    const entity = new Entity(name);
    const transform = new CartesianTransform3D({ position: this.rectToWorld(rect, layer) });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createPlane3D({
      width: rect.width / CANVAS_W * VIEW_W,
      height: rect.height / CANVAS_H * VIEW_H,
      normal: 'y',
    }), material));
    this.world.addEntity(entity);
    return { key: name, transform, initialRect: { ...rect }, material, rect, text, style: resolvedStyle };
  }

  private setText(visual: TextVisual, text: string): void {
    if (visual.text === text) return;
    visual.text = text;
    visual.material.texture = this.drawTextTexture(visual.text, visual.style, visual.key);
  }

  private setTextStyle(visual: TextVisual, style: CssMaterialStyle): void {
    visual.style = {
      ...style,
      width: Math.max(1, Math.floor(visual.rect.width)),
      height: Math.max(1, Math.floor(visual.rect.height)),
      resolutionScale: 2,
    };
    visual.material.texture = this.drawTextTexture(visual.text, visual.style, visual.key);
  }

  private drawTextTexture(text: string, style: CssMaterialStyle, key: string): MaterialTextureSource {
    const width = Math.max(1, Math.floor(style.width ?? 1));
    const height = Math.max(1, Math.floor(style.height ?? 1));
    const dpr = Math.max(1, Math.min(4, style.resolutionScale ?? 2));
    const canvas = this.textSurface.acquire(Math.floor(width * dpr), Math.floor(height * dpr));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Calendar puzzle requires Canvas 2D text rasterization.');
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

    if (!text) return this.platform.textureFromCanvas?.(canvas, key) ?? canvas;
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
    return this.platform.textureFromCanvas?.(canvas, key) ?? canvas;
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
      (centerX - this.layout.width / 2) / 100,
      layer,
      (centerY - this.layout.height / 2) / 100,
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
      backgroundColor: target ? CALENDAR_STYLE.selected.background : CALENDAR_STYLE.cell.background,
      borderColor: target ? CALENDAR_STYLE.selected.border : CALENDAR_STYLE.cell.border,
      borderWidth: target ? 4 : 2,
      borderRadius: CALENDAR_STYLE.cell.radius,
      padding: 0,
      textAlign: 'center',
      verticalAlign: 'middle',
      fontSize: 24,
      lineHeight: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 900,
      color: target ? CALENDAR_STYLE.selected.text : CALENDAR_STYLE.cell.text,
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

export async function startCalendarPuzzle(canvas: HTMLCanvasElement): Promise<void> {
  const game = new CalendarPuzzleGame();
  await game.init(canvas);
}
