import { HaiyueEngine } from '@haiyue/engine';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { SphericalTransform3D } from '@haiyue/engine';
import { CartesianTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { Render3DSystem } from '@haiyue/engine/systems';
import { PbrMaterial } from '@haiyue/engine';
import { ColorSRGB } from '@haiyue/engine';
import { Geometry3D } from '@haiyue/engine';
import { OrbitControl } from '@haiyue/engine';
import { Ray } from '@haiyue/engine/math';
import { createIcosahedron3D } from '@haiyue/engine/geometry';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { EnvironmentLight } from '@haiyue/engine';
import { mat4 } from 'wgpu-matrix';
import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

type CellState = 'hidden' | 'revealed' | 'flagged';
type GamePhase = 'playing' | 'won' | 'lost';

interface Cell {
  id: number;
  geometry: Geometry3D;
  mesh: Mesh3D | null;
  surface: CellSurface;
  center: [number, number, number];
  normal: [number, number, number];
  neighbors: number[];
  state: CellState;
  mine: boolean;
  count: number;
  label: HTMLDivElement;
}

interface PointerStart {
  x: number;
  y: number;
  button: number;
}

interface IcosahedronMinesweeperSaveData {
  phase: GamePhase;
  opened: number;
  flags: number;
  cells: Array<{ mine: boolean; count: number; state: CellState }>;
}

function isIcosahedronSaveData(value: unknown): value is IcosahedronMinesweeperSaveData {
  return isRecord(value)
    && (value.phase === 'playing' || value.phase === 'won' || value.phase === 'lost')
    && isNonNegativeInteger(value.opened)
    && isNonNegativeInteger(value.flags)
    && Array.isArray(value.cells)
    && value.cells.every(cell => isRecord(cell)
      && typeof cell.mine === 'boolean'
      && isNonNegativeInteger(cell.count)
      && (cell.state === 'hidden' || cell.state === 'revealed' || cell.state === 'flagged'));
}

const RADIUS = 2.0;
const DETAIL = 2;
const MINE_COUNT = 42;
const PICK_DRAG_THRESHOLD = 6;
const IDENTITY = mat4.identity() as Float32Array;

const COLORS = {
  hidden: new ColorSRGB(0.16, 0.34, 0.62, 1),
  hover: new ColorSRGB(0.25, 0.50, 0.82, 1),
  revealed: new ColorSRGB(0.74, 0.78, 0.84, 1),
  flagged: new ColorSRGB(0.62, 0.24, 0.28, 1),
  mine: new ColorSRGB(0.92, 0.18, 0.16, 1),
  wrongFlag: new ColorSRGB(0.50, 0.48, 0.52, 1),
};

type CellSurface = 'hidden' | 'hover' | 'revealed' | 'flagged' | 'mine' | 'wrong-flag';
type CellMaterialPalette = Record<CellSurface, PbrMaterial>;

function createCellMaterialPalette(): CellMaterialPalette {
  const material = (
    baseColor: ColorSRGB,
    metallic: number,
    roughness: number,
    clearcoatFactor: number,
    clearcoatRoughnessFactor: number,
    emissiveFactor: readonly [number, number, number] = [0, 0, 0],
  ): PbrMaterial => new PbrMaterial({
    baseColor,
    metallic,
    roughness,
    clearcoatFactor,
    clearcoatRoughnessFactor,
    emissiveFactor,
    doubleSided: true,
  });
  return {
    hidden: material(COLORS.hidden, 0.14, 0.42, 0.28, 0.24),
    hover: material(COLORS.hover, 0.16, 0.25, 0.48, 0.16),
    revealed: material(COLORS.revealed, 0.04, 0.7, 0.08, 0.5),
    flagged: material(COLORS.flagged, 0.1, 0.46, 0.2, 0.3),
    mine: material(COLORS.mine, 0.12, 0.3, 0.34, 0.18, [0.08, 0.005, 0.002]),
    'wrong-flag': material(COLORS.wrongFlag, 0.02, 0.8, 0.04, 0.7),
  };
}

type CellLabelKind = 'none' | 'number' | 'flag' | 'mine' | 'wrong-flag';

function setCellLabel(cell: Cell, text: string, kind: CellLabelKind): void {
  const { label } = cell;
  label.textContent = text;
  label.className = kind === 'none' ? 'label' : `label ${kind}`;
  // Old number colors were inline styles. Always clear them so a recycled
  // label cannot override the deterministic state/number CSS selectors.
  label.style.removeProperty('color');
  if (kind === 'number') label.dataset.number = text;
  else delete label.dataset.number;
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function polygonGeometry(
  center: [number, number, number],
  boundary: Array<[number, number, number]>,
  normal: [number, number, number],
): Geometry3D {
  const inset = 0.985;
  const lift = 0.012;
  const vertices = [center, ...boundary].map(v => {
    const p = normalize(v[0], v[1], v[2]);
    return [
      p[0] * RADIUS * inset + normal[0] * lift,
      p[1] * RADIUS * inset + normal[1] * lift,
      p[2] * RADIUS * inset + normal[2] * lift,
    ];
  });
  const indices: number[] = [];
  for (let i = 1; i <= boundary.length; i++) {
    indices.push(0, i, i === boundary.length ? 1 : i + 1);
  }
  return new Geometry3D({
    positions: new Float32Array(vertices.flat()),
    normals: new Float32Array(vertices.flatMap(() => normal)),
    textureCoordinates: [{ set: 0, data: new Float32Array(vertices.flatMap((_, i) => {
      if (i === 0) return [0.5, 0.5];
      const angle = ((i - 1) / boundary.length) * Math.PI * 2;
      return [0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5];
    })) }],
    indices: new Uint16Array(indices),
    cullMode: 'none',
  });
}

function buildCells(labelRoot: HTMLElement): Cell[] {
  const source = createIcosahedron3D({ radius: RADIUS, detail: DETAIL });
  const positions = source.positions;
  const indices = source.indices!;
  const cells: Cell[] = [];
  const vertexCount = positions.length / 3;
  const vertexToFaces = new Map<number, number[]>();
  const vertexNeighbors = Array.from({ length: vertexCount }, () => new Set<number>());
  const faceCenters: Array<[number, number, number]> = [];

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const vertexIds: [number, number, number] = [
      requiredNumberAt(indices, i, 'icosahedron indices'),
      requiredNumberAt(indices, i + 1, 'icosahedron indices'),
      requiredNumberAt(indices, i + 2, 'icosahedron indices'),
    ];
    const faceId = faceCenters.length;
    const points = vertexIds.map(index => [
      requiredNumberAt(positions, index * 3, 'icosahedron positions'),
      requiredNumberAt(positions, index * 3 + 1, 'icosahedron positions'),
      requiredNumberAt(positions, index * 3 + 2, 'icosahedron positions'),
    ] as [number, number, number]);
    const a = requiredItemAt(points, 0, 'icosahedron face points');
    const b = requiredItemAt(points, 1, 'icosahedron face points');
    const c = requiredItemAt(points, 2, 'icosahedron face points');
    faceCenters.push(normalize((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3));

    for (const [a, b] of [[vertexIds[0], vertexIds[1]], [vertexIds[1], vertexIds[2]], [vertexIds[2], vertexIds[0]]] as Array<[number, number]>) {
      requiredItemAt(vertexNeighbors, a, 'icosahedron vertex neighbors').add(b);
      requiredItemAt(vertexNeighbors, b, 'icosahedron vertex neighbors').add(a);
    }
    for (const vertexId of vertexIds) {
      const faces = vertexToFaces.get(vertexId);
      if (faces) faces.push(faceId);
      else vertexToFaces.set(vertexId, [faceId]);
    }
  }

  for (let vertexId = 0; vertexId < vertexCount; vertexId++) {
    const normal = normalize(
      requiredNumberAt(positions, vertexId * 3, 'icosahedron positions'),
      requiredNumberAt(positions, vertexId * 3 + 1, 'icosahedron positions'),
      requiredNumberAt(positions, vertexId * 3 + 2, 'icosahedron positions'),
    );
    const tangentSeed: [number, number, number] = Math.abs(normal[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
    const tangent = normalize(...cross(tangentSeed, normal));
    const bitangent = cross(normal, tangent);
    const boundary = [...(vertexToFaces.get(vertexId) ?? [])]
      .map(faceId => requiredItemAt(faceCenters, faceId, 'icosahedron face centers'))
      .sort((a, b) => {
        const angleA = Math.atan2(dot(a, bitangent), dot(a, tangent));
        const angleB = Math.atan2(dot(b, bitangent), dot(b, tangent));
        return angleA - angleB;
      });
    if (boundary.length < 3) continue;
    const center: [number, number, number] = [
      normal[0] * (RADIUS + 0.045),
      normal[1] * (RADIUS + 0.045),
      normal[2] * (RADIUS + 0.045),
    ];
    const label = document.createElement('div');
    label.className = 'label';
    labelRoot.append(label);

    cells.push({
      id: cells.length,
      geometry: polygonGeometry(normal, boundary, normal),
      mesh: null,
      surface: 'hidden',
      center,
      normal,
      neighbors: [...requiredItemAt(vertexNeighbors, vertexId, 'icosahedron vertex neighbors')],
      state: 'hidden',
      mine: false,
      count: 0,
      label,
    });
  }

  for (const cell of cells) {
    cell.neighbors = cell.neighbors
      .map(id => ({ id, score: dot(cell.normal, requiredItemAt(cells, id, 'icosahedron cells').normal) }))
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .map(item => item.id);
  }

  return cells;
}

function projectToScreen(
  point: [number, number, number],
  viewProj: Float32Array,
  width: number,
  height: number,
): { x: number; y: number; visible: boolean } {
  const x = requiredNumberAt(viewProj, 0, 'icosahedron view projection') * point[0] + requiredNumberAt(viewProj, 4, 'icosahedron view projection') * point[1] + requiredNumberAt(viewProj, 8, 'icosahedron view projection') * point[2] + requiredNumberAt(viewProj, 12, 'icosahedron view projection');
  const y = requiredNumberAt(viewProj, 1, 'icosahedron view projection') * point[0] + requiredNumberAt(viewProj, 5, 'icosahedron view projection') * point[1] + requiredNumberAt(viewProj, 9, 'icosahedron view projection') * point[2] + requiredNumberAt(viewProj, 13, 'icosahedron view projection');
  const w = requiredNumberAt(viewProj, 3, 'icosahedron view projection') * point[0] + requiredNumberAt(viewProj, 7, 'icosahedron view projection') * point[1] + requiredNumberAt(viewProj, 11, 'icosahedron view projection') * point[2] + requiredNumberAt(viewProj, 15, 'icosahedron view projection');
  if (w <= 0) return { x: 0, y: 0, visible: false };
  const ndcX = x / w;
  const ndcY = y / w;
  return {
    x: (ndcX + 1) * 0.5 * width,
    y: (1 - ndcY) * 0.5 * height,
    visible: ndcX >= -1.1 && ndcX <= 1.1 && ndcY >= -1.1 && ndcY <= 1.1,
  };
}

class IcosahedronMinesweeper {
  private readonly saves = new SingleSlotGameSave<IcosahedronMinesweeperSaveData>({
    gameId: 'icosahedron-minesweeper',
    name: 'Icosahedron Minesweeper 自动存档',
    validateData: isIcosahedronSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private camera!: Entity;
  private cameraTransform!: SphericalTransform3D;
  private viewProj = mat4.identity() as Float32Array;
  private ray = new Ray();
  private cells: Cell[] = [];
  private readonly cellMaterials = createCellMaterialPalette();
  private phase: GamePhase = 'playing';
  private opened = 0;
  private flags = 0;
  private hovered: Cell | null = null;
  private pointerStart: PointerStart | null = null;

  private elMines = document.getElementById('mines')!;
  private elFlags = document.getElementById('flags')!;
  private elOpen = document.getElementById('open')!;
  private elTotal = document.getElementById('total')!;
  private elMessage = document.getElementById('message')!;
  private labelRoot = document.getElementById('labels')!;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.035, g: 0.04, b: 0.055, a: 1 },
    });
    await this.engine.init();

    this.world = new World('IcosahedronMinesweeper');
    this.cameraTransform = new SphericalTransform3D({
      radius: 6.2,
      theta: Math.PI * 0.22,
      phi: Math.PI * 0.34,
      target: [0, 0, 0],
    });
    this.camera = new Entity('Camera');
    this.camera.addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: 0.1, far: 100 }));
    this.camera.addComponent(this.cameraTransform);
    this.world.addEntity(this.camera);

    new OrbitControl(canvas, this.cameraTransform, {
      minRadius: 3.2,
      maxRadius: 12,
      rotateSpeed: 0.75,
      enablePan: false,
    });
    const renderIntegration = new RenderIntegration(this.engine, { label: 'IcosahedronMinesweeper.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    this.world.addSystem(new Render3DSystem(this.engine, this.camera, { loadOp: 'clear' }));
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));

    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [0.72, 0.82, 1], intensity: 0.22 }));
    this.world.addEntity(ambient);
    const key = new Entity('KeyLight');
    key.addComponent(new DirectionalLight({
      color: [1, 0.94, 0.84],
      intensity: 2.15,
      direction: [-0.55, -0.75, -0.42],
    }));
    this.world.addEntity(key);
    const fill = new Entity('FillLight');
    fill.addComponent(new DirectionalLight({
      color: [0.48, 0.68, 1],
      intensity: 0.7,
      direction: [0.68, 0.24, 0.62],
    }));
    this.world.addEntity(fill);
    const environment = new Entity('EnvironmentLight');
    environment.addComponent(new EnvironmentLight({
      intensity: 0.55,
      diffuseColor: [0.15, 0.23, 0.42],
      specularColor: [0.72, 0.84, 1],
    }));
    this.world.addEntity(environment);

    this.cells = buildCells(this.labelRoot);
    for (const cell of this.cells) {
      const entity = new Entity(`Cell_${cell.id}`);
      entity.addComponent(new CartesianTransform3D());
      cell.mesh = new Mesh3D(cell.geometry, this.cellMaterials.hidden);
      entity.addComponent(cell.mesh);
      this.world.addEntity(entity);
    }

    this._setupInput(canvas);
    await this._loadOrCreateState();

    this.engine.on('update', ({ detail: { time, delta } }) => {
      this._updateViewProjection();
      this._updateLabels();
      this.world.update(time, delta);
    });
    this.engine.run();
  }

  private _setCellSurface(cell: Cell, surface: CellSurface): void {
    if (cell.surface === surface) return;
    cell.surface = surface;
    if (cell.mesh) cell.mesh.material = this.cellMaterials[surface];
  }

  private _setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      this.pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
    });
    canvas.addEventListener('pointerup', event => {
      if (!this.pointerStart) return;
      const moved = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
      const button = this.pointerStart.button;
      this.pointerStart = null;
      if (moved > PICK_DRAG_THRESHOLD) return;
      const cell = this._pickCell(event.clientX, event.clientY, canvas);
      if (!cell || this.phase !== 'playing') return;
      if (button === 2) {
        if (cell.state === 'revealed' && cell.count > 0) this._chordReveal(cell);
        else this._toggleFlag(cell);
      }
      else if (button === 0) this._reveal(cell);
    });
    canvas.addEventListener('pointermove', event => {
      if (this.phase !== 'playing') return;
      const cell = this._pickCell(event.clientX, event.clientY, canvas);
      if (cell === this.hovered) return;
      if (this.hovered?.state === 'hidden') this._setCellSurface(this.hovered, 'hidden');
      if (cell?.state === 'hidden') this._setCellSurface(cell, 'hover');
      this.hovered = cell;
    });
    canvas.addEventListener('pointerleave', () => {
      if (this.hovered?.state === 'hidden') this._setCellSurface(this.hovered, 'hidden');
      this.hovered = null;
    });
    document.getElementById('restart')!.addEventListener('click', () => this._newGame());
    document.addEventListener('keydown', event => {
      if (event.key === 'r' || event.key === 'R') this._newGame();
    });
  }

  private _newGame(save = true): void {
    this.phase = 'playing';
    this.opened = 0;
    this.flags = 0;
    this.hovered = null;
    for (const cell of this.cells) {
      cell.state = 'hidden';
      cell.mine = false;
      cell.count = 0;
      setCellLabel(cell, '', 'none');
      cell.label.style.display = 'none';
      this._setCellSurface(cell, 'hidden');
    }

    const ids = this.cells.map(cell => cell.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const current = requiredNumberAt(ids, i, 'icosahedron cell ids');
      ids[i] = requiredNumberAt(ids, j, 'icosahedron cell ids');
      ids[j] = current;
    }
    for (const id of ids.slice(0, MINE_COUNT)) requiredItemAt(this.cells, id, 'icosahedron cells').mine = true;
    for (const cell of this.cells) {
      cell.count = cell.neighbors.reduce((sum, id) => sum + (requiredItemAt(this.cells, id, 'icosahedron cells').mine ? 1 : 0), 0);
    }
    this.elMines.textContent = String(MINE_COUNT);
    this.elTotal.textContent = String(this.cells.length - MINE_COUNT);
    this.elMessage.textContent = 'Left click opens a cell. Right click toggles a flag or opens neighbors from a revealed number. Drag to orbit, wheel to zoom.';
    this._updateHud();
    if (save) this._saveState();
  }

  private async _loadOrCreateState(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved || saved.cells.length !== this.cells.length) {
      this._newGame();
      return;
    }
    this.phase = saved.phase;
    this.opened = saved.opened;
    this.flags = saved.flags;
    saved.cells.forEach((data, index) => {
      const cell = requiredItemAt(this.cells, index, 'icosahedron cells');
      cell.mine = data.mine;
      cell.count = data.count;
      cell.state = data.state;
      if (data.state === 'hidden') {
        setCellLabel(cell, '', 'none');
        this._setCellSurface(cell, 'hidden');
      } else if (data.state === 'flagged') {
        setCellLabel(cell, 'F', 'flag');
        this._setCellSurface(cell, 'flagged');
      } else if (data.mine) {
        setCellLabel(cell, '*', 'mine');
        this._setCellSurface(cell, 'mine');
      } else {
        setCellLabel(cell, data.count > 0 ? String(data.count) : '', data.count > 0 ? 'number' : 'none');
        this._setCellSurface(cell, 'revealed');
      }
    });
    this.elMines.textContent = String(MINE_COUNT);
    this.elTotal.textContent = String(this.cells.length - MINE_COUNT);
    this.elMessage.textContent = this.phase === 'won'
      ? 'Cleared. Press Restart or R to play again.'
      : this.phase === 'lost'
        ? 'Game over. Press Restart or R to start again.'
        : 'Saved game restored.';
    this._updateHud();
  }

  private _saveState(): void {
    this.saves.save({
      phase: this.phase,
      opened: this.opened,
      flags: this.flags,
      cells: this.cells.map(cell => ({ mine: cell.mine, count: cell.count, state: cell.state })),
    });
  }

  private _toggleFlag(cell: Cell): void {
    if (cell.state === 'revealed') return;
    if (cell.state === 'flagged') {
      cell.state = 'hidden';
      this.flags--;
      setCellLabel(cell, '', 'none');
      this._setCellSurface(cell, 'hidden');
    } else {
      cell.state = 'flagged';
      this.flags++;
      setCellLabel(cell, 'F', 'flag');
      this._setCellSurface(cell, 'flagged');
    }
    this._updateHud();
    this._saveState();
  }

  private _chordReveal(cell: Cell): void {
    if (cell.state !== 'revealed' || cell.count <= 0) return;
    const flagCount = cell.neighbors.reduce(
      (sum, id) => sum + (requiredItemAt(this.cells, id, 'icosahedron cells').state === 'flagged' ? 1 : 0),
      0,
    );
    if (flagCount !== cell.count) return;

    for (const id of cell.neighbors) {
      if (this.phase !== 'playing') return;
      const neighbor = requiredItemAt(this.cells, id, 'icosahedron cells');
      if (neighbor.state === 'hidden') this._reveal(neighbor);
    }
  }

  private _reveal(cell: Cell): void {
    if (cell.state === 'flagged' || cell.state === 'revealed') return;
    if (this.opened === 0) this._ensureFirstRevealSafe(cell);
    if (cell.mine) {
      this._lose(cell);
      return;
    }
    const stack = [cell.id];
    const seen = new Set<number>();
    while (stack.length) {
      const id = stack.pop();
      if (id === undefined) continue;
      const current = requiredItemAt(this.cells, id, 'icosahedron cells');
      if (seen.has(current.id) || current.state === 'revealed' || current.state === 'flagged') continue;
      seen.add(current.id);
      current.state = 'revealed';
      this.opened++;
      this._setCellSurface(current, 'revealed');
      if (current.count > 0) {
        setCellLabel(current, String(current.count), 'number');
      } else {
        setCellLabel(current, '', 'none');
        for (const id of current.neighbors) stack.push(id);
      }
    }
    this._updateHud();
    if (this.opened === this.cells.length - MINE_COUNT) this._win();
    else this._saveState();
  }

  private _ensureFirstRevealSafe(cell: Cell): void {
    if (!cell.mine) return;
    const protectedIds = new Set([cell.id, ...cell.neighbors]);
    const replacement = this.cells.find(candidate => !candidate.mine && !protectedIds.has(candidate.id));
    if (!replacement) return;
    cell.mine = false;
    replacement.mine = true;
    for (const item of this.cells) {
      item.count = item.neighbors.reduce((sum, id) => sum + (requiredItemAt(this.cells, id, 'icosahedron cells').mine ? 1 : 0), 0);
    }
  }

  private _lose(trigger: Cell): void {
    this.phase = 'lost';
    for (const cell of this.cells) {
      if (cell.mine) {
        cell.state = 'revealed';
        setCellLabel(cell, '*', 'mine');
        this._setCellSurface(cell, cell === trigger ? 'mine' : 'flagged');
      } else if (cell.state === 'flagged') {
        setCellLabel(cell, 'X', 'wrong-flag');
        this._setCellSurface(cell, 'wrong-flag');
      }
    }
    this.elMessage.textContent = 'Game over. Press Restart or R to start again.';
    this._updateHud();
    this._saveState();
  }

  private _win(): void {
    this.phase = 'won';
    for (const cell of this.cells) {
      if (cell.mine && cell.state !== 'flagged') {
        cell.state = 'flagged';
        setCellLabel(cell, 'F', 'flag');
        this._setCellSurface(cell, 'flagged');
      }
    }
    this.flags = MINE_COUNT;
    this.elMessage.textContent = 'Cleared. Press Restart or R to play again.';
    this._updateHud();
    this._saveState();
  }

  private _updateHud(): void {
    this.elFlags.textContent = String(this.flags);
    this.elOpen.textContent = String(this.opened);
  }

  private _pickCell(clientX: number, clientY: number, canvas: HTMLCanvasElement): Cell | null {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const invViewProj = mat4.inverse(this.viewProj) as Float32Array;
    this.ray.setFromCamera(ndcX, ndcY, this.cameraTransform.eyePosition, invViewProj);

    let best: Cell | null = null;
    let bestDistance = Infinity;
    for (const cell of this.cells) {
      const hit = this.ray.intersectMesh(cell.geometry, IDENTITY, { useBVH: false });
      if (hit && hit.distance < bestDistance) {
        best = cell;
        bestDistance = hit.distance;
      }
    }
    return best;
  }

  private _updateViewProjection(): void {
    this.cameraTransform.updateWorldMatrix();
    const camera = this.camera.getComponent(Camera3D)!;
    camera.updateAspect(this.engine.displayWidth / this.engine.displayHeight);
    const view = mat4.inverse(this.cameraTransform.worldMatrix) as Float32Array;
    mat4.multiply(camera.projectionMatrix, view, this.viewProj);
  }

  private _updateLabels(): void {
    const eye = this.cameraTransform.eyePosition;
    const eyeDir = normalize(requiredNumberAt(eye, 0, 'camera eye position'), requiredNumberAt(eye, 1, 'camera eye position'), requiredNumberAt(eye, 2, 'camera eye position'));
    for (const cell of this.cells) {
      const hasLabel = cell.label.textContent !== '';
      if (!hasLabel || dot(cell.normal, eyeDir) <= 0.08) {
        cell.label.style.display = 'none';
        continue;
      }
      const projected = projectToScreen(cell.center, this.viewProj, this.engine.displayWidth, this.engine.displayHeight);
      if (!projected.visible) {
        cell.label.style.display = 'none';
        continue;
      }
      cell.label.style.display = 'flex';
      cell.label.style.left = `${projected.x}px`;
      cell.label.style.top = `${projected.y}px`;
    }
  }
}

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const game = new IcosahedronMinesweeper();
  await game.init(canvas);
}

main().catch(console.error);
