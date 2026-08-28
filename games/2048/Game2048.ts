import { HaiyueEngine } from '@haiyue/engine';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { CartesianTransform3D } from '@haiyue/engine';
import { SphericalTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import { BlinnPhongRenderSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { BasicMaterial } from '@haiyue/engine';
import { ColorSRGB } from '@haiyue/engine';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { createBox3D } from '@haiyue/engine';
import { GameSaveError, GameSaveService, LocalStorageSaveBackend } from '@haiyue/engine/save';
import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { CameraViewProjectionCache } from '../CameraViewProjectionCache';
import {
  GAME_2048_ID,
  GAME_2048_SAVE_DATA_VERSION,
  GAME_2048_SAVE_ID,
  isGame2048SaveData,
  type Game2048SaveData,
} from './saveState';

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
} from './rules';

interface Config {
  rows: number;
  cols: number;
}

interface TileVisual {
  entity: Entity;
  material: BasicMaterial;
  label: HTMLElement;
  animation?: TileAnimation | undefined;
}

interface TileAnimation {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  start: number;
  duration: number;
}

const CELL_SIZE = 1.22;
const CELL_HEIGHT = 0.14;
const TILE_HEIGHT = 0.28;
const MOVE_ANIMATION_MS = 130;
const SWIPE_THRESHOLD = 24;
const geoCell = createBox3D({ width: 1.04, height: CELL_HEIGHT, depth: 1.04 });
const geoTile = createBox3D({ width: 1.02, height: TILE_HEIGHT, depth: 1.02 });

const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#cdc1b4', fg: '#776e65' },
  2: { bg: '#eee4da', fg: '#776e65' },
  4: { bg: '#ede0c8', fg: '#776e65' },
  8: { bg: '#f2b179', fg: '#f9f6f2' },
  16: { bg: '#f59563', fg: '#f9f6f2' },
  32: { bg: '#f67c5f', fg: '#f9f6f2' },
  64: { bg: '#f65e3b', fg: '#f9f6f2' },
  128: { bg: '#edcf72', fg: '#f9f6f2' },
  256: { bg: '#edcc61', fg: '#f9f6f2' },
  512: { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
};

function color(hex: string): ColorSRGB {
  return ColorSRGB.fromHex(hex);
}

function project3DToScreen(
  wx: number,
  wy: number,
  wz: number,
  viewProj: Float32Array,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number; behind: boolean } {
  const cx = requiredNumberAt(viewProj, 0, '2048 view projection') * wx + requiredNumberAt(viewProj, 4, '2048 view projection') * wy + requiredNumberAt(viewProj, 8, '2048 view projection') * wz + requiredNumberAt(viewProj, 12, '2048 view projection');
  const cy = requiredNumberAt(viewProj, 1, '2048 view projection') * wx + requiredNumberAt(viewProj, 5, '2048 view projection') * wy + requiredNumberAt(viewProj, 9, '2048 view projection') * wz + requiredNumberAt(viewProj, 13, '2048 view projection');
  const cw = requiredNumberAt(viewProj, 3, '2048 view projection') * wx + requiredNumberAt(viewProj, 7, '2048 view projection') * wy + requiredNumberAt(viewProj, 11, '2048 view projection') * wz + requiredNumberAt(viewProj, 15, '2048 view projection');
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  return {
    x: (ndcX + 1) / 2 * viewportWidth,
    y: (1 - ndcY) / 2 * viewportHeight,
    behind: cw < 0,
  };
}

class Game2048 {
  private readonly saves: GameSaveService<Game2048SaveData>;
  private engine!: HaiyueEngine;
  private world!: World;
  private camEntity!: Entity;
  private cam3D!: Camera3D;
  private spherical!: SphericalTransform3D;
  private viewProj = new Float32Array(16);
  private readonly cameraProjection = new CameraViewProjectionCache(this.viewProj);

  private board: number[][];
  private score = 0;
  private best = 0;
  private phase: GamePhase = 'playing';
  private cells: Entity[] = [];
  private tiles = new Map<string, TileVisual>();

  private elScore!: HTMLElement;
  private elBest!: HTMLElement;
  private elLabels!: HTMLElement;
  private elStatus!: HTMLElement;
  private elStatusTitle!: HTMLElement;
  private elStatusSub!: HTMLElement;

  private touchStartX = 0;
  private touchStartY = 0;
  private mouseStartX = 0;
  private mouseStartY = 0;
  private mouseDown = false;

  constructor(private config: Config) {
    this.config.rows = Math.max(2, Math.floor(config.rows || 4));
    this.config.cols = Math.max(2, Math.floor(config.cols || 4));
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
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.98, g: 0.96, b: 0.90, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    this.engine.resizeToDisplaySize(true);

    this.world = new World('2048');
    this._setupCamera();
    this._setupLights();
    this._setupDOM();
    this._setupInput(canvas);
    this._buildCells();
    await this._loadOrCreateState();
    this._syncVisuals();

    this.engine.on('update', ({ detail: { time, delta } }) => {
      this._tick(time, delta);
    });
    this.engine.run();
  }

  private _setupCamera() {
    const gridW = (this.config.cols - 1) * CELL_SIZE;
    const gridH = (this.config.rows - 1) * CELL_SIZE;
    const radius = Math.max(gridW, gridH) * 1.08 + 5.2;

    this.spherical = new SphericalTransform3D({
      radius,
      theta: 0,
      phi: Math.PI / 4.1,
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

    const render3DSystem = new Render3DSystem(this.engine, this.camEntity, {
      priority: 0,
      loadOp: 'clear',
      msaaSamples: 4,
    });
    this.world.addSystem(render3DSystem);
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, this.camEntity, {
      priority: -1,
      render3DSystem,
    }));
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Game2048.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private _setupLights() {
    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [1, 0.97, 0.9], intensity: 0.36 }));
    this.world.addEntity(ambient);

    const directional = new Entity('DirectionalLight');
    directional.addComponent(new DirectionalLight({
      color: [1, 0.95, 0.86],
      intensity: 1.18,
      direction: [-0.45, -1, -0.4],
    }));
    this.world.addEntity(directional);
  }

  private _setupDOM() {
    this.elScore = document.getElementById('score')!;
    this.elBest = document.getElementById('best')!;
    this.elLabels = document.getElementById('tile-labels')!;
    this.elStatus = document.getElementById('status')!;
    this.elStatusTitle = document.getElementById('status-title')!;
    this.elStatusSub = document.getElementById('status-sub')!;
    document.getElementById('btn-new')!.addEventListener('click', () => this._newGame());
  }

  private _setupInput(canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', (e) => {
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
    });

    canvas.addEventListener('touchstart', (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - this.touchStartX;
      const dy = touch.clientY - this.touchStartY;
      this._moveBySwipe(dx, dy);
    }, { passive: true });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseStartX = e.clientX;
      this.mouseStartY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.mouseDown) return;
      this.mouseDown = false;
      this._moveBySwipe(e.clientX - this.mouseStartX, e.clientY - this.mouseStartY);
    });
  }

  private _buildCells() {
    const mat = new BasicMaterial({ color: color('#cdc1b4') });
    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        const cell = new Entity(`cell_${r}_${c}`);
        cell.addComponent(new CartesianTransform3D({
          position: [c * CELL_SIZE, -0.02, r * CELL_SIZE],
        }));
        cell.addComponent(new Mesh3D(geoCell, mat));
        this.world.addEntity(cell);
        this.cells.push(cell);
      }
    }
  }

  private async _loadOrCreateState(): Promise<void> {
    try {
      const saved = await this.saves.load(GAME_2048_SAVE_ID);
      if (saved !== null) {
        this.board = saved.data.board;
        this.score = saved.data.score;
        this.best = saved.data.best;
        this.phase = saved.data.phase;
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
    const data: Game2048SaveData = {
      rows: this.config.rows,
      cols: this.config.cols,
      board: cloneBoard(this.board),
      score: this.score,
      best: this.best,
      phase: this.phase,
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
    this.board = makeEmptyBoard(this.config.rows, this.config.cols);
    this.score = 0;
    this.phase = 'playing';
    this._spawnRandomTile();
    this._spawnRandomTile();
    if (save) {
      this._syncVisuals();
      this._saveState();
    }
  }

  private _spawnRandomTile() {
    const empty: Array<[number, number]> = [];
    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        if (boardValue(this.board, r, c) === 0) empty.push([r, c]);
      }
    }
    if (!empty.length) return;
    const [r, c] = requiredItemAt(empty, Math.floor(Math.random() * empty.length), 'empty 2048 cells');
    setBoardValue(this.board, r, c, Math.random() < 0.9 ? 2 : 4);
  }

  private _move(direction: Direction) {
    if (this.phase === 'lost') return;

    const before = cloneBoard(this.board);
    const result = calculateMove(this.board, direction);
    if (boardsEqual(before, result.board)) return;

    this.board = result.board;
    this.score += result.gained;
    this.best = Math.max(this.best, this.score);
    this._spawnRandomTile();
    this._updatePhase();
    this._syncVisuals(result.movements);
    this._saveState();
  }

  private _moveBySwipe(dx: number, dy: number) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
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

  private _syncVisuals(movements: TileMovement[] = []) {
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
          const material = new BasicMaterial({ color: color('#eee4da') });
          const entity = new Entity(`tile_${key}`);
          entity.addComponent(new CartesianTransform3D());
          entity.addComponent(new Mesh3D(geoTile, material));
          this.world.addEntity(entity);

          const label = document.createElement('div');
          label.className = 'tile-num';
          this.elLabels.appendChild(label);

          visual = { entity, material, label };
          this.tiles.set(key, visual);
        }

        const palette = TILE_COLORS[value] ?? { bg: '#3c3a32', fg: '#f9f6f2' };
        const bg = color(palette.bg);
        visual.material.color.setFromSRGB(bg.r, bg.g, bg.b, 1);
        visual.label.textContent = String(value);
        visual.label.style.color = palette.fg;
        visual.label.style.fontSize = `${this._fontSizeForValue(value)}px`;

        const transform = visual.entity.getComponent(CartesianTransform3D)!;
        const movement = movementMap.get(key);
        if (movement && (movement.fromRow !== r || movement.fromCol !== c)) {
          visual.animation = {
            fromRow: movement.fromRow,
            fromCol: movement.fromCol,
            toRow: r,
            toCol: c,
            start: performance.now(),
            duration: MOVE_ANIMATION_MS,
          };
          transform.setPosition(
            movement.fromCol * CELL_SIZE,
            TILE_HEIGHT * 0.55,
            movement.fromRow * CELL_SIZE,
          );
        } else {
          visual.animation = undefined;
          transform.setPosition(c * CELL_SIZE, TILE_HEIGHT * 0.55, r * CELL_SIZE);
        }
      }
    }

    for (const [key, visual] of this.tiles) {
      if (used.has(key)) continue;
      this.world.removeEntity(visual.entity);
      visual.label.remove();
      this.tiles.delete(key);
    }

    this.elScore.textContent = String(this.score);
    this.elBest.textContent = String(this.best);
    this._syncStatus();
  }

  private _fontSizeForValue(value: number): number {
    if (value < 100) return 34;
    if (value < 1000) return 28;
    return 23;
  }

  private _syncStatus() {
    if (this.phase === 'playing') {
      this.elStatus.classList.remove('visible');
      return;
    }

    this.elStatusTitle.textContent = this.phase === 'won' ? 'You win!' : 'Game over';
    this.elStatusSub.textContent = this.phase === 'won'
      ? 'Keep playing or start a new game.'
      : 'No more moves. Start a new game.';
    this.elStatus.classList.add('visible');
  }

  private _updateLabels(viewportWidth: number, viewportHeight: number) {
    for (const visual of this.tiles.values()) {
      const transform = visual.entity.getComponent(CartesianTransform3D)!;
      const x = requiredNumberAt(transform.position, 0, '2048 tile position');
      const z = requiredNumberAt(transform.position, 2, '2048 tile position');
      const sc = project3DToScreen(
        x,
        TILE_HEIGHT + 0.18,
        z,
        this.viewProj,
        viewportWidth,
        viewportHeight,
      );
      visual.label.style.display = sc.behind ? 'none' : 'block';
      visual.label.style.left = `${sc.x}px`;
      visual.label.style.top = `${sc.y}px`;
    }
  }

  private _updateAnimations(now: number) {
    for (const visual of this.tiles.values()) {
      const animation = visual.animation;
      if (!animation) continue;

      const t = Math.min(1, (now - animation.start) / animation.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const x = (animation.fromCol + (animation.toCol - animation.fromCol) * eased) * CELL_SIZE;
      const z = (animation.fromRow + (animation.toRow - animation.fromRow) * eased) * CELL_SIZE;
      visual.entity
        .getComponent(CartesianTransform3D)!
        .setPosition(x, TILE_HEIGHT * 0.55, z);

      if (t >= 1) {
        visual.animation = undefined;
      }
    }
  }

  private _tick(time: number, delta: number) {
    const viewportWidth = Math.max(1, this.engine.displayWidth);
    const viewportHeight = Math.max(1, this.engine.displayHeight);
    this.cameraProjection.update(this.spherical, this.cam3D, viewportWidth, viewportHeight);
    this._updateAnimations(performance.now());
    this._updateLabels(viewportWidth, viewportHeight);
    this.world.update(time, delta);
  }
}

export async function start2048(canvas: HTMLCanvasElement): Promise<void> {
  const cfg = await fetch('./config.json')
    .then(r => r.json())
    .catch(() => ({ rows: 4, cols: 4 })) as Partial<Config>;

  const game = new Game2048({
    rows: cfg.rows ?? 4,
    cols: cfg.cols ?? 4,
  });
  await game.init(canvas);
}
