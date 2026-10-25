import { fitPerspectiveCamera } from '../../shared/rendering/fitPerspectiveCamera';
import { GameEngine } from '../../session/GameEngine';
import { HaiyueEngine } from '@haiyue/engine';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { CartesianTransform3D } from '@haiyue/engine';
import { SphericalTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { EnvironmentLight } from '@haiyue/engine';
import { createRoundedBox3D } from '@haiyue/engine/geometry';
import { MetalMaterials } from '../rendering/MetalMaterials';
import { ForgeMergeEffect } from '../rendering/ForgeMergeEffect';
import { MetalAudio } from '../audio/MetalAudio';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { createBox3D } from '@haiyue/engine';
import { GameSaveError, GameSaveService, LocalStorageSaveBackend } from '@haiyue/engine/save';
import { Easing, TweenManager, TweenSystem, type Tween } from '@haiyue/engine/tween';
import {
  GuiButton,
  GuiLabel,
  GuiImage,
  GuiModal,
  GuiRoot,
  GuiSystem,
  type GuiElement,
  type GuiTheme,
} from '@haiyue/engine/gui';
import { requiredItemAt } from '../../shared/collections/arrayAccess';
import { tileAtlasGeometry } from '../rendering/TileGeometry';
import {
  loadGame2048Config,
  type Game2048Config,
  type Game2048Palette,
} from '../rules/config';
import {
  GAME_2048_ID,
  GAME_2048_SAVE_DATA_VERSION,
  GAME_2048_SAVE_ID,
  isGame2048SaveData,
  type Game2048SaveData,
} from '../save/saveState';

import {
  boardValue,
  boardsEqual,
  calculateMove,
  canMove,
  cloneBoard,
  createEmptyBoard as makeEmptyBoard,
  setBoardValue,
  type Game2048Phase as GamePhase,
  type MoveDirection as Direction,
  type TileMovement,
  type TileMerge,
} from '../rules/rules';

interface TileVisual {
  entity: Entity;
  mesh: Mesh3D;
  age: number;
  revealAt: number;
  pop: boolean;
  tween?: Tween<TileTweenPosition> | undefined;
}

interface TileTweenPosition extends Record<string, unknown> {
  x: number;
  z: number;
}

function guiTheme(fontSize: number, text: string): Partial<GuiTheme> {
  return {
    fontSize,
    radius: 3,
    colors: {
      text,
      textMuted: text,
      primary: '#465466',
      danger: '#c94c4c',
      background: 'rgba(0,0,0,0)',
      surface: 'rgba(0,0,0,0)',
      border: 'rgba(0,0,0,0)',
      hover: '#657992',
      active: '#b9854c',
      disabled: 'rgba(0,0,0,0)',
    },
  };
}

class Game2048 {
  private readonly saves: GameSaveService<Game2048SaveData>;
  private engine!: HaiyueEngine;
  private world!: World;
  private camEntity!: Entity;
  private cam3D!: Camera3D;
  private spherical!: SphericalTransform3D;
  private readonly tweenManager = new TweenManager();
  private readonly cellGeometry: ReturnType<typeof createBox3D>;
  private readonly tileGeometry: ReturnType<typeof createBox3D>;
  private readonly materials: MetalMaterials;
  private readonly audio = new MetalAudio();
  private effects!: ForgeMergeEffect;
  private readonly inputAbort = new AbortController();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private moveElapsed = Infinity;
  private moveDuration = 0;
  private queuedDirection: Direction | null = null;
  private mergeRank = 0;
  private impactPlayed = false;
  private forgePlayed = false;
  private guiSound!: GuiButton;
  private guiRestart!: GuiButton;
  private readonly metalControls: { element: GuiButton; images: GuiImage[] }[] = [];
  private randomState = 2048;
  private disposed = false;
  private readonly verificationMode = new URLSearchParams(window.location.search).get('verify') === '1';

  private board: number[][];
  private score = 0;
  private best = 0;
  private phase: GamePhase = 'playing';
  private cells: Entity[] = [];
  private tiles = new Map<string, TileVisual>();

  private guiScore!: GuiLabel;
  private guiBest!: GuiLabel;
  private guiModal!: GuiModal;
  private dismissedModalPhase: GamePhase | null = null;

  private touchStartX = 0;
  private touchStartY = 0;
  private mouseStartX = 0;
  private mouseStartY = 0;
  private mouseDown = false;

  constructor(private readonly config: Game2048Config) {
    this.materials = new MetalMaterials(config);
    this.cellGeometry = createRoundedBox3D({
      radius: 0.045, segments: 2,
      width: config.geometry.cellWidth,
      height: config.geometry.cellHeight,
      depth: config.geometry.cellWidth,
    });
    this.tileGeometry = tileAtlasGeometry(createRoundedBox3D({
      radius: 0.065, segments: 1,
      width: config.geometry.tileWidth,
      height: config.geometry.tileHeight,
      depth: config.geometry.tileWidth,
    }), config.geometry.tileWidth, config.geometry.tileWidth);
    this.board = makeEmptyBoard(this.config.rows, this.config.cols);
    this.saves = new GameSaveService<Game2048SaveData>({
      gameId: GAME_2048_ID,
      dataVersion: GAME_2048_SAVE_DATA_VERSION,
      backend: new LocalStorageSaveBackend({ namespace: 'haiyue-games' }),
      maxSlots: 1,
      validateData: value => isGame2048SaveData(value, this.config.rows, this.config.cols),
    });
  }

  async init(canvas: HTMLCanvasElement) {
    this.engine = new GameEngine({
      canvas,
      clearColor: { r: 0.018, g: 0.026, b: 0.042, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    this.engine.resizeToDisplaySize(true);

    await Promise.all([this.materials.load(), this.audio.load()]);
    this.world = new World('2048');
    this.effects = new ForgeMergeEffect(this.world, this.config, this.materials);
    this.world.addRuntimeIntegration({ onDetach: () => this.dispose() });
    this.world.addSystem(new TweenSystem({ manager: this.tweenManager, priority: -100 }));
    this._setupCamera();
    this._setupLights();
    this._setupGui();
    this._setupRenderIntegration();
    this._setupInput(canvas);
    this._buildCells();
    await this._loadOrCreateState();
    await this.materials.prepare(this.board.flat());
    this._syncVisuals();

    this.engine.on('update', ({ detail: { time, delta } }) => {
      this._tick(time, delta);
    });
    window.addEventListener('pagehide', () => this.dispose(), { once: true, signal: this.inputAbort.signal });
    this.engine.run();
  }

  private _setupCamera() {
    const gridW = (this.config.cols - 1) * this.config.geometry.cellSize;
    const gridH = (this.config.rows - 1) * this.config.geometry.cellSize;
    const radius = Math.max(gridW, gridH) * 1.08 + 5.2;

    this.spherical = new SphericalTransform3D({
      radius,
      theta: 0,
      phi: Math.PI / 4.8,
      target: [gridW / 2, 0, gridH / 2],
    });

    this.cam3D = new Camera3D({
      type: 'perspective',
      fov: Math.PI / 4.4,
      near: 0.1,
      far: 200,
    });

    this.camEntity = new Entity('Camera3D');
    this.camEntity.addComponent(this.cam3D);
    this.camEntity.addComponent(this.spherical);
    this.world.addEntity(this.camEntity);
    fitPerspectiveCamera(this.engine, this.world, this.cam3D, 1.18);
    const fitHeight = () => { this.spherical.radius = radius * (this.engine.displayHeight < 500 ? 1.3 : 1); };
    this.engine.on('resize', fitHeight); fitHeight();
    this.world.addRuntimeIntegration({ onDetach: () => this.engine.off('resize', fitHeight) });

    const render3DSystem = new Render3DSystem(this.engine, this.camEntity, {
      priority: 0,
      loadOp: 'clear',
      msaaSamples: 4,
    });
    this.world.addSystem(render3DSystem);
  }

  private _setupLights() {
    this.world.addEntity(new Entity('Studio environment').addComponent(new EnvironmentLight({
      intensity: 1.05, diffuseColor: [0.46, 0.55, 0.72], specularColor: [0.95, 0.97, 1],
    })));
    this.world.addEntity(new Entity('Warm key').addComponent(new DirectionalLight({
      color: [1, 0.86, 0.65], intensity: 3.3, direction: [-0.5, -1, -0.65],
    })));
    this.world.addEntity(new Entity('Cool rim').addComponent(new DirectionalLight({
      color: [0.4, 0.68, 1], intensity: 2.1, direction: [0.7, -0.4, 0.6],
    })));
    this.world.addEntity(new Entity('Soft fill').addComponent(new AmbientLight({ color: [0.65, 0.76, 1], intensity: 0.2 })));
  }

  private _setupGui(): void {
    const title = this._createGuiRoot('2048TitleGui', 16, '#e2eaf3');
    title.root.add(new GuiImage({
      x: 18, y: 12, width: 192, height: 64,
      source: this.materials.title ?? null, sourceKey: '2048-metal-title',
      disabled: true, pointerFilter: 'ignore',
    }));

    const scores = this._createGuiRoot('2048ScoresGui', 16, '#ffffff');
    this.guiBest = scores.root.add(new GuiLabel({
      x: 0,
      y: 18,
      height: 42,
      text: 'BEST  0',
      textAlign: 'center',
      autoWidth: true,
      style: { backgroundColor: '#00000000', borderColor: '#00000000', radius: 3, padding: 20 },
    }));
    this._skin(this.guiBest);
    this._anchorRight(this.guiBest, 18);
    this.guiScore = scores.root.add(new GuiLabel({
      x: 0,
      y: 18,
      height: 42,
      text: 'SCORE  0',
      textAlign: 'center',
      autoWidth: true,
      style: { backgroundColor: '#00000000', borderColor: '#00000000', radius: 3, padding: 20 },
    }));
    this._skin(this.guiScore);
    this._anchorBefore(this.guiScore, this.guiBest, 8);


    const modalConfig = this.config.hud.modal;
    const status = this._createGuiRoot('2048ModalGui', 16, '#e4edf5');
    this.guiModal = status.root.add(new GuiModal({
      width: '88%',
      height: 240,
      title: modalConfig.winTitle,
      message: modalConfig.winMessage,
      confirmText: modalConfig.confirmText,
      cancelText: modalConfig.cancelText,
      showCloseButton: true,
      showConfirmButton: true,
      showCancelButton: true,
      closeOnBackdrop: false,
      style: {
        backgroundColor: '#151e2b',
        borderColor: '#748598',
        color: '#e4edf5',
        radius: 10,
      },
      backdropColor: 'rgba(4,9,17,0.82)',
      onConfirm: () => this._newGame(),
      onCancel: () => this._dismissModal(),
      onClose: reason => {
        if (reason === 'close' || reason === 'backdrop') this._dismissModal();
      },
    }));
    this.guiModal.confirmButton.setStyle({
      backgroundColor: '#5c4631',
      hoverBackgroundColor: '#836345',
      borderColor: '#c19b65',
      color: '#f9f6f2',
      hoverColor: '#ffffff',
    });
    this.guiModal.cancelButton.setStyle({
      backgroundColor: '#2b3c50',
      hoverBackgroundColor: '#3e536b',
      borderColor: '#748598',
      color: '#e4edf5',
      hoverColor: '#ffffff',
    });

    const controls = this._createGuiRoot('2048ControlsGui', 15, '#f9f6f2');
    const newGame = controls.root.add(new GuiButton({
      x: 0,
      y: 0,
      width: 116,
      height: 42,
      text: 'New Game',
      variant: 'primary',
      style: { backgroundColor: '#00000000', borderColor: '#00000000', radius: 3, hoverBackgroundColor: '#ffffff18', hoverColor: '#ffe4af' },
      onClick: () => this._newGame(),
    }));
    this.guiRestart = newGame;
    this._skin(newGame);
    this._anchorBottomRight(newGame, 18, 18);
    this._skin(this.guiModal);
    this._skin(this.guiModal.confirmButton);
    this._skin(this.guiModal.cancelButton);
    const modalLayout = this.guiModal.layout.bind(this.guiModal);
    this.guiModal.layout = rect => {
      modalLayout(rect);
      for (const child of this.guiModal.children) if (child instanceof GuiImage) child.layout(this.guiModal.dialogRect);
      for (const button of [this.guiModal.confirmButton, this.guiModal.cancelButton])
        for (const child of button.children) child.layout(button.rect);
    };
    this.guiSound = controls.root.add(new GuiButton({
      width: 108, height: 42, text: this.audio.muted ? 'Sound OFF' : 'Sound ON',
      style: { backgroundColor: '#00000000', borderColor: '#00000000', hoverBackgroundColor: '#ffffff18', hoverColor: '#ffe4af' },
      onClick: () => { this.audio.toggle(); this.guiSound.setText(this.audio.muted ? 'Sound OFF' : 'Sound ON'); },
    }));
    this._skin(this.guiSound);
    this._anchorBottomRight(this.guiSound, 144, 18);
    this.world.addSystem(new GuiSystem(this.engine, { loadOp: 'load' }));
  }

  private _skin(element: GuiElement): void {
    const panel = this.materials.panel;
    if (!panel) return;
    // Nine image patches preserve machined corners on both wide buttons and score plates.
    const patches: GuiImage[] = [];
    const cuts = [0, 88 / panel.width, 1 - 88 / panel.width, 1];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const image = element.add(new GuiImage({ source: panel, sourceKey: '2048-metal-panel',
        uv: [cuts[col]!, cuts[row]!, cuts[col + 1]! - cuts[col]!, cuts[row + 1]! - cuts[row]!],
        disabled: true, pointerFilter: 'ignore',
      }));
      patches.push(image);
      image.layout = rect => {
        const edge = Math.min(11, rect.width / 2, rect.height / 2);
        const xs = [0, edge, rect.width - edge, rect.width], ys = [0, edge, rect.height - edge, rect.height];
        image.rect = { x: rect.x + xs[col]!, y: rect.y + ys[row]!, width: xs[col + 1]! - xs[col]!, height: ys[row + 1]! - ys[row]! };
      };
    }
    if (element instanceof GuiModal) {
      element.children.splice(element.children.length - patches.length, patches.length);
      element.children.unshift(...patches);
    }
    if (element instanceof GuiButton) this.metalControls.push({ element, images: patches });
    // This Engine version paints children after their parent text. Keep the parent text
    // for auto-width measurement and draw its live caption over the metal patches.
    if (element instanceof GuiLabel || element instanceof GuiButton) {
      const caption = element.add(new GuiLabel({ text: element.text, textAlign: 'center',
        fontSize: element instanceof GuiLabel ? element.fontSize ?? 16 : 15,
        disabled: true, pointerFilter: 'ignore', style: { color: '#f0f3f8' },
      }));
      caption.layout = rect => { caption.rect = { ...rect }; };
      const setText = element.setText.bind(element);
      element.setText = text => { setText(text); caption.setText(text); };
      element.setStyle({ color: '#00000000', hoverColor: '#00000000' });
    }
  }

  private _setupRenderIntegration(): void {
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Game2048.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private _createGuiRoot(name: string, fontSize: number, textColor: string): { root: GuiRoot } {
    const entity = new Entity(name);
    const root = new GuiRoot({ theme: guiTheme(fontSize, textColor) });
    entity.addComponent(root);
    this.world.addEntity(entity);
    return { root };
  }

  private _anchorRight(element: GuiElement, right: number): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect) => {
      layout(parentRect);
      element.rect.x = parentRect.x + parentRect.width - right - element.rect.width;
      if (parentRect.width < 600) element.rect.y = parentRect.y + 100;
      for (const child of element.children) child.layout(element.rect);
    };
  }

  private _anchorBefore(element: GuiElement, next: GuiElement, gap: number): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect) => {
      layout(parentRect);
      element.rect.x = next.rect.x - gap - element.rect.width;
      element.rect.y = next.rect.y;
      for (const child of element.children) child.layout(element.rect);
    };
  }

  private _anchorBottomRight(element: GuiElement, right: number, bottom: number): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect) => {
      layout(parentRect);
      element.rect.x = parentRect.x + parentRect.width - right - element.rect.width;
      element.rect.y = parentRect.y + parentRect.height - bottom - element.rect.height;
      for (const child of element.children) child.layout(element.rect);
    };
  }

  private _setupInput(canvas: HTMLCanvasElement) {
    const signal = this.inputAbort.signal;
    canvas.addEventListener('pointerdown', () => this.audio.unlock(), { signal });
    window.addEventListener('keydown', (e) => {
      const keyMap: Record<string, Direction | undefined> = {
        ArrowLeft: 'left',
        a: 'left',
        A: 'left',
        ArrowRight: 'right',
        d: 'right',
        D: 'right',
        ArrowUp: 'up',
        w: 'up',
        W: 'up',
        ArrowDown: 'down',
        s: 'down',
        S: 'down',
      };
      const direction = keyMap[e.key];
      if (!direction) return;
      e.preventDefault();
      this._move(direction);
    }, { signal });

    canvas.addEventListener('touchstart', (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
    }, { passive: true, signal });

    canvas.addEventListener('touchend', (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - this.touchStartX;
      const dy = touch.clientY - this.touchStartY;
      this._moveBySwipe(dx, dy);
    }, { passive: true, signal });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseStartX = e.clientX;
      this.mouseStartY = e.clientY;
    }, { signal });

    window.addEventListener('mouseup', (e) => {
      if (!this.mouseDown) return;
      this.mouseDown = false;
      this._moveBySwipe(e.clientX - this.mouseStartX, e.clientY - this.mouseStartY);
    }, { signal });
  }

  private _buildCells() {
    const mat = this.materials.surface(this._paletteForValue(0).bg, 0.7, 0.72);
    const gridW = (this.config.cols - 1) * this.config.geometry.cellSize;
    const gridH = (this.config.rows - 1) * this.config.geometry.cellSize;
    const base = new Entity('Machined board chassis');
    base.addComponent(new CartesianTransform3D({ position: [gridW / 2, -0.25, gridH / 2] }));
    base.addComponent(new Mesh3D(createRoundedBox3D({ width: gridW + 1.58, height: 0.42, depth: gridH + 1.58, radius: 0.16, segments: 3 }), this.materials.surface('#536176', 0.38)));
    this.world.addEntity(base);
    const trim = new Entity('Brass chassis undercut');
    trim.addComponent(new CartesianTransform3D({ position: [gridW / 2, -0.43, gridH / 2] }));
    trim.addComponent(new Mesh3D(createRoundedBox3D({ width: gridW + 1.48, height: 0.12, depth: gridH + 1.48, radius: 0.055, segments: 2 }), this.materials.surface('#a78049', 0.33)));
    this.world.addEntity(trim);
    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        const cell = new Entity(`cell_${r}_${c}`);
        cell.addComponent(new CartesianTransform3D({
          position: [
            c * this.config.geometry.cellSize,
            -0.02,
            r * this.config.geometry.cellSize,
          ],
        }));
        cell.addComponent(new Mesh3D(this.cellGeometry, mat));
        this.world.addEntity(cell);
        this.cells.push(cell);
      }
    }
  }

  private async _loadOrCreateState(): Promise<void> {
    if (this.verificationMode) { this.loadVerificationBoard(); return; }
    try {
      const saved = await this.saves.load(GAME_2048_SAVE_ID);
      if (saved !== null) {
        this.board = saved.data.board;
        this.score = saved.data.score;
        this.best = saved.data.best;
        this.phase = saved.data.phase;
        this.dismissedModalPhase = saved.data.dismissedModalPhase ?? null;
        return;
      }
      this._newGame(false);
      await this._writeSaveState();
    } catch (error) {
      this._reportSaveError('读取存档失败，已创建新游戏。', error);
      this.best = 0;
      this._newGame(false);
      try {
        await this.saves.delete(GAME_2048_SAVE_ID);
        await this._writeSaveState();
      } catch (replacementError) {
        this._reportSaveError('新游戏可以继续，但当前环境无法保存进度。', replacementError);
      }
    }
  }

  private _saveState(): void {
    void this._writeSaveState().catch(error => {
      this._reportSaveError('自动保存失败。', error);
    });
  }

  private async _writeSaveState(): Promise<void> {
    if (this.verificationMode) return;
    const data: Game2048SaveData = {
      rows: this.config.rows,
      cols: this.config.cols,
      board: cloneBoard(this.board),
      score: this.score,
      best: this.best,
      phase: this.phase,
      dismissedModalPhase: this.dismissedModalPhase === 'won' || this.dismissedModalPhase === 'lost'
        ? this.dismissedModalPhase
        : null,
    };
    await this.saves.save({
      saveId: GAME_2048_SAVE_ID,
      name: '2048 自动存档',
      kind: 'autosave',
      data,
    });
  }

  private _reportSaveError(message: string, error: unknown): void {
    if (error instanceof GameSaveError) {
      console.warn(`[2048 save] ${message}`, {
        code: error.code,
        operation: error.operation,
        issues: error.issues,
      });
      return;
    }
    console.warn(`[2048 save] ${message}`, error);
  }

  private _newGame(save = true) {
    this.queuedDirection = null; this.moveElapsed = Infinity; this.moveDuration = 0;
    this.effects?.clear(); this.audio.stop();
    this.mergeRank = 0;
    if (save) this.audio.play('new-game');
    this.board = makeEmptyBoard(this.config.rows, this.config.cols);
    this.score = 0;
    this.phase = 'playing';
    this.dismissedModalPhase = null;
    this.guiModal?.hide();
    this._spawnRandomTile();
    this._spawnRandomTile();
    if (save) {
      this._syncVisuals();
      this._saveState();
    }
  }

  private _random(): number {
    if (!this.verificationMode) return Math.random();
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  private _spawnRandomTile() {
    const empty: Array<[number, number]> = [];
    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        if (boardValue(this.board, r, c) === 0) empty.push([r, c]);
      }
    }
    if (!empty.length) return;
    const [r, c] = requiredItemAt(empty, Math.floor(this._random() * empty.length), 'empty 2048 cells');
    setBoardValue(this.board, r, c, this._random() < 0.9 ? 2 : 4);
  }

  private _move(direction: Direction) {
    this.audio.unlock();
    if (this.phase === 'lost' || this.guiModal?.visible || this.disposed) return;
    if (this.moveElapsed < this.moveDuration) { this.queuedDirection = direction; return; }

    const before = cloneBoard(this.board);
    const result = calculateMove(this.board, direction);
    if (boardsEqual(before, result.board)) { this.audio.play('blocked'); return; }

    this.board = result.board;
    this.score += result.gained;
    this.best = Math.max(this.best, this.score);
    this._spawnRandomTile();
    this._updatePhase();
    this.moveElapsed = 0;
    this.moveDuration = result.merges.length && !this.reducedMotion ? this.effects.durationMs : this.config.animation.moveDurationMs;
    this.mergeRank = result.merges.reduce((rank, merge) => Math.max(rank, Math.log2(merge.value)), 0);
    this.impactPlayed = false; this.forgePlayed = false;
    this.audio.play('slide');
    this.effects.start(this.reducedMotion ? [] : result.merges);
    this._syncVisuals(result.movements, result.merges);
    this._saveState();
  }

  private _moveBySwipe(dx: number, dy: number) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.config.input.swipeThreshold) return;
    this._move(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up'));
  }

  private _updatePhase() {
    if (this.board.some(row => row.some(value => value >= 2048))) {
      this.phase = 'won';
    }
    if (!canMove(this.board)) {
      this.phase = 'lost';
    }
  }

  private _syncVisuals(movements: TileMovement[] = [], merges: TileMerge[] = []) {
    const merged = new Set(merges.map(merge => `${merge.toRow}_${merge.toCol}`));
    const used = new Set<string>();
    const movementMap = new Map(
      movements.map(move => [`${move.toRow}_${move.toCol}`, move]),
    );

    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        const value = boardValue(this.board, r, c);
        const key = `${r}_${c}`;
        if (!value) continue;
        used.add(key);

        let visual = this.tiles.get(key);
        if (!visual) {
          const material = this.materials.tile(value);
          const entity = new Entity(`tile_${key}`);
          entity.addComponent(new CartesianTransform3D());
          const mesh = new Mesh3D(this.tileGeometry, material);
          entity.addComponent(mesh);
          this.world.addEntity(entity);

          visual = { entity, mesh, age: 0, revealAt: 0, pop: true };
          this.tiles.set(key, visual);
        }

        visual.mesh.material = this.materials.tile(value);
        visual.age = 0;
        visual.revealAt = merged.has(key) && !this.reducedMotion ? this.effects.durationMs : 0;
        visual.mesh.disabled = visual.revealAt > 0;
        visual.entity.disabled = visual.mesh.disabled;
        visual.pop = merged.has(key) || !movementMap.has(key);
        visual.entity.getComponent(CartesianTransform3D)!.setScale(1, 1, 1);

        const transform = visual.entity.getComponent(CartesianTransform3D)!;
        const movement = movementMap.get(key);
        if (!merged.has(key) && movement && (movement.fromRow !== r || movement.fromCol !== c)) {
          this._animateTile(
            visual,
            transform,
            movement.fromCol * this.config.geometry.cellSize,
            movement.fromRow * this.config.geometry.cellSize,
            c * this.config.geometry.cellSize,
            r * this.config.geometry.cellSize,
          );
        } else {
          this._stopTileTween(visual);
          transform.setPosition(
            c * this.config.geometry.cellSize,
            this.config.geometry.tileHeight * 0.55,
            r * this.config.geometry.cellSize,
          );
        }
      }
    }

    for (const [key, visual] of this.tiles) {
      if (used.has(key)) continue;
      this._stopTileTween(visual);
      this.world.removeEntity(visual.entity);
      this.tiles.delete(key);
    }

    this.guiScore.setText(`SCORE  ${this.score}`);
    this.guiBest.setText(`BEST  ${this.best}`);
    this._syncStatus();
  }

  private _paletteForValue(value: number): Game2048Palette {
    return this.config.colors.tiles[String(value)] ?? this.config.colors.fallback;
  }

  private _animateTile(
    visual: TileVisual,
    transform: CartesianTransform3D,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): void {
    this._stopTileTween(visual);
    transform.setPosition(fromX, this.config.geometry.tileHeight * 0.55, fromZ);

    const position: TileTweenPosition = { x: fromX, z: fromZ };
    const tween = this.tweenManager.create(position, {
      duration: this.config.animation.moveDurationMs,
      easing: Easing.cubicOut,
    });
    tween.onUpdate = current => {
      transform.setPosition(current.x, this.config.geometry.tileHeight * 0.55, current.z);
    };
    tween.onComplete = () => {
      if (visual.tween !== tween) return;
      transform.setPosition(toX, this.config.geometry.tileHeight * 0.55, toZ);
      visual.tween = undefined;
    };
    tween.to({ x: toX, z: toZ });
    visual.tween = tween;
  }

  private _stopTileTween(visual: TileVisual): void {
    const tween = visual.tween;
    if (!tween) return;
    tween.stop();
    this.tweenManager.remove(tween);
    visual.tween = undefined;
  }

  private _syncStatus() {
    if (this.moveElapsed < this.moveDuration) { this.guiModal.hide(); return; }
    if (this.phase === 'playing') {
      this.dismissedModalPhase = null;
      this.guiModal.hide();
      return;
    }
    if (this.dismissedModalPhase === this.phase) {
      this.guiModal.hide();
      return;
    }

    const modal = this.config.hud.modal;
    const won = this.phase === 'won';
    this.guiModal.setTitle(won ? modal.winTitle : modal.lostTitle);
    this.guiModal.setMessage(won ? modal.winMessage : modal.lostMessage);
    this.guiModal.setConfirmText(modal.confirmText);
    this.guiModal.setCancelText(modal.cancelText);
    this.guiModal.setShowCancelButton(won);
    this.guiModal.show();
  }

  private _dismissModal(): void {
    this.dismissedModalPhase = this.phase;
    this._saveState();
  }

  private _tick(time: number, delta: number) {
    if (this.disposed) return;
    for (const control of this.metalControls) {
      const tint = control.element.pressed ? '#bd9564' : control.element.hovered ? '#fff0ca' : '#ffffff';
      for (const image of control.images) image.setTint(tint);
    }
    const wasBusy = this.moveElapsed < this.moveDuration;
    this.moveElapsed += Math.max(0, delta);
    this.effects.update(delta);
    if (this.mergeRank > 0 && !this.impactPlayed && this.moveElapsed >= this.config.animation.moveDurationMs) {
      this.impactPlayed = true; this.audio.play('fracture');
    }
    if (this.mergeRank > 0 && !this.forgePlayed && this.moveElapsed >= this.moveDuration) {
      this.forgePlayed = true; this.audio.play('forge', this.mergeRank);
    }
    for (const visual of this.tiles.values()) {
      visual.age += Math.max(0, delta);
      visual.mesh.disabled = visual.age < visual.revealAt;
      visual.entity.disabled = visual.mesh.disabled;
      if (!visual.pop || visual.mesh.disabled) continue;
      const t = Math.min(1, (visual.age - visual.revealAt) / 180);
      const scale = this.reducedMotion ? 1 : (t < 0.3 ? 0.75 + t / 0.3 * 0.32 : 1 + Math.sin((t - 0.3) / 0.7 * Math.PI) * 0.07);
      visual.entity.getComponent(CartesianTransform3D)!.setScale(scale, scale, scale);
      if (t >= 1) visual.pop = false;
    }
    if (wasBusy && this.moveElapsed >= this.moveDuration) this._syncStatus();
    if (this.moveElapsed >= this.moveDuration && this.queuedDirection) {
      const direction = this.queuedDirection; this.queuedDirection = null; this._move(direction);
    }
    this.world.update(time, delta);
  }
  /** Available to the deterministic browser fixture only; never changes a player's save. */
  verification() {
    if (!this.verificationMode) throw new Error('2048 verification mode is disabled.');
    return {
      snapshot: () => ({ board: cloneBoard(this.board), score: this.score, best: this.best, phase: this.phase,
        busy: this.moveElapsed < this.moveDuration, effects: this.effects.activeCount, pool: this.effects.poolSize,
        numberedTextures: this.materials.diagnostics(), tileTextOverlays: 0,
        trianglesPerMerge: this.effects.triangleCount, audio: this.audio.diagnostics(), tiles: this.tiles.size, muted: this.audio.muted,
        hiddenTiles: [...this.tiles.values()].filter(v => v.mesh.disabled).length,
        reducedMotion: this.reducedMotion,
        buttons: { restart: { ...this.guiRestart.rect }, sound: { ...this.guiSound.rect }, keep: { ...this.guiModal.cancelButton.rect } },
        viewport: { width: this.engine.displayWidth, height: this.engine.displayHeight },
      }),
      material: (value: number) => this.materials.tile(value),
      radius: (value: number) => { this.spherical.radius = value; },
      texture: (value: number) => this.materials.preview(value),
      fixture: (mode: 'showcase' | 'play' | 'full' = 'showcase') => this.loadVerificationBoard(mode),
    };
  }

  private loadVerificationBoard(mode: 'showcase' | 'play' | 'full' = 'showcase'): void {
    this.effects.clear(); this.audio.stop(); this.queuedDirection = null; this.moveElapsed = Infinity;
    this.board = makeEmptyBoard(this.config.rows, this.config.cols);
    const values = [2, 2, 4, 4, 8, 8, 16, 16, 32, 32, 64, 64, 128, 128, 256, 256, 512, 512, 1024, 1024];
    const fixture = mode === 'full' ? Array(this.config.rows * this.config.cols).fill(2) : mode === 'play' ? values.slice(0, 18) : values;
    fixture.slice(0, this.config.rows * this.config.cols).forEach((value, i) => setBoardValue(this.board, Math.floor(i / this.config.cols), i % this.config.cols, value));
    this.randomState = 2048;
    this.score = 0; this.best = 0; this.phase = 'playing'; this.dismissedModalPhase = null; this.mergeRank = 0;
    // During initial loading the caller performs visual synchronization.
    if (this.guiScore) this._syncVisuals();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inputAbort.abort(); this.queuedDirection = null;
    for (const visual of this.tiles.values()) this._stopTileTween(visual);
    this.engine?.stop();
    this.effects?.dispose(); this.audio.dispose();
    this.world?.destroy(); this.tiles.clear(); this.metalControls.length = 0; this.materials.dispose();
    this.engine?.destroy();
  }

}

export async function start2048(canvas: HTMLCanvasElement): Promise<Game2048> {
  const game = new Game2048(await loadGame2048Config());
  try { await game.init(canvas); return game; }
  catch (error) { game.dispose(); throw error; }
}
