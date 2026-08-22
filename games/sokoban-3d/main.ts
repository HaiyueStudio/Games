import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import { BlinnPhongRenderSystem, Render3DSystem } from '@haiyue/engine/systems';
import { Camera3D, CartesianTransform3D, DirectionalLight, Entity, Mesh3D, OrbitControl, SphericalTransform3D, HaiyueEngine, World, createBox3D, createSphere3D } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { requiredItemAt } from '../arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

type Color = [number, number, number, number];

interface LevelDef {
  name: string;
  map: string[];
}

interface LevelsFile {
  levels: LevelDef[];
}

interface Point {
  x: number;
  y: number;
}

interface BoxRecord {
  id: string;
  pos: Point;
  entity: Entity;
  transform: CartesianTransform3D;
}

interface Snapshot {
  player: Point;
  boxes: Point[];
  moves: number;
}

interface SokobanSaveData extends Snapshot {
  levelIndex: number;
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y);
}

function isSokobanSaveData(value: unknown): value is SokobanSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.levelIndex)
    && isNonNegativeInteger(value.moves)
    && isPoint(value.player)
    && Array.isArray(value.boxes)
    && value.boxes.every(isPoint);
}

const TILE = 42;
const FLOOR_H = 4;
const WALL_H = 34;
const BOX_SIZE = 28;
const PLAYER_R = 15;
const COLORS = {
  floor: [0.30, 0.35, 0.35, 1] as Color,
  floorAlt: [0.26, 0.31, 0.31, 1] as Color,
  wall: [0.18, 0.23, 0.26, 1] as Color,
  wallTop: [0.31, 0.39, 0.42, 1] as Color,
  box: [0.78, 0.48, 0.20, 1] as Color,
  boxDone: [0.28, 0.72, 0.48, 1] as Color,
  player: [0.16, 0.48, 1.0, 1] as Color,
  target: [0.98, 0.82, 0.22, 1] as Color,
};

function keyOf(point: Point): string {
  return `${point.x},${point.y}`;
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

class Sokoban3DGame {
  private readonly saves = new SingleSlotGameSave<SokobanSaveData>({
    gameId: 'sokoban-3d',
    name: 'Sokoban 3D 自动存档',
    validateData: isSokobanSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private cameraEntity!: Entity;
  private orbitTransform!: SphericalTransform3D;
  private levels: LevelDef[] = [];
  private levelIndex = 0;
  private moves = 0;
  private width = 0;
  private height = 0;
  private player: Point = { x: 0, y: 0 };
  private playerTransform!: CartesianTransform3D;
  private playerEntity!: Entity;
  private boxes: BoxRecord[] = [];
  private walls = new Set<string>();
  private targets = new Set<string>();
  private entities: Entity[] = [];
  private history: Snapshot[] = [];
  private materials = new Map<string, BlinnPhongMaterial>();

  private levelText = document.getElementById('level')!;
  private movesText = document.getElementById('moves')!;
  private boxesText = document.getElementById('boxes')!;
  private messageText = document.getElementById('message')!;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({ canvas, clearColor: { r: 0.07, g: 0.09, b: 0.11, a: 1 } });
    await this.engine.init();
    this.world = new World('Sokoban3D');
    this.setupCamera(canvas);
    this.setupLights();
    const render3DSystem = new Render3DSystem(this.engine, this.cameraEntity, { priority: 10, loadOp: 'clear' });
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, this.cameraEntity, { priority: -1, render3DSystem }));
    this.world.addSystem(render3DSystem);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Sokoban3D.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.levels = await this.loadLevels();
    this.bindUi();
    await this.restoreOrStart();
    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private async loadLevels(): Promise<LevelDef[]> {
    const response = await fetch('./levels.json');
    if (!response.ok) throw new Error(`Failed to load levels.json: ${response.status}`);
    const data = await response.json() as LevelsFile;
    if (!Array.isArray(data.levels) || data.levels.length === 0) throw new Error('levels.json has no levels.');
    return data.levels;
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    const camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4.6, near: 1, far: 2200 });
    this.orbitTransform = new SphericalTransform3D({
      radius: 430,
      theta: -Math.PI * 0.24,
      phi: Math.PI * 0.30,
      target: [0, 0, 0],
    });
    this.cameraEntity = new Entity('Camera');
    this.cameraEntity.addComponent(camera);
    this.cameraEntity.addComponent(this.orbitTransform);
    this.world.addEntity(this.cameraEntity);
    new OrbitControl(canvas, this.orbitTransform, {
      minRadius: 220,
      maxRadius: 760,
      minPhi: Math.PI * 0.12,
      maxPhi: Math.PI * 0.47,
      enablePan: true,
      rotateSpeed: 0.58,
      zoomSpeed: 0.36,
    });
  }

  private setupLights(): void {
    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [1, 1, 1], intensity: 0.42 }));
    this.world.addEntity(ambient);
    const key = new Entity('KeyLight');
    key.addComponent(new DirectionalLight({ color: [1, 0.96, 0.88], intensity: 1.55, direction: [-0.42, -1, -0.35] }));
    this.world.addEntity(key);
    const fill = new Entity('FillLight');
    fill.addComponent(new DirectionalLight({ color: [0.66, 0.78, 1], intensity: 0.45, direction: [0.58, -0.72, 0.34] }));
    this.world.addEntity(fill);
  }

  private bindUi(): void {
    window.addEventListener('keydown', event => this.handleKey(event));
    document.getElementById('restart')!.addEventListener('click', () => this.restart());
    document.getElementById('undo')!.addEventListener('click', () => this.undo());
    document.getElementById('prev')!.addEventListener('click', () => this.changeLevel(-1));
    document.getElementById('next')!.addEventListener('click', () => this.changeLevel(1));
  }

  private loadLevel(index: number, save = true): void {
    this.clearScene();
    this.levelIndex = (index + this.levels.length) % this.levels.length;
    this.moves = 0;
    this.history = [];
    this.boxes = [];
    this.walls.clear();
    this.targets.clear();

    const level = requiredItemAt(this.levels, this.levelIndex, 'Sokoban levels');
    this.height = level.map.length;
    this.width = Math.max(...level.map.map(row => row.length));

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = requiredItemAt(level.map, y, 'Sokoban level rows').charAt(x) || ' ';
        const pos = { x, y };
        if (cell !== ' ') this.addFloorTile(x, y);
        if (cell === '#') this.addWall(x, y);
        if (cell === '.' || cell === '*' || cell === '+') this.addTarget(x, y);
        if (cell === '$' || cell === '*') this.addBox(x, y);
        if (cell === '@' || cell === '+') this.player = pos;
      }
    }

    this.playerEntity = new Entity('Player');
    this.playerTransform = new CartesianTransform3D({ position: this.worldPosition(this.player.x, this.player.y, PLAYER_R + FLOOR_H) });
    this.playerEntity.addComponent(this.playerTransform);
    this.playerEntity.addComponent(new Mesh3D(
      createSphere3D({ radius: PLAYER_R, widthSegments: 32, heightSegments: 16 }),
      this.material(COLORS.player, 76),
    ));
    this.world.addEntity(this.playerEntity);
    this.entities.push(this.playerEntity);

    this.centerCamera();
    this.syncActors();
    this.updateHud();
    this.messageText.textContent = `${level.name}: push every cube onto a gold target.`;
    if (save) this.saveState();
  }

  private async restoreOrStart(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved || saved.levelIndex >= this.levels.length) {
      this.loadLevel(0);
      return;
    }
    this.loadLevel(saved.levelIndex, false);
    if (saved.boxes.length !== this.boxes.length) {
      this.saveState();
      return;
    }
    this.player = { ...saved.player };
    this.moves = saved.moves;
    saved.boxes.forEach((position, index) => {
      const box = this.boxes[index];
      if (box) box.pos = { ...position };
    });
    this.syncActors();
    this.updateHud();
  }

  private saveState(): void {
    this.saves.save({
      levelIndex: this.levelIndex,
      moves: this.moves,
      player: { ...this.player },
      boxes: this.boxes.map(box => ({ ...box.pos })),
    });
  }

  private clearScene(): void {
    for (const entity of this.entities) this.world.removeEntity(entity);
    this.entities = [];
  }

  private addFloorTile(x: number, y: number): void {
    const color = (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
    this.addBoxEntity('Floor', x, FLOOR_H * 0.5, y, TILE, FLOOR_H, TILE, color, 12);
  }

  private addWall(x: number, y: number): void {
    this.walls.add(keyOf({ x, y }));
    this.addBoxEntity('Wall', x, FLOOR_H + WALL_H * 0.5, y, TILE, WALL_H, TILE, COLORS.wall, 18);
    this.addBoxEntity('WallTop', x, FLOOR_H + WALL_H + 2, y, TILE * 0.92, 4, TILE * 0.92, COLORS.wallTop, 28);
  }

  private addTarget(x: number, y: number): void {
    this.targets.add(keyOf({ x, y }));
    this.addBoxEntity('Target', x, FLOOR_H + 0.85, y, TILE * 0.55, 1.4, TILE * 0.55, COLORS.target, 46);
  }

  private addBox(x: number, y: number): void {
    const entity = new Entity('Crate');
    const transform = new CartesianTransform3D({ position: this.worldPosition(x, y, FLOOR_H + BOX_SIZE * 0.5) });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(
      createBox3D({ width: BOX_SIZE, height: BOX_SIZE, depth: BOX_SIZE }),
      this.material(COLORS.box, 34),
    ));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.boxes.push({ id: `${x},${y},${this.boxes.length}`, pos: { x, y }, entity, transform });
  }

  private addBoxEntity(name: string, gridX: number, y: number, gridY: number, width: number, height: number, depth: number, color: Color, shininess: number): Entity {
    const entity = new Entity(name);
    const [x, _y, z] = this.worldPosition(gridX, gridY, y);
    entity.addComponent(new CartesianTransform3D({ position: [x, y, z] }));
    entity.addComponent(new Mesh3D(
      createBox3D({ width, height, depth }),
      this.material(color, shininess),
    ));
    this.world.addEntity(entity);
    this.entities.push(entity);
    return entity;
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    const dirs: Record<string, Point> = {
      arrowup: { x: 0, y: -1 },
      w: { x: 0, y: -1 },
      arrowdown: { x: 0, y: 1 },
      s: { x: 0, y: 1 },
      arrowleft: { x: -1, y: 0 },
      a: { x: -1, y: 0 },
      arrowright: { x: 1, y: 0 },
      d: { x: 1, y: 0 },
    };
    if (dirs[key]) {
      this.tryMove(dirs[key]);
      event.preventDefault();
      return;
    }
    if (key === 'z') this.undo();
    if (key === 'r') this.restart();
    if (key === '[') this.changeLevel(-1);
    if (key === ']') this.changeLevel(1);
  }

  private tryMove(dir: Point): void {
    const next = { x: this.player.x + dir.x, y: this.player.y + dir.y };
    if (this.blockedByWall(next)) return;
    const box = this.boxAt(next);
    if (box) {
      const boxNext = { x: box.pos.x + dir.x, y: box.pos.y + dir.y };
      if (this.blockedByWall(boxNext) || this.boxAt(boxNext)) return;
      this.pushHistory();
      box.pos = boxNext;
    } else {
      this.pushHistory();
    }
    this.player = next;
    this.moves++;
    this.syncActors();
    this.updateHud();
    if (this.solved()) {
      this.messageText.textContent = `Solved ${requiredItemAt(this.levels, this.levelIndex, 'Sokoban levels').name} in ${this.moves} moves.`;
    }
    this.saveState();
  }

  private pushHistory(): void {
    this.history.push({
      player: { ...this.player },
      boxes: this.boxes.map(box => ({ ...box.pos })),
      moves: this.moves,
    });
  }

  private undo(): void {
    const snapshot = this.history.pop();
    if (!snapshot) return;
    this.player = { ...snapshot.player };
    this.moves = snapshot.moves;
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i];
      const position = snapshot.boxes[i];
      if (box && position) box.pos = { ...position };
    }
    this.syncActors();
    this.updateHud();
    this.messageText.textContent = 'Move undone.';
    this.saveState();
  }

  private restart(): void {
    this.loadLevel(this.levelIndex);
  }

  private changeLevel(delta: number): void {
    this.loadLevel(this.levelIndex + delta);
  }

  private syncActors(): void {
    this.playerTransform.setPosition(...this.worldPosition(this.player.x, this.player.y, PLAYER_R + FLOOR_H));
    for (const box of this.boxes) {
      box.transform.setPosition(...this.worldPosition(box.pos.x, box.pos.y, FLOOR_H + BOX_SIZE * 0.5));
      const mesh = box.entity.getComponent(Mesh3D);
      if (mesh) mesh.material = this.material(this.targets.has(keyOf(box.pos)) ? COLORS.boxDone : COLORS.box, 34);
    }
  }

  private tick(time: number, delta: number): void {
    this.world.update(time, delta);
  }

  private blockedByWall(point: Point): boolean {
    return this.walls.has(keyOf(point));
  }

  private boxAt(point: Point): BoxRecord | undefined {
    return this.boxes.find(box => samePoint(box.pos, point));
  }

  private solved(): boolean {
    return this.boxes.every(box => this.targets.has(keyOf(box.pos)));
  }

  private updateHud(): void {
    const onTargets = this.boxes.filter(box => this.targets.has(keyOf(box.pos))).length;
    this.levelText.textContent = `${this.levelIndex + 1} / ${this.levels.length}`;
    this.movesText.textContent = String(this.moves);
    this.boxesText.textContent = `${onTargets} / ${this.boxes.length}`;
  }

  private centerCamera(): void {
    const centerX = (this.width - 1) * 0.5;
    const centerY = (this.height - 1) * 0.5;
    const [x, _y, z] = this.worldPosition(centerX, centerY, 0);
    this.orbitTransform.setTarget(x, 16, z);
    this.orbitTransform.set(Math.max(330, Math.max(this.width, this.height) * 58), -Math.PI * 0.23, Math.PI * 0.31);
  }

  private worldPosition(gridX: number, gridY: number, y: number): [number, number, number] {
    return [
      (gridX - (this.width - 1) * 0.5) * TILE,
      y,
      (gridY - (this.height - 1) * 0.5) * TILE,
    ];
  }

  private material(color: Color, shininess: number): BlinnPhongMaterial {
    const key = `${color.join(',')}:${shininess}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new BlinnPhongMaterial({
        diffuse: color,
        ambient: [color[0] * 0.22, color[1] * 0.22, color[2] * 0.22, 1],
        specular: [0.25, 0.27, 0.28, 1],
        shininess,
      });
      this.materials.set(key, material);
    }
    return material;
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new Sokoban3DGame().init(canvas).catch(error => {
  console.error(error);
  const message = document.getElementById('message');
  if (message) message.textContent = error instanceof Error ? error.message : String(error);
});
