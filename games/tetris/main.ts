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
import { requiredItemAt } from '../arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

type Phase = 'playing' | 'paused' | 'lost';
type PieceKind = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

interface Config {
  rows: number;
  cols: number;
}

interface Point {
  row: number;
  col: number;
}

interface Piece {
  kind: PieceKind;
  row: number;
  col: number;
  rotation: number;
}

interface TetrisSaveData {
  rows: number;
  cols: number;
  board: Array<Array<PieceKind | null>>;
  current: Piece;
  nextKind: PieceKind;
  phase: Phase;
  score: number;
}

interface BlockVisual {
  entity: Entity;
  material: BasicMaterial;
}

const CANVAS_W = 900;
const CANVAS_H = 600;
const CELL_SIZE = 0.58;
const CELL_HEIGHT = 0.08;
const BLOCK_HEIGHT = 0.34;
const DROP_MS = 620;
const SCORE_BY_LINES = [0, 1, 4, 12, 32];

const COLORS: Record<PieceKind, string> = {
  I: '#22d3ee',
  J: '#2563eb',
  L: '#f97316',
  O: '#facc15',
  S: '#22c55e',
  T: '#a855f7',
  Z: '#ef4444',
};

const SHAPES: Record<PieceKind, Point[]> = {
  I: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }],
  J: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  L: [{ row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  O: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  S: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
  T: [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  Z: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
};

const KINDS = Object.keys(SHAPES) as PieceKind[];
const KIND_SET = new Set<string>(KINDS);
const geoCell = createBox3D({ width: 0.52, height: CELL_HEIGHT, depth: 0.52 });
const geoBlock = createBox3D({ width: 0.54, height: BLOCK_HEIGHT, depth: 0.54 });

function color(hex: string): ColorSRGB {
  return ColorSRGB.fromHex(hex);
}

function emptyBoard(rows: number, cols: number): Array<Array<PieceKind | null>> {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

function rotatePoint(point: Point, rotation: number, kind: PieceKind): Point {
  if (kind === 'O') return point;

  let row = point.row;
  let col = point.col;
  for (let i = 0; i < rotation % 4; i++) {
    [row, col] = [col, 3 - row];
  }
  return { row, col };
}

function randomKind(): PieceKind {
  return requiredItemAt(KINDS, Math.floor(Math.random() * KINDS.length), 'Tetris piece kinds');
}

function isPiece(value: unknown): value is Piece {
  return isRecord(value)
    && typeof value.kind === 'string' && KIND_SET.has(value.kind)
    && Number.isSafeInteger(value.row)
    && Number.isSafeInteger(value.col)
    && Number.isSafeInteger(value.rotation);
}

function isTetrisSaveData(value: unknown): value is TetrisSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.rows)
    && isNonNegativeInteger(value.cols)
    && Array.isArray(value.board)
    && value.board.length === value.rows
    && value.board.every(row => Array.isArray(row)
      && row.length === value.cols
      && row.every(cell => cell === null || (typeof cell === 'string' && KIND_SET.has(cell))))
    && isPiece(value.current)
    && typeof value.nextKind === 'string' && KIND_SET.has(value.nextKind)
    && (value.phase === 'playing' || value.phase === 'paused' || value.phase === 'lost')
    && isNonNegativeInteger(value.score);
}

class TetrisGame {
  private readonly saves = new SingleSlotGameSave<TetrisSaveData>({
    gameId: 'tetris',
    name: 'Tetris 自动存档',
    validateData: isTetrisSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private camEntity!: Entity;
  private cam3D!: Camera3D;
  private board: Array<Array<PieceKind | null>>;

  private boardVisuals = new Map<string, BlockVisual>();
  private activeVisuals: BlockVisual[] = [];
  private cellVisuals: Entity[] = [];

  private current!: Piece;
  private nextKind: PieceKind = randomKind();
  private phase: Phase = 'playing';
  private score = 0;
  private dropAccumulator = 0;

  private elScore!: HTMLElement;
  private elNext!: HTMLElement;
  private elStatus!: HTMLElement;
  private elStatusTitle!: HTMLElement;
  private elStatusSub!: HTMLElement;
  private elPauseButton!: HTMLButtonElement;
  private nextCells: HTMLElement[] = [];

  constructor(private config: Config) {
    this.config.rows = Math.max(10, Math.floor(config.rows || 20));
    this.config.cols = Math.max(6, Math.floor(config.cols || 10));
    this.board = emptyBoard(this.config.rows, this.config.cols);
  }

  async init(canvas: HTMLCanvasElement) {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.07, g: 0.10, b: 0.16, a: 1 },
    });
    await this.engine.init();

    this.world = new World('Tetris');
    this._setupCamera();
    this._setupLights();
    this._setupDOM();
    this._setupInput();
    this._buildCells();
    await this._loadOrCreateState();

    this.engine.on('update', ({ detail: { time, delta } }) => this._tick(time, delta));
    this.engine.run();
  }

  private _setupCamera() {
    const gridW = (this.config.cols - 1) * CELL_SIZE;
    const gridH = (this.config.rows - 1) * CELL_SIZE;
    const radius = Math.max(gridW, gridH) * 1.08 + 4.2;

    const spherical = new SphericalTransform3D({
      radius,
      theta: 0,
      phi: Math.PI / 5.4,
      target: [gridW / 2, 0, gridH / 2],
    });
    this.cam3D = new Camera3D({
      type: 'perspective',
      fov: Math.PI / 4.7,
      near: 0.1,
      far: 200,
    });

    this.camEntity = new Entity('Camera3D');
    this.camEntity.addComponent(this.cam3D);
    this.camEntity.addComponent(spherical);
    this.world.addEntity(this.camEntity);
    const render3DSystem = new Render3DSystem(this.engine, this.camEntity, {
      priority: 0,
      loadOp: 'clear',
      transparentSort: false,
    });
    this.world.addSystem(render3DSystem);
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, this.camEntity, {
      priority: -1,
      render3DSystem,
    }));
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Tetris.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private _setupLights() {
    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [1, 1, 1], intensity: 0.28 }));
    this.world.addEntity(ambient);

    const directional = new Entity('DirectionalLight');
    directional.addComponent(new DirectionalLight({
      color: [0.95, 0.98, 1],
      intensity: 1.25,
      direction: [-0.55, -1, -0.35],
    }));
    this.world.addEntity(directional);
  }

  private _setupDOM() {
    this.elScore = document.getElementById('score')!;
    this.elNext = document.getElementById('next')!;
    this.elStatus = document.getElementById('status')!;
    this.elStatusTitle = document.getElementById('status-title')!;
    this.elStatusSub = document.getElementById('status-sub')!;
    this.elPauseButton = document.getElementById('btn-pause') as HTMLButtonElement;
    document.getElementById('btn-new')!.addEventListener('click', () => this._newGame());
    this.elPauseButton.addEventListener('click', () => this._togglePause());

    this.nextCells = [];
    this.elNext.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.className = 'next-cell';
      this.elNext.appendChild(cell);
      this.nextCells.push(cell);
    }
  }

  private _setupInput() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') {
        this._togglePause();
        return;
      }
      if (this.phase !== 'playing') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        this._tryMove(0, -1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this._tryMove(0, 1);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this._softDrop();
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        this._tryRotate();
      } else if (e.code === 'Space') {
        e.preventDefault();
        this._hardDrop();
      }
      this._saveState();
    });
  }

  private _buildCells() {
    const mat = new BasicMaterial({ color: color('#1e293b') });
    for (let row = 0; row < this.config.rows; row++) {
      for (let col = 0; col < this.config.cols; col++) {
        const entity = new Entity(`cell_${row}_${col}`);
        entity.addComponent(new CartesianTransform3D({
          position: [col * CELL_SIZE, -0.03, row * CELL_SIZE],
        }));
        entity.addComponent(new Mesh3D(geoCell, mat));
        this.world.addEntity(entity);
        this.cellVisuals.push(entity);
      }
    }
  }

  private _newGame(save = true) {
    for (const visual of this.boardVisuals.values()) this.world.removeEntity(visual.entity);
    for (const visual of this.activeVisuals) this.world.removeEntity(visual.entity);
    this.boardVisuals.clear();
    this.activeVisuals = [];
    this.board = emptyBoard(this.config.rows, this.config.cols);
    this.score = 0;
    this.phase = 'playing';
    this.dropAccumulator = 0;
    this.nextKind = randomKind();
    this._spawnPiece();
    this._syncHUD();
    this._syncPauseButton();
    this._syncStatus();
    if (save) this._saveState();
  }

  private async _loadOrCreateState(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved || saved.rows !== this.config.rows || saved.cols !== this.config.cols) {
      this._newGame();
      return;
    }
    this.board = saved.board.map(row => [...row]);
    this.current = { ...saved.current };
    this.nextKind = saved.nextKind;
    this.phase = saved.phase;
    this.score = saved.score;
    this.dropAccumulator = 0;
    this._syncBoardVisuals();
    this._syncActiveVisuals();
    this._syncNextPreview();
    this._syncHUD();
    this._syncStatus();
  }

  private _saveState(): void {
    this.saves.save({
      rows: this.config.rows,
      cols: this.config.cols,
      board: this.board.map(row => [...row]),
      current: { ...this.current },
      nextKind: this.nextKind,
      phase: this.phase,
      score: this.score,
    });
  }

  private _spawnPiece() {
    this.current = {
      kind: this.nextKind,
      row: 0,
      col: Math.floor(this.config.cols / 2) - 2,
      rotation: 0,
    };
    this.nextKind = randomKind();
    if (!this._isValid(this.current)) {
      this.phase = 'lost';
    }
    this._syncActiveVisuals();
    this._syncNextPreview();
    this._syncPauseButton();
    this._syncStatus();
  }

  private _activeCells(piece = this.current): Point[] {
    return SHAPES[piece.kind].map(point => {
      const rotated = rotatePoint(point, piece.rotation, piece.kind);
      return {
        row: piece.row + rotated.row,
        col: piece.col + rotated.col,
      };
    });
  }

  private _isValid(piece: Piece): boolean {
    return this._activeCells(piece).every(({ row, col }) => (
      row >= 0 &&
      row < this.config.rows &&
      col >= 0 &&
      col < this.config.cols &&
      !requiredItemAt(requiredItemAt(this.board, row, 'Tetris board rows'), col, 'Tetris board cells')
    ));
  }

  private _tryMove(dr: number, dc: number): boolean {
    const next = { ...this.current, row: this.current.row + dr, col: this.current.col + dc };
    if (!this._isValid(next)) return false;
    this.current = next;
    this._syncActiveVisuals();
    return true;
  }

  private _tryRotate() {
    const attempts = [0, -1, 1, -2, 2];
    for (const kick of attempts) {
      const next = {
        ...this.current,
        col: this.current.col + kick,
        rotation: (this.current.rotation + 1) % 4,
      };
      if (this._isValid(next)) {
        this.current = next;
        this._syncActiveVisuals();
        return;
      }
    }
  }

  private _softDrop() {
    if (!this._tryMove(1, 0)) {
      this._lockPiece();
    }
    this.dropAccumulator = 0;
  }

  private _hardDrop() {
    while (this._tryMove(1, 0)) {
      // Keep falling until blocked.
    }
    this._lockPiece();
    this.dropAccumulator = 0;
  }

  private _lockPiece() {
    for (const cell of this._activeCells()) {
      if (cell.row >= 0 && cell.row < this.config.rows) {
        requiredItemAt(this.board, cell.row, 'Tetris board rows')[cell.col] = this.current.kind;
      }
    }
    this._clearActiveVisuals();
    this._clearLines();
    this._syncBoardVisuals();
    this._spawnPiece();
  }

  private _clearLines() {
    let cleared = 0;
    const nextBoard: Array<Array<PieceKind | null>> = [];
    for (let row = 0; row < this.config.rows; row++) {
      const boardRow = requiredItemAt(this.board, row, 'Tetris board rows');
      if (boardRow.every(Boolean)) {
        cleared++;
      } else {
        nextBoard.push(boardRow);
      }
    }

    while (nextBoard.length < this.config.rows) {
      nextBoard.unshift(Array(this.config.cols).fill(null));
    }
    this.board = nextBoard;
    this.score += SCORE_BY_LINES[cleared] ?? 0;
    this._syncHUD();
  }

  private _syncBoardVisuals() {
    const used = new Set<string>();
    for (let row = 0; row < this.config.rows; row++) {
      for (let col = 0; col < this.config.cols; col++) {
        const kind = requiredItemAt(requiredItemAt(this.board, row, 'Tetris board rows'), col, 'Tetris board cells');
        if (!kind) continue;
        const key = `${row}_${col}`;
        used.add(key);
        let visual = this.boardVisuals.get(key);
        if (!visual) {
          visual = this._createBlock(`fixed_${key}`, kind);
          this.boardVisuals.set(key, visual);
        }
        this._placeVisual(visual, row, col, kind);
      }
    }
    for (const [key, visual] of this.boardVisuals) {
      if (used.has(key)) continue;
      this.world.removeEntity(visual.entity);
      this.boardVisuals.delete(key);
    }
  }

  private _syncActiveVisuals() {
    while (this.activeVisuals.length < 4) {
      this.activeVisuals.push(this._createBlock(`active_${this.activeVisuals.length}`, this.current.kind));
    }
    const cells = this._activeCells();
    for (let i = 0; i < 4; i++) {
      const visual = requiredItemAt(this.activeVisuals, i, 'active Tetris visuals');
      const cell = requiredItemAt(cells, i, 'active Tetris cells');
      this._placeVisual(visual, cell.row, cell.col, this.current.kind);
    }
  }

  private _clearActiveVisuals() {
    for (const visual of this.activeVisuals) {
      this.world.removeEntity(visual.entity);
    }
    this.activeVisuals = [];
  }

  private _createBlock(name: string, kind: PieceKind): BlockVisual {
    const material = new BasicMaterial({ color: color(COLORS[kind]) });
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D());
    entity.addComponent(new Mesh3D(geoBlock, material));
    this.world.addEntity(entity);
    return { entity, material };
  }

  private _placeVisual(visual: BlockVisual, row: number, col: number, kind: PieceKind) {
    const c = color(COLORS[kind]);
    visual.material.color.setFromSRGB(c.r, c.g, c.b, 1);
    visual.entity
      .getComponent(CartesianTransform3D)!
      .setPosition(col * CELL_SIZE, BLOCK_HEIGHT * 0.48, row * CELL_SIZE);
  }

  private _syncNextPreview() {
    const filled = new Set(SHAPES[this.nextKind].map(point => `${point.row}_${point.col}`));
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const el = this.nextCells[row * 4 + col];
        const active = filled.has(`${row}_${col}`);
        if (!el) continue;
        el.className = active ? 'next-cell filled' : 'next-cell';
        el.style.background = active ? COLORS[this.nextKind] : 'rgba(51, 65, 85, 0.52)';
      }
    }
  }

  private _syncHUD() {
    this.elScore.textContent = String(this.score);
  }

  private _syncStatus() {
    if (this.phase === 'playing') {
      this.elStatus.classList.remove('visible');
      this._syncPauseButton();
      return;
    }
    this.elStatusTitle.textContent = this.phase === 'paused' ? 'Paused' : 'Game over';
    this.elStatusSub.textContent = this.phase === 'paused'
      ? 'Press P to resume.'
      : `Score: ${this.score}. Start a new game.`;
    this.elStatus.classList.add('visible');
    this._syncPauseButton();
  }

  private _togglePause() {
    if (this.phase === 'lost') return;
    this.phase = this.phase === 'paused' ? 'playing' : 'paused';
    this._syncStatus();
    this._saveState();
  }

  private _syncPauseButton() {
    this.elPauseButton.textContent = this.phase === 'paused' ? 'Resume' : 'Pause';
    this.elPauseButton.disabled = this.phase === 'lost';
  }

  private _tick(time: number, delta: number) {
    if (this.phase === 'playing') {
      this.dropAccumulator += delta;
      if (this.dropAccumulator >= DROP_MS) {
        this._softDrop();
        this._saveState();
      }
    }
    this.world.update(time, delta);
  }
}

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const cfg = await fetch('./config.json')
    .then(r => r.json())
    .catch(() => ({ rows: 20, cols: 10 })) as Partial<Config>;

  const game = new TetrisGame({
    rows: cfg.rows ?? 20,
    cols: cfg.cols ?? 10,
  });
  await game.init(canvas);
}

main();
