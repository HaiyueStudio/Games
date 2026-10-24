import { fitPerspectiveCamera } from '../../shared/rendering/fitPerspectiveCamera';
import { TetrisHud } from '../ui/TetrisHud';
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
import { BasicMaterial } from '@haiyue/engine';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { createBox3D } from '@haiyue/engine';
import { requiredItemAt } from '../../shared/collections/arrayAccess';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { NeonSurface } from '../rendering/NeonSurface';
import { LineFragments, type ClearedBlock } from '../rendering/LineFragments';
import { TetrisAudio } from '../audio/TetrisAudio';
import { NeonChrome } from '../rendering/NeonChrome';
import { Geometry3D } from '@haiyue/engine/geometry';

import {
  createEmptyTetrisBoard as emptyBoard,
  isTetrisSaveData,
  randomTetrisKind as randomKind,
  rotateTetrisPoint as rotatePoint,
  TETRIS_COLORS as COLORS,
  TETRIS_SCORE_BY_LINES as SCORE_BY_LINES,
  TETRIS_SHAPES as SHAPES,
  type PieceKind,
  type TetrisConfig as Config,
  type TetrisPhase as Phase,
  type TetrisPiece as Piece,
  type TetrisPoint as Point,
  type TetrisSaveData,
} from '../rules/rules';

interface BlockVisual {
  entity: Entity;
  mesh: Mesh3D;
}

const CELL_SIZE = 0.58;
const BLOCK_HEIGHT = 0.34;
const DROP_MS = 620;
const geoBlock = createBox3D({ width: 0.54, height: BLOCK_HEIGHT, depth: 0.54 });

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
  private lines = 0;
  private effectTime = 0;
  private surface!: NeonSurface;
  private chrome!: NeonChrome;
  private fragments!: LineFragments;
  private readonly audio = new TetrisAudio();
  private readonly lifetime = new AbortController();
  private readonly gpuErrors: string[] = [];
  private dropAccumulator = 0;

  private hud!: TetrisHud;

  constructor(private config: Config) {
    this.config.rows = Math.max(10, Math.floor(config.rows || 20));
    this.config.cols = Math.max(6, Math.floor(config.cols || 10));
    this.board = emptyBoard(this.config.rows, this.config.cols);
  }

  async init(canvas: HTMLCanvasElement) {
    this.engine = new GameEngine({
      canvas,
      clearColor: { r: 0.012, g: 0.018, b: 0.052, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    if (new URLSearchParams(location.search).has('verify')) {
      this.engine.device.addEventListener('uncapturederror', event => this.gpuErrors.push(event.error.message), { signal: this.lifetime.signal });
    }

    this.world = new World('Tetris');
    this.surface = new NeonSurface(this.engine.device);
    this.chrome = new NeonChrome(this.engine.device, this.config.cols, this.config.rows);
    this.fragments = new LineFragments(this.world, this.surface, this.config.cols * 4);
    this.hud = new TetrisHud(this.engine, this.world,
      () => { this.hud.system.focus.blur(); this.audio.play('button'); this._togglePause(); },
      () => { this.hud.system.focus.blur(); this.audio.play('button'); this._newGame(); },
      () => { this.hud.system.focus.blur(); this.audio.toggle(); this.hud.sound.setText(this.audio.muted ? '音效 关' : '音效 开'); }, this.chrome);
    this._setupCamera();
    this._setupLights();
    this._setupInput();
    this._buildCells();
    await this._loadOrCreateState();
    if (new URLSearchParams(location.search).has('verify')) this._installVerification();
    document.body.dataset.renderStatus = 'ready';
    window.addEventListener('pagehide', () => {
      this.lifetime.abort(); this.audio.dispose(); this.engine.stop();
      this.fragments.dispose(); this.world.destroy(); this.surface.dispose(); this.chrome.dispose(); this.engine.destroy();
    }, { once: true, signal: this.lifetime.signal });

    this.engine.on('update', ({ detail: { time, delta } }) => this._tick(time, delta));
    this.engine.run();
  }

  private _setupCamera() {
    const gridW = (this.config.cols - 1) * CELL_SIZE;
    const gridH = (this.config.rows - 1) * CELL_SIZE;
    const radius = Math.max(gridW, gridH) * 1.4 + 5.6;

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
    fitPerspectiveCamera(this.engine, this.world, this.cam3D, .9);
    const render3DSystem = new Render3DSystem(this.engine, this.camEntity, {
      priority: 0,
      loadOp: 'clear',
      transparentSort: false,
    });
    this.world.addSystem(render3DSystem);
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

  private _setupInput() {
    document.addEventListener('pointerdown', () => this.audio.unlock(), { signal: this.lifetime.signal });
    document.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.key === 'p' || e.key === 'P') {
        if (e.repeat) return;
        this.audio.play('button');
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
    }, { signal: this.lifetime.signal });
  }

  private _buildCells() {
    const x0 = -.69, z0 = -.69;
    const x1 = x0 + this.chrome.boardWidth, z1 = z0 + this.chrome.boardDepth;
    const geometry = new Geometry3D({
      positions: new Float32Array([x0, -.06, z0, x1, -.06, z0, x1, -.06, z1, x0, -.06, z1]),
      textureCoordinates: [{ set: 0, data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]) }],
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]), cullMode: 'none',
    });
    const entity = new Entity('Tetris luminous grid and rails')
      .addComponent(new CartesianTransform3D())
      .addComponent(new Mesh3D(geometry, new BasicMaterial({ texture: this.chrome.board, blending: 'normal', depthWrite: false })));
    this.world.addEntity(entity); this.cellVisuals.push(entity);
  }

  private _newGame(save = true) {
    this.fragments.clear(); this.lines = 0; this.hud.resetFeedback(); this.chrome.reset();
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
    this.lines = saved.lines ?? 0;
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
      lines: this.lines,
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
    this.audio.play('drop');
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
    const broken: ClearedBlock[] = [];
    const nextBoard: Array<Array<PieceKind | null>> = [];
    for (let row = 0; row < this.config.rows; row++) {
      const boardRow = requiredItemAt(this.board, row, 'Tetris board rows');
      if (boardRow.every(Boolean)) {
        cleared++;
        boardRow.forEach((kind, col) => { if (kind) broken.push({ row, col, kind }); });
      } else {
        nextBoard.push(boardRow);
      }
    }

    while (nextBoard.length < this.config.rows) {
      nextBoard.unshift(Array(this.config.cols).fill(null));
    }
    this.board = nextBoard;
    this.score += SCORE_BY_LINES[cleared] ?? 0;
    if (cleared) {
      this.lines += cleared; this.fragments.start(broken);
      this.hud.cleared(cleared); this.audio.play('clear', cleared);
      this.chrome.flash(this.effectTime);
    }
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
    const material = this.surface.material(kind);
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D());
    const mesh = new Mesh3D(geoBlock, material);
    entity.addComponent(mesh);
    this.world.addEntity(entity);
    return { entity, mesh };
  }

  private _placeVisual(visual: BlockVisual, row: number, col: number, kind: PieceKind) {
    visual.mesh.material = this.surface.material(kind);
    visual.entity
      .getComponent(CartesianTransform3D)!
      .setPosition(col * CELL_SIZE, BLOCK_HEIGHT * 0.48, row * CELL_SIZE);
  }

  private _syncNextPreview() {
    const filled = new Set(SHAPES[this.nextKind].map(point => `${point.row}_${point.col}`));
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const el = this.hud.next[row * 4 + col];
        const active = filled.has(`${row}_${col}`);
        if (!el) continue;
        el.setStyle({ backgroundColor: active ? COLORS[this.nextKind] : '#151e3a', borderColor: active ? '#b9eaff' : '#243154' });
        el.setSource(active ? this.surface.texture : null);
        el.setTint(active ? COLORS[this.nextKind] : '#ffffff');
      }
    }
  }

  private _syncHUD() {
    this.hud.score.setText(String(this.score));
    this.hud.lines.setText(`LINES  ${this.lines}`);
  }

  private _syncStatus() {
    if (this.phase === 'playing') {
      this.hud.title.setVisible(false); this.hud.detail.setVisible(false);
      this._syncPauseButton();
      return;
    }
    this.hud.title.setText(this.phase === 'paused' ? '已暂停 / PAUSED' : '游戏结束');
    this.hud.detail.setText(this.phase === 'paused'
      ? '按 P 继续'
      : `得分 ${this.score} · 新局再来`);
    this.hud.title.setVisible(true); this.hud.detail.setVisible(true);
    this._syncPauseButton();
  }

  private _togglePause() {
    if (this.phase === 'lost') return;
    this.phase = this.phase === 'paused' ? 'playing' : 'paused';
    this._syncStatus();
    this._saveState();
  }

  private _syncPauseButton() {
    this.hud.pause.setText(this.phase === 'paused' ? '继续' : '暂停');
    this.hud.pause.setDisabled(this.phase === 'lost');
  }

  private _tick(time: number, delta: number) {
    const dt = Math.min(50, Math.max(0, delta));
    if (this.phase !== 'paused') {
      this.effectTime += dt / 1000;
      this.fragments.update(dt);
    }
    this.surface.update(this.effectTime);
    this.chrome.update(this.effectTime);
    this.hud.animate(this.effectTime, this.phase === 'paused' ? 0 : dt);
    if (this.phase === 'playing') {
      this.dropAccumulator += delta;
      if (this.dropAccumulator >= DROP_MS) {
        this._softDrop();
        this._saveState();
      }
    }
    this.world.update(time, delta);
  }

  private _installVerification(): void {
    Object.defineProperty(window, '__tetris', { configurable: true, value: {
      snapshot: () => ({ phase: this.phase, score: this.score, lines: this.lines, board: this.board, current: this.current,
        fragments: this.fragments.activeCount, pool: this.fragments.poolSize, triangles: this.fragments.trianglesPerBlock,
        effectTime: this.effectTime, gpuErrors: this.gpuErrors, audio: this.audio.snapshot(), hud: this.hud.snapshot(),
        chrome: { boardMeshes: this.cellVisuals.length, buttons: this.hud.chromeSnapshot() } }),
      fixture: (rows = 1, drop = false) => {
        this._newGame(false); this.audio.stop();
        this.board = emptyBoard(this.config.rows, this.config.cols);
        const kinds: PieceKind[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        for (let r = this.config.rows - 5; r < this.config.rows; r++) for (let c = 0; c < this.config.cols; c++) {
          if ((r + c) % 3 !== 0) this.board[r]![c] = kinds[(r + c) % kinds.length]!;
        }
        for (let r = this.config.rows - rows; r < this.config.rows; r++) {
          this.board[r] = Array(this.config.cols).fill('T');
          if (drop) this.board[r]![4] = null;
        }
        if (drop) for (const row of this.board) row[4] = null;
        this.current = { kind: 'I', row: 3, col: drop ? 2 : 3, rotation: drop ? 1 : 0 };
        this.nextKind = 'T'; this.dropAccumulator = 0;
        this._syncBoardVisuals(); this._syncActiveVisuals(); this._syncNextPreview();
      },
      clear: () => { this._clearLines(); this._syncBoardVisuals(); },
      advance: (ms: number) => { this.fragments.update(ms); },
    } });
  }
}

export async function startTetris(canvas: HTMLCanvasElement): Promise<void> {
  const cfg = await fetch('./config.json')
    .then(r => r.json())
    .catch(() => ({ rows: 20, cols: 10 })) as Partial<Config>;

  const game = new TetrisGame({
    rows: cfg.rows ?? 20,
    cols: cfg.cols ?? 10,
  });
  await game.init(canvas);
}
