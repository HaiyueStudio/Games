import {
  Entity,
  Mesh3D,
  PbrMaterial,
  System,
  createBox3D,
  type Scene,
  type World,
} from '@haiyue/engine';
import { Transform3D } from '@haiyue/engine/components';
import { Physics3DBody, type Physics3DSystem } from '@haiyue/engine/physics';
import { mat4 } from 'wgpu-matrix';
import {
  BALL_RADIUS,
  CELL_SIZE,
  FLOOR_COLLIDER_HEIGHT,
  FLOOR_COLLIDER_OVERLAP,
  FLOOR_HEIGHT,
  WALL_HEIGHT,
  WALL_THICKNESS,
  type BoardPiece,
} from './MazeConfig';
import {
  floorSegments,
  generateMaze,
  hasWall,
  isHole,
  nextLevelSeed,
  type MazeCell,
  type MazeLayout,
} from './MazeRules';
import type { MazeTiltSystem } from './MazeTiltSystem';

/** Owns one level's entities and gameplay transitions; rendering/input remain external adapters. */
export class GravityMazeGame {
  private readonly _pieces: Entity[] = [];
  private readonly _boardPieces: BoardPiece[] = [];
  private _layout = generateMaze(1);
  private _level = 1;
  private _seed = 1;
  private _won = false;
  private _restartCount = 0;

  private readonly _levelElement = requiredElement('level', HTMLElement);
  private readonly _seedElement = requiredElement('seed', HTMLElement);
  private readonly _holesElement = requiredElement('holes', HTMLElement);
  private readonly _statusElement = requiredElement('status', HTMLElement);
  private readonly _victory = requiredElement('victory', HTMLElement);
  private readonly _restartButton = requiredElement('restart', HTMLButtonElement);
  private readonly _nextButton = requiredElement('next-level', HTMLButtonElement);

  constructor(
    private readonly _scene: Scene,
    private readonly _physics: Physics3DSystem,
    private readonly _tilt: MazeTiltSystem,
    private readonly _ballTransform: Transform3D,
    private readonly _ballBody: Physics3DBody,
    private readonly _baseSeed: number,
    private readonly _onLevelChanged: (level: number) => void = () => undefined,
  ) {
    this._restartButton.addEventListener('click', this._onRestart);
    this._nextButton.addEventListener('click', this._onNextLevel);
    window.addEventListener('keydown', this._onKeyDown);
  }

  get layout(): MazeLayout { return this._layout; }
  get level(): number { return this._level; }
  get seed(): number { return this._seed; }

  loadLevel(level: number): void {
    this._clearMaze();
    this._level = level;
    this._seed = nextLevelSeed(this._baseSeed, level);
    this._layout = generateMaze(this._seed);
    this._won = false;
    this._tilt.reset();
    this._buildMaze();
    this._tilt.setPieces(this._boardPieces);
    this._victory.classList.remove('visible');
    this._statusElement.textContent = '拖拽迷宫，让小球滚向绿色终点';
    this._levelElement.textContent = String(level);
    this._seedElement.textContent = String(this._seed);
    this._holesElement.textContent = String(this._layout.holes.length);
    document.body.dataset.gameState = 'playing';
    document.body.dataset.level = String(level);
    document.body.dataset.mazeSeed = String(this._seed);
    document.body.dataset.holeCount = String(this._layout.holes.length);
    this._onLevelChanged(level);
    this.restart('level-start');
  }

  update(): void {
    const local = this._tilt.worldToBoard(matrixPosition(this._ballTransform.localMatrix));
    document.body.dataset.ballCell = `${Math.round(local[0] / CELL_SIZE)},${Math.round(local[2] / CELL_SIZE)}`;
    if (!this._won && this._isAtGoal(local)) {
      this._won = true;
      this._physics.setLinearVelocity(this._ballBody, 0, 0, 0);
      this._physics.setAngularVelocity(this._ballBody, 0, 0, 0);
      this._statusElement.textContent = `第 ${this._level} 关完成！`;
      this._victory.classList.add('visible');
      document.body.dataset.gameState = 'won';
      return;
    }
    const halfWidth = this._layout.columns * CELL_SIZE * 0.5;
    const halfDepth = this._layout.rows * CELL_SIZE * 0.5;
    if (local[1] < -2.1 || Math.abs(local[0]) > halfWidth + 1 || Math.abs(local[2]) > halfDepth + 1) {
      const fallCell = this._cellAtLocal(local);
      document.body.dataset.lastFallCell = fallCell ? `${fallCell.row},${fallCell.column}` : 'outside';
      document.body.dataset.lastFallWasHole = String(fallCell !== null && isHole(this._layout, fallCell));
      this.restart('fell');
    }
  }

  restart(reason: 'level-start' | 'manual' | 'fell'): void {
    if (reason === 'fell') {
      this._restartCount += 1;
      this._statusElement.textContent = '小球掉出去了，已回到起点';
    } else if (reason === 'manual') {
      this._restartCount += 1;
      this._statusElement.textContent = '已回到本关起点';
    }
    const start = this._cellPosition(this._layout.start, BALL_RADIUS + 0.055);
    const world = this._tilt.boardToWorld(start);
    if (!this._physics.teleportBody(this._ballBody, world, [0, 0, 0, 1])) {
      this._ballTransform.setMatrix(mat4.translation(world));
    }
    this._physics.setLinearVelocity(this._ballBody, 0, 0, 0);
    this._physics.setAngularVelocity(this._ballBody, 0, 0, 0);
    document.body.dataset.restartCount = String(this._restartCount);
    document.body.dataset.lastResetReason = reason;
  }

  dispose(): void {
    this._restartButton.removeEventListener('click', this._onRestart);
    this._nextButton.removeEventListener('click', this._onNextLevel);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  private _buildMaze(): void {
    const floorColor: readonly [number, number, number, number] = [0.24, 0.32, 0.39, 1];
    const wallColor: readonly [number, number, number, number] = [0.08, 0.17, 0.24, 1];
    for (let row = 0; row < this._layout.rows; row += 1) {
      for (let column = 0; column < this._layout.columns; column += 1) {
        const cell = { row, column };
        const center = this._cellPosition(cell, -FLOOR_HEIGHT * 0.5);
        if (isHole(this._layout, cell)) {
          this._addVisualBox(`Hole ${row}:${column}`, [center[0], -0.24, center[2]], [CELL_SIZE * 0.94, 0.035, CELL_SIZE * 0.94], [0.28, 0.025, 0.035, 1], [0.15, 0.01, 0.01]);
        } else {
          const alternating = (row + column) % 2 === 0 ? 0.025 : 0;
          this._addVisualBox(
            `Floor ${row}:${column}`,
            center,
            [CELL_SIZE - 0.018, FLOOR_HEIGHT, CELL_SIZE - 0.018],
            [floorColor[0] + alternating, floorColor[1] + alternating, floorColor[2] + alternating, 1],
            [0, 0, 0],
            0.78,
            0.04,
          );
        }
        if (hasWall(this._layout, cell, 'north')) this._addWall(row, column, 'north', wallColor);
        if (hasWall(this._layout, cell, 'west')) this._addWall(row, column, 'west', wallColor);
        if (column === this._layout.columns - 1 && hasWall(this._layout, cell, 'east')) {
          this._addWall(row, column, 'east', wallColor);
        }
        if (row === this._layout.rows - 1 && hasWall(this._layout, cell, 'south')) {
          this._addWall(row, column, 'south', wallColor);
        }
      }
    }
    this._addFloorColliders();
    const start = this._cellPosition(this._layout.start, 0.025);
    this._addVisualBox('Start marker', start, [CELL_SIZE * 0.56, 0.035, CELL_SIZE * 0.56], [0.08, 0.7, 0.88, 1], [0.01, 0.28, 0.42]);
    const goal = this._cellPosition(this._layout.goal, 0.03);
    this._addVisualBox('Goal marker', goal, [CELL_SIZE * 0.62, 0.045, CELL_SIZE * 0.62], [0.18, 0.92, 0.48, 1], [0.03, 0.48, 0.16]);
  }

  private _addFloorColliders(): void {
    for (const segment of floorSegments(this._layout)) {
      const cellCount = segment.endColumn - segment.startColumn + 1;
      const centerColumn = (segment.startColumn + segment.endColumn) * 0.5;
      const center = this._cellPosition({ row: segment.row, column: centerColumn }, -FLOOR_COLLIDER_HEIGHT * 0.5);
      this._addStaticCollider(
        `Floor collider ${segment.row}:${segment.startColumn}-${segment.endColumn}`,
        center,
        [
          cellCount * CELL_SIZE + FLOOR_COLLIDER_OVERLAP,
          FLOOR_COLLIDER_HEIGHT,
          CELL_SIZE + FLOOR_COLLIDER_OVERLAP,
        ],
        { friction: 0.76, restitution: 0.025 },
      );
    }
  }

  private _addWall(
    row: number,
    column: number,
    direction: 'north' | 'east' | 'south' | 'west',
    color: readonly [number, number, number, number],
  ): void {
    const center = this._cellPosition({ row, column }, WALL_HEIGHT * 0.5 - 0.01);
    const horizontal = direction === 'north' || direction === 'south';
    const x = center[0] + (direction === 'east' ? CELL_SIZE * 0.5 : direction === 'west' ? -CELL_SIZE * 0.5 : 0);
    const z = center[2] + (direction === 'south' ? CELL_SIZE * 0.5 : direction === 'north' ? -CELL_SIZE * 0.5 : 0);
    this._addStaticBox(
      `Wall ${row}:${column}:${direction}`,
      [x, center[1], z],
      horizontal
        ? [CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]
        : [WALL_THICKNESS, WALL_HEIGHT, CELL_SIZE + WALL_THICKNESS],
      color,
      { friction: 0.62, restitution: 0.12 },
    );
  }

  private _addStaticBox(
    name: string,
    localPosition: readonly [number, number, number],
    size: readonly [number, number, number],
    color: readonly [number, number, number, number],
    surface: { friction: number; restitution: number },
  ): void {
    const transform = new Transform3D();
    const entity = new Entity(name)
      .addComponent(transform)
      .addComponent(new Mesh3D(
        createBox3D({ width: size[0], height: size[1], depth: size[2] }),
        new PbrMaterial({ baseColor: color, metallic: 0.05, roughness: 0.76 }),
      ))
      .addComponent(new Physics3DBody({
        type: 'static',
        shape: 'box',
        width: size[0],
        height: size[1],
        depth: size[2],
        density: 0,
        friction: surface.friction,
        restitution: surface.restitution,
      }));
    this._scene.add(entity);
    this._pieces.push(entity);
    this._boardPieces.push({ transform, localPosition });
  }

  private _addStaticCollider(
    name: string,
    localPosition: readonly [number, number, number],
    size: readonly [number, number, number],
    surface: { friction: number; restitution: number },
  ): void {
    const transform = new Transform3D();
    const entity = new Entity(name)
      .addComponent(transform)
      .addComponent(new Physics3DBody({
        type: 'static',
        shape: 'box',
        width: size[0],
        height: size[1],
        depth: size[2],
        density: 0,
        friction: surface.friction,
        restitution: surface.restitution,
      }));
    this._scene.add(entity);
    this._pieces.push(entity);
    this._boardPieces.push({ transform, localPosition });
  }

  private _addVisualBox(
    name: string,
    localPosition: readonly [number, number, number],
    size: readonly [number, number, number],
    color: readonly [number, number, number, number],
    emissiveFactor: readonly [number, number, number],
    roughness = 0.5,
    metallic = 0.08,
  ): void {
    const transform = new Transform3D();
    const entity = new Entity(name)
      .addComponent(transform)
      .addComponent(new Mesh3D(
        createBox3D({ width: size[0], height: size[1], depth: size[2] }),
        new PbrMaterial({ baseColor: color, metallic, roughness, emissiveFactor }),
      ));
    this._scene.add(entity);
    this._pieces.push(entity);
    this._boardPieces.push({ transform, localPosition });
  }

  private _clearMaze(): void {
    for (const entity of this._pieces) this._scene.world.destroyEntity(entity);
    this._pieces.length = 0;
    this._boardPieces.length = 0;
  }

  private _cellPosition(cell: MazeCell, y: number): [number, number, number] {
    return [
      (cell.column - (this._layout.columns - 1) * 0.5) * CELL_SIZE,
      y,
      (cell.row - (this._layout.rows - 1) * 0.5) * CELL_SIZE,
    ];
  }

  private _isAtGoal(local: readonly [number, number, number]): boolean {
    const goal = this._cellPosition(this._layout.goal, 0);
    return Math.hypot(local[0] - goal[0], local[2] - goal[2]) < CELL_SIZE * 0.3
      && local[1] > -0.2
      && local[1] < 1.2;
  }

  private _cellAtLocal(local: readonly [number, number, number]): MazeCell | null {
    const column = Math.floor(local[0] / CELL_SIZE + this._layout.columns * 0.5);
    const row = Math.floor(local[2] / CELL_SIZE + this._layout.rows * 0.5);
    return row >= 0 && row < this._layout.rows && column >= 0 && column < this._layout.columns
      ? { row, column }
      : null;
  }

  private _onRestart = (): void => this.restart('manual');
  private _onNextLevel = (): void => this.loadLevel(this._level + 1);
  private _onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyR') this.restart('manual');
    else if (event.code === 'Enter' && this._won) this.loadLevel(this._level + 1);
    else return;
    event.preventDefault();
  };
}

export class MazeOutcomeSystem extends System {
  constructor(private readonly _game: GravityMazeGame) {
    super(() => false);
    this.name = 'MazeOutcomeSystem';
    this.priority = 0;
  }

  override update(_world: World): this {
    this._game.update();
    return this;
  }
}

function matrixPosition(matrix: Float32Array): [number, number, number] {
  return [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0];
}

function requiredElement<T extends Element>(id: string, type: { new(): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing required #${id} element.`);
  return element;
}
