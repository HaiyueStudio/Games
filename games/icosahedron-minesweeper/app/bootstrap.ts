import { fitPerspectiveCamera } from '../../shared/rendering/fitPerspectiveCamera';
import { MinesHud } from '../ui/MinesHud';
import { createMinesAudio } from '../../shared/minesweeper/audio/BrowserAudio';
import type { MinesAudio } from '../../shared/minesweeper/audio/MinesAudio';
import { GameEngine } from '../../session/GameEngine';
import { installGamepad, gamepadPointer } from '../../gamepad/runtime';
installGamepad('icosahedron-minesweeper');
import { HaiyueEngine } from '@haiyue/engine';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { SphericalTransform3D } from '@haiyue/engine';
import { CartesianTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { PbrMaterial } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { Render3DSystem } from '@haiyue/engine/systems';
import { Geometry3D } from '@haiyue/engine';
import { OrbitControl } from '@haiyue/engine';
import { Ray } from '@haiyue/engine/math';
import { createIcosahedron3D } from '@haiyue/engine/geometry';
import { AmbientLight } from '@haiyue/engine/lighting';
import { DirectionalLight } from '@haiyue/engine';
import { EnvironmentLight } from '@haiyue/engine';
import { mat4 } from 'wgpu-matrix';
import { requiredItemAt, requiredNumberAt } from '../../shared/collections/arrayAccess';
import { CameraViewProjectionCache } from '../../shared/rendering/CameraViewProjectionCache';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../../save/SingleSlotGameSave';
import { CellMaterials, createCellFlag, tileGeometry, tangentFrame, normalize, dot, TILE_HEIGHT, type CellSurface, type CellFlag } from '../rendering/CellVisuals';
import { verifyMinesweeper } from '../verification/verifyMinesweeper';
import { BoardGesture, type BoardAction } from '../../shared/minesweeper/BoardGesture';

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
  flag: CellFlag | null;
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

function buildCells(): Cell[] {
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
    const { right: tangent, up: bitangent } = tangentFrame(normal);
    const boundary = [...(vertexToFaces.get(vertexId) ?? [])]
      .map(faceId => requiredItemAt(faceCenters, faceId, 'icosahedron face centers'))
      .sort((a, b) => {
        const angleA = Math.atan2(dot(a, bitangent), dot(a, tangent));
        const angleB = Math.atan2(dot(b, bitangent), dot(b, tangent));
        return angleA - angleB;
      });
    if (boundary.length < 3) continue;
    const center: [number, number, number] = [
      normal[0] * TILE_HEIGHT,
      normal[1] * TILE_HEIGHT,
      normal[2] * TILE_HEIGHT,
    ];

    cells.push({
      id: cells.length,
      geometry: tileGeometry(boundary, normal, RADIUS),
      mesh: null,
      surface: 'hidden',
      center,
      normal,
      neighbors: [...requiredItemAt(vertexNeighbors, vertexId, 'icosahedron vertex neighbors')],
      state: 'hidden',
      mine: false,
      count: 0,
      flag: null,
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
  private readonly cameraProjection = new CameraViewProjectionCache(this.viewProj);
  private ray = new Ray();
  private cells: Cell[] = [];
  private cellMaterials!: CellMaterials;
  private readonly verifying = new URLSearchParams(location.search).has('verify');
  private phase: GamePhase = 'playing';
  private opened = 0;
  private flags = 0;
  private hovered: Cell | null = null;
  private hoverPointer: { x: number; y: number } | null = null;
  private hoverSample: { x: number; y: number; view: number; left: number; top: number; width: number; height: number } | null = null;
  private viewRevision = 0;
  private readonly gesture = new BoardGesture(PICK_DRAG_THRESHOLD);
  private orbit!: OrbitControl;
  private orbitWasEnabled = true;

  private hud!: MinesHud;
  private audio!: MinesAudio;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new GameEngine({
      canvas,
      clearColor: { r: 0.035, g: 0.04, b: 0.055, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();

    this.world = new World('IcosahedronMinesweeper');
    this.audio = await createMinesAudio(this.world, canvas, 'icosahedron-minesweeper');
    this.hud = new MinesHud(this.engine, this.world, () => this._newGame(), { audio: this.audio });
    this.cameraTransform = new SphericalTransform3D({
      radius: 6.6,
      theta: Math.PI * 0.22,
      phi: Math.PI * 0.34,
      target: [0, 0, 0],
    });
    this.camera = new Entity('Camera');
    this.camera.addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 4, near: 0.1, far: 100 }));
    this.camera.addComponent(this.cameraTransform);
    this.world.addEntity(this.camera);
    fitPerspectiveCamera(this.engine, this.world, this.camera.getComponent(Camera3D)!, 1.1);

    const orbit = this.orbit = new OrbitControl(canvas, this.cameraTransform, {
      minRadius: 3.2,
      maxRadius: 12,
      rotateSpeed: 0.75,
      enablePan: false,
    });
    this.hud.guardOrbit(orbit, canvas);
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

    await this.hud.loadSkin();
    this.cellMaterials = await CellMaterials.load(this.engine);
    this.world.addRuntimeIntegration({ onDetach: () => this.cellMaterials.dispose() });
    this.world.addEntity(new Entity('Dark inner shell')
      .addComponent(new CartesianTransform3D())
      .addComponent(new Mesh3D(createIcosahedron3D({ radius: 1.91, detail: DETAIL + 1 }),
        new PbrMaterial({ baseColor: [0.018, 0.032, 0.046, 1], metallic: 0.2, roughness: 0.75 }))));
    this.cells = buildCells();
    for (const cell of this.cells) {
      const entity = new Entity(`Cell_${cell.id}`);
      entity.addComponent(new CartesianTransform3D());
      cell.mesh = new Mesh3D(cell.geometry, this.cellMaterials.surfaces.hidden);
      entity.addComponent(cell.mesh);
      this.world.addEntity(entity);
    }

    this._setupInput(canvas);
    await this._loadOrCreateState();

    if (new URLSearchParams(location.search).has('gamepadVerify')) Object.defineProperty(window, '__icosahedronInput', { configurable: true, get: () => {
      const pointer = gamepadPointer();
      const eye = this.cameraTransform.eyePosition, facing = normalize(eye[0]!, eye[1]!, eye[2]!);
      return { pointer, picked: pointer ? this._pickCell(pointer.x, pointer.y, canvas)?.id ?? null : null,
        hovered: this.hovered?.id ?? null, highlighted: this.cells.filter(cell => cell.surface === 'hover').map(cell => cell.id),
        phase: this.phase, opened: this.opened, flags: this.flags, gesture: this.gesture.active,
        camera: { theta: this.cameraTransform.theta, phi: this.cameraTransform.phi, radius: this.cameraTransform.radius },
        cells: this.cells.map(cell => ({ id: cell.id, state: cell.state, mine: cell.mine, count: cell.count,
          front: dot(cell.normal, facing) > .75, point: this._projectCell(cell, canvas) })) };
    } });

    this.engine.on('update', ({ detail: { time, delta } }) => {
      this._updateViewProjection();
      this._refreshHover(canvas);
      this.hud.update(delta);
      this.audio.update(delta / 1000);
      this.world.update(time, delta);
    });
    this.engine.run();
    if (this.verifying) await this._verify(canvas);
  }

  private _setCellSurface(cell: Cell, surface: CellSurface): void {
    cell.surface = surface;
    if (cell.mesh) cell.mesh.material = surface === 'revealed'
      ? this.cellMaterials.numbers[cell.count] ?? this.cellMaterials.surfaces.revealed
      : this.cellMaterials.surfaces[surface];
    const showFlag = cell.state === 'flagged';
    if (showFlag && !cell.flag) cell.flag = createCellFlag(this.world, cell.normal, cell.id, this.cellMaterials);
    if (cell.flag) {
      cell.flag.root.disabled = !showFlag;
      cell.flag.cloth.material = surface === 'wrong-flag' ? this.cellMaterials.wrongCloth : this.cellMaterials.cloth;
    }
  }

  private _clearHover(): void {
    if (this.hovered?.state === 'hidden') this._setCellSurface(this.hovered, 'hidden');
    this.hovered = null;
    this.hoverSample = null;
  }

  private _refreshHover(canvas: HTMLCanvasElement): void {
    const pointer = gamepadPointer() ?? this.hoverPointer;
    if (!pointer || this.gesture.active || this.phase !== 'playing') { this._clearHover(); return; }
    const previous = this.hoverSample, { left, top, width, height } = canvas.getBoundingClientRect();
    if (previous && pointer.x === previous.x && pointer.y === previous.y && previous.view === this.viewRevision
      && left === previous.left && top === previous.top && width === previous.width && height === previous.height) return;
    const cell = this._pickCell(pointer.x, pointer.y, canvas);
    if (cell !== this.hovered) {
      this._clearHover();
      if (cell?.state === 'hidden') this._setCellSurface(cell, 'hover');
      this.hovered = cell;
    }
    this.hoverSample = { ...pointer, view: this.viewRevision, left, top, width, height };
  }

  private _cancelGesture(): void {
    if (this.gesture.active) this.orbit.enableRotate = this.orbitWasEnabled;
    this.gesture.cancel();
    this.hoverPointer = null;
    this._clearHover();
  }

  private _applyPointerAction(action: BoardAction | null): void {
    if (!action || this.phase !== 'playing') return;
    const cell = requiredItemAt(this.cells, action.cellId, 'icosahedron cells');
    const beforeState = cell.state, beforeOpened = this.opened;
    if (action.kind === 'chord' || action.kind === 'flag' && cell.state === 'revealed') this._chordReveal(cell);
    else if (action.kind === 'flag') this._toggleFlag(cell);
    else this._reveal(cell);
    if ((this.phase as string) === 'lost') this.audio.explosion();
    else if (action.kind === 'flag' && beforeState !== 'revealed' && cell.state !== beforeState) this.audio.flag(cell.state === 'flagged');
    else if (this.opened > beforeOpened) this.audio.click();
  }

  private _setupInput(canvas: HTMLCanvasElement): void {
    const abort = new AbortController();
    const options = { signal: abort.signal, capture: true };
    this.world.addRuntimeIntegration({ onDetach: () => { this._cancelGesture(); abort.abort(); } });
    const release = (event: MouseEvent) => {
      this.hoverPointer = { x: event.clientX, y: event.clientY };
      if (!this.gesture.active) return;
      const action = this.gesture.release(event.clientX, event.clientY, event.buttons,
        this._pickCell(event.clientX, event.clientY, canvas)?.id ?? null);
      if (!this.gesture.active) this.orbit.enableRotate = this.orbitWasEnabled;
      this._applyPointerAction(action);
    };
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    canvas.addEventListener('pointerdown', event => {
      this.hoverPointer = { x: event.clientX, y: event.clientY };
      if (this.hud.hit(event.clientX, event.clientY, canvas)) return;
      if (!this.gesture.active) this.orbitWasEnabled = this.orbit.enableRotate;
      this._clearHover();
      this.gesture.begin(event.clientX, event.clientY, event.button, event.buttons, event.pointerId,
        this._pickCell(event.clientX, event.clientY, canvas)?.id ?? null);
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
      this.hoverPointer = { x: event.clientX, y: event.clientY };
      if (this.gesture.active) {
        this.gesture.move(event.clientX, event.clientY, event.buttons);
        this.orbit.enableRotate = this.orbitWasEnabled && this.gesture.dragging && !this.gesture.chording;
        this._clearHover();
        return;
      }
    }, options);
    canvas.addEventListener('pointerleave', () => { this.hoverPointer = null; this._clearHover(); }, options);
    canvas.addEventListener('pointercancel', () => this._cancelGesture(), options);
    window.addEventListener('blur', () => this._cancelGesture(), options);
    document.addEventListener('keydown', event => {
      if (event.key === 'r' || event.key === 'R') { this.audio.button(); this._newGame(); }
    }, options);
  }

  private _newGame(save = true): void {
    this.audio.reset();
    this._cancelGesture();
    this.phase = 'playing';
    this.opened = 0;
    this.flags = 0;
    this.hovered = null;
    for (const cell of this.cells) {
      cell.state = 'hidden';
      cell.mine = false;
      cell.count = 0;
      this._setCellSurface(cell, 'hidden');
    }

    const ids = this.cells.map(cell => cell.id);
    let seed = 0x1c05a;
    for (let i = ids.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = Math.floor((this.verifying ? seed / 4294967296 : Math.random()) * (i + 1));
      const current = requiredNumberAt(ids, i, 'icosahedron cell ids');
      ids[i] = requiredNumberAt(ids, j, 'icosahedron cell ids');
      ids[j] = current;
    }
    for (const id of ids.slice(0, MINE_COUNT)) requiredItemAt(this.cells, id, 'icosahedron cells').mine = true;
    for (const cell of this.cells) {
      cell.count = cell.neighbors.reduce((sum, id) => sum + (requiredItemAt(this.cells, id, 'icosahedron cells').mine ? 1 : 0), 0);
    }
    this.hud.elMines.setText(String(MINE_COUNT));
    this.hud.elTotal.setText(String(this.cells.length - MINE_COUNT));
    this.hud.showMessage('Left: reveal   Right: flag   Left + Right: open neighbors   Drag: orbit', 5500);
    this._updateHud();
    if (save) this._saveState();
  }

  private async _loadOrCreateState(): Promise<void> {
    const saved = this.verifying ? null : await this.saves.load();
    if (!saved || saved.cells.length !== this.cells.length) {
      this._newGame();
      return;
    }
    this._restoreState(saved);
  }

  private _restoreState(saved: IcosahedronMinesweeperSaveData): void {
    this._cancelGesture();
    this.audio.reset();
    this.phase = saved.phase;
    this.opened = saved.opened;
    this.flags = saved.flags;
    saved.cells.forEach((data, index) => {
      const cell = requiredItemAt(this.cells, index, 'icosahedron cells');
      cell.mine = data.mine;
      cell.count = data.count;
      cell.state = data.state;
      this._setCellSurface(cell, data.state === 'revealed' ? data.mine ? 'mine' : 'revealed'
        : data.state === 'flagged' ? this.phase === 'lost' && !data.mine ? 'wrong-flag' : 'flagged' : 'hidden');
    });
    this.hud.elMines.setText(String(MINE_COUNT));
    this.hud.elTotal.setText(String(this.cells.length - MINE_COUNT));
    this.hud.showMessage(this.phase === 'won'
      ? 'Cleared. Press Restart or R to play again.'
      : this.phase === 'lost'
        ? 'Game over. Press Restart or R to start again.'
        : 'Saved game restored.', 2800, this.phase !== 'playing');
    this._updateHud();
  }

  private _saveState(): void {
    if (this.verifying) return;
    this.saves.save(this._snapshotState());
  }

  private _snapshotState(): IcosahedronMinesweeperSaveData {
    return {
      phase: this.phase,
      opened: this.opened,
      flags: this.flags,
      cells: this.cells.map(cell => ({ mine: cell.mine, count: cell.count, state: cell.state })),
    };
  }

  private _toggleFlag(cell: Cell): void {
    if (cell.state === 'revealed') return;
    if (cell.state === 'flagged') {
      cell.state = 'hidden';
      this.flags--;
      this._setCellSurface(cell, 'hidden');
    } else {
      cell.state = 'flagged';
      this.flags++;
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
      this._lose();
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
      if (current.count === 0) {
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

  private _lose(): void {
    this.phase = 'lost';
    for (const cell of this.cells) {
      if (cell.mine) {
        cell.state = 'revealed';
        this._setCellSurface(cell, 'mine');
      } else if (cell.state === 'flagged') {
        this._setCellSurface(cell, 'wrong-flag');
      }
    }
    this.hud.showMessage('Game over. Press Restart or R to start again.', 0, true);
    this._updateHud();
    this._saveState();
  }

  private _win(): void {
    this.phase = 'won';
    for (const cell of this.cells) {
      if (cell.mine && cell.state !== 'flagged') {
        cell.state = 'flagged';
        this._setCellSurface(cell, 'flagged');
      }
    }
    this.flags = MINE_COUNT;
    this.hud.showMessage('Cleared. Press Restart or R to play again.', 0, true);
    this._updateHud();
    this._saveState();
  }

  private _updateHud(): void {
    this.hud.elFlags.setText(String(this.flags));
    this.hud.elOpen.setText(String(this.opened));
  }

  private _pickCell(clientX: number, clientY: number, canvas: HTMLCanvasElement): Cell | null {
    this._updateViewProjection();
    if (this.hud.hit(clientX, clientY, canvas)) return null;
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
    const camera = this.camera.getComponent(Camera3D)!;
    if (this.cameraProjection.update(
      this.cameraTransform,
      camera,
      this.engine.displayWidth,
      this.engine.displayHeight,
    )) this.viewRevision++;
  }

  private _projectCell(cell: Cell, canvas: HTMLCanvasElement): { x: number; y: number } {
    this._updateViewProjection();
    const rect = canvas.getBoundingClientRect(), m = this.viewProj, p = cell.center;
    const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
    return {
      x: rect.left + ((m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!) / w + 1) * rect.width / 2,
      y: rect.top + (1 - (m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!) / w) * rect.height / 2,
    };
  }

  private async _verify(canvas: HTMLCanvasElement): Promise<void> {
    const result = await verifyMinesweeper({
      canvas, cells: this.cells, materials: this.cellMaterials, audio: this.audio,
      reset: () => this._newGame(false),
      pick: (x, y) => this._pickCell(x, y, canvas)?.id ?? null,
      project: cell => this._projectCell(cell, canvas),
      orbit: () => { this.cameraTransform.theta += 0.35; this.cameraTransform.radius = 6.3; },
      hud: this.hud,
      snapshot: () => this._snapshotState(),
      restore: state => this._restoreState(state),
    });
    const theta = this.cameraTransform.theta;
    Object.defineProperty(window, '__minesRenderingProbe', { configurable: true, value: {
      orbit: (offset: number) => { this._cancelGesture(); this.cameraTransform.theta = theta + offset; this._updateViewProjection(); },
      samples: () => {
        const eye = this.cameraTransform.eyePosition;
        const direction = normalize(eye[0]!, eye[1]!, eye[2]!);
        const rect = canvas.getBoundingClientRect(), m = this.viewProj;
        return this.cells.flatMap(cell => {
          if (cell.state !== 'hidden' || dot(cell.normal, direction) < 0.7) return [];
          const { right, up } = tangentFrame(cell.normal);
          const p = cell.center.map((v, i) => v + right[i]! * 0.055 + up[i]! * 0.05);
          const w = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
          const x = rect.left + ((m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!) / w + 1) * rect.width / 2;
          const y = rect.top + (1 - (m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!) / w) * rect.height / 2;
          return y > 175 && this._pickCell(x, y, canvas)?.id === cell.id ? [{ id: cell.id, x, y }] : [];
        });
      },
    } });
    const output = document.getElementById('result')!;
    output.textContent = JSON.stringify(result);
    output.dataset.status = 'passed';
  }
}

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const game = new IcosahedronMinesweeper();
  await game.init(canvas);
}

main().catch(error => {
  console.error(error);
  const result = document.getElementById('result');
  if (result) {
    result.textContent = JSON.stringify({ status: 'failed', error: String(error) });
    result.dataset.status = 'failed';
  }
});
