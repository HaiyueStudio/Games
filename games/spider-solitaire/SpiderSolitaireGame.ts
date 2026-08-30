import { AmbientLight } from '@haiyue/engine/lighting';
import { BasicMaterial, Camera3D, CartesianTransform3D, DirectionalLight, Entity, Mesh3D, OrbitControl, SphericalTransform3D, HaiyueEngine, World, createBox3D, createPlane3D, type Geometry3D } from '@haiyue/engine';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import { Render3DSystem } from '@haiyue/engine/systems';
import { Ray } from '@haiyue/engine/math';
import {
  GuiButton,
  GuiRoot,
  GuiSystem,
} from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { mat4 } from 'wgpu-matrix';
import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';

import {
  cloneSpiderCard as cloneCard,
  cloneSpiderColumns as cloneColumns,
  createSpiderDeck,
  isSpiderCompleteRun,
  isSpiderMovableRun,
  isSpiderSaveData,
  spiderColumnAt as columnAt,
  SPIDER_COLUMN_COUNT as COLUMN_COUNT,
  SPIDER_DIFFICULTY_LABELS as DIFFICULTY_LABELS,
  SPIDER_INITIAL_DEAL as INITIAL_DEAL,
  SPIDER_RANK_LABELS as RANK_LABELS,
  SPIDER_RUN_LENGTH as RUN_LENGTH,
  SPIDER_SUIT_SYMBOLS as SUIT_SYMBOLS,
  type SpiderCard as Card,
  type SpiderCardSelection as CardSelection,
  type SpiderDifficulty as Difficulty,
  type SpiderRank as Rank,
  type SpiderSnapshot as Snapshot,
  type SpiderSuit as Suit,
} from './model';

type Color = [number, number, number, number];

interface DragState {
  selection: CardSelection;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  worldOffsetX: number;
  worldOffsetZ: number;
  active: boolean;
}

interface PointerColumnHit {
  column: number;
  cardIndex?: number;
}

interface TextMaterialOptions {
  width: number;
  height: number;
  fontSize: number;
  fontWeight?: number;
  color?: string;
  background?: string;
  border?: string;
  radius?: number;
  align?: CanvasTextAlign;
}

interface CardPose {
  x: number;
  y: number;
  z: number;
  stackIndex: number;
}

interface CardFlight {
  card: Card | null;
  from: CardPose;
  to: CardPose;
  startTime: number;
  duration: number;
  selected: boolean;
  flip?: boolean;
  flipAxis?: 'x' | 'y' | 'z';
  hideCardId?: number;
}

interface SceneVisual {
  entity: Entity;
  transform: CartesianTransform3D;
  mesh: Mesh3D;
}

type UiAction = 'deal' | 'undo' | 'new' | Difficulty;
type GuiActionButton = { action: UiAction; button: GuiButton; label: string; difficulty: Difficulty | undefined };

const TABLE_WIDTH = 1080;
const TABLE_DEPTH = 720;
const COLUMN_GAP = 84;
const CARD_WIDTH = 70;
const CARD_DEPTH = 96;
const CARD_THICKNESS = 2.6;
const CARD_Y_OFFSET = 4.2;
const STACK_GAP = 22;
const STACK_LIFT = 0.34;
const CARD_TILT = Math.PI / 36;
const TABLEAU_START_Z = -104;
const STOCK_Z = -212;
const FOUNDATION_Z = -222;
const STOCK_X = -468;
const FOUNDATION_START_X = -42;
const FOUNDATION_GAP = 76;
const HUD_Z = -318;
const HUD_Y = 5.5;
const DEAL_ANIMATION_MS = 1250;
const RUN_COLLECT_ANIMATION_MS = 760;
const ANIMATION_STAGGER_MS = 42;

const GUI_BUTTONS = [
  { action: 'easy' as UiAction, difficulty: 'easy' as Difficulty, label: 'Easy · 1 Suit', width: 116 },
  { action: 'normal' as UiAction, difficulty: 'normal' as Difficulty, label: 'Normal · 2', width: 116 },
  { action: 'hard' as UiAction, difficulty: 'hard' as Difficulty, label: 'Hard · 4', width: 104 },
  { action: 'deal' as UiAction, label: 'Deal', width: 92 },
  { action: 'undo' as UiAction, label: 'Undo', width: 92 },
  { action: 'new' as UiAction, label: 'New Game', width: 124 },
];

const COLORS = {
  table: [0.08, 0.38, 0.27, 1] as Color,
  tableEdge: [0.05, 0.18, 0.15, 1] as Color,
  slot: [0.10, 0.50, 0.35, 1] as Color,
  cardSide: [0.86, 0.82, 0.72, 1] as Color,
  cardBackSide: [0.10, 0.22, 0.48, 1] as Color,
  selected: [1.00, 0.80, 0.24, 1] as Color,
  run: [0.82, 0.78, 0.68, 1] as Color,
};

class SpiderSolitaire {
  private readonly saves = new SingleSlotGameSave<Snapshot>({
    gameId: 'spider-solitaire',
    name: 'Spider Solitaire 自动存档',
    validateData: isSpiderSaveData,
  });
  private columns: Card[][] = [];
  private stock: Card[] = [];
  private difficulty: Difficulty = 'easy';
  private completedRuns = 0;
  private completedSuits: Suit[] = [];
  private moves = 0;
  private nextId = 1;
  private selection: CardSelection | null = null;
  private drag: DragState | null = null;
  private history: Snapshot[] = [];

  private engine!: HaiyueEngine;
  private world!: World;
  private cameraEntity!: Entity;
  private orbitTransform!: SphericalTransform3D;
  private orbitControl!: OrbitControl;
  private canvas!: HTMLCanvasElement;
  private sceneVisuals: SceneVisual[] = [];
  private sceneVisualCursor = 0;
  private sceneDirty = true;
  private guiDirty = true;
  private geometryCache = new Map<string, Geometry3D>();
  private solidMaterials = new Map<string, BlinnPhongMaterial>();
  private textureMaterials = new Map<string, BasicMaterial>();
  private dynamicTextMaterials = new Map<string, { text: string; material: BasicMaterial }>();
  private toastMessage = 'Drag a face-up descending stack to a destination column.';
  private savedOrbitState: { rotate: boolean; pan: boolean; zoom: boolean } | null = null;
  private guiButtons: GuiActionButton[] = [];
  private flights: CardFlight[] = [];
  private hiddenAnimatedCardIds = new Set<number>();
  private pickRay = new Ray();
  private cardPickGeometry: Geometry3D = createBox3D({ width: CARD_WIDTH, height: CARD_THICKNESS + 2, depth: CARD_DEPTH });
  private cardPickTransform = new CartesianTransform3D({ rotation: [CARD_TILT, 0, 0] });

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.04, g: 0.11, b: 0.09, a: 1 },
      msaaSamples: 4,
      devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2),
    });
    await this.engine.init();
    this.engine.reverseZ = true;
    this.world = new World('SpiderSolitaireWebGPU');
    this.setupCamera();
    this.setupLights();
    const render3DSystem = new Render3DSystem(this.engine, this.cameraEntity, { priority: 20, loadOp: 'clear', transparentSort: false, reverseZ: true });
    this.world.addSystem(render3DSystem);
    this.setupGui();
    const renderIntegration = new RenderIntegration(this.engine, { label: 'SpiderSolitaire.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.bindUi();
    await this.loadOrStart();
    this.flushRender();
    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private tick(time: number, delta: number): void {
    if (this.flights.length > 0) {
      const before = this.flights.length;
      this.flights = this.flights.filter(flight => time < flight.startTime + flight.duration);
      if (this.flights.length !== before || this.flights.length > 0) this.requestSceneRender();
      if (before > 0 && this.flights.length === 0) this.guiDirty = true;
    }
    this.flushRender();
    this.world.update(time, delta);
  }

  private setupCamera(): void {
    const camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4.2, near: 1, far: 2400 });
    camera.reverseZ = true;
    this.orbitTransform = new SphericalTransform3D({
      radius: 820,
      theta: 0,
      phi: Math.PI * 0.24,
      target: [0, 0, 44],
    });
    this.cameraEntity = new Entity('Camera');
    this.cameraEntity.addComponent(camera);
    this.cameraEntity.addComponent(this.orbitTransform);
    this.world.addEntity(this.cameraEntity);
    this.orbitControl = new OrbitControl(this.canvas, this.orbitTransform, {
      minRadius: 620,
      maxRadius: 1080,
      minPhi: Math.PI * 0.12,
      maxPhi: Math.PI * 0.42,
      enablePan: true,
      rotateSpeed: 0.42,
      zoomSpeed: 0.30,
    });
  }

  private setupLights(): void {
    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [1, 1, 1], intensity: 0.58 }));
    this.world.addEntity(ambient);
    const key = new Entity('KeyLight');
    key.addComponent(new DirectionalLight({ color: [1, 0.95, 0.84], intensity: 1.55, direction: [-0.35, -1, -0.28] }));
    this.world.addEntity(key);
    const fill = new Entity('FillLight');
    fill.addComponent(new DirectionalLight({ color: [0.62, 0.80, 1], intensity: 0.55, direction: [0.56, -0.72, 0.42] }));
    this.world.addEntity(fill);
  }

  private bindUi(): void {
    this.canvas.addEventListener('pointerdown', event => this.handlePointerDown(event));
    window.addEventListener('keydown', event => this.handleKey(event));
    window.addEventListener('pointermove', event => this.handlePointerMove(event));
    window.addEventListener('pointerup', event => this.handlePointerUp(event));
    window.addEventListener('pointercancel', event => this.handlePointerUp(event));
  }

  private setupGui(): void {
    const rootEntity = new Entity('SpiderSolitaireGui');
    const guiRoot = new GuiRoot({
      theme: {
        fontSize: 15,
        radius: 6,
        colors: {
          text: '#ffffff',
          textMuted: '#cbd5d7',
          primary: '#21b07f',
          danger: '#dc2626',
          background: '#071712',
          surface: 'rgba(255,255,255,0.12)',
          border: 'rgba(255,255,255,0.24)',
          hover: '#32c994',
          active: '#15966e',
          disabled: 'rgba(255,255,255,0.22)',
        },
      },
    });

    let right = 18;
    for (let i = GUI_BUTTONS.length - 1; i >= 0; i--) {
      const item = requiredItemAt(GUI_BUTTONS, i, 'Spider GUI buttons');
      right += item.width;
      const offsetRight = right;
      const button = guiRoot.add(new GuiButton({
        x: `100%`,
        y: 16,
        width: item.width,
        height: 38,
        text: item.label,
        variant: 'primary',
        style: { radius: 7, padding: 8 },
        onClick: () => this.runAction(item.action),
      }));
      button.layout = ((original) => (parentRect) => {
        original.call(button, parentRect);
        button.rect.x = parentRect.width - offsetRight;
      })(button.layout);
      this.guiButtons.push({ action: item.action, button, label: item.label, difficulty: item.difficulty });
      right += 10;
    }

    rootEntity.addComponent(guiRoot);
    this.world.addEntity(rootEntity);
    this.world.addSystem(new GuiSystem(this.engine, { loadOp: 'load' }));
  }

  private newGame(save = true, message = 'Drag a face-up, same-suit descending stack to another column.'): void {
    this.columns = Array.from({ length: COLUMN_COUNT }, () => []);
    this.stock = this.createDeck();
    this.completedRuns = 0;
    this.completedSuits = [];
    this.moves = 0;
    this.selection = null;
    this.drag = null;
    this.resumeOrbitControl();
    this.flights = [];
    this.hiddenAnimatedCardIds.clear();
    this.history = [];

    for (let column = 0; column < COLUMN_COUNT; column++) {
      const dealCount = requiredNumberAt(INITIAL_DEAL, column, 'Spider initial deal');
      for (let i = 0; i < dealCount; i++) {
        const card = this.stock.pop();
        if (!card) continue;
        card.faceUp = i === dealCount - 1;
        columnAt(this.columns, column).push(card);
      }
    }

    this.toast(message);
    this.render();
    if (save) this.saveState();
  }

  private async loadOrStart(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved) {
      this.newGame();
      return;
    }
    this.columns = cloneColumns(saved.columns);
    this.stock = saved.stock.map(cloneCard);
    this.difficulty = saved.difficulty;
    this.completedRuns = saved.completedRuns;
    this.completedSuits = [...saved.completedSuits];
    this.moves = saved.moves;
    this.nextId = Math.max(0, ...this.columns.flat().map(card => card.id), ...this.stock.map(card => card.id)) + 1;
    this.selection = null;
    this.drag = null;
    this.history = [];
    this.toast('Saved game restored.');
    this.render();
  }

  private saveState(): void {
    this.saves.save({
      difficulty: this.difficulty,
      columns: cloneColumns(this.columns),
      stock: this.stock.map(cloneCard),
      completedRuns: this.completedRuns,
      completedSuits: [...this.completedSuits],
      moves: this.moves,
    });
  }

  private createDeck(): Card[] {
    const cards = createSpiderDeck(this.difficulty);
    this.nextId = cards.length + 1;
    return cards;
  }

  private handleKey(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'n') this.newGame();
    if (this.isAnimating()) {
      if (key === 'z' || key === 'd' || key === ' ') event.preventDefault();
      return;
    }
    if (key === 'z') this.undo();
    if (key === 'd' || key === ' ') {
      this.dealFromStock();
      event.preventDefault();
    }
    if (key === 'escape') {
      this.selection = null;
      this.drag = null;
      this.resumeOrbitControl();
      this.render();
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.guiHitFromPoint(event.clientX, event.clientY)) {
      event.preventDefault();
      return;
    }
    if (this.isAnimating()) {
      event.preventDefault();
      return;
    }

    const stockHit = this.stockHitFromPoint(event.clientX, event.clientY);
    if (stockHit) {
      this.dealFromStock();
      event.preventDefault();
      return;
    }

    const hit = this.columnHitFromPoint(event.clientX, event.clientY);
    if (!hit) {
      this.selection = null;
      this.render();
      return;
    }
    if (hit.cardIndex == null) {
      this.selectOrMove(hit.column);
      event.preventDefault();
      return;
    }
    this.startDrag(event, hit.column, hit.cardIndex);
  }

  private selectOrMove(columnIndex: number, cardIndex?: number): void {
    if (this.selection) {
      if (this.tryMoveSelection(columnIndex)) return;
      this.selection = null;
    }

    if (cardIndex == null) {
      this.render();
      return;
    }

    const card = columnAt(this.columns, columnIndex)[cardIndex];
    if (!card?.faceUp || !this.isMovableStack(columnIndex, cardIndex)) {
      this.toast('Only a face-up descending stack can move.');
      this.render();
      return;
    }

    this.selection = { column: columnIndex, index: cardIndex };
    this.render();
  }

  private startDrag(event: PointerEvent, columnIndex: number, cardIndex: number): void {
    const card = columnAt(this.columns, columnIndex)[cardIndex];
    if (!card?.faceUp || !this.isMovableStack(columnIndex, cardIndex)) {
      this.toast('Only a face-up descending stack can move.');
      return;
    }
    this.selection = { column: columnIndex, index: cardIndex };
    this.suspendOrbitControl();
    const pointerWorld = this.pointerWorldOnCardPlane(event.clientX, event.clientY);
    const cardPose = this.columnCardPose(columnIndex, cardIndex);
    this.drag = {
      selection: { column: columnIndex, index: cardIndex },
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      worldOffsetX: pointerWorld ? cardPose.x - pointerWorld.x : 0,
      worldOffsetZ: pointerWorld ? cardPose.z - pointerWorld.z : 0,
      active: false,
    };
    this.canvas.setPointerCapture?.(event.pointerId);
    this.render();
    event.preventDefault();
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    if (!this.drag.active && Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 5) {
      this.drag.active = true;
    }
    if (this.drag.active) this.requestSceneRender();
    event.preventDefault();
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;
    this.drag = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
    this.resumeOrbitControl();
    if (drag.active) {
      const destination = this.columnHitFromPoint(event.clientX, event.clientY)?.column;
      if (destination != null) this.tryMoveSelection(destination);
      else {
        this.selection = null;
        this.render();
      }
    } else {
      this.selectOrMove(drag.selection.column, drag.selection.index);
    }
    event.preventDefault();
  }

  private columnHitFromPoint(clientX: number, clientY: number): PointerColumnHit | null {
    const point = this.canvasPoint(clientX, clientY);
    const ray = this.rayFromPointer(clientX, clientY);
    let closest: { column: number; cardIndex: number; distance: number } | null = null;
    if (ray) {
      for (let column = 0; column < COLUMN_COUNT; column++) {
        const cards = columnAt(this.columns, column);
        for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
          const card = requiredItemAt(cards, cardIndex, 'Spider cards');
          if (this.hiddenAnimatedCardIds.has(card.id)) continue;
          const pose = this.columnCardPose(column, cardIndex);
          this.cardPickTransform.setPosition(pose.x, pose.y, pose.z);
          const hit = ray.intersectMesh(this.cardPickGeometry, this.cardPickTransform.localMatrix, { useBVH: false });
          if (hit && (!closest || hit.distance < closest.distance)) {
            closest = { column, cardIndex, distance: hit.distance };
          }
        }
      }
    }
    if (closest) return { column: closest.column, cardIndex: closest.cardIndex };

    let best: { column: number; distance: number } | null = null;
    for (let column = 0; column < COLUMN_COUNT; column++) {
      const pose = this.columnCardPose(column, Math.max(0, columnAt(this.columns, column).length - 1));
      const rect = this.projectCardRect({ ...pose, z: Math.max(TABLEAU_START_Z, pose.z) }, 1.18);
      if (!this.pointInRect(point.x, point.y, rect)) continue;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const distance = Math.hypot(point.x - centerX, point.y - centerY);
      if (!best || distance < best.distance) best = { column, distance };
    }
    return best ? { column: best.column } : null;
  }

  private stockHitFromPoint(clientX: number, clientY: number): boolean {
    if (this.stock.length < COLUMN_COUNT) return false;
    const point = this.canvasPoint(clientX, clientY);
    const rect = this.projectCardRect(this.stockCardPose(0), 1.25);
    return this.pointInRect(point.x, point.y, rect);
  }

  private guiHitFromPoint(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const top = 16;
    const height = 38;
    const right = rect.width - 18;
    if (y < top || y > top + height) return false;

    let cursor = right;
    for (let i = GUI_BUTTONS.length - 1; i >= 0; i--) {
      const button = requiredItemAt(GUI_BUTTONS, i, 'Spider GUI buttons');
      const width = button.width;
      const left = cursor - width;
      if (x >= left && x <= cursor) return true;
      cursor = left - 10;
    }
    return false;
  }

  private runAction(action: UiAction): void {
    if (this.isAnimating() && action !== 'new') return;
    if (action === 'deal') this.dealFromStock();
    else if (action === 'undo') this.undo();
    else if (action === 'new') this.newGame();
    else this.changeDifficulty(action);
  }

  private changeDifficulty(difficulty: Difficulty): void {
    if (difficulty === this.difficulty) return;
    this.difficulty = difficulty;
    this.newGame(true, `${DIFFICULTY_LABELS[difficulty]} started. Build same-suit runs from King to Ace.`);
  }

  private tryMoveSelection(destinationColumn: number): boolean {
    const selection = this.selection;
    if (!selection) return false;
    if (selection.column === destinationColumn) {
      this.selection = null;
      this.render();
      return true;
    }

    const sourceColumn = columnAt(this.columns, selection.column);
    const moving = sourceColumn.slice(selection.index);
    if (!this.canPlaceStack(moving, destinationColumn)) {
      this.toast('Stack must land on a card one rank higher, or an empty column.');
      this.render();
      return false;
    }

    this.pushHistory();
    sourceColumn.splice(selection.index);
    columnAt(this.columns, destinationColumn).push(...moving);
    this.flipExposedCard(selection.column);
    this.moves++;
    this.selection = null;
    this.drag = null;
    this.resumeOrbitControl();
    this.collectCompletedRuns();
    this.render();
    this.saveState();
    return true;
  }

  private canPlaceStack(stack: Card[], destinationColumn: number): boolean {
    const destination = columnAt(this.columns, destinationColumn);
    if (destination.length === 0) return true;
    const top = requiredItemAt(destination, destination.length - 1, 'Spider destination cards');
    const first = requiredItemAt(stack, 0, 'Spider moving stack');
    return top.faceUp && top.rank === first.rank + 1;
  }

  private isMovableStack(columnIndex: number, cardIndex: number): boolean {
    return isSpiderMovableRun(columnAt(this.columns, columnIndex).slice(cardIndex));
  }

  private dealFromStock(): void {
    if (this.isAnimating()) return;
    if (this.stock.length < COLUMN_COUNT) {
      this.toast('No stock deals left.');
      return;
    }
    if (this.columns.some(column => column.length === 0)) {
      this.toast('Spider rule: fill every empty column before dealing.');
      return;
    }

    this.pushHistory();
    const now = performance.now();
    const dealsLeftBefore = Math.floor(this.stock.length / COLUMN_COUNT);
    const stockFrom = this.stockCardPose(Math.max(0, dealsLeftBefore - 1));
    for (let column = 0; column < COLUMN_COUNT; column++) {
      const card = this.stock.pop();
      if (!card) continue;
      card.faceUp = true;
      const destination = columnAt(this.columns, column);
      const targetIndex = destination.length;
      destination.push(card);
      this.flights.push({
        card,
        from: { ...stockFrom, x: stockFrom.x + column * 1.6, y: stockFrom.y + 22 },
        to: this.columnCardPose(column, targetIndex),
        startTime: now + column * ANIMATION_STAGGER_MS,
        duration: DEAL_ANIMATION_MS,
        selected: false,
        flip: true,
        flipAxis: 'z',
        hideCardId: card.id,
      });
    }
    this.moves++;
    this.selection = null;
    this.drag = null;
    this.resumeOrbitControl();
    this.collectCompletedRuns();
    this.render();
    this.saveState();
  }

  private collectCompletedRuns(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let columnIndex = 0; columnIndex < COLUMN_COUNT; columnIndex++) {
        const column = columnAt(this.columns, columnIndex);
        if (column.length < RUN_LENGTH) continue;
        const run = column.slice(column.length - RUN_LENGTH);
        if (!this.isCompleteRun(run)) continue;
        const runStartIndex = column.length - RUN_LENGTH;
        const runIndex = this.completedRuns;
        this.addRunCollectAnimation(run, columnIndex, runStartIndex, runIndex);
        column.splice(column.length - RUN_LENGTH, RUN_LENGTH);
        this.completedSuits.push(requiredItemAt(run, 0, 'completed Spider run').suit);
        this.completedRuns++;
        this.flipExposedCard(columnIndex);
        changed = true;
      }
    }
    if (this.completedRuns === 8) this.toast(`Cleared in ${this.moves} moves.`);
  }

  private isCompleteRun(cards: Card[]): boolean {
    return isSpiderCompleteRun(cards);
  }

  private flipExposedCard(columnIndex: number): void {
    const column = columnAt(this.columns, columnIndex);
    const top = column[column.length - 1];
    if (top && !top.faceUp) top.faceUp = true;
  }

  private pushHistory(): void {
    this.history.push({
      difficulty: this.difficulty,
      columns: cloneColumns(this.columns),
      stock: this.stock.map(cloneCard),
      completedRuns: this.completedRuns,
      completedSuits: [...this.completedSuits],
      moves: this.moves,
    });
  }

  private undo(): void {
    const snapshot = this.history.pop();
    if (!snapshot) {
      this.toast('Nothing to undo.');
      return;
    }
    this.columns = cloneColumns(snapshot.columns);
    this.stock = snapshot.stock.map(cloneCard);
    this.difficulty = snapshot.difficulty;
    this.completedRuns = snapshot.completedRuns;
    this.completedSuits = [...snapshot.completedSuits];
    this.moves = snapshot.moves;
    this.selection = null;
    this.drag = null;
    this.resumeOrbitControl();
    this.flights = [];
    this.hiddenAnimatedCardIds.clear();
    this.render();
    this.saveState();
  }

  private render(): void {
    this.sceneDirty = true;
    this.guiDirty = true;
  }

  private requestSceneRender(): void {
    this.sceneDirty = true;
  }

  private flushRender(): void {
    if (this.sceneDirty) {
      this.sceneDirty = false;
      this.rebuildScene();
    }
    if (this.guiDirty) {
      this.guiDirty = false;
      this.syncGui();
    }
  }

  private syncGui(): void {
    for (const item of this.guiButtons) {
      const disabled = (item.action === 'deal' && this.stock.length < COLUMN_COUNT) ||
        (item.action === 'undo' && this.history.length === 0) ||
        item.difficulty === this.difficulty ||
        (this.isAnimating() && item.action !== 'new');
      item.button.setText(item.difficulty === this.difficulty ? `✓ ${item.label}` : item.label);
      item.button.setDisabled(disabled);
    }
  }

  private rebuildScene(): void {
    this.sceneVisualCursor = 0;
    this.hiddenAnimatedCardIds = new Set(this.flights.map(flight => flight.hideCardId).filter((id): id is number => id != null));
    this.addTable();
    this.addHud();
    this.addStock();
    this.addFoundation();
    this.addColumns();
    this.addDragStack();
    this.addAnimatedFlights();
    for (let i = this.sceneVisualCursor; i < this.sceneVisuals.length; i++) {
      requiredItemAt(this.sceneVisuals, i, 'Spider scene visuals').entity.disabled = true;
    }
  }

  private addTable(): void {
    this.addBox('Table', 0, -3, 58, TABLE_WIDTH, 6, TABLE_DEPTH, this.solidMaterial('table', COLORS.table, 18));
  }

  private addHud(): void {
    this.addTextPlane('Title', -320, HUD_Z, 240, 42, this.textMaterial('title', 'Spider Solitaire', {
      width: 512,
      height: 128,
      fontSize: 54,
      fontWeight: 900,
      color: '#f8fff9',
      align: 'left',
    }), HUD_Y);

    const stats = `${DIFFICULTY_LABELS[this.difficulty]}     Moves ${this.moves}     Runs ${this.completedRuns} / 8     Stock ${this.stock.length}`;
    this.addTextPlane('Stats', -228, HUD_Z + 43, 420, 30, this.dynamicTextMaterial('stats', stats, {
      width: 900,
      height: 96,
      fontSize: 34,
      fontWeight: 800,
      color: 'rgba(247,251,248,0.82)',
      align: 'left',
    }), HUD_Y);

    this.addTextPlane('Toast', 0, 334, 560, 38, this.dynamicTextMaterial('toast', this.toastMessage, {
      width: 1200,
      height: 128,
      fontSize: 34,
      fontWeight: 800,
      color: 'rgba(255,255,255,0.86)',
      background: 'rgba(4,15,12,0.78)',
      border: 'rgba(255,255,255,0.16)',
      radius: 22,
    }), 6.8);
  }

  private addStock(): void {
    const dealsLeft = Math.floor(this.stock.length / COLUMN_COUNT);
    this.addSlot(STOCK_X, STOCK_Z, '');
    for (let i = 0; i < dealsLeft; i++) {
      this.addCardVisual(null, STOCK_X + i * 2.2, STOCK_Z - i * 1.1, CARD_Y_OFFSET + 1.4 + i * 0.56, 0, false);
    }
  }

  private addFoundation(): void {
    for (let i = 0; i < 8; i++) {
      if (i < this.completedRuns) this.addCompletedRunPile(i, requiredItemAt(this.completedSuits, i, 'completed Spider suits'));
    }
  }

  private addCompletedRunPile(runIndex: number, suit: Suit): void {
    this.addSlot(FOUNDATION_START_X + runIndex * FOUNDATION_GAP, FOUNDATION_Z, '');
    for (let i = 0; i < 5; i++) {
      const pose = this.foundationRunPose(runIndex, i);
      const rank = Math.max(1, 13 - i * 3) as Rank;
      this.addCardVisual({ id: -10000 - runIndex * 10 - i, rank, suit, faceUp: true }, pose.x, pose.z, pose.y, i, false);
    }
  }

  private addColumns(): void {
    for (let columnIndex = 0; columnIndex < COLUMN_COUNT; columnIndex++) {
      const x = this.columnX(columnIndex);
      this.addSlot(x, TABLEAU_START_Z, '');
      const column = columnAt(this.columns, columnIndex);
      for (let cardIndex = 0; cardIndex < column.length; cardIndex++) {
        const card = requiredItemAt(column, cardIndex, 'Spider cards');
        if (this.hiddenAnimatedCardIds.has(card.id)) continue;
        if (this.drag?.active && this.selection && this.selection.column === columnIndex && cardIndex >= this.selection.index) continue;
        const selected = this.selection && this.selection.column === columnIndex && cardIndex >= this.selection.index;
        const pose = this.columnCardPose(columnIndex, cardIndex);
        this.addCardVisual(card, pose.x, pose.z, pose.y + (selected ? 10 : 0), pose.stackIndex, Boolean(selected));
      }
    }
  }

  private addDragStack(): void {
    if (!this.drag?.active) return;
    const { column, index } = this.drag.selection;
    const cards = columnAt(this.columns, column).slice(index);
    const [x, z] = this.dragWorldPosition(this.drag.x, this.drag.y);
    cards.forEach((card, i) => {
      this.addCardVisual(card, x, z + i * STACK_GAP, 22 + i * STACK_LIFT, i, true);
    });
  }

  private addAnimatedFlights(): void {
    if (this.flights.length === 0) return;
    const now = performance.now();
    for (const flight of this.flights) {
      const rawT = Math.max(0, Math.min(1, (now - flight.startTime) / flight.duration));
      const moveStart = 0;
      const moveT = this.easeInOut(Math.max(0, Math.min(1, (rawT - moveStart) / (1 - moveStart))));
      const flipT = flight.flip ? this.easeInOut(Math.max(0, Math.min(1, rawT / 0.86))) : 1;
      const moveLift = Math.sin(Math.PI * moveT) * 38;
      const flipLift = flight.flip ? Math.sin(Math.PI * Math.min(1, rawT / 0.86)) * 84 : 0;
      const x = this.lerp(flight.from.x, flight.to.x, moveT);
      const y = this.lerp(flight.from.y, flight.to.y, moveT) + moveLift + flipLift;
      const z = this.lerp(flight.from.z, flight.to.z, moveT);
      const displayCard = flight.flip && flipT < 0.52 ? null : flight.card;
      const flipAngle = flight.flip ? (1 - flipT) * Math.PI : 0;
      this.addCardVisual(displayCard, x, z, y, flight.to.stackIndex, flight.selected, {
        x: flight.flipAxis === 'x' ? flipAngle : 0,
        y: flight.flipAxis === 'y' ? flipAngle : 0,
        z: flight.flipAxis === 'z' ? flipAngle : 0,
      });
    }
  }

  private addCardVisual(
    card: Card | null,
    x: number,
    z: number,
    y: number,
    stackIndex: number,
    selected: boolean,
    extraRotation: { x?: number; y?: number; z?: number } = {},
  ): void {
    const faceUp = card?.faceUp ?? false;
    const bodyMaterial = selected
      ? this.solidMaterial('selected', COLORS.selected, 42)
      : this.solidMaterial(faceUp ? 'card-side' : 'card-back-side', faceUp ? COLORS.cardSide : COLORS.cardBackSide, 24);
    const rotationX = CARD_TILT + (extraRotation.x ?? 0);
    const rotationY = extraRotation.y ?? 0;
    const rotationZ = extraRotation.z ?? 0;
    this.addBox('CardBody', x, y, z, CARD_WIDTH, CARD_THICKNESS, CARD_DEPTH, bodyMaterial, rotationX, rotationY, rotationZ);
    this.addVisual(
      'CardFace',
      x,
      y + CARD_THICKNESS * 0.5 + 0.24,
      z,
      this.planeGeometry(CARD_WIDTH * 0.94, CARD_DEPTH * 0.94),
      card && faceUp ? this.cardFaceMaterial(card.rank, card.suit) : this.cardBackMaterial(),
      rotationX,
      rotationY,
      rotationZ,
    );

    if (selected && stackIndex === 0) {
      this.addBox('SelectionGlow', x, y - 0.12, z, CARD_WIDTH + 8, 1.1, CARD_DEPTH + 8, this.solidMaterial('selected', COLORS.selected, 18), CARD_TILT);
    }
  }

  private addSlot(x: number, z: number, label: string): void {
    this.addBox('Slot', x, 0.08, z, CARD_WIDTH + 1, 0.16, CARD_DEPTH + 1, this.solidMaterial(`slot-${label}`, COLORS.slot, 4));
    if (!label) return;
    this.addTextPlane('SlotLabel', x, z, CARD_WIDTH * 0.72, CARD_DEPTH * 0.32, this.labelMaterial(label), 1.28);
  }

  private addTextPlane(name: string, x: number, z: number, width: number, depth: number, material: BasicMaterial, y: number): void {
    this.addVisual(name, x, y, z, this.planeGeometry(width, depth), material);
  }

  private addBox(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, material: BlinnPhongMaterial, rotationX = 0, rotationY = 0, rotationZ = 0): Entity {
    return this.addVisual(name, x, y, z, this.boxGeometry(width, height, depth), material, rotationX, rotationY, rotationZ);
  }

  private addVisual(
    name: string,
    x: number,
    y: number,
    z: number,
    geometry: Geometry3D,
    material: BasicMaterial | BlinnPhongMaterial,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
  ): Entity {
    const visualIndex = this.sceneVisualCursor++;
    let visual = this.sceneVisuals[visualIndex];
    if (!visual) {
      const entity = new Entity(name);
      const transform = new CartesianTransform3D({
        position: [x, y, z],
        rotation: [rotationX, rotationY, rotationZ],
      });
      const mesh = new Mesh3D(geometry, material);
      entity.addComponent(transform);
      entity.addComponent(mesh);
      this.world.addEntity(entity);
      visual = { entity, transform, mesh };
      this.sceneVisuals.push(visual);
    } else {
      if (visual.entity.name !== name) visual.entity.name = name;
      visual.entity.disabled = false;
      const position = visual.transform.position;
      if (position[0] !== x || position[1] !== y || position[2] !== z) {
        visual.transform.setPosition(x, y, z);
      }
      const rotation = visual.transform.rotation;
      if (rotation[0] !== rotationX || rotation[1] !== rotationY || rotation[2] !== rotationZ) {
        visual.transform.setRotation(rotationX, rotationY, rotationZ);
      }
      if (visual.mesh.geometry !== geometry) visual.mesh.geometry = geometry;
      if (visual.mesh.material !== material) visual.mesh.material = material;
    }
    return visual.entity;
  }

  private boxGeometry(width: number, height: number, depth: number): Geometry3D {
    const key = `box:${width}:${height}:${depth}`;
    let geometry = this.geometryCache.get(key);
    if (!geometry) {
      geometry = createBox3D({ width, height, depth });
      this.geometryCache.set(key, geometry);
    }
    return geometry;
  }

  private planeGeometry(width: number, height: number): Geometry3D {
    const key = `plane-y:${width}:${height}`;
    let geometry = this.geometryCache.get(key);
    if (!geometry) {
      geometry = createPlane3D({ width, height, normal: 'y' });
      this.geometryCache.set(key, geometry);
    }
    return geometry;
  }

  private columnX(column: number): number {
    return (column - (COLUMN_COUNT - 1) / 2) * COLUMN_GAP;
  }

  private columnSpan(): number {
    return (COLUMN_COUNT - 1) * COLUMN_GAP;
  }

  private columnCardPose(column: number, cardIndex: number): CardPose {
    return {
      x: this.columnX(column),
      y: CARD_Y_OFFSET + CARD_THICKNESS * 0.5 + cardIndex * STACK_LIFT,
      z: TABLEAU_START_Z + cardIndex * STACK_GAP,
      stackIndex: cardIndex,
    };
  }

  private stockCardPose(stockIndex: number): CardPose {
    return {
      x: STOCK_X + stockIndex * 2.2,
      y: CARD_Y_OFFSET + 1.4 + stockIndex * 0.56,
      z: STOCK_Z - stockIndex * 1.1,
      stackIndex: 0,
    };
  }

  private foundationRunPose(runIndex: number, cardOffset = 0): CardPose {
    return {
      x: FOUNDATION_START_X + runIndex * FOUNDATION_GAP + cardOffset * 0.44,
      y: 16 + cardOffset * 0.22,
      z: FOUNDATION_Z - cardOffset * 0.35,
      stackIndex: cardOffset,
    };
  }

  private addRunCollectAnimation(cards: Card[], column: number, startIndex: number, runIndex: number): void {
    const now = performance.now();
    cards.forEach((card, offset) => {
      this.flights.push({
        card: cloneCard(card),
        from: this.columnCardPose(column, startIndex + offset),
        to: this.foundationRunPose(runIndex, offset),
        startTime: now + offset * (ANIMATION_STAGGER_MS * 0.42),
        duration: RUN_COLLECT_ANIMATION_MS,
        selected: true,
      });
    });
  }

  private isAnimating(): boolean {
    return this.flights.length > 0;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private easeInOut(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private canvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private pointInRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private projectCardRect(pose: CardPose, scale = 1): { x: number; y: number; width: number; height: number } {
    const hw = CARD_WIDTH * 0.55 * scale;
    const hd = CARD_DEPTH * 0.55 * scale;
    const points = [
      this.projectWorldPoint(pose.x - hw, pose.y, pose.z - hd),
      this.projectWorldPoint(pose.x + hw, pose.y, pose.z - hd),
      this.projectWorldPoint(pose.x + hw, pose.y, pose.z + hd),
      this.projectWorldPoint(pose.x - hw, pose.y, pose.z + hd),
    ].filter((point): point is { x: number; y: number } => point != null);
    if (points.length === 0) return { x: -Infinity, y: -Infinity, width: 0, height: 0 };
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    return {
      x: minX - 8,
      y: minY - 8,
      width: maxX - minX + 16,
      height: maxY - minY + 16,
    };
  }

  private projectWorldPoint(x: number, y: number, z: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const viewProj = this.viewProjectionMatrix();
    if (!viewProj) return null;
    const clipX = requiredNumberAt(viewProj, 0, 'Spider view projection') * x + requiredNumberAt(viewProj, 4, 'Spider view projection') * y + requiredNumberAt(viewProj, 8, 'Spider view projection') * z + requiredNumberAt(viewProj, 12, 'Spider view projection');
    const clipY = requiredNumberAt(viewProj, 1, 'Spider view projection') * x + requiredNumberAt(viewProj, 5, 'Spider view projection') * y + requiredNumberAt(viewProj, 9, 'Spider view projection') * z + requiredNumberAt(viewProj, 13, 'Spider view projection');
    const clipW = requiredNumberAt(viewProj, 3, 'Spider view projection') * x + requiredNumberAt(viewProj, 7, 'Spider view projection') * y + requiredNumberAt(viewProj, 11, 'Spider view projection') * z + requiredNumberAt(viewProj, 15, 'Spider view projection');
    if (clipW <= 0.0001) return null;
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;
    return {
      x: (ndcX * 0.5 + 0.5) * rect.width,
      y: (0.5 - ndcY * 0.5) * rect.height,
    };
  }

  private rayFromPointer(clientX: number, clientY: number): Ray | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
    const viewProj = this.viewProjectionMatrix();
    if (!viewProj) return null;
    const invViewProj = mat4.inverse(viewProj) as Float32Array;
    const cameraWorld = this.orbitTransform.localMatrix;
    const cameraPosition = new Float32Array([requiredNumberAt(cameraWorld, 12, 'Spider camera matrix'), requiredNumberAt(cameraWorld, 13, 'Spider camera matrix'), requiredNumberAt(cameraWorld, 14, 'Spider camera matrix')]);
    return this.pickRay.setFromCamera(ndcX, ndcY, cameraPosition, invViewProj);
  }

  private dragWorldPosition(clientX: number, clientY: number): [number, number] {
    const world = this.pointerWorldOnCardPlane(clientX, clientY);
    if (world && this.drag) return [world.x + this.drag.worldOffsetX, world.z + this.drag.worldOffsetZ];
    const rect = this.canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / Math.max(1, rect.width);
    const ny = (clientY - rect.top) / Math.max(1, rect.height);
    return [
      (nx - 0.5) * TABLE_WIDTH,
      -270 + ny * TABLE_DEPTH,
    ];
  }

  private pointerWorldOnCardPlane(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
    const viewProj = this.viewProjectionMatrix();
    if (!viewProj) return null;
    const inverseViewProjection = mat4.inverse(viewProj) as Float32Array;
    const near = this.unproject(nx, ny, 0, inverseViewProjection);
    const far = this.unproject(nx, ny, 1, inverseViewProjection);
    if (!near || !far) return null;
    const dy = far.y - near.y;
    if (Math.abs(dy) < 0.0001) return null;
    const planeY = CARD_Y_OFFSET + CARD_THICKNESS * 0.5 + 12;
    const t = (planeY - near.y) / dy;
    if (!Number.isFinite(t)) return null;
    return {
      x: near.x + (far.x - near.x) * t,
      z: near.z + (far.z - near.z) * t,
    };
  }

  private unproject(ndcX: number, ndcY: number, ndcZ: number, inv: Float32Array): { x: number; y: number; z: number } | null {
    const x = requiredNumberAt(inv, 0, 'Spider inverse view projection') * ndcX + requiredNumberAt(inv, 4, 'Spider inverse view projection') * ndcY + requiredNumberAt(inv, 8, 'Spider inverse view projection') * ndcZ + requiredNumberAt(inv, 12, 'Spider inverse view projection');
    const y = requiredNumberAt(inv, 1, 'Spider inverse view projection') * ndcX + requiredNumberAt(inv, 5, 'Spider inverse view projection') * ndcY + requiredNumberAt(inv, 9, 'Spider inverse view projection') * ndcZ + requiredNumberAt(inv, 13, 'Spider inverse view projection');
    const z = requiredNumberAt(inv, 2, 'Spider inverse view projection') * ndcX + requiredNumberAt(inv, 6, 'Spider inverse view projection') * ndcY + requiredNumberAt(inv, 10, 'Spider inverse view projection') * ndcZ + requiredNumberAt(inv, 14, 'Spider inverse view projection');
    const w = requiredNumberAt(inv, 3, 'Spider inverse view projection') * ndcX + requiredNumberAt(inv, 7, 'Spider inverse view projection') * ndcY + requiredNumberAt(inv, 11, 'Spider inverse view projection') * ndcZ + requiredNumberAt(inv, 15, 'Spider inverse view projection');
    if (Math.abs(w) < 0.0001) return null;
    return { x: x / w, y: y / w, z: z / w };
  }

  private viewProjectionMatrix(): Float32Array | null {
    const camera = this.cameraEntity.getComponent(Camera3D);
    if (!camera) return null;
    camera.updateAspect(this.engine.width / Math.max(1, this.engine.height));
    const view = mat4.inverse(this.orbitTransform.localMatrix) as Float32Array;
    return mat4.multiply(camera.projectionMatrix, view) as Float32Array;
  }

  private suspendOrbitControl(): void {
    if (this.savedOrbitState) return;
    this.savedOrbitState = {
      rotate: this.orbitControl.enableRotate,
      pan: this.orbitControl.enablePan,
      zoom: this.orbitControl.enableZoom,
    };
    this.orbitControl.enableRotate = false;
    this.orbitControl.enablePan = false;
    this.orbitControl.enableZoom = false;
  }

  private resumeOrbitControl(): void {
    if (!this.savedOrbitState) return;
    this.orbitControl.enableRotate = this.savedOrbitState.rotate;
    this.orbitControl.enablePan = this.savedOrbitState.pan;
    this.orbitControl.enableZoom = this.savedOrbitState.zoom;
    this.savedOrbitState = null;
  }

  private solidMaterial(key: string, color: Color, shininess: number): BlinnPhongMaterial {
    const cacheKey = `${key}:${color.join(',')}:${shininess}`;
    let material = this.solidMaterials.get(cacheKey);
    if (!material) {
      material = new BlinnPhongMaterial({
        diffuse: color,
        ambient: [color[0] * 0.22, color[1] * 0.22, color[2] * 0.22, color[3]],
        specular: [0.36, 0.34, 0.30, 1],
        shininess,
      });
      this.solidMaterials.set(cacheKey, material);
    }
    return material;
  }

  private cardFaceMaterial(rank: Rank, suit: Suit): BasicMaterial {
    const key = `face-${suit}-${rank}`;
    let material = this.textureMaterials.get(key);
    if (!material) {
      material = new BasicMaterial({ texture: this.createCardCanvas(rank, suit), cullMode: 'none', blending: 'normal', depthWrite: false });
      this.textureMaterials.set(key, material);
    }
    return material;
  }

  private cardBackMaterial(): BasicMaterial {
    const key = 'back';
    let material = this.textureMaterials.get(key);
    if (!material) {
      material = new BasicMaterial({ texture: this.createBackCanvas(), cullMode: 'none', blending: 'normal', depthWrite: false });
      this.textureMaterials.set(key, material);
    }
    return material;
  }

  private labelMaterial(label: string): BasicMaterial {
    return this.textMaterial(`label-${label}`, label, {
      width: 256,
      height: 128,
      fontSize: 48,
      fontWeight: 900,
      color: 'rgba(255,255,255,0.72)',
    });
  }

  private textMaterial(key: string, text: string, options: TextMaterialOptions): BasicMaterial {
    let material = this.textureMaterials.get(key);
    if (!material) {
      material = new BasicMaterial({ texture: this.createTextCanvas(text, options), cullMode: 'none', blending: 'normal', depthWrite: false });
      this.textureMaterials.set(key, material);
    }
    return material;
  }

  private dynamicTextMaterial(key: string, text: string, options: TextMaterialOptions): BasicMaterial {
    const cached = this.dynamicTextMaterials.get(key);
    if (cached?.text === text) return cached.material;
    const material = new BasicMaterial({ texture: this.createTextCanvas(text, options), cullMode: 'none', blending: 'normal', depthWrite: false });
    this.dynamicTextMaterials.set(key, { text, material });
    return material;
  }

  private createCardCanvas(rank: Rank, suit: Suit): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 528;
    const context = canvas.getContext('2d')!;
    this.roundRect(context, 10, 10, 364, 508, 28);
    context.fillStyle = '#fffdf5';
    context.fill();
    context.lineWidth = 8;
    context.strokeStyle = '#26303a';
    context.stroke();

    const suitSymbol = SUIT_SYMBOLS[suit];
    context.fillStyle = suit === 'hearts' || suit === 'diamonds' ? '#c92532' : '#111827';
    context.textBaseline = 'top';
    context.textAlign = 'left';
    context.font = '900 76px ui-sans-serif, system-ui, sans-serif';
    context.fillText(RANK_LABELS[rank], 36, 30);
    context.font = '900 72px ui-sans-serif, system-ui, sans-serif';
    context.fillText(suitSymbol, 38, 108);

    context.save();
    context.globalAlpha = 0.16;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '900 190px ui-sans-serif, system-ui, sans-serif';
    context.fillText(suitSymbol, 192, 278);
    context.restore();

    context.save();
    context.translate(348, 498);
    context.rotate(Math.PI);
    context.textBaseline = 'top';
    context.textAlign = 'left';
    context.font = '900 76px ui-sans-serif, system-ui, sans-serif';
    context.fillText(RANK_LABELS[rank], 0, 0);
    context.font = '900 72px ui-sans-serif, system-ui, sans-serif';
    context.fillText(suitSymbol, 0, 78);
    context.restore();
    return canvas;
  }

  private createBackCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 528;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 384, 528);
    gradient.addColorStop(0, '#3d68bb');
    gradient.addColorStop(1, '#152d66');
    this.roundRect(context, 10, 10, 364, 508, 28);
    context.fillStyle = gradient;
    context.fill();
    context.lineWidth = 8;
    context.strokeStyle = 'rgba(255,255,255,0.28)';
    context.stroke();
    context.clip();
    context.strokeStyle = 'rgba(255,255,255,0.22)';
    context.lineWidth = 8;
    for (let i = -520; i < 520; i += 34) {
      context.beginPath();
      context.moveTo(i, 0);
      context.lineTo(i + 520, 528);
      context.stroke();
    }
    context.strokeStyle = 'rgba(0,0,0,0.18)';
    context.lineWidth = 5;
    for (let i = -480; i < 560; i += 42) {
      context.beginPath();
      context.moveTo(i + 520, 0);
      context.lineTo(i, 528);
      context.stroke();
    }
    return canvas;
  }

  private createTextCanvas(text: string, options: TextMaterialOptions): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = options.height;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (options.background || options.border) {
      const pad = options.border ? 3 : 0;
      this.roundRect(context, pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, options.radius ?? 0);
      if (options.background) {
        context.fillStyle = options.background;
        context.fill();
      }
      if (options.border) {
        context.strokeStyle = options.border;
        context.lineWidth = 4;
        context.stroke();
      }
    }
    context.fillStyle = options.color ?? '#ffffff';
    context.textAlign = options.align ?? 'center';
    context.textBaseline = 'middle';
    context.font = `${options.fontWeight ?? 800} ${options.fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const x = context.textAlign === 'left' ? 20 : context.textAlign === 'right' ? canvas.width - 20 : canvas.width / 2;
    context.fillText(text, x, canvas.height / 2, canvas.width - 40);
    return canvas;
  }

  private roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  private toast(message: string): void {
    this.toastMessage = message;
    this.render();
  }
}

export async function startSpiderSolitaire(canvas: HTMLCanvasElement): Promise<void> {
  await new SpiderSolitaire().init(canvas);
}
