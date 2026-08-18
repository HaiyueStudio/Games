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
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import { ColorSRGB } from '@haiyue/engine';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { createBox3D } from '@haiyue/engine';
import { createSphere3D } from '@haiyue/engine';
import { createCone3D } from '@haiyue/engine/geometry';
import { Camera2D } from '@haiyue/engine';
import { Transform2D } from '@haiyue/engine';
import { Mesh2D } from '@haiyue/engine';
import { Mesh2DRenderSystem } from '@haiyue/engine/systems';
import { Material2D } from '@haiyue/engine';
import { createRect2D } from '@haiyue/engine/geometry';
import { mat4 } from 'wgpu-matrix';
import { requiredItemAt, requiredNumberAt } from '../arrayAccess';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CellState = 'hidden' | 'revealed' | 'flagged';

interface Cell {
  row:       number;
  col:       number;
  isMine:    boolean;
  adjCount:  number;
  state:     CellState;

  // 3D scene entities
  cubeEntity:  Entity;
  cubeMat:     BasicMaterial;
  flagEntity:  Entity | null;
  mineEntity:  Entity | null;
}

type GamePhase = 'idle' | 'playing' | 'won' | 'lost';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CANVAS_W = 900;
const CANVAS_H = 600;
const CELL_SIZE = 1.1;   // spacing between cell centres
const ORBIT_ROTATE_SPEED = 0.006;
const ORBIT_ZOOM_SPEED = 0.0015;
const ORBIT_MIN_PHI = 0.18;
const ORBIT_MAX_PHI = Math.PI / 2.15;
const ORBIT_MIN_RADIUS = 5;
const ORBIT_MAX_RADIUS = 40;

// Number colours (classic minesweeper palette)
const NUM_COLORS = [
  '',
  '#2255ff', // 1
  '#007b00', // 2
  '#ff2200', // 3
  '#00007b', // 4
  '#7b0000', // 5
  '#007b7b', // 6
  '#000000', // 7
  '#7b7b7b', // 8
];

// ─────────────────────────────────────────────────────────────────────────────
// Geometry singletons (shared across all cells)
// ─────────────────────────────────────────────────────────────────────────────

const geoBox    = createBox3D({ width: 1, height: 0.35, depth: 1 });
const geoSphere = createSphere3D({ radius: 0.28, widthSegments: 16, heightSegments: 12 });
const geoCone   = createCone3D({ radius: 0.14, height: 0.45, radialSegments: 12 });

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

const C = (r: number, g: number, b: number, a = 1) => new ColorSRGB(r, g, b, a);

const MAT_HIDDEN   = C(0.38, 0.50, 0.72);
const MAT_REVEALED = C(0.82, 0.84, 0.90);
const MAT_HOVER    = C(0.55, 0.68, 0.90);

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
  private renderBP!: BlinnPhongRenderSystem;

  // HUD 2D
  private cam2DEntity!: Entity;
  private hudBgEntity!: Entity;
  private render2D!: Mesh2DRenderSystem;

  // DOM
  private elMinesCount!: HTMLElement;
  private elTimer!:      HTMLElement;
  private elCellLabels!: HTMLElement;
  private elStatus!:     HTMLElement;
  private elStatusText!: HTMLElement;
  private elStatusSub!:  HTMLElement;

  // Label elements pool
  private labelEls: Map<string, HTMLElement> = new Map();

  // Game state
  private phase: GamePhase = 'idle';
  private startTime = 0;
  private elapsedSec = 0;
  private flagCount = 0;
  private revealedCount = 0;

  // Interaction
  private hoveredCell: Cell | null = null;
  private isOrbiting = false;
  private orbitLastX = 0;
  private orbitLastY = 0;

  // viewProj for picking & projection
  private viewProj: Float32Array = new Float32Array(16);

  constructor(rows: number, cols: number, mines: number) {
    this.rows       = rows;
    this.cols       = cols;
    this.totalMines = mines;
  }

  async init(canvas: HTMLCanvasElement) {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.06, g: 0.07, b: 0.13, a: 1 },
    });
    await this.engine.init();

    this.world = new World('Minesweeper');

    this._setupCamera();
    this._setupHUD();
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Minesweeper.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this._setupDOM();
    this._newGame();
    this._setupInput(canvas);

    this.engine.on('update', ({ detail: { time, delta } }) => {
      this._tick(time, delta);
    });

    this.engine.run();
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  private _setupCamera() {
    const gridW = (this.cols - 1) * CELL_SIZE;
    const gridH = (this.rows - 1) * CELL_SIZE;
    const radius = Math.max(gridW, gridH) * 0.95 + 4;

    this.spherical = new SphericalTransform3D({
      radius,
      theta: 0,
      phi:   Math.PI / 4.5,
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

    this.render3D = new Render3DSystem(this.engine, this.camEntity, {
      priority: 0,
      loadOp: 'clear',
    });
    this.world.addSystem(this.render3D);

    this.renderBP = new BlinnPhongRenderSystem(this.engine, this.camEntity, {
      priority: -1,
      render3DSystem: this.render3D,
    });
    this.world.addSystem(this.renderBP);

    // Lights
    const ambientE = new Entity('AmbientLight');
    ambientE.addComponent(new AmbientLight({ color: [1, 1, 1], intensity: 0.18 }));
    this.world.addEntity(ambientE);

    const dirE = new Entity('DirLight');
    dirE.addComponent(new DirectionalLight({
      color: [1, 0.95, 0.88],
      intensity: 1.1,
      direction: [-0.5, -1, -0.4],
    }));
    this.world.addEntity(dirE);
  }

  // ── 2D HUD ────────────────────────────────────────────────────────────────

  private _setupHUD() {
    this.cam2DEntity = new Entity('Camera2D');
    this.cam2DEntity.addComponent(new Camera2D());
    this.world.addEntity(this.cam2DEntity);

    // Dark strip behind the HUD text
    const hudBg = new Entity('HudBg');
    hudBg.addComponent(new Mesh2D(
      createRect2D({ width: CANVAS_W, height: 46 }),
      new Material2D({ color: new ColorSRGB(0, 0, 0, 0.55), blending: 'normal' }),
    ));
    hudBg.addComponent(new Transform2D({ x: 0, y: CANVAS_H / 2 - 23 }));
    this.world.addEntity(hudBg);
    this.hudBgEntity = hudBg;

    this.render2D = new Mesh2DRenderSystem(this.engine, this.cam2DEntity, {
      priority: 2,
      loadOp: 'load',
    });
    this.world.addSystem(this.render2D);
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────

  private _setupDOM() {
    this.elMinesCount = document.getElementById('mines-count')!;
    this.elTimer      = document.getElementById('timer-count')!;
    this.elCellLabels = document.getElementById('cell-labels')!;
    this.elStatus     = document.getElementById('status-overlay')!;
    this.elStatusText = document.getElementById('status-text')!;
    this.elStatusSub  = document.getElementById('status-sub')!;

    document.getElementById('btn-new')!.addEventListener('click', () => this._newGame());
  }

  // ── New game ──────────────────────────────────────────────────────────────

  private _newGame() {
    // Remove old entities
    for (const row of this.cells) {
      for (const cell of row) {
        this.world.removeEntity(cell.cubeEntity);
        if (cell.flagEntity) this.world.removeEntity(cell.flagEntity);
        if (cell.mineEntity) this.world.removeEntity(cell.mineEntity);
      }
    }
    // Clear labels
    this.labelEls.forEach(el => el.remove());
    this.labelEls.clear();

    this.cells        = [];
    this.phase        = 'idle';
    this.startTime    = 0;
    this.elapsedSec   = 0;
    this.flagCount    = 0;
    this.revealedCount= 0;
    this.hoveredCell  = null;

    this.elStatus.classList.remove('visible');
    this._updateHUD();
    this._buildGrid();
  }

  // ── Build grid ────────────────────────────────────────────────────────────

  private _buildGrid() {
    const offX = 0;
    const offZ = 0;

    for (let r = 0; r < this.rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const wx = offX + c * CELL_SIZE;
        const wz = offZ + r * CELL_SIZE;

        const mat = new BasicMaterial({ color: MAT_HIDDEN.clone() });
        const cube = new Entity(`cell_${r}_${c}`);
        const t = new CartesianTransform3D({ position: [wx, 0, wz] });
        cube.addComponent(t);
        cube.addComponent(new Mesh3D(geoBox, mat));
        this.world.addEntity(cube);

        requiredItemAt(this.cells, r, 'Minesweeper rows')[c] = {
          row: r, col: c,
          isMine: false,
          adjCount: 0,
          state: 'hidden',
          cubeEntity: cube,
          cubeMat: mat,
          flagEntity: null,
          mineEntity: null,
        };
      }
    }
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
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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
      this.startTime = performance.now();
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

      // Update cube colour
      cell.cubeMat.color.setFromSRGB(MAT_REVEALED.r, MAT_REVEALED.g, MAT_REVEALED.b, 1);
      // Sink the tile slightly
      const t = cell.cubeEntity.getComponent(CartesianTransform3D)!;
      t.setPosition(cell.col * CELL_SIZE, -0.15, cell.row * CELL_SIZE);

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

    if (cell.state === 'flagged') {
      // Remove flag
      if (cell.flagEntity) {
        this.world.removeEntity(cell.flagEntity);
        cell.flagEntity = null;
      }
      cell.state = 'hidden';
      this.flagCount--;
    } else {
      // Place flag (cone on top of cube)
      const [wx, , wz] = this._cellWorldPos(cell);
      const flagE = new Entity(`flag_${cell.row}_${cell.col}`);
      const ft = new CartesianTransform3D({ position: [wx, 0.55, wz] });
      flagE.addComponent(ft);
      flagE.addComponent(new Mesh3D(geoCone, new BlinnPhongMaterial({
        ambient:   [0.15, 0.10, 0.01],
        diffuse:   [1.00, 0.75, 0.10],
        specular:  [1.00, 0.90, 0.50],
        shininess: 128,
      })));
      this.world.addEntity(flagE);
      cell.flagEntity = flagE;
      cell.state = 'flagged';
      this.flagCount++;
    }

    this._updateHUD();
  }

  // ── Mine visual ───────────────────────────────────────────────────────────

  private _showMine(cell: Cell) {
    const [wx, , wz] = this._cellWorldPos(cell);
    // Red cube
    cell.cubeMat.color.setFromSRGB(0.9, 0.15, 0.15, 1);
    // Sphere floating above
    const mineE = new Entity(`mine_${cell.row}_${cell.col}`);
    const mt = new CartesianTransform3D({ position: [wx, 0.45, wz] });
    mineE.addComponent(mt);
    mineE.addComponent(new Mesh3D(geoSphere, new BlinnPhongMaterial({
      ambient:   [0.15, 0.01, 0.01],
      diffuse:   [1.00, 0.12, 0.12],
      specular:  [1.00, 0.50, 0.50],
      shininess: 64,
    })));
    this.world.addEntity(mineE);
    cell.mineEntity = mineE;
  }

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
        if (cell.flagEntity && !cell.isMine) {
          cell.cubeMat.color.setFromSRGB(0.7, 0.2, 0.2, 1);
        }
      }
    }

    this.elStatusText.textContent = '💥  BOOM';
    this.elStatusText.className = 'lost';
    this.elStatusSub.textContent = `Time: ${this.elapsedSec}s  ·  R to restart`;
    this.elStatus.classList.add('visible');
  }

  private _checkWin() {
    const safeCells = this.rows * this.cols - this.totalMines;
    if (this.revealedCount >= safeCells) {
      this.phase = 'won';
      this.elStatusText.textContent = '✓  CLEARED';
      this.elStatusText.className = 'won';
      this.elStatusSub.textContent = `Time: ${this.elapsedSec}s  ·  R to restart`;
      this.elStatus.classList.add('visible');
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private _updateHUD() {
    this.elMinesCount.textContent = String(this.totalMines - this.flagCount);
    this.elTimer.textContent      = String(this.elapsedSec);
  }

  // ── Cell number labels (DOM projection) ──────────────────────────────────

  private _updateLabels() {
    for (const row of this.cells) {
      for (const cell of row) {
        const key = `${cell.row}_${cell.col}`;
        if (cell.state === 'revealed' && !cell.isMine && cell.adjCount > 0) {
          let el = this.labelEls.get(key);
          if (!el) {
            el = document.createElement('div');
            el.className = 'cell-num';
            el.textContent = String(cell.adjCount);
            el.style.color = NUM_COLORS[cell.adjCount] ?? '#fff';
            this.elCellLabels.appendChild(el);
            this.labelEls.set(key, el);
          }
          // Project world pos to screen
          const [wx, wy, wz] = this._cellWorldPos(cell);
          const sc = project3DToScreen(wx, wy + 0.30, wz, this.viewProj, CANVAS_W, CANVAS_H);
          if (sc.behind) {
            el.style.display = 'none';
          } else {
            el.style.display  = 'block';
            el.style.left     = `${sc.x}px`;
            el.style.top      = `${sc.y}px`;
          }
        }
      }
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private _setupInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
      const cell = this._pickCell(e.clientX, e.clientY, canvas);
      if (!cell) {
        this._clearHover();
        this.isOrbiting = true;
        this.orbitLastX = e.clientX;
        this.orbitLastY = e.clientY;
        e.preventDefault();
        return;
      }

      if (this.phase === 'won' || this.phase === 'lost') return;

      if (e.button === 2) {
        if (cell.state === 'revealed') {
          this._quickReveal(cell);
        } else {
          this._toggleFlag(cell);
        }
      } else if (e.button === 0) {
        if (cell.state === 'hidden') this._reveal(cell);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.isOrbiting) {
        const dx = e.clientX - this.orbitLastX;
        const dy = e.clientY - this.orbitLastY;
        this.orbitLastX = e.clientX;
        this.orbitLastY = e.clientY;
        this._orbitCamera(dx, dy);
        return;
      }

      if (this.phase === 'won' || this.phase === 'lost') return;
      const cell = this._pickCell(e.clientX, e.clientY, canvas);

      if (this.hoveredCell && this.hoveredCell !== cell) {
        const hc = this.hoveredCell;
        if (hc.state === 'hidden') {
          hc.cubeMat.color.setFromSRGB(MAT_HIDDEN.r, MAT_HIDDEN.g, MAT_HIDDEN.b, 1);
        }
      }

      if (cell && cell.state === 'hidden') {
        cell.cubeMat.color.setFromSRGB(MAT_HOVER.r, MAT_HOVER.g, MAT_HOVER.b, 1);
      }

      this.hoveredCell = cell;
    });

    canvas.addEventListener('wheel', (e) => {
      const cell = this._pickCell(e.clientX, e.clientY, canvas);
      if (cell) return;

      this._zoomCamera(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('mouseleave', () => {
      this._clearHover();
    });

    window.addEventListener('mouseup', () => {
      this.isOrbiting = false;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') this._newGame();
    });
  }

  private _clearHover() {
    if (this.hoveredCell?.state === 'hidden') {
      this.hoveredCell.cubeMat.color.setFromSRGB(MAT_HIDDEN.r, MAT_HIDDEN.g, MAT_HIDDEN.b, 1);
    }
    this.hoveredCell = null;
  }

  private _orbitCamera(dx: number, dy: number) {
    const nextTheta = this.spherical.theta - dx * ORBIT_ROTATE_SPEED;
    const nextPhi = Math.max(
      ORBIT_MIN_PHI,
      Math.min(ORBIT_MAX_PHI, this.spherical.phi + dy * ORBIT_ROTATE_SPEED),
    );
    this.spherical.set(this.spherical.radius, nextTheta, nextPhi);
  }

  private _zoomCamera(deltaY: number) {
    const zoom = 1 + deltaY * ORBIT_ZOOM_SPEED;
    const nextRadius = Math.max(
      ORBIT_MIN_RADIUS,
      Math.min(ORBIT_MAX_RADIUS, this.spherical.radius * zoom),
    );
    this.spherical.radius = nextRadius;
  }

  private _pickCell(clientX: number, clientY: number, canvas: HTMLCanvasElement): Cell | null {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (CANVAS_W / rect.width);
    const py = (clientY - rect.top)  * (CANVAS_H / rect.height);

    const invVP = mat4.inverse(this.viewProj) as Float32Array;
    const { origin, dir } = screenToRay(px, py, CANVAS_W, CANVAS_H, invVP);

    let best: Cell | null = null;
    let bestT = Infinity;

    for (const row of this.cells) {
      for (const cell of row) {
        const cx = cell.col * CELL_SIZE;
        const cz = cell.row * CELL_SIZE;
        const t = rayIntersectsAABB(
          origin, dir,
          [cx - 0.5, -0.35, cz - 0.5],
          [cx + 0.5,  0.35, cz + 0.5],
        );
        if (t !== null && t < bestT) { bestT = t; best = cell; }
      }
    }
    return best;
  }

  // ── Main tick ─────────────────────────────────────────────────────────────

  private _tick(time: number, delta: number) {
    if (this.phase === 'playing') {
      this.elapsedSec = Math.floor((time - this.startTime) / 1000);
      this.elTimer.textContent = String(this.elapsedSec);
    }

    // Build viewProj from camera for picking & label projection
    const cam3D = this.camEntity.getComponent(Camera3D)!;
    const camT  = this.camEntity.getComponent(SphericalTransform3D)!;
    camT.updateWorldMatrix();
    const view = mat4.inverse(camT.worldMatrix) as Float32Array;
    cam3D.updateAspect(CANVAS_W / CANVAS_H);
    mat4.multiply(cam3D.projectionMatrix, view, this.viewProj);

    this._updateLabels();

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

main();
