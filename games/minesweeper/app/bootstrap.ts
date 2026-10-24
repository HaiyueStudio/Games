import {MinesHud} from '../ui/MinesHud';
import { createMinesAudio } from '../../shared/minesweeper/audio/BrowserAudio';
import type { MinesAudio } from '../../shared/minesweeper/audio/MinesAudio';
import { gameTime } from '../../session/SessionPause';
import { GameEngine } from '../../session/GameEngine';
import { installGamepad } from '../../gamepad/runtime';
installGamepad('minesweeper');
import { HaiyueEngine } from '@haiyue/engine';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { CartesianTransform3D } from '@haiyue/engine';
import { SphericalTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { EnvironmentLight, OrbitControl } from '@haiyue/engine';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { mat4 } from 'wgpu-matrix';
import { requiredItemAt, requiredNumberAt } from '../../shared/collections/arrayAccess';
import { CameraViewProjectionCache } from '../../shared/rendering/CameraViewProjectionCache';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../../save/SingleSlotGameSave';
import { CellMaterials } from '../../shared/minesweeper/Theme';
import { BoardGesture, type BoardAction } from '../../shared/minesweeper/BoardGesture';
import { BoardScene, CELL_SIZE, TILE_TOP, REVEAL_DROP, type TileVisual } from '../rendering/BoardScene';
import { fitPerspectiveCamera } from '../../shared/rendering/fitPerspectiveCamera';
import { verifyMinesweeper } from '../verification/verifyMinesweeper';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CellState = 'hidden' | 'revealed' | 'flagged';

export interface Cell {
  row:       number;
  col:       number;
  isMine:    boolean;
  adjCount:  number;
  state:     CellState;

  visual: TileVisual;
}

type GamePhase = 'idle' | 'playing' | 'won' | 'lost';

export interface MinesweeperSaveData {
  rows: number;
  cols: number;
  totalMines: number;
  phase: GamePhase;
  elapsedSec: number;
  cells: Array<Array<{ isMine: boolean; adjCount: number; state: CellState }>>;
}

function isMinesweeperSaveData(value: unknown): value is MinesweeperSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.rows)
    && isNonNegativeInteger(value.cols)
    && isNonNegativeInteger(value.totalMines)
    && isNonNegativeInteger(value.elapsedSec)
    && (value.phase === 'idle' || value.phase === 'playing' || value.phase === 'won' || value.phase === 'lost')
    && Array.isArray(value.cells)
    && value.cells.length === value.rows
    && value.cells.every(row => Array.isArray(row) && row.length === value.cols && row.every(cell => (
      isRecord(cell)
      && typeof cell.isMine === 'boolean'
      && isNonNegativeInteger(cell.adjCount) && cell.adjCount <= 8
      && (cell.state === 'hidden' || cell.state === 'revealed' || cell.state === 'flagged')
    )));
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ORBIT_MIN_PHI = 0.18;
const ORBIT_MAX_PHI = Math.PI / 2.15;
const ORBIT_MIN_RADIUS = 5;
const ORBIT_MAX_RADIUS = 40;

function cellAt(cells: Cell[][], row: number, col: number): Cell {
  return requiredItemAt(requiredItemAt(cells, row, 'Minesweeper rows'), col, 'Minesweeper cells');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ray-box intersection (AABB in world space)
// ─────────────────────────────────────────────────────────────────────────────

function rayIntersectsAABB(
  ro: [number, number, number],
  rd: [number, number, number],
  min: [number, number, number],
  max: [number, number, number],
): number | null {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const direction = requiredNumberAt(rd, i, 'Minesweeper ray direction');
    const origin = requiredNumberAt(ro, i, 'Minesweeper ray origin');
    const minValue = requiredNumberAt(min, i, 'Minesweeper bounds minimum');
    const maxValue = requiredNumberAt(max, i, 'Minesweeper bounds maximum');
    if (Math.abs(direction) < 1e-8) {
      if (origin < minValue || origin > maxValue) return null;
    } else {
      const t1 = (minValue - origin) / direction;
      const t2 = (maxValue - origin) / direction;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  if (tmax < tmin || tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ray from screen pixel
// ─────────────────────────────────────────────────────────────────────────────

function screenToRay(
  px: number, py: number,
  W: number, H: number,
  invViewProj: Float32Array,
): { origin: [number, number, number]; dir: [number, number, number] } {
  const ndcX =  (px / W) * 2 - 1;
  const ndcY = -(py / H) * 2 + 1;

  const unproject = (z: number): [number, number, number] => {
    const v = [ndcX, ndcY, z, 1.0];
    const r = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) {
      r[row] = requiredNumberAt(invViewProj, row, 'Minesweeper inverse view projection') * requiredNumberAt(v, 0, 'Minesweeper clip point')
             + requiredNumberAt(invViewProj, 4 + row, 'Minesweeper inverse view projection') * requiredNumberAt(v, 1, 'Minesweeper clip point')
             + requiredNumberAt(invViewProj, 8 + row, 'Minesweeper inverse view projection') * requiredNumberAt(v, 2, 'Minesweeper clip point')
             + requiredNumberAt(invViewProj, 12 + row, 'Minesweeper inverse view projection') * requiredNumberAt(v, 3, 'Minesweeper clip point');
    }
    const w = requiredNumberAt(r, 3, 'Minesweeper unprojected point');
    return [requiredNumberAt(r, 0, 'Minesweeper unprojected point') / w, requiredNumberAt(r, 1, 'Minesweeper unprojected point') / w, requiredNumberAt(r, 2, 'Minesweeper unprojected point') / w];
  };

  const near = unproject(0);
  const far  = unproject(1);
  const dx = far[0] - near[0];
  const dy = far[1] - near[1];
  const dz = far[2] - near[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return {
    origin: near,
    dir:    [dx / len, dy / len, dz / len],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell label DOM management
// ─────────────────────────────────────────────────────────────────────────────

function project3DToScreen(
  wx: number, wy: number, wz: number,
  viewProj: Float32Array,
  W: number, H: number,
): { x: number; y: number; behind: boolean } {
  // clip = viewProj * [wx, wy, wz, 1]
  const cx = requiredNumberAt(viewProj, 0, 'Minesweeper view projection')*wx + requiredNumberAt(viewProj, 4, 'Minesweeper view projection')*wy + requiredNumberAt(viewProj, 8, 'Minesweeper view projection')*wz  + requiredNumberAt(viewProj, 12, 'Minesweeper view projection');
  const cy = requiredNumberAt(viewProj, 1, 'Minesweeper view projection')*wx + requiredNumberAt(viewProj, 5, 'Minesweeper view projection')*wy + requiredNumberAt(viewProj, 9, 'Minesweeper view projection')*wz  + requiredNumberAt(viewProj, 13, 'Minesweeper view projection');
  const cw = requiredNumberAt(viewProj, 3, 'Minesweeper view projection')*wx + requiredNumberAt(viewProj, 7, 'Minesweeper view projection')*wy + requiredNumberAt(viewProj, 11, 'Minesweeper view projection')*wz + requiredNumberAt(viewProj, 15, 'Minesweeper view projection');
  const ndcX =  cx / cw;
  const ndcY =  cy / cw;
  return {
    x: (ndcX + 1) / 2 * W,
    y: (1 - ndcY) / 2 * H,
    behind: cw < 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Game class
// ─────────────────────────────────────────────────────────────────────────────

class Minesweeper {
  private readonly saves = new SingleSlotGameSave<MinesweeperSaveData>({
    gameId: 'minesweeper',
    name: 'Minesweeper 自动存档',
    validateData: isMinesweeperSaveData,
  });
  private engine!: HaiyueEngine;
  private world!:  World;

  private cells: Cell[][] = [];
  private rows: number;
  private cols: number;
  private totalMines: number;

  private camEntity!: Entity;
  private cam3D!: Camera3D;
  private spherical!: SphericalTransform3D;

  private render3D!: Render3DSystem;

  // Engine GUI
  private hud!: MinesHud;
  private audio!: MinesAudio;

  private scene!: BoardScene;
  private materials!: CellMaterials;
  private orbit!: OrbitControl;
  private readonly gesture = new BoardGesture();
  private orbitWasEnabled = true;
  private readonly verifying = new URLSearchParams(location.search).has('verify');

  // Game state
  private phase: GamePhase = 'idle';
  private startTime = 0;
  private elapsedSec = 0;
  private flagCount = 0;
  private revealedCount = 0;
  private savedElapsedSec = -1;

  // Interaction
  private hoveredCell: Cell | null = null;

  // viewProj for picking & projection
  private viewProj: Float32Array = new Float32Array(16);
  private readonly cameraProjection = new CameraViewProjectionCache(this.viewProj);

  constructor(rows: number, cols: number, mines: number) {
    this.rows       = rows;
    this.cols       = cols;
    this.totalMines = mines;
  }

  async init(canvas: HTMLCanvasElement) {
    this.engine = new GameEngine({
      canvas,
      clearColor: { r: 0.035, g: 0.04, b: 0.055, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();

    this.world = new World('Minesweeper');

    this._setupCamera(canvas);
    this.audio = await createMinesAudio(this.world, canvas, 'minesweeper');
    this.hud = new MinesHud(this.engine, this.world, () => this._newGame(), this.rows, this.cols, this.audio);
    this.hud.guardOrbit(this.orbit, canvas);
    await this.hud.loadSkin();
    this.materials = await CellMaterials.load(this.engine);
    this.world.addRuntimeIntegration({ onDetach: () => this.materials.dispose() });
    this.scene = new BoardScene(this.world, this.materials, this.rows, this.cols);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Minesweeper.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));

    await this._loadOrCreateState();
    this._setupInput(canvas);

    this.engine.on('update', ({ detail: { time, delta } }) => {
      this._tick(time, delta);
    });

    this.engine.run();
    if (this.verifying) await this._verify(canvas);
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  private _setupCamera(canvas: HTMLCanvasElement) {
    const gridW = (this.cols - 1) * CELL_SIZE;
    const gridH = (this.rows - 1) * CELL_SIZE;
    const radius = Math.max(gridW, gridH) * 1.3 + 4;

    this.spherical = new SphericalTransform3D({
      radius,
      theta: -0.25,
      phi:   0.62,
      target: [gridW / 2, 0, gridH / 2],
    });

    this.cam3D = new Camera3D({
      type: 'perspective',
      fov:  Math.PI / 4,
      near: 0.1,
      far:  200,
    });

    this.camEntity = new Entity('Camera3D');
    this.camEntity.addComponent(this.cam3D);
    this.camEntity.addComponent(this.spherical);
    this.world.addEntity(this.camEntity);
    fitPerspectiveCamera(this.engine, this.world, this.cam3D, 1.1);
    this.orbit = new OrbitControl(canvas, this.spherical, { minRadius: ORBIT_MIN_RADIUS, maxRadius: ORBIT_MAX_RADIUS,
      minPhi: ORBIT_MIN_PHI, maxPhi: ORBIT_MAX_PHI, enablePan: false, rotateSpeed: .75 });

    this.render3D = new Render3DSystem(this.engine, this.camEntity, {
      priority: 0,
      loadOp: 'clear',
    });
    this.world.addSystem(this.render3D);


    // Lights
    const ambientE = new Entity('AmbientLight');
    ambientE.addComponent(new AmbientLight({ color: [.72, .82, 1], intensity: 0.32 }));
    this.world.addEntity(ambientE);

    const dirE = new Entity('DirLight');
    dirE.addComponent(new DirectionalLight({
      color: [1, 0.95, 0.88],
      intensity: 2.1,
      direction: [-0.5, -1, -0.4],
    }));
    this.world.addEntity(dirE);
    this.world.addEntity(new Entity('Cool fill').addComponent(new DirectionalLight({ color: [.48,.68,1], intensity: .7, direction: [.68,.24,.62] })));
    this.world.addEntity(new Entity('Environment').addComponent(new EnvironmentLight({ intensity: .55, diffuseColor: [.15,.23,.42], specularColor: [.72,.84,1] })));
  }

  // ── New game ──────────────────────────────────────────────────────────────

  private _newGame(save = true) {
    this.audio.reset();
    this._cancelGesture();
    this.phase = 'idle'; this.startTime = 0; this.elapsedSec = 0;
    this.flagCount = 0; this.revealedCount = 0; this.savedElapsedSec = -1;
    if (!this.cells.length) this._buildGrid();
    for (const row of this.cells) for (const cell of row) {
      cell.state = 'hidden'; cell.isMine = false; cell.adjCount = 0; this._syncCell(cell);
    }
    this.hud.clearMessage();
    this.hud.showMessage('Left: reveal   Right: flag   Left + Right: open neighbors   Drag: orbit', 4500);
    this._updateHUD();
    if (save) this._saveState();
  }

  private async _loadOrCreateState(): Promise<void> {
    const saved = this.verifying ? null : await this.saves.load();
    if (!saved || saved.rows !== this.rows || saved.cols !== this.cols || saved.totalMines !== this.totalMines) {
      this._newGame();
      return;
    }
    this._restoreState(saved);
  }

  private _restoreState(saved: MinesweeperSaveData): void {
    this._newGame(false);
    this.phase = saved.phase;
    this.elapsedSec = saved.elapsedSec;
    this.startTime = gameTime() - this.elapsedSec * 1000;
    this.flagCount = 0;
    this.revealedCount = 0;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const data = requiredItemAt(requiredItemAt(saved.cells, row, 'saved Minesweeper rows'), col, 'saved Minesweeper cells');
        const cell = cellAt(this.cells, row, col);
        cell.isMine = data.isMine;
        cell.adjCount = data.adjCount;
        cell.state = data.state;
        if (cell.state === 'flagged') this.flagCount++;
        if (cell.state === 'revealed' && !cell.isMine) this.revealedCount++;
        this._syncCell(cell);
      }
    }
    this.hud.showMessage('Saved game restored.', 2800);
    this._restoreStatusOverlay();
    this._updateHUD();
    this.savedElapsedSec = this.elapsedSec;
  }

  private _restoreStatusOverlay(): void {
    if (this.phase !== 'won' && this.phase !== 'lost') return;
    this.hud.showResult(this.phase === 'won', this.elapsedSec);
  }

  private _saveState(): void {
    if (this.verifying) return;
    this.saves.save(this._snapshotState());
    this.savedElapsedSec = this.elapsedSec;
  }

  private _snapshotState(): MinesweeperSaveData {
    return {
      rows: this.rows,
      cols: this.cols,
      totalMines: this.totalMines,
      phase: this.phase,
      elapsedSec: this.elapsedSec,
      cells: this.cells.map(row => row.map(cell => ({
        isMine: cell.isMine,
        adjCount: cell.adjCount,
        state: cell.state,
      }))),
    };
  }

  // ── Build grid ────────────────────────────────────────────────────────────

  private _buildGrid() {
    this.cells = Array.from({ length: this.rows }, (_, row) => Array.from({ length: this.cols }, (_, col) => ({
      row, col, isMine: false, adjCount: 0, state: 'hidden' as CellState, visual: this.scene.tile(row, col),
    })));
  }

  private _syncCell(cell: Cell): void {
    const surface = cell.state === 'revealed' ? cell.isMine ? 'mine' : 'revealed'
      : cell.state === 'flagged' ? this.phase === 'lost' && !cell.isMine ? 'wrong-flag' : 'flagged'
      : cell === this.hoveredCell ? 'hover' : 'hidden';
    this.scene.update(cell.visual, cell.row, cell.col, cell.state, cell.adjCount, surface);
  }

  // ── Mine placement (deferred to first click so first click is safe) ───────

  private _placeMines(safeR: number, safeC: number) {
    const positions: [number, number][] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // exclude 3×3 area around first click
        if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
        positions.push([r, c]);
      }
    }
    // Fisher-Yates shuffle, take first N
    let seed = 0xc1a551c;
    for (let i = positions.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = Math.floor((this.verifying ? seed / 4294967296 : Math.random()) * (i + 1));
      const current = requiredItemAt(positions, i, 'mine positions');
      positions[i] = requiredItemAt(positions, j, 'mine positions');
      positions[j] = current;
    }
    const count = Math.min(this.totalMines, positions.length);
    for (let i = 0; i < count; i++) {
      const [r, c] = requiredItemAt(positions, i, 'mine positions');
      cellAt(this.cells, r, c).isMine = true;
    }

    // Compute adjacency
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = cellAt(this.cells, r, c);
        if (cell.isMine) continue;
        let adj = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
              if (cellAt(this.cells, nr, nc).isMine) adj++;
            }
          }
        }
        cell.adjCount = adj;
      }
    }
  }

  // ── Cell world-space centre ───────────────────────────────────────────────

  private _cellWorldPos(cell: Cell): [number, number, number] {
    return [cell.col * CELL_SIZE, 0, cell.row * CELL_SIZE];
  }

  private _getNeighbors(cell: Cell): Cell[] {
    const neighbors: Cell[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = cell.row + dr, nc = cell.col + dc;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          neighbors.push(cellAt(this.cells, nr, nc));
        }
      }
    }
    return neighbors;
  }

  // ── Reveal ────────────────────────────────────────────────────────────────

  private _reveal(cell: Cell) {
    if (cell.state !== 'hidden') return;

    if (this.phase === 'idle') {
      this.phase = 'playing';
      this.startTime = gameTime();
      this._placeMines(cell.row, cell.col);
    }

    if (cell.isMine) {
      cell.state = 'revealed';
      this._showMine(cell);
      this._triggerLose(cell);
      return;
    }

    this._floodReveal(cell);
    this._checkWin();
  }

  private _quickReveal(cell: Cell) {
    if (cell.state !== 'revealed' || cell.isMine || cell.adjCount <= 0) return;

    const neighbors = this._getNeighbors(cell);
    const flaggedCount = neighbors.filter(nb => nb.state === 'flagged').length;
    if (flaggedCount !== cell.adjCount) return;

    for (const nb of neighbors) {
      if (this.phase === 'won' || this.phase === 'lost') return;
      if (nb.state === 'hidden') {
        this._reveal(nb);
      }
    }
  }

  private _floodReveal(start: Cell) {
    const queue: Cell[] = [start];
    const visited = new Set<Cell>();

    while (queue.length > 0) {
      const cell = queue.shift()!;
      if (visited.has(cell)) continue;
      visited.add(cell);

      if (cell.state !== 'hidden') continue;
      cell.state = 'revealed';
      this.revealedCount++;

      this._syncCell(cell);

      if (cell.adjCount === 0) {
        // Flood neighbours
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = cell.row + dr, nc = cell.col + dc;
            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
              const nb = cellAt(this.cells, nr, nc);
              if (!visited.has(nb) && nb.state === 'hidden' && !nb.isMine) {
                queue.push(nb);
              }
            }
          }
        }
      }
    }
  }

  // ── Flag ──────────────────────────────────────────────────────────────────

  private _toggleFlag(cell: Cell) {
    if (cell.state === 'revealed') return;
    if (cell.state === 'flagged') { cell.state = 'hidden'; this.flagCount--; }
    else { cell.state = 'flagged'; this.flagCount++; }
    this._syncCell(cell); this._updateHUD();
  }

  private _showMine(cell: Cell) { this._syncCell(cell); }

  // ── Reveal all mines on loss ──────────────────────────────────────────────

  private _triggerLose(triggered: Cell) {
    this.phase = 'lost';

    for (const row of this.cells) {
      for (const cell of row) {
        if (cell.isMine && cell !== triggered && cell.state !== 'flagged') {
          cell.state = 'revealed';
          this._showMine(cell);
        }
        // Remove flags that were wrong
        if (cell.state === 'flagged') this._syncCell(cell);
      }
    }

    this.hud.showResult(false, this.elapsedSec);
  }

  private _checkWin() {
    const safeCells = this.rows * this.cols - this.totalMines;
    if (this.revealedCount >= safeCells) {
      this.phase = 'won';
      this.hud.showResult(true, this.elapsedSec);
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private _updateHUD() {
    this.hud.mines.setText(String(this.totalMines - this.flagCount));
    this.hud.timer.setText(String(this.elapsedSec));
    this.hud.elFlags.setText(String(this.flagCount));
    this.hud.elOpen.setText(String(this.revealedCount));
  }

  private _clearHover(): void {
    if (this.hoveredCell?.state === 'hidden') this.scene.update(this.hoveredCell.visual, this.hoveredCell.row, this.hoveredCell.col, this.hoveredCell.state, this.hoveredCell.adjCount, 'hidden');
    this.hoveredCell = null;
  }

  private _cancelGesture(): void {
    if (this.gesture.active) this.orbit.enableRotate = this.orbitWasEnabled;
    this.gesture.cancel();
    this._clearHover();
  }

  private _applyPointerAction(action: BoardAction | null): void {
    if (!action || this.phase === 'lost' || this.phase === 'won') return;
    const cell = cellAt(this.cells, Math.floor(action.cellId / this.cols), action.cellId % this.cols);
    const beforeState = cell.state, beforeOpened = this.revealedCount;
    if (action.kind === 'chord' || action.kind === 'flag' && cell.state === 'revealed') this._quickReveal(cell);
    else if (action.kind === 'flag') this._toggleFlag(cell);
    else this._reveal(cell);
    if ((this.phase as string) === 'lost') this.audio.explosion();
    else if (action.kind === 'flag' && beforeState !== 'revealed' && cell.state !== beforeState) this.audio.flag(cell.state === 'flagged');
    else if (this.revealedCount > beforeOpened) this.audio.click();
    this._updateHUD();
    this._saveState();
  }

  private _setupInput(canvas: HTMLCanvasElement): void {
    const abort = new AbortController();
    const options = { signal: abort.signal, capture: true };
    this.world.addRuntimeIntegration({ onDetach: () => { this._cancelGesture(); abort.abort(); } });
    const release = (event: MouseEvent) => {
      if (!this.gesture.active) return;
      const action = this.gesture.release(event.clientX, event.clientY, event.buttons,
        this._cellId(this._pickCell(event.clientX, event.clientY, canvas)));
      if (!this.gesture.active) this.orbit.enableRotate = this.orbitWasEnabled;
      this._applyPointerAction(action);
    };
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    canvas.addEventListener('pointerdown', event => {
      if (this.hud.hit(event.clientX, event.clientY, canvas)) return;
      if (!this.gesture.active) this.orbitWasEnabled = this.orbit.enableRotate;
      this._clearHover();
      this.gesture.begin(event.clientX, event.clientY, event.button, event.buttons, event.pointerId,
        this._cellId(this._pickCell(event.clientX, event.clientY, canvas)));
      if (this.gesture.active) this.orbit.enableRotate = false;
    }, options);
    canvas.addEventListener('mousedown', event => {
      this.gesture.move(event.clientX, event.clientY, event.buttons);
      if (this.gesture.chording) this.orbit.enableRotate = false;
    }, options);
    canvas.addEventListener('pointerup', release, options);
    // Mouse events fire for the second button and first release of a chord, unlike pointer events.
    canvas.addEventListener('mouseup', release, options);
    canvas.addEventListener('pointermove', event => {
      if (this.gesture.active) {
        this.gesture.move(event.clientX, event.clientY, event.buttons);
        this.orbit.enableRotate = this.orbitWasEnabled && this.gesture.dragging && !this.gesture.chording;
        this._clearHover();
        return;
      }
      if (event.buttons !== 0 || this.phase === 'lost' || this.phase === 'won') return;
      const cell = this._pickCell(event.clientX, event.clientY, canvas);
      if (cell === this.hoveredCell) return;
      this._clearHover();
      if (cell?.state === 'hidden') this.scene.update(cell.visual, cell.row, cell.col, cell.state, cell.adjCount, 'hover');
      this.hoveredCell = cell;
    }, options);
    canvas.addEventListener('pointerleave', () => this._clearHover(), options);
    canvas.addEventListener('pointercancel', () => this._cancelGesture(), options);
    window.addEventListener('blur', () => this._cancelGesture(), options);
    document.addEventListener('keydown', event => {
      if (event.key === 'r' || event.key === 'R') { this.audio.button(); this._newGame(); }
    }, options);
  }

  private _cellId(cell: Cell | null): number | null { return cell ? cell.row * this.cols + cell.col : null; }

  private _pickCell(clientX: number, clientY: number, canvas: HTMLCanvasElement): Cell | null {
    if (this.hud.hit(clientX, clientY, canvas)) return null;
    this._updateViewProjection();
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.engine.displayWidth / rect.width);
    const py = (clientY - rect.top)  * (this.engine.displayHeight / rect.height);

    const invVP = mat4.inverse(this.viewProj) as Float32Array;
    const { origin, dir } = screenToRay(px, py, this.engine.displayWidth, this.engine.displayHeight, invVP);

    let best: Cell | null = null;
    let bestT = Infinity;

    for (const row of this.cells) {
      for (const cell of row) {
        const cx = cell.col * CELL_SIZE;
        const cz = cell.row * CELL_SIZE;
        const drop = cell.state === 'revealed' ? REVEAL_DROP : 0;
        const t = rayIntersectsAABB(
          origin, dir,
          [cx - 0.5, -0.14 + drop, cz - 0.5],
          [cx + 0.5, TILE_TOP + drop, cz + 0.5],
        );
        if (t !== null && t < bestT) { bestT = t; best = cell; }
      }
    }
    return best;
  }

  private _updateViewProjection(): void {
    this.cameraProjection.update(this.spherical, this.cam3D, this.engine.displayWidth, this.engine.displayHeight);
  }

  private async _verify(canvas: HTMLCanvasElement): Promise<void> {
    const result = await verifyMinesweeper({
      canvas, cells: this.cells, materials: this.materials, hud: this.hud, audio: this.audio,
      reset: () => this._newGame(false), snapshot: () => this._snapshotState(), restore: state => this._restoreState(state),
      pick: (x,y) => this._cellId(this._pickCell(x,y,canvas)),
      project: cell => {
        this._updateViewProjection();
        const [x,,z] = this._cellWorldPos(cell);
        const projected = project3DToScreen(x,TILE_TOP+(cell.state==='revealed'?REVEAL_DROP:0),z,this.viewProj,this.engine.displayWidth,this.engine.displayHeight);
        const rect=canvas.getBoundingClientRect();
        return {x:rect.left+projected.x*rect.width/this.engine.displayWidth,y:rect.top+projected.y*rect.height/this.engine.displayHeight};
      },
      orbit: () => { this.spherical.theta+=.3; },
    });
    const output=document.getElementById('result')!;output.textContent=JSON.stringify(result);output.dataset.status='passed';
  }

  // ── Main tick ─────────────────────────────────────────────────────────────

  private _tick(time: number, delta: number) {
    if (this.phase === 'playing' && !this.verifying) {
      this.elapsedSec = Math.floor((time - this.startTime) / 1000);
      this.hud.timer.setText(String(this.elapsedSec));
      if (this.elapsedSec !== this.savedElapsedSec) this._saveState();
    }

    // Build viewProj from camera for picking & label projection
    this.cameraProjection.update(this.spherical, this.cam3D, this.engine.displayWidth, this.engine.displayHeight);

    this.hud.update(delta);
    this.audio.update(delta / 1000);

    this.world.update(time, delta);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // Load config at runtime so edits to config.json take effect on page reload
  const cfg = await fetch('./config.json').then(r => r.json()) as {
    rows: number; cols: number; mines: number;
  };

  const game = new Minesweeper(cfg.rows, cfg.cols, cfg.mines);
  await game.init(canvas);
}

main().catch(error => { console.error(error); const output=document.getElementById('result'); if(output){output.textContent=JSON.stringify({status:'failed',error:String(error)});output.dataset.status='failed';} });
