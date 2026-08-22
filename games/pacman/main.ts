import {
  Camera3D,
  CartesianTransform3D,
  DirectionalLight,
  Entity,
  Geometry3D,
  HaiyueEngine,
  Mesh3D,
  SphericalTransform3D,
  World,
  createBox3D,
  createSphere3D,
} from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { createCylinder3D } from '@haiyue/engine/geometry';
import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import { BlinnPhongRenderSystem, Render3DSystem } from '@haiyue/engine/systems';
import {
  DIRECTION_VECTORS,
  OPPOSITE_DIRECTION,
  PACMAN_MAZE_LAYOUT,
  availableDirections,
  cellAt,
  chooseGhostDirection,
  ghostTarget,
  isWalkable,
  parseMaze,
  stepFrom,
  type Direction,
  type GhostPersonality,
  type GridPoint,
  type ParsedMaze,
} from './PacmanRules';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

type Rgba = readonly [number, number, number, number];
type Phase = 'ready' | 'playing' | 'paused' | 'dying' | 'level-clear' | 'game-over';
type GhostMode = 'normal' | 'frightened' | 'eyes';

interface PacmanConfig {
  startingLives: number;
  pacmanSpeed: number;
  ghostSpeed: number;
  frightenedSeconds: number;
}

interface MovingActor {
  tileRow: number;
  tileColumn: number;
  direction: Direction;
  progress: number;
}

interface PelletVisual {
  readonly row: number;
  readonly column: number;
  readonly power: boolean;
  readonly entity: Entity;
  readonly transform: CartesianTransform3D;
}

interface GhostActor extends MovingActor {
  readonly personality: GhostPersonality;
  readonly start: GridPoint;
  readonly root: Entity;
  readonly transform: CartesianTransform3D;
  readonly body: Entity;
  readonly skirt: Entity;
  readonly material: BlinnPhongMaterial;
  readonly normalColor: Rgba;
  mode: GhostMode;
  releaseAt: number;
  visualState: string;
}

const TILE = 1;
const FIXED_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const READY_SECONDS = 1.5;
const DEATH_SECONDS = 1.45;
const LEVEL_CLEAR_SECONDS = 1.5;
const GHOST_EAT_SCORE = [200, 400, 800, 1600];
interface PacmanSaveData {
  score: number;
  highScore: number;
  lives: number;
  level: number;
  remainingPellets: string[];
}

function isPacmanSaveData(value: unknown): value is PacmanSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.score)
    && isNonNegativeInteger(value.highScore) && value.highScore >= value.score
    && isNonNegativeInteger(value.lives)
    && isNonNegativeInteger(value.level) && value.level >= 1
    && Array.isArray(value.remainingPellets)
    && value.remainingPellets.every(key => typeof key === 'string');
}

const COLORS = {
  floor: [0.008, 0.012, 0.035, 1] as Rgba,
  floorEdge: [0.025, 0.04, 0.11, 1] as Rgba,
  wall: [0.025, 0.08, 0.42, 1] as Rgba,
  wallTop: [0.07, 0.28, 1, 1] as Rgba,
  gate: [1, 0.48, 0.78, 1] as Rgba,
  pellet: [1, 0.82, 0.55, 1] as Rgba,
  power: [1, 0.93, 0.72, 1] as Rgba,
  pacman: [1, 0.84, 0.02, 1] as Rgba,
  frightened: [0.06, 0.18, 0.95, 1] as Rgba,
  frightenedFlash: [0.94, 0.97, 1, 1] as Rgba,
  eyes: [0.93, 0.97, 1, 1] as Rgba,
  pupil: [0.035, 0.08, 0.32, 1] as Rgba,
};

const GHOST_COLORS: Readonly<Record<GhostPersonality, Rgba>> = {
  blinky: [1, 0.09, 0.12, 1],
  pinky: [1, 0.43, 0.72, 1],
  inky: [0.05, 0.88, 0.95, 1],
  clyde: [1, 0.56, 0.12, 1],
};

const GHOST_RELEASE_DELAY: Readonly<Record<GhostPersonality, number>> = {
  blinky: 0,
  pinky: 1.8,
  inky: 4,
  clyde: 6.2,
};

const DIRECTION_ANGLE: Readonly<Record<Direction, number>> = {
  right: 0,
  down: -Math.PI / 2,
  left: Math.PI,
  up: Math.PI / 2,
};

class ArcadeAudio {
  private context: AudioContext | null = null;
  private enabled = true;
  private lastPelletAt = 0;

  get muted(): boolean { return !this.enabled; }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    return this.enabled;
  }

  unlock(): void {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  pellet(): void {
    const now = performance.now();
    if (now - this.lastPelletAt < 45) return;
    this.lastPelletAt = now;
    this.tone(520, 0.035, 0.025, 'square');
  }

  power(): void {
    this.tone(190, 0.18, 0.06, 'sawtooth', 420);
  }

  ghost(): void {
    this.tone(660, 0.18, 0.055, 'square', 1120);
  }

  death(): void {
    this.tone(420, 0.55, 0.07, 'sawtooth', 70);
  }

  level(): void {
    this.tone(440, 0.12, 0.05, 'square', 660);
    window.setTimeout(() => this.tone(660, 0.18, 0.05, 'square', 920), 130);
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency = frequency,
  ): void {
    if (!this.enabled) return;
    this.unlock();
    const context = this.context;
    if (!context) return;
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}

class PacmanGame {
  private readonly saves = new SingleSlotGameSave<PacmanSaveData>({
    gameId: 'pacman',
    name: 'Pac-Man 自动存档',
    validateData: isPacmanSaveData,
  });
  private readonly maze: ParsedMaze = parseMaze(PACMAN_MAZE_LAYOUT);
  private readonly audio = new ArcadeAudio();
  private readonly pellets = new Map<string, PelletVisual>();
  private readonly powerPellets: PelletVisual[] = [];
  private readonly materials = new Map<string, BlinnPhongMaterial>();
  private readonly pacmanFrames = Array.from({ length: 7 }, (_, index) => (
    createPacmanDisc(0.4, 0.48, 0.06 + index * 0.055)
  ));

  private engine!: HaiyueEngine;
  private world!: World;
  private pacman!: MovingActor;
  private pacmanEntity!: Entity;
  private pacmanTransform!: CartesianTransform3D;
  private pacmanMesh!: Mesh3D;
  private ghosts: GhostActor[] = [];
  private requestedDirection: Direction = 'left';
  private phase: Phase = 'ready';
  private phaseBeforePause: Exclude<Phase, 'paused'> = 'playing';
  private phaseRemaining = READY_SECONDS;
  private simulationTime = 0;
  private playTime = 0;
  private accumulator = 0;
  private frightenedUntil = 0;
  private ghostCombo = 0;
  private score = 0;
  private highScore = 0;
  private lives: number;
  private level = 1;

  private readonly scoreElement = requiredElement('score');
  private readonly highScoreElement = requiredElement('high-score');
  private readonly levelElement = requiredElement('level');
  private readonly pelletElement = requiredElement('pellets');
  private readonly livesElement = requiredElement('lives');
  private readonly statusElement = requiredElement('status');
  private readonly statusTitleElement = requiredElement('status-title');
  private readonly statusDetailElement = requiredElement('status-detail');
  private readonly pauseButton = requiredElement<HTMLButtonElement>('pause');
  private readonly soundButton = requiredElement<HTMLButtonElement>('sound');

  constructor(private readonly config: PacmanConfig) {
    this.lives = config.startingLives;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.002, g: 0.004, b: 0.018, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    this.world = new World('Pac-Man');
    this.setupCamera();
    this.setupLights();
    this.buildMaze();
    this.createActors();
    this.bindInput(canvas);
    await this.loadOrStart();

    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
    document.body.classList.add('ready');
  }

  private setupCamera(): void {
    const vertical = 12.5;
    const horizontal = vertical * (16 / 9);
    const camera = new Camera3D({
      type: 'orthographic',
      left: -horizontal,
      right: horizontal,
      top: vertical,
      bottom: -vertical,
      near: 0.1,
      far: 100,
    });
    const transform = new SphericalTransform3D({
      radius: 34,
      theta: 0,
      phi: 0.11,
      target: [0, 0, 0],
    });
    const cameraEntity = new Entity('ArcadeCamera');
    cameraEntity.addComponent(camera);
    cameraEntity.addComponent(transform);
    this.world.addEntity(cameraEntity);

    const render3DSystem = new Render3DSystem(this.engine, cameraEntity, {
      priority: 0,
      loadOp: 'clear',
      transparentSort: false,
    });
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, cameraEntity, {
      priority: -1,
      render3DSystem,
    }));
    this.world.addSystem(render3DSystem);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Pacman.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private setupLights(): void {
    const ambient = new Entity('ArcadeAmbient');
    ambient.addComponent(new AmbientLight({ color: [0.42, 0.52, 1], intensity: 0.5 }));
    this.world.addEntity(ambient);

    const key = new Entity('ArcadeKey');
    key.addComponent(new DirectionalLight({
      color: [0.72, 0.82, 1],
      intensity: 1.5,
      direction: [-0.35, -1, -0.22],
    }));
    this.world.addEntity(key);

    const fill = new Entity('ArcadeFill');
    fill.addComponent(new DirectionalLight({
      color: [1, 0.48, 0.72],
      intensity: 0.42,
      direction: [0.45, -0.7, 0.5],
    }));
    this.world.addEntity(fill);
  }

  private buildMaze(): void {
    const floorWidth = (this.maze.columns + 2.4) * TILE;
    const floorDepth = (this.maze.rows + 1) * TILE;
    this.addBox('MazeFloor', 0, -0.18, 0, floorWidth, 0.32, floorDepth, COLORS.floor, 12);
    this.addBox('MazeUnderGlow', 0, -0.37, 0, floorWidth + 0.45, 0.08, floorDepth + 0.45, COLORS.floorEdge, 22);

    for (let row = 0; row < this.maze.rows; row += 1) {
      let column = 0;
      while (column < this.maze.columns) {
        if (cellAt(this.maze, row, column) !== '#') {
          column += 1;
          continue;
        }
        const start = column;
        while (column < this.maze.columns && cellAt(this.maze, row, column) === '#') column += 1;
        const end = column;
        const centerColumn = (start + end - 1) * 0.5;
        const world = this.worldPosition(row, centerColumn, 0);
        const width = (end - start) * TILE - 0.12;
        this.addBox('MazeWall', world[0], 0.16, world[2], width, 0.54, 0.82, COLORS.wall, 26);
        this.addBox('MazeWallCap', world[0], 0.455, world[2], width - 0.08, 0.08, 0.7, COLORS.wallTop, 82);
      }

      let gateStart = -1;
      for (let gateColumn = 0; gateColumn <= this.maze.columns; gateColumn += 1) {
        const gate = gateColumn < this.maze.columns && cellAt(this.maze, row, gateColumn) === '-';
        if (gate && gateStart < 0) gateStart = gateColumn;
        if (!gate && gateStart >= 0) {
          const centerColumn = (gateStart + gateColumn - 1) * 0.5;
          const world = this.worldPosition(row, centerColumn, 0);
          this.addBox('GhostGate', world[0], 0.1, world[2], gateColumn - gateStart - 0.16, 0.08, 0.16, COLORS.gate, 70);
          gateStart = -1;
        }
      }
    }
  }

  private createActors(): void {
    const pacmanMaterial = this.createMaterial(COLORS.pacman, 72);
    this.pacmanEntity = new Entity('Pac-Man');
    this.pacmanTransform = new CartesianTransform3D();
    this.pacmanMesh = new Mesh3D(requiredItem(this.pacmanFrames, 0, 'Pac-Man animation frames'), pacmanMaterial);
    this.pacmanEntity.addComponent(this.pacmanTransform);
    this.pacmanEntity.addComponent(this.pacmanMesh);
    this.world.addEntity(this.pacmanEntity);

    const eyeGeometry = createSphere3D({ radius: 0.105, widthSegments: 14, heightSegments: 8 });
    const pupilGeometry = createSphere3D({ radius: 0.052, widthSegments: 12, heightSegments: 7 });
    const eyeMaterial = this.sharedMaterial('eyes', COLORS.eyes, 24);
    const pupilMaterial = this.sharedMaterial('pupil', COLORS.pupil, 36);
    const bodyGeometry = createSphere3D({ radius: 0.39, widthSegments: 24, heightSegments: 14 });
    const skirtGeometry = createCylinder3D({
      radiusTop: 0.34,
      radiusBottom: 0.38,
      height: 0.36,
      radialSegments: 18,
    });

    const order: readonly GhostPersonality[] = ['blinky', 'pinky', 'inky', 'clyde'];
    this.ghosts = order.map(personality => {
      const root = new Entity(`${personality}-ghost`);
      const transform = new CartesianTransform3D();
      root.addComponent(transform);
      this.world.addEntity(root);

      const material = this.createMaterial(GHOST_COLORS[personality], 54);
      const body = this.addChildMesh(root, `${personality}-body`, bodyGeometry, material, [0, 0.11, 0]);
      const skirt = this.addChildMesh(root, `${personality}-skirt`, skirtGeometry, material, [0, -0.16, 0]);
      this.addChildMesh(root, `${personality}-eye-left`, eyeGeometry, eyeMaterial, [0.29, 0.15, -0.15]);
      this.addChildMesh(root, `${personality}-eye-right`, eyeGeometry, eyeMaterial, [0.29, 0.15, 0.15]);
      this.addChildMesh(root, `${personality}-pupil-left`, pupilGeometry, pupilMaterial, [0.375, 0.15, -0.15]);
      this.addChildMesh(root, `${personality}-pupil-right`, pupilGeometry, pupilMaterial, [0.375, 0.15, 0.15]);
      return {
        personality,
        start: this.maze.ghostStarts[personality],
        root,
        transform,
        body,
        skirt,
        material,
        normalColor: GHOST_COLORS[personality],
        tileRow: 0,
        tileColumn: 0,
        direction: personality === 'blinky' || personality === 'inky' ? 'right' : 'left',
        progress: 0,
        mode: 'normal',
        releaseAt: 0,
        visualState: '',
      } satisfies GhostActor;
    });
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', event => {
      const directionByKey: Readonly<Record<string, Direction | undefined>> = {
        arrowup: 'up', w: 'up',
        arrowleft: 'left', a: 'left',
        arrowdown: 'down', s: 'down',
        arrowright: 'right', d: 'right',
      };
      const key = event.key.toLowerCase();
      const direction = directionByKey[key];
      if (direction) {
        event.preventDefault();
        this.requestDirection(direction);
      } else if (key === 'p' || key === 'escape') {
        event.preventDefault();
        this.togglePause();
      } else if (key === 'r') {
        this.newGame();
      } else if (key === 'm') {
        this.toggleSound();
      }
    });

    requiredElement('new-game').addEventListener('click', () => {
      this.audio.unlock();
      this.newGame();
    });
    this.pauseButton.addEventListener('click', () => {
      this.audio.unlock();
      this.togglePause();
    });
    this.soundButton.addEventListener('click', () => this.toggleSound());
    document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        const direction = button.dataset.direction as Direction | undefined;
        if (direction) this.requestDirection(direction);
      });
    });

    let pointerStart: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', event => {
      pointerStart = { x: event.clientX, y: event.clientY };
      this.audio.unlock();
    });
    canvas.addEventListener('pointerup', event => {
      if (!pointerStart) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.hypot(dx, dy) < 24) return;
      this.requestDirection(Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? 'right' : 'left'
        : dy > 0 ? 'down' : 'up');
    });
    canvas.addEventListener('pointercancel', () => { pointerStart = null; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.togglePause();
    });
  }

  private newGame(save = true): void {
    this.score = 0;
    this.level = 1;
    this.lives = this.config.startingLives;
    this.rebuildPellets();
    this.resetActors();
    this.setPhase('ready', READY_SECONDS);
    this.syncHud();
    if (save) this.saveState();
  }

  private async loadOrStart(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved) {
      this.newGame();
      return;
    }
    this.score = saved.score;
    this.highScore = saved.highScore;
    this.lives = Math.min(this.config.startingLives, saved.lives);
    this.level = saved.remainingPellets.length === 0 ? saved.level + 1 : saved.level;
    this.rebuildPellets();
    const remaining = new Set(saved.remainingPellets);
    if (remaining.size > 0) {
      for (const [key, pellet] of this.pellets) {
        if (remaining.has(key)) continue;
        this.world.removeEntity(pellet.entity);
        this.pellets.delete(key);
      }
    }
    this.resetActors();
    this.setPhase(this.lives > 0 ? 'ready' : 'game-over', this.lives > 0 ? READY_SECONDS : 0);
    this.syncHud();
  }

  private saveState(): void {
    this.saves.save({
      score: this.score,
      highScore: this.highScore,
      lives: this.lives,
      level: this.level,
      remainingPellets: [...this.pellets.keys()],
    });
  }

  private rebuildPellets(): void {
    for (const pellet of this.pellets.values()) this.world.removeEntity(pellet.entity);
    this.pellets.clear();
    this.powerPellets.length = 0;

    const pelletGeometry = createSphere3D({ radius: 0.075, widthSegments: 10, heightSegments: 6 });
    const powerGeometry = createSphere3D({ radius: 0.18, widthSegments: 16, heightSegments: 10 });
    const pelletMaterial = this.sharedMaterial('pellet', COLORS.pellet, 28);
    const powerMaterial = this.sharedMaterial('power', COLORS.power, 60);
    for (let row = 0; row < this.maze.rows; row += 1) {
      for (let column = 0; column < this.maze.columns; column += 1) {
        const cell = cellAt(this.maze, row, column);
        if (cell !== '.' && cell !== 'o') continue;
        const power = cell === 'o';
        const world = this.worldPosition(row, column, power ? 0.22 : 0.15);
        const entity = new Entity(power ? 'PowerPellet' : 'Pellet');
        const transform = new CartesianTransform3D({ position: world });
        entity.addComponent(transform);
        entity.addComponent(new Mesh3D(power ? powerGeometry : pelletGeometry, power ? powerMaterial : pelletMaterial));
        this.world.addEntity(entity);
        const pellet: PelletVisual = { row, column, power, entity, transform };
        this.pellets.set(tileKey(row, column), pellet);
        if (power) this.powerPellets.push(pellet);
      }
    }
  }

  private resetActors(): void {
    this.pacman = {
      tileRow: this.maze.pacmanStart.row,
      tileColumn: this.maze.pacmanStart.column,
      direction: 'left',
      progress: 0,
    };
    this.requestedDirection = 'left';
    this.frightenedUntil = 0;
    this.ghostCombo = 0;
    this.playTime = 0;
    this.pacmanEntity.disabled = false;
    this.pacmanTransform.setScale(1, 1, 1);
    for (const ghost of this.ghosts) {
      ghost.tileRow = ghost.start.row;
      ghost.tileColumn = ghost.start.column;
      ghost.direction = ghost.personality === 'blinky' || ghost.personality === 'inky' ? 'right' : 'left';
      ghost.progress = 0;
      ghost.mode = 'normal';
      ghost.releaseAt = this.simulationTime + GHOST_RELEASE_DELAY[ghost.personality];
      ghost.visualState = '';
      ghost.root.disabled = false;
    }
    this.syncVisuals(performance.now());
  }

  private requestDirection(direction: Direction): void {
    this.audio.unlock();
    if (this.phase === 'game-over') {
      this.newGame();
      return;
    }
    if (this.phase === 'paused') this.togglePause();
    if (this.phase !== 'playing' && this.phase !== 'ready') return;
    this.requestedDirection = direction;
    if (direction === OPPOSITE_DIRECTION[this.pacman.direction] && this.pacman.progress > 0) {
      reverseActor(this.maze, this.pacman);
    }
  }

  private togglePause(): void {
    if (this.phase === 'game-over' || this.phase === 'dying' || this.phase === 'level-clear') return;
    if (this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
    } else {
      this.phaseBeforePause = this.phase;
      this.phase = 'paused';
    }
    this.syncStatus();
  }

  private toggleSound(): void {
    const enabled = this.audio.toggle();
    this.soundButton.textContent = enabled ? 'Sound on' : 'Sound off';
    this.soundButton.setAttribute('aria-pressed', String(!enabled));
  }

  private tick(time: number, delta: number): void {
    const seconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, delta / 1000));
    if (this.phase !== 'paused') {
      this.accumulator += seconds;
      while (this.accumulator >= FIXED_STEP) {
        this.updateGame(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
      }
    }
    this.syncVisuals(time);
    this.world.update(time, delta);
  }

  private updateGame(delta: number): void {
    this.simulationTime += delta;
    if (this.phase === 'ready') {
      this.phaseRemaining -= delta;
      if (this.phaseRemaining <= 0) this.setPhase('playing');
      return;
    }
    if (this.phase === 'dying') {
      this.phaseRemaining -= delta;
      if (this.phaseRemaining <= 0) {
        if (this.lives <= 0) this.setPhase('game-over');
        else {
          this.resetActors();
          this.setPhase('ready', READY_SECONDS);
        }
      }
      return;
    }
    if (this.phase === 'level-clear') {
      this.phaseRemaining -= delta;
      if (this.phaseRemaining <= 0) {
        this.level += 1;
        this.rebuildPellets();
        this.resetActors();
        this.setPhase('ready', READY_SECONDS);
        this.syncHud();
        this.saveState();
      }
      return;
    }
    if (this.phase !== 'playing') return;

    this.playTime += delta;
    this.advancePacman(delta);
    this.consumePellet();
    for (const ghost of this.ghosts) this.advanceGhost(ghost, delta);
    this.resolveCollisions();
  }

  private advancePacman(delta: number): void {
    const levelBoost = Math.min(1.1, (this.level - 1) * 0.08);
    advanceActor(this.maze, this.pacman, (this.config.pacmanSpeed + levelBoost) * delta, point => {
      if (canMove(this.maze, point, this.requestedDirection, false)) return this.requestedDirection;
      if (canMove(this.maze, point, this.pacman.direction, false)) return this.pacman.direction;
      return null;
    });
  }

  private advanceGhost(ghost: GhostActor, delta: number): void {
    if (ghost.mode === 'frightened' && this.simulationTime >= this.frightenedUntil) {
      ghost.mode = 'normal';
      ghost.visualState = '';
    }
    if (ghost.releaseAt > this.simulationTime) return;

    const levelBoost = Math.min(1.25, (this.level - 1) * 0.07);
    const speed = ghost.mode === 'eyes'
      ? 7.4
      : ghost.mode === 'frightened'
        ? Math.max(2.8, this.config.ghostSpeed - 1.15)
        : this.config.ghostSpeed + levelBoost;
    advanceActor(this.maze, ghost, speed * delta, point => {
      if (ghost.mode === 'eyes' && sameTile(point, ghost.start)) {
        ghost.mode = 'normal';
        ghost.releaseAt = this.simulationTime + 1;
        ghost.visualState = '';
      }
      if (ghost.releaseAt > this.simulationTime) return null;

      const pacmanPoint = actorTile(this.pacman);
      const blinky = this.ghosts.find(candidate => candidate.personality === 'blinky');
      const target = ghost.mode === 'eyes'
        ? ghost.start
        : ghostTarget(
          ghost.personality,
          point,
          pacmanPoint,
          this.pacman.direction,
          blinky ? actorTile(blinky) : pacmanPoint,
          this.isScatterMode(),
          this.maze,
        );
      return chooseGhostDirection({
        maze: this.maze,
        position: point,
        current: ghost.direction,
        target,
        frightened: ghost.mode === 'frightened',
        allowGate: true,
      });
    });
  }

  private consumePellet(): void {
    if (this.pacman.progress > 0.2 && this.pacman.progress < 0.8) return;
    const point = this.pacman.progress >= 0.8
      ? stepFrom(this.maze, actorTile(this.pacman), this.pacman.direction)
      : actorTile(this.pacman);
    const key = tileKey(point.row, point.column);
    const pellet = this.pellets.get(key);
    if (!pellet) return;
    this.world.removeEntity(pellet.entity);
    this.pellets.delete(key);
    this.addScore(pellet.power ? 50 : 10);
    if (pellet.power) this.activatePowerMode();
    else this.audio.pellet();
    this.syncHud();
    if (this.pellets.size === 0) {
      this.audio.level();
      this.setPhase('level-clear', LEVEL_CLEAR_SECONDS);
    }
    this.saveState();
  }

  private activatePowerMode(): void {
    this.audio.power();
    this.frightenedUntil = this.simulationTime + Math.max(2.5, this.config.frightenedSeconds - (this.level - 1) * 0.35);
    this.ghostCombo = 0;
    for (const ghost of this.ghosts) {
      if (ghost.mode === 'eyes') continue;
      ghost.mode = 'frightened';
      ghost.visualState = '';
      reverseActor(this.maze, ghost);
    }
  }

  private resolveCollisions(): void {
    const pacmanPosition = actorPosition(this.maze, this.pacman);
    for (const ghost of this.ghosts) {
      if (ghost.releaseAt > this.simulationTime || ghost.mode === 'eyes') continue;
      const ghostPosition = actorPosition(this.maze, ghost);
      let columnDistance = Math.abs(pacmanPosition.column - ghostPosition.column);
      if (this.maze.tunnelRows.has(Math.round(pacmanPosition.row))) {
        columnDistance = Math.min(columnDistance, this.maze.columns - columnDistance);
      }
      const rowDistance = pacmanPosition.row - ghostPosition.row;
      if (Math.hypot(columnDistance, rowDistance) >= 0.55) continue;
      if (ghost.mode === 'frightened') {
        ghost.mode = 'eyes';
        ghost.visualState = '';
        const award = GHOST_EAT_SCORE[Math.min(this.ghostCombo, GHOST_EAT_SCORE.length - 1)] ?? 1600;
        this.ghostCombo += 1;
        this.addScore(award);
        this.audio.ghost();
        this.syncHud();
      } else {
        this.loseLife();
        break;
      }
    }
  }

  private loseLife(): void {
    if (this.phase !== 'playing') return;
    this.lives -= 1;
    this.audio.death();
    this.setPhase('dying', DEATH_SECONDS);
    this.syncHud();
    this.saveState();
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score <= this.highScore) return;
    this.highScore = this.score;
  }

  private setPhase(phase: Exclude<Phase, 'paused'>, duration = 0): void {
    this.phase = phase;
    this.phaseRemaining = duration;
    this.syncStatus();
  }

  private isScatterMode(): boolean {
    const cycle = this.playTime % 27;
    return cycle < 7;
  }

  private syncVisuals(time: number): void {
    const pacmanPosition = actorPosition(this.maze, this.pacman);
    const pacmanWorld = this.worldPosition(pacmanPosition.row, pacmanPosition.column, 0.46);
    this.pacmanTransform.setPosition(pacmanWorld[0], pacmanWorld[1], pacmanWorld[2]);
    this.pacmanTransform.setRotation(0, DIRECTION_ANGLE[this.pacman.direction], 0);
    const chompPhase = Math.floor(time / 58) % 12;
    const chompIndex = chompPhase <= 6 ? chompPhase : 12 - chompPhase;
    this.pacmanMesh.geometry = requiredItem(this.pacmanFrames, chompIndex, 'Pac-Man animation frames');
    if (this.phase === 'dying') {
      const scale = Math.max(0.04, this.phaseRemaining / DEATH_SECONDS);
      this.pacmanTransform.setScale(scale, scale, scale);
      this.pacmanTransform.setRotation(0, DIRECTION_ANGLE[this.pacman.direction] + (1 - scale) * Math.PI * 2, 0);
    } else {
      this.pacmanTransform.setScale(1, 1, 1);
    }

    for (const ghost of this.ghosts) {
      const position = actorPosition(this.maze, ghost);
      const bob = Math.sin(time * 0.008 + ghost.start.column) * 0.025;
      const world = this.worldPosition(position.row, position.column, 0.48 + bob);
      ghost.transform.setPosition(world[0], world[1], world[2]);
      ghost.transform.setRotation(0, DIRECTION_ANGLE[ghost.direction], 0);
      this.syncGhostAppearance(ghost);
    }

    const pulse = 0.88 + Math.sin(time * 0.008) * 0.18;
    for (const pellet of this.powerPellets) {
      if (this.pellets.has(tileKey(pellet.row, pellet.column))) pellet.transform.setScale(pulse, pulse, pulse);
    }
  }

  private syncGhostAppearance(ghost: GhostActor): void {
    const flashing = ghost.mode === 'frightened'
      && this.frightenedUntil - this.simulationTime < 1.6
      && Math.floor(this.simulationTime * 8) % 2 === 0;
    const state = ghost.mode === 'eyes' ? 'eyes' : flashing ? 'flash' : ghost.mode;
    if (state === ghost.visualState) return;
    ghost.visualState = state;
    const eyesOnly = ghost.mode === 'eyes';
    ghost.body.disabled = eyesOnly;
    ghost.skirt.disabled = eyesOnly;
    const color = flashing
      ? COLORS.frightenedFlash
      : ghost.mode === 'frightened'
        ? COLORS.frightened
        : ghost.normalColor;
    setMaterialColor(ghost.material, color);
  }

  private syncHud(): void {
    this.scoreElement.textContent = String(this.score).padStart(6, '0');
    this.highScoreElement.textContent = String(this.highScore).padStart(6, '0');
    this.levelElement.textContent = String(this.level).padStart(2, '0');
    this.pelletElement.textContent = String(this.pellets.size).padStart(3, '0');
    this.livesElement.replaceChildren(...Array.from({ length: Math.max(0, this.lives) }, () => {
      const life = document.createElement('span');
      life.className = 'life';
      life.setAttribute('aria-label', 'life');
      return life;
    }));
    this.syncStatus();
  }

  private syncStatus(): void {
    const messages: Partial<Record<Phase, readonly [string, string]>> = {
      ready: ['READY!', 'Arrow keys / WASD / swipe to move'],
      paused: ['PAUSED', 'Press P or tap resume'],
      dying: [this.lives > 0 ? 'OUCH!' : 'GAME OVER', this.lives > 0 ? 'Get ready…' : `Final score ${this.score}`],
      'level-clear': ['LEVEL CLEAR', `Level ${this.level + 1} incoming`],
      'game-over': ['GAME OVER', 'Press a direction or New game'],
    };
    const message = messages[this.phase];
    this.statusElement.classList.toggle('visible', Boolean(message));
    if (message) {
      this.statusTitleElement.textContent = message[0];
      this.statusDetailElement.textContent = message[1];
    }
    this.pauseButton.textContent = this.phase === 'paused' ? 'Resume' : 'Pause';
  }

  private worldPosition(row: number, column: number, y: number): [number, number, number] {
    return [
      (column - (this.maze.columns - 1) * 0.5) * TILE,
      y,
      (row - (this.maze.rows - 1) * 0.5) * TILE,
    ];
  }

  private addBox(
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: Rgba,
    shininess: number,
  ): Entity {
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D({ position: [x, y, z] }));
    entity.addComponent(new Mesh3D(
      createBox3D({ width, height, depth }),
      this.sharedMaterial(`${name}:${color.join(',')}:${shininess}`, color, shininess),
    ));
    this.world.addEntity(entity);
    return entity;
  }

  private addChildMesh(
    parent: Entity,
    name: string,
    geometry: Geometry3D,
    material: BlinnPhongMaterial,
    position: [number, number, number],
  ): Entity {
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D({ position }));
    entity.addComponent(new Mesh3D(geometry, material));
    parent.addChild(entity);
    return entity;
  }

  private sharedMaterial(key: string, color: Rgba, shininess: number): BlinnPhongMaterial {
    let material = this.materials.get(key);
    if (!material) {
      material = this.createMaterial(color, shininess);
      this.materials.set(key, material);
    }
    return material;
  }

  private createMaterial(color: Rgba, shininess: number): BlinnPhongMaterial {
    return new BlinnPhongMaterial({
      diffuse: color,
      ambient: [color[0] * 0.3, color[1] * 0.3, color[2] * 0.34, color[3]],
      specular: [0.48, 0.52, 0.66, 1],
      shininess,
    });
  }
}

function advanceActor(
  maze: ParsedMaze,
  actor: MovingActor,
  distance: number,
  chooseDirection: (point: GridPoint) => Direction | null,
): void {
  let remaining = Math.max(0, distance);
  let guard = 0;
  while (remaining > 0.000001 && guard < 8) {
    guard += 1;
    if (actor.progress <= 0.000001) {
      actor.progress = 0;
      const direction = chooseDirection(actorTile(actor));
      if (!direction || !canMove(maze, actorTile(actor), direction, true)) return;
      actor.direction = direction;
    }
    const movement = Math.min(remaining, 1 - actor.progress);
    actor.progress += movement;
    remaining -= movement;
    if (actor.progress >= 0.999999) {
      const next = stepFrom(maze, actorTile(actor), actor.direction);
      actor.tileRow = next.row;
      actor.tileColumn = next.column;
      actor.progress = 0;
    }
  }
}

function reverseActor(maze: ParsedMaze, actor: MovingActor): void {
  const reverse = OPPOSITE_DIRECTION[actor.direction];
  if (actor.progress <= 0.000001) {
    actor.direction = reverse;
    return;
  }
  const destination = stepFrom(maze, actorTile(actor), actor.direction);
  actor.tileRow = destination.row;
  actor.tileColumn = destination.column;
  actor.progress = 1 - actor.progress;
  actor.direction = reverse;
}

function canMove(maze: ParsedMaze, point: GridPoint, direction: Direction, allowGate: boolean): boolean {
  const next = stepFrom(maze, point, direction);
  return isWalkable(maze, next.row, next.column, allowGate);
}

function actorTile(actor: MovingActor): GridPoint {
  return { row: actor.tileRow, column: actor.tileColumn };
}

function actorPosition(maze: ParsedMaze, actor: MovingActor): GridPoint {
  const vector = DIRECTION_VECTORS[actor.direction];
  let column = actor.tileColumn + vector.column * actor.progress;
  if (maze.tunnelRows.has(actor.tileRow)) {
    if (column < -1) column += maze.columns;
    else if (column > maze.columns) column -= maze.columns;
  }
  return {
    row: actor.tileRow + vector.row * actor.progress,
    column,
  };
}

function sameTile(first: GridPoint, second: GridPoint): boolean {
  return first.row === second.row && first.column === second.column;
}

function tileKey(row: number, column: number): string {
  return `${row},${column}`;
}

function setMaterialColor(material: BlinnPhongMaterial, color: Rgba): void {
  material.diffuse = color;
  material.ambient = [color[0] * 0.3, color[1] * 0.3, color[2] * 0.34, color[3]];
}

function createPacmanDisc(radius: number, height: number, mouthHalfAngle: number): Geometry3D {
  const positions: number[] = [];
  const normals: number[] = [];
  const halfHeight = height * 0.5;
  const segments = 42;
  const arc = Math.PI * 2 - mouthHalfAngle * 2;
  const points: Array<readonly [number, number]> = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = mouthHalfAngle + arc * (index / segments);
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }

  for (let index = 0; index < segments; index += 1) {
    const first = requiredItem(points, index, 'Pac-Man arc');
    const second = requiredItem(points, index + 1, 'Pac-Man arc');
    pushTriangle(positions, normals, [0, halfHeight, 0], [second[0], halfHeight, second[1]], [first[0], halfHeight, first[1]], [0, 1, 0]);
    pushTriangle(positions, normals, [0, -halfHeight, 0], [first[0], -halfHeight, first[1]], [second[0], -halfHeight, second[1]], [0, -1, 0]);

    const middleAngle = mouthHalfAngle + arc * ((index + 0.5) / segments);
    const normal: readonly [number, number, number] = [Math.cos(middleAngle), 0, Math.sin(middleAngle)];
    pushQuad(
      positions,
      normals,
      [first[0], halfHeight, first[1]],
      [second[0], halfHeight, second[1]],
      [second[0], -halfHeight, second[1]],
      [first[0], -halfHeight, first[1]],
      normal,
    );
  }

  const first = requiredItem(points, 0, 'Pac-Man arc');
  const last = requiredItem(points, points.length - 1, 'Pac-Man arc');
  pushQuad(positions, normals, [0, halfHeight, 0], [first[0], halfHeight, first[1]], [first[0], -halfHeight, first[1]], [0, -halfHeight, 0], [-Math.sin(mouthHalfAngle), 0, Math.cos(mouthHalfAngle)]);
  pushQuad(positions, normals, [last[0], halfHeight, last[1]], [0, halfHeight, 0], [0, -halfHeight, 0], [last[0], -halfHeight, last[1]], [Math.sin(mouthHalfAngle), 0, -Math.cos(mouthHalfAngle)]);

  return new Geometry3D({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    topology: 'triangle-list',
    cullMode: 'none',
  });
}

function pushQuad(
  positions: number[],
  normals: number[],
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  third: readonly [number, number, number],
  fourth: readonly [number, number, number],
  normal: readonly [number, number, number],
): void {
  pushTriangle(positions, normals, first, second, third, normal);
  pushTriangle(positions, normals, first, third, fourth, normal);
}

function pushTriangle(
  positions: number[],
  normals: number[],
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  third: readonly [number, number, number],
  normal: readonly [number, number, number],
): void {
  positions.push(...first, ...second, ...third);
  normals.push(...normal, ...normal, ...normal);
}

function requiredItem<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`${label} is missing item ${index}.`);
  return item;
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Pac-Man is missing #${id}.`);
  return element as T;
}

async function main(): Promise<void> {
  const fallback: PacmanConfig = {
    startingLives: 3,
    pacmanSpeed: 5.25,
    ghostSpeed: 4.35,
    frightenedSeconds: 7,
  };
  const loaded = await fetch('./config.json')
    .then(response => response.ok ? response.json() as Promise<Partial<PacmanConfig>> : fallback)
    .catch(() => fallback);
  const config: PacmanConfig = {
    startingLives: Math.max(1, Math.min(5, Math.floor(loaded.startingLives ?? fallback.startingLives))),
    pacmanSpeed: Math.max(3, Math.min(8, loaded.pacmanSpeed ?? fallback.pacmanSpeed)),
    ghostSpeed: Math.max(2.5, Math.min(7, loaded.ghostSpeed ?? fallback.ghostSpeed)),
    frightenedSeconds: Math.max(2, Math.min(12, loaded.frightenedSeconds ?? fallback.frightenedSeconds)),
  };
  const canvas = requiredElement<HTMLCanvasElement>('canvas');
  await new PacmanGame(config).init(canvas);
}

main().catch(error => {
  console.error(error);
  document.body.classList.add('failed');
  const status = document.getElementById('status');
  const title = document.getElementById('status-title');
  const detail = document.getElementById('status-detail');
  status?.classList.add('visible');
  if (title) title.textContent = 'WEBGPU ERROR';
  if (detail) detail.textContent = error instanceof Error ? error.message : String(error);
});
