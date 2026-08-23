import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import { BlinnPhongRenderSystem, Render3DSystem } from '@haiyue/engine/systems';
import { Camera3D, CartesianTransform3D, DirectionalLight, Entity, Mesh3D, OrbitControl, SphericalTransform3D, HaiyueEngine, World, createBox3D, createSphere3D, type Geometry3D } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiButton, GuiElement, GuiRoot, GuiSystem } from '@haiyue/engine/gui';
import { requiredItemAt } from '../arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

type Color = [number, number, number, number];

interface LevelDef {
  name: string;
  difficulty: 'beginner' | 'medium' | 'hard';
  source?: { file: string; level: number };
  map: string[];
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
  completedLevels?: number[];
  levelSetVersion?: number;
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y);
}

function isLevelDef(value: unknown): value is LevelDef {
  return isRecord(value)
    && typeof value.name === 'string'
    && value.name.length > 0
    && (value.difficulty === 'beginner' || value.difficulty === 'medium' || value.difficulty === 'hard')
    && Array.isArray(value.map)
    && value.map.length >= 3
    && value.map.every(row => typeof row === 'string');
}

function isSokobanSaveData(value: unknown): value is SokobanSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.levelIndex)
    && isNonNegativeInteger(value.moves)
    && isPoint(value.player)
    && Array.isArray(value.boxes)
    && value.boxes.every(isPoint)
    && (value.levelSetVersion === undefined || isNonNegativeInteger(value.levelSetVersion))
    && (value.completedLevels === undefined || (
      Array.isArray(value.completedLevels)
      && value.completedLevels.every(isNonNegativeInteger)
    ));
}

const TILE = 42;
const FLOOR_H = 4;
const WALL_H = 34;
const BOX_SIZE = 28;
const PLAYER_R = 15;
const LEVEL_SET_VERSION = 2;
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
  private walkable = new Set<string>();
  private targets = new Set<string>();
  private entities: Entity[] = [];
  private history: Snapshot[] = [];
  private materials = new Map<string, BlinnPhongMaterial>();
  private geometries = new Map<string, Geometry3D>();
  private completedLevels = new Set<number>();
  private levelsPanelOpen = false;
  private levelsButton!: GuiButton;
  private levelsPanel!: GuiElement;
  private levelsHeader!: GuiButton;
  private levelButtons: GuiButton[] = [];

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
    this.levels = await this.loadLevels();
    this.setupGui();
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Sokoban3D.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.bindUi();
    await this.restoreOrStart();
    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private async loadLevels(): Promise<LevelDef[]> {
    const response = await fetch('./levels.json');
    if (!response.ok) throw new Error(`Failed to load levels.json: ${response.status}`);
    const data = await response.json() as unknown;
    if (!isRecord(data) || !Array.isArray(data.levels) || data.levels.length === 0 || !data.levels.every(isLevelDef)) {
      throw new Error('[SOKOBAN_LEVELS_INVALID] levels.json has no valid levels.');
    }
    const levels: LevelDef[] = data.levels;
    for (const level of levels) {
      const width = requiredItemAt(level.map, 0, 'Sokoban level rows').length;
      const cells = level.map.join('');
      const players = [...cells].filter(cell => cell === '@' || cell === '+').length;
      const boxes = [...cells].filter(cell => cell === '$' || cell === '*').length;
      const targets = [...cells].filter(cell => cell === '.' || cell === '*' || cell === '+').length;
      const closed = level.map.every(row => row.length === width && row.startsWith('#') && row.endsWith('#'))
        && requiredItemAt(level.map, 0, 'Sokoban level rows').split('').every(cell => cell === '#')
        && requiredItemAt(level.map, level.map.length - 1, 'Sokoban level rows').split('').every(cell => cell === '#');
      if (!closed || players !== 1 || boxes === 0 || boxes !== targets) {
        throw new Error(`[SOKOBAN_LEVEL_INVALID] ${level.name} has an invalid boundary or actor count.`);
      }
    }
    return levels;
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

  private setupGui(): void {
    const rootEntity = new Entity('Sokoban3DGui');
    const guiRoot = new GuiRoot({
      theme: {
        fontSize: 15,
        radius: 7,
        colors: {
          text: '#f8fafc',
          textMuted: '#cbd5e1',
          primary: '#15803d',
          danger: '#dc2626',
          background: '#0f172a',
          surface: 'rgba(15,23,42,0.92)',
          border: 'rgba(148,163,184,0.42)',
          hover: '#334155',
          active: '#475569',
          disabled: '#64748b',
        },
      },
    });

    this.levelsButton = guiRoot.add(new GuiButton({
      x: '100%',
      y: 66,
      width: 118,
      height: 38,
      text: 'Levels',
      variant: 'primary',
      onClick: () => this.toggleLevelsPanel(),
    }));
    const originalButtonLayout = this.levelsButton.layout;
    this.levelsButton.layout = parentRect => {
      originalButtonLayout.call(this.levelsButton, parentRect);
      this.levelsButton.rect.x = parentRect.width - this.levelsButton.rect.width - 14;
    };

    const columns = 3;
    const rows = Math.ceil(this.levels.length / columns);
    const panelWidth = 304;
    const panelHeight = 68 + rows * 48;
    this.levelsPanel = guiRoot.add(new GuiElement({
      width: panelWidth,
      height: panelHeight,
      visible: false,
      style: {
        backgroundColor: 'rgba(7,12,20,0.96)',
        borderColor: 'rgba(148,163,184,0.45)',
        radius: 10,
        padding: 12,
      },
    }));
    this.levelsPanel.layout = parentRect => {
      this.levelsPanel.rect = {
        x: Math.max(8, parentRect.width - panelWidth - 14),
        y: 112,
        width: Math.min(panelWidth, parentRect.width - 16),
        height: panelHeight,
      };
      for (const child of this.levelsPanel.children) child.layout(this.levelsPanel.rect);
    };

    this.levelsHeader = this.levelsPanel.add(new GuiButton({
      x: 12,
      y: 12,
      width: 280,
      height: 38,
      text: 'Choose a level',
      onClick: () => this.toggleLevelsPanel(false),
      style: { backgroundColor: '#1e293b', borderColor: '#475569' },
    }));

    this.levelButtons = this.levels.map((level, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return this.levelsPanel.add(new GuiButton({
        x: 12 + column * 94,
        y: 58 + row * 48,
        width: 86,
        height: 40,
        text: String(index + 1),
        onClick: () => this.selectLevel(index),
      }));
    });

    rootEntity.addComponent(guiRoot);
    this.world.addEntity(rootEntity);
    this.world.addSystem(new GuiSystem(this.engine, { loadOp: 'load' }));
    this.syncLevelGui();
  }

  private toggleLevelsPanel(open = !this.levelsPanelOpen): void {
    this.levelsPanelOpen = open;
    this.levelsPanel.setVisible(open);
    this.syncLevelGui();
  }

  private selectLevel(index: number): void {
    this.toggleLevelsPanel(false);
    this.loadLevel(index);
  }

  private syncLevelGui(): void {
    if (!this.levelsButton || !this.levelsPanel) return;
    this.levelsButton.setText(`Levels ${this.completedLevels.size}/${this.levels.length} ${this.levelsPanelOpen ? '-' : '+'}`);
    this.levelsHeader.setText(`Choose Level - ${this.completedLevels.size} cleared`);
    this.levelButtons.forEach((button, index) => {
      const completed = this.completedLevels.has(index);
      const current = index === this.levelIndex;
      const difficulty = requiredItemAt(this.levels, index, 'Sokoban levels').difficulty;
      const difficultyLabel = difficulty === 'beginner' ? 'B' : difficulty === 'medium' ? 'M' : 'H';
      button.setText(completed ? `OK ${index + 1}` : `${current ? '> ' : ''}${difficultyLabel}${index + 1}`);
      button.setStyle({
        backgroundColor: completed ? '#15803d' : current ? '#1d4ed8' : 'rgba(30,41,59,0.94)',
        borderColor: completed ? '#4ade80' : current ? '#60a5fa' : '#475569',
      });
    });
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
    this.walkable.clear();
    this.targets.clear();

    const level = requiredItemAt(this.levels, this.levelIndex, 'Sokoban levels');
    this.height = level.map.length;
    this.width = Math.max(...level.map.map(row => row.length));

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = requiredItemAt(level.map, y, 'Sokoban level rows').charAt(x) || ' ';
        const pos = { x, y };
        if (cell !== '#') {
          this.walkable.add(keyOf(pos));
          this.addFloorTile(x, y);
        }
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
      this.sphereGeometry(PLAYER_R, 32, 16),
      this.material(COLORS.player, 76),
    ));
    this.world.addEntity(this.playerEntity);
    this.entities.push(this.playerEntity);

    this.centerCamera();
    this.syncActors();
    this.updateHud();
    this.syncLevelGui();
    this.messageText.textContent = `${level.name}: push every cube onto a gold target.`;
    if (save) this.saveState();
  }

  private async restoreOrStart(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved || saved.levelIndex >= this.levels.length) {
      this.loadLevel(0);
      return;
    }
    const savedCompletedLevels = saved.completedLevels ?? [];
    this.completedLevels = new Set(savedCompletedLevels.filter(index => (
      index < this.levels.length
      && (saved.levelSetVersion === LEVEL_SET_VERSION || index < 2)
    )));
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
    if (this.solved()) this.completedLevels.add(this.levelIndex);
    this.syncLevelGui();
    this.saveState();
  }

  private saveState(): void {
    this.saves.save({
      levelIndex: this.levelIndex,
      moves: this.moves,
      player: { ...this.player },
      boxes: this.boxes.map(box => ({ ...box.pos })),
      completedLevels: [...this.completedLevels].sort((a, b) => a - b),
      levelSetVersion: LEVEL_SET_VERSION,
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
      this.boxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE),
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
      this.boxGeometry(width, height, depth),
      this.material(color, shininess),
    ));
    this.world.addEntity(entity);
    this.entities.push(entity);
    return entity;
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'l') {
      this.toggleLevelsPanel();
      event.preventDefault();
      return;
    }
    if (this.levelsPanelOpen) {
      if (key === 'escape') this.toggleLevelsPanel(false);
      return;
    }
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
      this.completedLevels.add(this.levelIndex);
      this.syncLevelGui();
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
    const key = keyOf(point);
    return this.walls.has(key) || !this.walkable.has(key);
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

  private boxGeometry(width: number, height: number, depth: number): Geometry3D {
    const key = `box:${width}:${height}:${depth}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = createBox3D({ width, height, depth });
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  private sphereGeometry(radius: number, widthSegments: number, heightSegments: number): Geometry3D {
    const key = `sphere:${radius}:${widthSegments}:${heightSegments}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = createSphere3D({ radius, widthSegments, heightSegments });
      this.geometries.set(key, geometry);
    }
    return geometry;
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new Sokoban3DGame().init(canvas).catch(error => {
  console.error(error);
  const message = document.getElementById('message');
  if (message) message.textContent = error instanceof Error ? error.message : String(error);
});
