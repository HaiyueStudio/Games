import { fitPerspectiveCamera } from '../../shared/rendering/fitPerspectiveCamera';
import{SokobanHud}from'../ui/SokobanHud';
import { GameEngine } from '../../session/GameEngine';
import { installGamepad } from '../../gamepad/runtime';
installGamepad('sokoban-3d');
import { AmbientLight } from '@haiyue/engine/lighting';
import { PbrMaterial } from '@haiyue/engine/material';
import { Render3DSystem } from '@haiyue/engine/systems';
import { Camera3D, CartesianTransform3D, DirectionalLight, EnvironmentLight, Entity, Mesh3D, OrbitControl, SphericalTransform3D, HaiyueEngine, World, createSphere3D, type Geometry3D } from '@haiyue/engine';
import { createRoundedBox3D, createTorus3D } from '@haiyue/engine/geometry';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiButton, GuiElement, GuiLabel } from '@haiyue/engine/gui';
import { requiredItemAt } from '../../shared/collections/arrayAccess';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../../save/SingleSlotGameSave';
import { WarehouseMaterials } from '../rendering/WarehouseMaterials';
import { ActorMotion } from '../rendering/ActorMotion';
import { SokobanAudio } from '../audio/SokobanAudio';
import { resolveMove } from '../rules/move';
import { prepareLevelMap } from '../rules/levels';
import { LEVEL_SET_VERSION, isCompatibleLevel, validSavedBoard } from '../rules/save';

interface LevelDef {
  name: string;
  difficulty: 'beginner' | 'medium' | 'hard';
  source?: { file: string; level: number; collection?: string; author?: string };
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
const WALL_H = 26;
const BOX_SIZE = 28;
const PLAYER_R = 15;
const LEVELS_PER_PAGE = 9;

function keyOf(point: Point): string {
  return `${point.x},${point.y}`;
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
  private keyLight!: DirectionalLight;
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
  private walkable = new Set<string>();
  private targets = new Set<string>();
  private entities: Entity[] = [];
  private history: Snapshot[] = [];
  private readonly materials = new WarehouseMaterials();
  private readonly motion = new ActorMotion();
  private readonly audio = new SokobanAudio();
  private readonly lifetime = new AbortController();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private queuedMove: Point | null = null;
  private arrival: (() => void) | null = null;
  private disposed = false;
  private readonly targetRings = new Map<string, Mesh3D>();
  private geometries = new Map<string, Geometry3D>();
  private completedLevels = new Set<number>();
  private levelsPanelOpen = false;
  private levelsButton!: GuiButton;
  private levelsPanel!: GuiElement;
  private levelsHeader!: GuiButton;
  private levelButtons: GuiButton[] = [];
  private levelsPage = 0;
  private levelsPageText!: GuiLabel;
  private levelsPreviousPage!: GuiButton;
  private levelsNextPage!: GuiButton;


  private hud!: SokobanHud;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new GameEngine({
      canvas,
      clearColor: { r: 0.045, g: 0.105, b: 0.115, a: 1 },
      msaaSamples: 4,
      devicePixelRatio: () => Math.min(devicePixelRatio || 1, 1.5),
    });
    window.addEventListener('pagehide', event => { if (!event.persisted) this.destroy(); }, { signal: this.lifetime.signal });
    await this.engine.init();
    if (this.disposed) return;
    this.world = new World('Sokoban3D');
    this.hud = new SokobanHud(this.engine, this.world, () => this.restart(), () => this.undo(), () => this.changeLevel(-1), () => this.changeLevel(1),
      (x, y) => this.tryMove({ x, y }), () => { this.audio.toggle(); this.hud.soundButton.setText(this.audio.muted ? '音效 关' : '音效 开'); },
      () => this.toggleLevelsPanel(true), () => this.levelIndex === this.levels.length - 1 ? this.toggleLevelsPanel(true) : this.changeLevel(1));
    this.setupCamera(canvas);
    this.setupLights();
    const render3DSystem = new Render3DSystem(this.engine, this.cameraEntity, { priority: 10, loadOp: 'clear' });
    this.world.addSystem(render3DSystem);
    [this.levels] = await Promise.all([this.loadLevels(), this.materials.load()]);
    if (this.disposed) return;
    this.setupGui();
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Sokoban3D.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.bindUi();
    await this.restoreOrStart();
    if (this.disposed) return;
    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    const verify = new URLSearchParams(location.search).has('verify') || new URLSearchParams(location.search).has('gamepadVerify');
    if (verify) (window as Window & { __sokoban?: unknown }).__sokoban = { snapshot: () => this.snapshot(), move: (x: number, y: number) => this.tryMove({ x, y }), undo: () => this.undo(), restart: () => this.restart(), level: (index: number) => this.loadLevel(index) };
    this.engine.run();
  }

  private async loadLevels(): Promise<LevelDef[]> {
    const response = await fetch('./levels.json');
    if (!response.ok) throw new Error(`Failed to load levels.json: ${response.status}`);
    const data = await response.json() as unknown;
    if (!isRecord(data) || !Array.isArray(data.levels) || data.levels.length === 0 || !data.levels.every(isLevelDef)) {
      throw new Error('[SOKOBAN_LEVELS_INVALID] levels.json has no valid levels.');
    }
    return data.levels.map(level => {
      try { return { ...level, map: prepareLevelMap(level.map) }; }
      catch (error) { throw new Error(`[SOKOBAN_LEVEL_INVALID] ${level.name}`, { cause: error }); }
    });
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    const camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4.6, near: 1, far: 10000 });
    this.orbitTransform = new SphericalTransform3D({
      radius: 430,
      theta: -Math.PI * 0.24,
      phi: Math.PI * 0.30,
      target: [0, 0, 0],
    });
    this.cameraEntity = new Entity('Camera');
    this.cameraEntity.addComponent(camera);
    fitPerspectiveCamera(this.engine, this.world, camera, 1.25);
    this.cameraEntity.addComponent(this.orbitTransform);
    this.world.addEntity(this.cameraEntity);
    const orbit = new OrbitControl(canvas, this.orbitTransform, {
      minRadius: 220,
      maxRadius: 6500,
      minPhi: Math.PI * 0.12,
      maxPhi: Math.PI * 0.47,
      enablePan: true,
      rotateSpeed: 0.58,
      zoomSpeed: 0.36,
    });
    this.hud.guardOrbit(orbit, canvas);
    this.engine.on('resize', () => { if (this.width > 0) this.centerCamera(); });
  }

  private setupLights(): void {
    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [1, .95, .85], intensity: 0.6 }));
    this.world.addEntity(ambient);
    const key = new Entity('KeyLight');
    this.keyLight = new DirectionalLight({ color: [1, 0.94, 0.78], intensity: 2.2, direction: [-0.42, -1, -0.35], castShadow: true, shadow: { mapSize: 1024, extent: 400, far: 1500, bias: .001, normalBias: .3 } });
    key.addComponent(this.keyLight);
    this.world.addEntity(key);
    const fill = new Entity('FillLight');
    fill.addComponent(new DirectionalLight({ color: [0.66, 0.78, 1], intensity: 0.45, direction: [0.58, -0.72, 0.34] }));
    this.world.addEntity(fill);
    this.world.addEntity(new Entity('Warehouse sky fill').addComponent(new EnvironmentLight({ intensity: .75, diffuseColor: [.7, .88, .9], specularColor: [.65, .8, .82] })));
  }

  private setupGui(): void {
    const guiRoot = this.hud.root;
    this.levelsButton = guiRoot.add(new GuiButton({
      id: 'sokoban-levels',
      x: '100%',
      y: 18,
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
    const panelWidth = 336;
    const panelHeight = 268;
    this.levelsPanel = guiRoot.add(new GuiElement({
      id: 'sokoban-levels-panel',
      width: panelWidth,
      height: panelHeight,
      visible: false,
      style: {
        backgroundColor: 'rgba(16,42,44,0.97)',
        borderColor: '#708c79',
        radius: 16,
        padding: 12,
      },
    }));
    this.levelsPanel.layout = parentRect => {
      const scale = Math.min(1, Math.max(1, parentRect.width - 24) / panelWidth, Math.max(1, parentRect.height - 24) / panelHeight);
      this.levelsPanel.rect = {
        x: Math.max(8, parentRect.width - panelWidth * scale - 14),
        y: Math.max(12, Math.min(80, parentRect.height - panelHeight * scale - 12)),
        width: panelWidth * scale,
        height: panelHeight * scale,
      };
      for (const child of this.levelsPanel.children) {
        child.layout({ x: 0, y: 0, width: panelWidth, height: panelHeight });
        child.rect.x = this.levelsPanel.rect.x + child.rect.x * scale; child.rect.y = this.levelsPanel.rect.y + child.rect.y * scale;
        child.rect.width *= scale; child.rect.height *= scale;
      }
    };

    this.levelsHeader = this.levelsPanel.add(new GuiButton({
      id: 'sokoban-levels-close',
      x: 12,
      y: 12,
      width: 312,
      height: 38,
      text: 'Choose a level',
      onClick: () => this.toggleLevelsPanel(false),
      style: { backgroundColor: '#33574e', borderColor: '#63846d' },
    }));

    this.levelButtons = Array.from({ length: LEVELS_PER_PAGE }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return this.levelsPanel.add(new GuiButton({
        id: 'sokoban-level-slot-' + index,
        x: 12 + column * 106,
        y: 58 + row * 48,
        width: 100,
        height: 42,
        text: String(index + 1),
        onClick: () => this.selectLevel(this.levelsPage * LEVELS_PER_PAGE + index),
        style: { fontSize: 13, padding: 0, radius: 9 },
      }));
    });
    this.levelsPreviousPage = this.levelsPanel.add(new GuiButton({ id: 'sokoban-levels-prev-page', x: 12, y: 214, width: 100, height: 42,
      text: '← 上一页', onClick: () => this.changeLevelsPage(-1), style: { fontSize: 13, padding: 0, radius: 9 } }));
    this.levelsPageText = this.levelsPanel.add(new GuiLabel({ id: 'sokoban-levels-page', x: 118, y: 214, width: 100, height: 42,
      textAlign: 'center', fontSize: 14, style: { color: '#c9d8d0', padding: 0 } }));
    this.levelsNextPage = this.levelsPanel.add(new GuiButton({ id: 'sokoban-levels-next-page', x: 224, y: 214, width: 100, height: 42,
      text: '下一页 →', onClick: () => this.changeLevelsPage(1), style: { fontSize: 13, padding: 0, radius: 9 } }));
    this.syncLevelGui();
  }

  private toggleLevelsPanel(open = !this.levelsPanelOpen): void {
    if (open) { this.hud.victory.hide(); this.levelsPage = Math.floor(this.levelIndex / LEVELS_PER_PAGE); }
    this.levelsPanelOpen = open;
    this.levelsPanel.setVisible(open);
    this.syncLevelGui();
  }

  private changeLevelsPage(delta: number): void {
    this.levelsPage = Math.max(0, Math.min(Math.ceil(this.levels.length / LEVELS_PER_PAGE) - 1, this.levelsPage + delta));
    this.syncLevelGui();
  }

  private selectLevel(index: number): void {
    this.toggleLevelsPanel(false);
    this.loadLevel(index);
  }

  private syncLevelGui(): void {
    if (!this.levelsButton || !this.levelsPanel) return;
    this.levelsButton.setText(`选关 ${this.completedLevels.size}/${this.levels.length} ${this.levelsPanelOpen ? '-' : '+'}`);
    this.levelsHeader.setText(`选择关卡 · 已完成 ${this.completedLevels.size}/${this.levels.length}`);
    const pages = Math.ceil(this.levels.length / LEVELS_PER_PAGE);
    this.levelsPageText.setText(`${this.levelsPage + 1} / ${pages}`);
    this.levelsPreviousPage.setDisabled(this.levelsPage === 0);
    this.levelsNextPage.setDisabled(this.levelsPage === pages - 1);
    this.levelButtons.forEach((button, slot) => {
      const index = this.levelsPage * LEVELS_PER_PAGE + slot;
      button.setVisible(index < this.levels.length);
      if (index >= this.levels.length) return;
      const completed = this.completedLevels.has(index);
      const current = index === this.levelIndex;
      const difficulty = requiredItemAt(this.levels, index, 'Sokoban levels').difficulty;
      const difficultyLabel = difficulty === 'beginner' ? '入门' : difficulty === 'medium' ? '进阶' : '挑战';
      button.setText(completed ? `OK ${index + 1}` : `${current ? '> ' : ''}${difficultyLabel}${index + 1}`);
      button.setStyle({
        backgroundColor: completed ? '#15803d' : current ? '#765d33' : 'rgba(35,70,72,0.96)',
        borderColor: completed ? '#4ade80' : current ? '#dfc38e' : '#5e7d70',
      });
    });
  }

  private bindUi(): void {
    const options = { signal: this.lifetime.signal };
    window.addEventListener('keydown', event => { this.audio.unlock(); this.handleKey(event); }, options);
    window.addEventListener('pointerdown', () => this.audio.unlock(), { ...options, capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.audio.stop(); }, options);
  }

  private loadLevel(index: number, save = true): void {
    this.hud.victory.hide(); this.toggleLevelsPanel(false);
    this.motion.clear(); this.queuedMove = null; this.arrival = null; this.audio.stop();
    this.targetRings.clear();
    this.clearScene();
    this.levelIndex = (index + this.levels.length) % this.levels.length;
    this.moves = 0;
    this.history = [];
    this.boxes = [];
    this.walkable.clear();
    this.targets.clear();

    const level = requiredItemAt(this.levels, this.levelIndex, 'Sokoban levels');
    this.height = level.map.length;
    this.width = Math.max(...level.map.map(row => row.length));
    this.keyLight.shadow.extent = Math.max(400, Math.max(this.width, this.height) * TILE * .8);
    this.keyLight.shadow.far = Math.max(1500, this.keyLight.shadow.extent * 4);
    this.keyLight.markDirty();
    this.hud.subtitleText.setText(level.source?.collection === 'Sasquatch III'
      ? `SASQUATCH III ${String(level.source.level).padStart(2, '0')}/50 · DAVID W. SKINNER` : 'THE LITTLE WAREHOUSE');
    this.addPlatform();

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = requiredItemAt(level.map, y, 'Sokoban level rows').charAt(x) || ' ';
        if (cell === '_') continue;
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
    this.addPlayerModel(this.playerEntity);
    this.world.addEntity(this.playerEntity);
    this.entities.push(this.playerEntity);

    this.centerCamera();
    this.syncActors();
    this.updateHud();
    this.syncLevelGui();
    this.hud.messageText.setText('方向键移动 · 把货箱推入光环');
    if (save) this.saveState();
  }

  private async restoreOrStart(): Promise<void> {
    const saved = await this.saves.load();
    if (this.disposed) return;
    if (!saved || saved.levelIndex >= this.levels.length) {
      this.loadLevel(0);
      return;
    }
    const savedCompletedLevels = saved.completedLevels ?? [];
    this.completedLevels = new Set(savedCompletedLevels.filter(index => (
      index < this.levels.length
      && isCompatibleLevel(index, saved.levelSetVersion)
    )));
    this.loadLevel(saved.levelIndex, false);
    if (!isCompatibleLevel(saved.levelIndex, saved.levelSetVersion)
      || !validSavedBoard(saved.player, saved.boxes, this.boxes.length, this.walkable)) {
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
    if (this.solved()) { this.completedLevels.add(this.levelIndex); this.showVictory(); }
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
    for (const entity of this.entities) { this.world.removeEntity(entity); entity.destroy(); }
    this.entities = [];
  }

  private addFloorTile(x: number, y: number): void {
    this.addBoxEntity('Limestone floor', x, FLOOR_H * 0.5, y, TILE - 1.1, FLOOR_H, TILE - 1.1, this.materials.get((x + y) % 2 === 0 ? 'floor' : 'floorAlt'));
  }

  private addWall(x: number, y: number): void {
    this.addBoxEntity('Sandstone wall', x, FLOOR_H + WALL_H * 0.5, y, TILE - .7, WALL_H, TILE - .7, this.materials.get('wall'));
    this.addBoxEntity('Sandstone coping', x, FLOOR_H + WALL_H + 1.5, y, TILE * .96, 3, TILE * .96, this.materials.get('cap'));
  }

  private addTarget(x: number, y: number): void {
    this.targets.add(keyOf({ x, y }));
    let geometry = this.geometries.get('target-ring');
    if (!geometry) { geometry = createTorus3D({ radius: 13, tube: 1.3, radialSegments: 8, tubularSegments: 32 }); this.geometries.set('target-ring', geometry); }
    const ring = new Entity('Delivery target').addComponent(new CartesianTransform3D({ position: this.worldPosition(x, y, FLOOR_H + 1.8) }));
    const mesh = new Mesh3D(geometry, this.materials.get('target')); ring.addComponent(mesh);
    this.world.addEntity(ring); this.entities.push(ring); this.targetRings.set(keyOf({ x, y }), mesh);
    this.addBoxEntity('Delivery center', x, FLOOR_H + .5, y, 9, .8, 9, this.materials.get('target'));
  }

  private addBox(x: number, y: number): void {
    const entity = new Entity('Crate');
    const transform = new CartesianTransform3D({ position: this.worldPosition(x, y, FLOOR_H + BOX_SIZE * 0.5) });
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(
      this.boxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE, BOX_SIZE * 0.15, 5),
      this.materials.crate(this.boxes.length),
    ));
    this.world.addEntity(entity);
    this.entities.push(entity);
    this.boxes.push({ id: `${x},${y},${this.boxes.length}`, pos: { x, y }, entity, transform });
  }

  private addBoxEntity(name: string, gridX: number, y: number, gridY: number, width: number, height: number, depth: number, material: PbrMaterial): Entity {
    const entity = new Entity(name);
    const [x, _y, z] = this.worldPosition(gridX, gridY, y);
    entity.addComponent(new CartesianTransform3D({ position: [x, y, z] }));
    entity.addComponent(new Mesh3D(
      this.boxGeometry(width, height, depth),
      material,
    ));
    this.world.addEntity(entity);
    this.entities.push(entity);
    return entity;
  }

  private handleKey(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (this.hud.victory.visible) {
      if (!event.repeat && key === 'r') this.restart();
      if (!event.repeat && key === 'z') this.undo();
      return;
    }
    if (event.repeat && !['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) return;
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
      this.tryMove(dirs[key], !event.repeat);
      event.preventDefault();
      return;
    }
    if (key === 'z') this.undo();
    if (key === 'r') this.restart();
    if (key === '[') this.changeLevel(-1);
    if (key === ']') this.changeLevel(1);
    if (key === 'm') { this.audio.toggle(); this.hud.soundButton.setText(this.audio.muted ? '音效 关' : '音效 开'); }
  }

  private tryMove(dir: Point, buffer = true): void {
    if (this.disposed || this.levelsPanelOpen || this.hud.victory.visible) return;
    if (this.motion.busy) { if (buffer) this.queuedMove = { ...dir }; return; }
    const result = resolveMove(this.player, this.boxes.map(box => box.pos), this.walkable, dir);
    if (result.kind === 'blocked') {
      this.motion.bump(this.playerTransform, dir.x, dir.y, this.reducedMotion.matches); this.audio.play('blocked'); return;
    }
    const wasSolved = this.solved(), box = this.boxes[result.boxIndex], enteredTarget = result.box && this.targets.has(keyOf(result.box)) && box && !this.targets.has(keyOf(box.pos));
    this.pushHistory();
    if (box && result.box) box.pos = result.box;
    this.player = result.player;
    this.moves++;
    this.syncActors(true);
    this.audio.play(result.kind === 'push' ? 'push' : 'step');
    this.updateHud();
    const won = this.solved() && !wasSolved;
    if (won) {
      this.completedLevels.add(this.levelIndex);
      this.syncLevelGui();
      this.hud.messageText.setText(`全部归位！${this.moves} 步完成`);
    }
    this.arrival = () => {
      this.updateActorMaterials();
      if (won) { this.audio.play('win'); this.showVictory(); }
      else if (enteredTarget) this.audio.play('target');
    };
    if (!this.motion.busy) { this.arrival(); this.arrival = null; }
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
    this.hud.victory.hide();
    this.motion.clear(); this.queuedMove = null; this.arrival = null; this.audio.stop();
    const snapshot = this.history.pop();
    if (!snapshot) { if (this.playerTransform) this.syncActors(); return; }
    this.player = { ...snapshot.player };
    this.moves = snapshot.moves;
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i];
      const position = snapshot.boxes[i];
      if (box && position) box.pos = { ...position };
    }
    this.syncActors(true); this.audio.play('undo');
    this.arrival = () => this.updateActorMaterials();
    this.updateHud();
    this.hud.messageText.setText('已撤销一步');
    this.saveState();
  }

  private restart(): void {
    this.loadLevel(this.levelIndex);
    this.audio.play('restart');
  }

  private changeLevel(delta: number): void {
    this.loadLevel(this.levelIndex + delta);
    this.audio.play('restart');
  }

  private syncActors(animate = false): void {
    const reduced = !animate || this.reducedMotion.matches;
    this.motion.slide(this.playerTransform, this.worldPosition(this.player.x, this.player.y, PLAYER_R + FLOOR_H), true, reduced);
    for (const box of this.boxes) {
      this.motion.slide(box.transform, this.worldPosition(box.pos.x, box.pos.y, FLOOR_H + BOX_SIZE * .5), false, reduced);
    }
    if (!animate || !this.motion.busy) this.updateActorMaterials();
  }

  private updateActorMaterials(): void {
    for (const box of this.boxes) {
      const mesh = box.entity.getComponent(Mesh3D);
      if (mesh?.material instanceof PbrMaterial) {
        mesh.material.baseColor = this.materials.get(this.targets.has(keyOf(box.pos)) ? 'crateDone' : 'crate').baseColor;
      }
    }
    for (const [key, ring] of this.targetRings) ring.material = this.materials.get(this.boxes.some(box => keyOf(box.pos) === key) ? 'targetDone' : 'target');
  }

  private tick(time: number, delta: number): void {
    this.motion.update(time, Math.min(50, delta));
    if (!this.motion.busy) {
      const arrival = this.arrival; this.arrival = null; arrival?.();
      const queued = this.queuedMove; this.queuedMove = null; if (queued) this.tryMove(queued);
    }
    this.world.update(time, delta);
  }

  private solved(): boolean {
    return this.boxes.every(box => this.targets.has(keyOf(box.pos)));
  }

  private showVictory(): void {
    this.queuedMove = null;
    this.toggleLevelsPanel(false);
    this.hud.victory.showResult({ level: this.levelIndex + 1, total: this.levels.length,
      name: requiredItemAt(this.levels, this.levelIndex, 'Sokoban levels').name,
      moves: this.moves, completed: this.completedLevels.size });
    this.hud.system.focus.focus(this.hud.victory.nextButton);
  }

  private updateHud(): void {
    const onTargets = this.boxes.filter(box => this.targets.has(keyOf(box.pos))).length;
    this.hud.levelText.setText(`${this.levelIndex + 1} / ${this.levels.length}`);
    this.hud.movesText.setText(String(this.moves));
    this.hud.boxesText.setText(`${onTargets} / ${this.boxes.length}`);
  }

  private centerCamera(): void {
    const centerX = (this.width - 1) * 0.5;
    const centerY = (this.height - 1) * 0.5;
    const [x, _y, z] = this.worldPosition(centerX, centerY, 0);
    this.orbitTransform.setTarget(x, 16, z);
    const toolbarSpace = Math.max(1, (this.engine.displayHeight < 500 ? 600 : 720) / Math.max(320, this.engine.displayHeight));
    this.orbitTransform.set(Math.max(390, Math.max(this.width, this.height) * 74) * toolbarSpace, -Math.PI * 0.23, Math.PI * 0.23);
  }

  private worldPosition(gridX: number, gridY: number, y: number): [number, number, number] {
    return [
      (gridX - (this.width - 1) * 0.5) * TILE,
      y,
      (gridY - (this.height - 1) * 0.5) * TILE,
    ];
  }

  private boxGeometry(width: number, height: number, depth: number, radius = Math.min(1.8, height * .2), segments = 2): Geometry3D {
    const key = `box:${width}:${height}:${depth}:${radius}:${segments}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = createRoundedBox3D({ width, height, depth, radius, segments });
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

  private addPlatform(): void {
    this.addBoxEntity('Floating warehouse plinth', (this.width - 1) / 2, -6, (this.height - 1) / 2, this.width * TILE + 10, 16, this.height * TILE + 10, this.materials.get('base'));
    this.addBoxEntity('Oak plinth rim', (this.width - 1) / 2, -14, (this.height - 1) / 2, this.width * TILE + 6, 4, this.height * TILE + 6, this.materials.get('trim'));
  }

  private addPlayerModel(root: Entity): void {
    const part = (name: string, position: [number, number, number], geometry: Geometry3D, material: PbrMaterial) => root.addChild(new Entity(name).addComponent(new CartesianTransform3D({ position })).addComponent(new Mesh3D(geometry, material)));
    part('Worker teal jacket', [0, -3, 0], this.boxGeometry(18, 18, 15), this.materials.get('body'));
    part('Worker helmet', [0, 10, 0], this.sphereGeometry(11, 24, 12), this.materials.get('helmet'));
    part('Worker face visor', [0, 10, 10.3], this.boxGeometry(14, 7, 3), this.materials.get('visor'));
    part('Worker left boot', [-5, -12, 2], this.boxGeometry(7, 5, 11), this.materials.get('boots'));
    part('Worker right boot', [5, -12, 2], this.boxGeometry(7, 5, 11), this.materials.get('boots'));
    part('Worker left glove', [-11, -3, 2], this.sphereGeometry(3.6, 12, 8), this.materials.get('helmet'));
    part('Worker right glove', [11, -3, 2], this.sphereGeometry(3.6, 12, 8), this.materials.get('helmet'));
  }

  private snapshot() {
    return { ready: true, levelIndex: this.levelIndex, moves: this.moves, player: { ...this.player }, playerPosition: [...this.playerTransform.position], boxes: this.boxes.map(box => {
      const material = box.entity.getComponent(Mesh3D)?.material;
      return { pos: { ...box.pos }, position: [...box.transform.position], materialId: material?.id,
        tint: material instanceof PbrMaterial ? [...material.baseColor.writeSRGB(new Float32Array(4))] : [] };
    }),
      animating: this.motion.busy, queued: this.queuedMove, solved: this.solved(), history: this.history.length, materials: this.materials.snapshot(), audio: this.audio.snapshot(), entities: this.entities.length, reducedMotion: this.reducedMotion.matches,
      levelCount: this.levels.length, levelName: requiredItemAt(this.levels, this.levelIndex, 'Sokoban levels').name,
      board: { width: this.width, height: this.height, walkable: this.walkable.size },
      completedLevels: [...this.completedLevels].sort((a, b) => a - b), victoryVisible: this.hud.victory.visible, levelsPanelOpen: this.levelsPanelOpen, levelsPage: this.levelsPage };
  }

  private destroy(): void {
    if (this.disposed) return; this.disposed = true;
    this.lifetime.abort(); this.motion.clear(); this.queuedMove = null; this.arrival = null;
    this.audio.dispose(); this.world?.destroy(); this.materials.dispose(); this.engine?.destroy();
    delete (window as Window & { __sokoban?: unknown }).__sokoban;
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new Sokoban3DGame().init(canvas).catch(error => {
  console.error(error);
  const message = document.getElementById('message');
  if (message) message.textContent = error instanceof Error ? error.message : String(error);
});
