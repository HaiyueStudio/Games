import {
  Camera3D,
  CartesianTransform3D,
  DirectionalLight,
  Entity,
  HaiyueEngine,
  Mesh3D,
  SphericalTransform3D,
  World,
} from '@haiyue/engine';
import {
  createRoundedBox3D,
} from '@haiyue/engine/geometry';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import {
  BlinnPhongRenderSystem,
  Line3DRenderSystem,
  Particle3DRenderSystem,
  Particle3DSystem,
  Render3DSystem,
} from '@haiyue/engine/systems';
import {
  MATCH3_COLUMNS,
  MATCH3_KIND_COUNT,
  MATCH3_ROWS,
  createPlayableGemGrid,
  decodeGridIndex,
  findGemMatches,
  findLegalGemSwap,
  getGem,
  type GemGrid,
  type GemKind,
  type GridPosition,
} from './Match3Board';
import { Match3ShardEffect } from './Match3ShardEffect';
import { Match3ExplosionEffect } from './Match3ExplosionEffect';
import {
  MATCH3_LIGHTNING_DURATION_MS,
  Match3LightningEffect,
  type LightningTarget,
} from './Match3LightningEffect';
import {
  countSpecialTiles,
  expandTriggeredSpecials,
  findRainbowSwap,
  planMatchedClear,
  planSpecialSwap,
  type MatchClearPlan,
  type SpecialGrid,
  type SpecialSpawn,
  type SpecialSwapPlan,
  type TileSpecial,
} from './Match3SpecialRules';
import { Match3TilePresentation } from './Match3TilePresentation';

type GamePhase = 'idle' | 'swapping' | 'reverting' | 'channeling' | 'arming' | 'clearing' | 'falling';

interface Tile {
  readonly id: number;
  kind: GemKind | null;
  special: TileSpecial;
  row: number;
  column: number;
  readonly entity: Entity;
  readonly transform: CartesianTransform3D;
  readonly mesh: Mesh3D;
  displayX: number;
  displayY: number;
  displayZ: number;
  displayScale: number;
}

interface PointerGesture {
  readonly pointerId: number;
  readonly originTile: Tile;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly deselectOnTap: boolean;
  committed: boolean;
}

interface Match3Snapshot {
  readonly phase: GamePhase;
  readonly score: number;
  readonly moves: number;
  readonly cascade: number;
  readonly tileCount: number;
  readonly shardCount: number;
  readonly explosionParticleCount: number;
  readonly lightningTargetCount: number;
  readonly grid: SpecialGrid;
  readonly matches: number;
  readonly legalMove: readonly [GridPosition, GridPosition] | null;
  readonly specials: Readonly<Record<'bomb' | 'rainbow' | 'super-bomb', number>>;
}

interface Match3DebugApi {
  snapshot(): Match3Snapshot;
  select(row: number, column: number): void;
  playLegalMove(): boolean;
  restart(): void;
}

declare global {
  interface Window {
    __match3?: Match3DebugApi;
  }
}

const TILE_SIZE = 0.86;
const TILE_DEPTH = 0.42;
const CELL_STEP = 1.02;
const CAMERA_FOV = Math.PI / 4.25;
const CLEAR_DELAY_MS = 150;
const MAX_SHARD_PARTICLES_PER_CLEAR = 576;
const MOVE_EPSILON = 0.008;
const BOARD_TOP_Y = ((MATCH3_ROWS - 1) * CELL_STEP) / 2;
const BOARD_HALF_WIDTH = ((MATCH3_COLUMNS - 1) * CELL_STEP + TILE_SIZE) / 2 + 0.34;
const BOARD_HALF_HEIGHT = ((MATCH3_ROWS - 1) * CELL_STEP + TILE_SIZE) / 2 + 0.34;

class Match3Game {
  private readonly regression = new URLSearchParams(location.search).get('regression') === '1';
  private regressionRandomState = 0x7f4a7c15;
  private readonly random = (): number => {
    if (!this.regression) return Math.random();
    this.regressionRandomState = (Math.imul(this.regressionRandomState, 1664525) + 1013904223) >>> 0;
    return this.regressionRandomState / 0x1_0000_0000;
  };
  private engine!: HaiyueEngine;
  private world!: World;
  private cameraTransform!: SphericalTransform3D;
  private readonly board: Array<Array<Tile | null>> = Array.from(
    { length: MATCH3_ROWS },
    () => Array<Tile | null>(MATCH3_COLUMNS).fill(null),
  );
  private shardEffect!: Match3ShardEffect;
  private explosionEffect!: Match3ExplosionEffect;
  private lightningEffect!: Match3LightningEffect;
  private lightningRenderSystem!: Line3DRenderSystem;
  private tilePresentation!: Match3TilePresentation;
  private canvas!: HTMLCanvasElement;
  private phase: GamePhase = 'idle';
  private phaseElapsedMs = 0;
  private selected: Tile | null = null;
  private pointerGesture: PointerGesture | null = null;
  private pendingSwap: readonly [Tile, Tile] | null = null;
  private pendingArmedClear: Set<number> | null = null;
  private pendingArmedSpecial: 'bomb' | 'super-bomb' | null = null;
  private pendingRainbowClear: Set<number> | null = null;
  private nextTileId = 1;
  private score = 0;
  private moves = 0;
  private cascade = 0;
  private cameraDistance = 12;
  private fittedWidth = 0;
  private fittedHeight = 0;
  private validationFrames = 0;
  private validationFinished = false;
  private readonly validationErrors: string[] = [];

  private readonly scoreText = query<HTMLElement>('#score');
  private readonly movesText = query<HTMLElement>('#moves');
  private readonly cascadeText = query<HTMLElement>('#cascade');
  private readonly messageText = query<HTMLElement>('#message');
  private readonly resultText = query<HTMLElement>('#result');

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.018, g: 0.025, b: 0.056, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    this.engine.device.addEventListener('uncapturederror', event => {
      this.validationErrors.push(event.error.message);
    });
    this.engine.device.pushErrorScope('validation');

    this.world = new World('Match3');
    this.setupCamera();
    this.setupLights();
    this.setupRenderer();
    this.setupGeometryAndMaterials();
    this.createBoardBackdrop();
    this.bindInput();
    this.restart();

    window.__match3 = {
      snapshot: () => this.snapshot(),
      select: (row, column) => this.selectCell(row, column),
      playLegalMove: () => this.playLegalMove(),
      restart: () => this.restart(),
    };

    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private setupCamera(): void {
    const cameraEntity = new Entity('Camera');
    cameraEntity.addComponent(new Camera3D({
      type: 'perspective',
      fov: CAMERA_FOV,
      near: 0.1,
      far: 100,
    }));
    this.cameraTransform = new SphericalTransform3D({
      radius: this.cameraDistance,
      theta: 0,
      phi: Math.PI / 2,
      target: [0, 0, 0],
    });
    cameraEntity.addComponent(this.cameraTransform);
    this.world.addEntity(cameraEntity);

    const render3DSystem = new Render3DSystem(this.engine, cameraEntity, {
      priority: 10,
      loadOp: 'clear',
      msaaSamples: 4,
    });
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, cameraEntity, {
      priority: -1,
      render3DSystem,
    }));
    this.world.addSystem(render3DSystem);
    this.lightningRenderSystem = new Line3DRenderSystem(this.engine, cameraEntity, {
      loadOp: 'load',
      msaaSamples: 4,
    });
    this.lightningRenderSystem.priority = 15;
    this.world.addSystem(this.lightningRenderSystem);
    this.world.addSystem(new Particle3DSystem({ maxDeltaSeconds: 0.1, priority: -10 }));
    this.world.addSystem(new Particle3DRenderSystem(this.engine, cameraEntity, {
      loadOp: 'load',
      priority: 20,
    }));
  }

  private setupRenderer(): void {
    const integration = new RenderIntegration(this.engine, { label: 'Match3.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private setupLights(): void {
    const ambient = new Entity('AmbientLight');
    ambient.addComponent(new AmbientLight({ color: [0.72, 0.80, 1], intensity: 0.62 }));
    this.world.addEntity(ambient);

    const key = new Entity('KeyLight');
    key.addComponent(new DirectionalLight({
      color: [1, 0.94, 0.84],
      intensity: 1.9,
      direction: [-0.42, -0.76, -0.55],
    }));
    this.world.addEntity(key);

    const rim = new Entity('RimLight');
    rim.addComponent(new DirectionalLight({
      color: [0.35, 0.62, 1],
      intensity: 0.68,
      direction: [0.68, 0.28, -0.52],
    }));
    this.world.addEntity(rim);
  }

  private setupGeometryAndMaterials(): void {
    this.tilePresentation = new Match3TilePresentation(TILE_SIZE, TILE_DEPTH);
    this.shardEffect = new Match3ShardEffect(this.world, TILE_SIZE, TILE_DEPTH);
    this.explosionEffect = new Match3ExplosionEffect(this.world);
    this.lightningEffect = new Match3LightningEffect(this.world, this.lightningRenderSystem);
  }

  private createBoardBackdrop(): void {
    const backdrop = new Entity('BoardBackdrop');
    backdrop.addComponent(new CartesianTransform3D({ position: [0, 0, -0.43] }));
    backdrop.addComponent(new Mesh3D(
      createRoundedBox3D({
        width: BOARD_HALF_WIDTH * 2,
        height: BOARD_HALF_HEIGHT * 2,
        depth: 0.38,
        radius: 0.22,
        segments: 4,
      }),
      new BlinnPhongMaterial({
        ambient: [0.015, 0.025, 0.07, 1],
        diffuse: [0.035, 0.07, 0.15, 1],
        specular: [0.18, 0.34, 0.62, 1],
        shininess: 54,
      }),
    ));
    this.world.addEntity(backdrop);
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || this.phase !== 'idle') return;
      const position = this.pointerToCell(event);
      if (!position) return;
      const pressedTile = this.tileAt(position.row, position.column);
      if (!pressedTile) return;

      const deselectOnTap = this.selected === pressedTile;
      if (!deselectOnTap) this.selectCell(position.row, position.column);
      // Selecting a second adjacent tile starts a normal click swap immediately.
      if (this.phase !== 'idle' || this.selected !== pressedTile) return;

      this.pointerGesture = {
        pointerId: event.pointerId,
        originTile: pressedTile,
        startClientX: event.clientX,
        startClientY: event.clientY,
        deselectOnTap,
        committed: false,
      };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.dataset.dragging = 'true';
      event.preventDefault();
    });
    this.canvas.addEventListener('pointermove', event => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerup', event => this.finishPointerGesture(event, false));
    this.canvas.addEventListener('pointercancel', event => this.finishPointerGesture(event, true));
    query<HTMLButtonElement>('#restart').addEventListener('click', () => this.restart());
    window.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 'r') this.restart();
    });
  }

  private tick(timeMs: number, deltaMs: number): void {
    this.fitCamera();
    const tilesSettled = this.updateTiles(timeMs, deltaMs);
    this.tilePresentation.update(timeMs);
    this.shardEffect.update(deltaMs);
    this.explosionEffect.update();
    this.lightningEffect.update(deltaMs);

    if ((this.phase === 'swapping' || this.phase === 'reverting' || this.phase === 'falling') && tilesSettled) {
      this.handleMovementComplete();
    } else if (this.phase === 'arming' || this.phase === 'channeling') {
      this.phaseElapsedMs += deltaMs;
      if (this.phaseElapsedMs >= MATCH3_LIGHTNING_DURATION_MS) this.finishRainbowActivation();
    } else if (this.phase === 'clearing') {
      this.phaseElapsedMs += deltaMs;
      if (this.phaseElapsedMs >= CLEAR_DELAY_MS) this.collapseAndRefill();
    }

    this.world.update(timeMs, deltaMs);
    document.body.dataset.phase = this.phase;
    document.body.dataset.shardCount = String(this.shardEffect.particleCount);
    document.body.dataset.explosionParticleCount = String(this.explosionEffect.particleCount);
    document.body.dataset.explosionEmitterCount = String(this.explosionEffect.emitterCount);
    document.body.dataset.lightningTargetCount = String(this.lightningEffect.activeTargetCount);
    document.body.dataset.lightningSegmentCount = String(this.lightningEffect.activeSegmentCount);
    if (!this.validationFinished && ++this.validationFrames >= 18) {
      this.validationFinished = true;
      void this.finishValidation();
    }
  }

  private selectCell(row: number, column: number): void {
    if (this.phase !== 'idle') return;
    const tile = this.tileAt(row, column);
    if (!tile) return;
    if (!this.selected) {
      this.selected = tile;
      this.messageText.textContent = '点击相邻方块，或按住向相邻方向滑动';
      return;
    }
    if (this.selected === tile) {
      this.selected = null;
      this.messageText.textContent = '点击相邻方块，或按住滑动来交换位置';
      return;
    }
    const distance = Math.abs(this.selected.row - tile.row) + Math.abs(this.selected.column - tile.column);
    if (distance !== 1) {
      this.selected = tile;
      this.messageText.textContent = '已改选方块；请选择它的相邻方块';
      return;
    }

    this.beginSwap(this.selected, tile);
  }

  private handlePointerMove(event: PointerEvent): void {
    const gesture = this.pointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.committed || this.phase !== 'idle') return;
    if (this.selected !== gesture.originTile) return;

    const deltaX = event.clientX - gesture.startClientX;
    const deltaY = event.clientY - gesture.startClientY;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < this.dragThresholdPixels()) return;

    const rowDelta = Math.abs(deltaY) > Math.abs(deltaX) ? Math.sign(deltaY) : 0;
    const columnDelta = rowDelta === 0 ? Math.sign(deltaX) : 0;
    const targetRow = gesture.originTile.row + rowDelta;
    const targetColumn = gesture.originTile.column + columnDelta;
    const targetTile = this.tileAt(targetRow, targetColumn);
    if (!targetTile) return;

    gesture.committed = true;
    this.beginSwap(gesture.originTile, targetTile);
    event.preventDefault();
  }

  private finishPointerGesture(event: PointerEvent, cancelled: boolean): void {
    const gesture = this.pointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!cancelled && !gesture.committed && gesture.deselectOnTap
      && this.phase === 'idle' && this.selected === gesture.originTile) {
      this.selected = null;
      this.messageText.textContent = '点击相邻方块，或按住滑动来交换位置';
    }
    this.resetPointerGesture();
  }

  private resetPointerGesture(): void {
    const gesture = this.pointerGesture;
    this.pointerGesture = null;
    delete this.canvas.dataset.dragging;
    if (gesture && this.canvas.hasPointerCapture(gesture.pointerId)) {
      this.canvas.releasePointerCapture(gesture.pointerId);
    }
  }

  private dragThresholdPixels(): number {
    const rect = this.canvas.getBoundingClientRect();
    const halfHeight = Math.tan(CAMERA_FOV / 2) * this.cameraDistance;
    const pixelsPerCell = halfHeight > 0 ? CELL_STEP * rect.height / (halfHeight * 2) : 0;
    return Math.max(12, Math.min(36, pixelsPerCell * 0.28));
  }

  private beginSwap(first: Tile, second: Tile): void {
    this.selected = null;
    this.pendingSwap = [first, second];
    this.swapTilePositions(first, second);
    this.phase = 'swapping';
    this.messageText.textContent = '交换中…';
  }

  private handleMovementComplete(): void {
    if (this.phase === 'swapping') {
      const swap = this.pendingSwap;
      if (!swap) throw new Error('Match-3 swap transaction lost its tile pair.');
      const preferredSpawns = [tilePosition(swap[0]), tilePosition(swap[1])] as const;
      const specialSwap = planSpecialSwap(this.toSpecialGrid(), preferredSpawns[0], preferredSpawns[1]);
      if (specialSwap) {
        this.moves++;
        this.cascade = 1;
        this.pendingSwap = null;
        this.activateSpecialSwap(specialSwap);
        return;
      }

      const plan = planMatchedClear(this.toSpecialGrid(), preferredSpawns);
      if (plan.matchedCellCount === 0) {
        this.swapTilePositions(swap[0], swap[1]);
        this.phase = 'reverting';
        this.messageText.textContent = '没有形成三连，交换已撤销';
        return;
      }
      this.moves++;
      this.cascade = 1;
      this.pendingSwap = null;
      this.beginMatchClear(plan);
      return;
    }

    if (this.phase === 'reverting') {
      this.pendingSwap = null;
      this.phase = 'idle';
      this.messageText.textContent = '点击相邻方块，或按住滑动来交换位置';
      this.updateHud();
      return;
    }

    if (this.phase === 'falling') {
      const plan = planMatchedClear(this.toSpecialGrid());
      if (plan.matchedCellCount > 0) {
        this.cascade++;
        this.beginMatchClear(plan);
        return;
      }
      this.cascade = 0;
      this.phase = 'idle';
      if (!this.findPlayableMove()) {
        this.rebuildBoard('没有可行交换，棋盘已自动洗牌');
      } else {
        this.messageText.textContent = '点击相邻方块，或按住滑动来交换位置';
      }
      this.updateHud();
    }
  }

  private beginMatchClear(plan: MatchClearPlan): void {
    const clear = expandTriggeredSpecials(this.toSpecialGrid(), plan.clear);
    for (const spawn of plan.spawns) {
      clear.delete(spawn.position.row * MATCH3_COLUMNS + spawn.position.column);
      this.applySpecialSpawn(spawn);
    }
    const generated = plan.spawns.map(spawn => specialLabel(spawn.special));
    const message = generated.length > 0 ? `生成${generated.join('、')}！` : undefined;
    this.beginClear(clear, message, plan.spawns.length);
  }

  private activateSpecialSwap(plan: SpecialSwapPlan): void {
    this.startRainbowLightning(plan);
    if (plan.conversion) {
      for (const index of plan.conversion.indexes) {
        const { row, column } = decodeGridIndex(index);
        const tile = this.tileAt(row, column);
        if (tile && tile.kind !== null) this.applyTileSpecial(tile, tile.kind, plan.conversion.special);
      }
      this.pendingArmedClear = plan.clear;
      this.pendingArmedSpecial = plan.conversion.special;
      this.phase = 'arming';
      this.phaseElapsedMs = 0;
      this.messageText.textContent = plan.conversion.special === 'super-bomb'
        ? '同色方块正在转化为超级炸弹…'
        : '同色方块正在转化为炸弹…';
      this.updateHud();
      return;
    }

    const message = plan.kind === 'rainbow-rainbow'
      ? '双彩色方块共鸣：全盘消除！'
      : '彩色方块清除了全部同色方块！';
    if (plan.targetColor !== null) {
      this.pendingRainbowClear = plan.clear;
      this.phase = 'channeling';
      this.phaseElapsedMs = 0;
      this.messageText.textContent = '彩色闪电正在锁定同色方块…';
      this.updateHud();
      return;
    }
    this.beginClear(plan.clear, message);
  }

  private startRainbowLightning(plan: SpecialSwapPlan): void {
    if (plan.targetColor === null) return;
    const sourcePosition = plan.activatedRainbows[0];
    if (!sourcePosition) throw new Error('Rainbow special swap lost its activation source.');
    const source = this.tileAt(sourcePosition.row, sourcePosition.column);
    if (!source || source.special !== 'rainbow') {
      throw new Error('Rainbow special swap source no longer contains a rainbow tile.');
    }
    const targets: LightningTarget[] = [];
    for (let row = 0; row < MATCH3_ROWS; row++) {
      for (let column = 0; column < MATCH3_COLUMNS; column++) {
        const tile = this.tileAt(row, column);
        if (!tile || tile.kind !== plan.targetColor) continue;
        targets.push({ id: tile.id, position: [tile.displayX, tile.displayY, tile.displayZ] });
      }
    }
    this.lightningEffect.start(
      source.id,
      [source.displayX, source.displayY, source.displayZ],
      plan.targetColor,
      targets,
    );
  }

  private finishRainbowActivation(): void {
    this.lightningEffect.clear();
    if (this.phase === 'arming') {
      const clear = this.pendingArmedClear;
      if (!clear) throw new Error('Bomb arming phase lost its pending clear set.');
      this.pendingArmedClear = null;
      const armedSpecial = this.pendingArmedSpecial;
      if (!armedSpecial) throw new Error('Bomb arming phase lost its converted special type.');
      this.pendingArmedSpecial = null;
      this.beginClear(clear, armedSpecial === 'super-bomb'
        ? '同色超级炸弹同时引爆！'
        : '同色炸弹同时引爆！');
      return;
    }
    const clear = this.pendingRainbowClear;
    if (!clear) throw new Error('Rainbow channeling phase lost its pending clear set.');
    this.pendingRainbowClear = null;
    this.beginClear(clear, '彩色闪电清除了全部同色方块！');
  }

  private applySpecialSpawn(spawn: SpecialSpawn): void {
    const tile = this.tileAt(spawn.position.row, spawn.position.column);
    if (!tile) throw new Error('Special spawn cell no longer contains a tile.');
    this.applyTileSpecial(tile, spawn.color, spawn.special);
  }

  private applyTileSpecial(tile: Tile, color: GemKind | null, special: TileSpecial): void {
    tile.kind = color;
    tile.special = special;
    this.tilePresentation.apply(tile.mesh, color, special);
  }

  private beginClear(
    clear: ReadonlySet<number>,
    overrideMessage?: string,
    retainedMatchCredits = 0,
  ): void {
    const clearedTiles: Tile[] = [];
    const shardStride = Math.max(1, Math.ceil(
      clear.size * this.shardEffect.triangleCount / MAX_SHARD_PARTICLES_PER_CLEAR,
    ));
    for (const index of [...clear].sort((a, b) => a - b)) {
      const { row, column } = decodeGridIndex(index);
      const tile = this.tileAt(row, column);
      if (!tile) continue;
      clearedTiles.push(tile);
      if (tile.special === 'bomb' || tile.special === 'super-bomb') {
        this.explosionEffect.explode(
          tile.id,
          [tile.displayX, tile.displayY, tile.displayZ],
          tile.special === 'super-bomb' ? 2 : 1,
        );
      }
      this.shardEffect.shatter(
        tile.id,
        this.tilePresentation.materialFor(tile.kind, tile.special),
        [tile.displayX, tile.displayY, tile.displayZ],
        shardStride,
      );
      this.world.removeEntity(tile.entity);
      this.setTile(row, column, null);
    }
    this.score += (clearedTiles.length + retainedMatchCredits) * 10 * Math.max(1, this.cascade);
    this.phase = 'clearing';
    this.phaseElapsedMs = 0;
    this.messageText.textContent = overrideMessage ?? (this.cascade > 1
      ? `${this.cascade} 连锁！${clearedTiles.length} 个方块碎裂`
      : `${clearedTiles.length} 个方块碎裂消除`);
    this.updateHud();
  }

  private collapseAndRefill(): void {
    for (let column = 0; column < MATCH3_COLUMNS; column++) {
      const survivors: Tile[] = [];
      for (let row = MATCH3_ROWS - 1; row >= 0; row--) {
        const tile = this.tileAt(row, column);
        if (tile) survivors.push(tile);
      }
      for (let row = 0; row < MATCH3_ROWS; row++) this.setTile(row, column, null);

      for (let survivorIndex = 0; survivorIndex < survivors.length; survivorIndex++) {
        const tile = requiredItem(survivors, survivorIndex, 'match-3 survivors');
        const row = MATCH3_ROWS - 1 - survivorIndex;
        tile.row = row;
        tile.column = column;
        this.setTile(row, column, tile);
      }

      const missing = MATCH3_ROWS - survivors.length;
      for (let row = missing - 1; row >= 0; row--) {
        const spawnY = BOARD_TOP_Y + (missing - row + 0.7) * CELL_STEP;
        this.setTile(row, column, this.createTile(randomGemKind(this.random), row, column, spawnY));
      }
    }
    this.phase = 'falling';
    this.messageText.textContent = '新方块落下中…';
  }

  private restart(): void {
    if (this.regression) this.regressionRandomState = 0x7f4a7c15;
    this.resetPointerGesture();
    this.clearTileEntities();
    this.clearShardEntities();
    this.explosionEffect.clear();
    this.lightningEffect.clear();
    this.score = 0;
    this.moves = 0;
    this.cascade = 0;
    this.selected = null;
    this.pendingSwap = null;
    this.pendingArmedClear = null;
    this.pendingArmedSpecial = null;
    this.pendingRainbowClear = null;
    this.phase = 'idle';
    this.rebuildBoard('点击相邻方块，或按住滑动来交换位置');
    this.applyBrowserFixture();
    this.updateHud();
  }

  private applyBrowserFixture(): void {
    if (new URLSearchParams(window.location.search).get('match3Fixture') !== 'rainbow-lightning') return;
    const rainbow = this.tileAt(3, 3);
    if (!rainbow) throw new Error('Rainbow lightning fixture source is missing.');
    this.applyTileSpecial(rainbow, null, 'rainbow');
    this.messageText.textContent = '验证模式：交换中央彩色方块以触发闪电';
  }

  private rebuildBoard(message: string): void {
    this.clearTileEntities();
    const kinds = createPlayableGemGrid(this.random);
    for (let row = 0; row < MATCH3_ROWS; row++) {
      for (let column = 0; column < MATCH3_COLUMNS; column++) {
        const kind = getGem(kinds, row, column);
        if (kind === null) throw new Error('Generated match-3 board contains an empty cell.');
        this.setTile(row, column, this.createTile(kind, row, column));
      }
    }
    this.phase = 'idle';
    this.selected = null;
    this.pendingSwap = null;
    this.pendingArmedClear = null;
    this.pendingArmedSpecial = null;
    this.pendingRainbowClear = null;
    this.messageText.textContent = message;
  }

  private createTile(kind: GemKind, row: number, column: number, startY?: number): Tile {
    const [targetX, targetY] = cellWorldPosition(row, column);
    const displayY = startY ?? targetY;
    const transform = new CartesianTransform3D({ position: [targetX, displayY, 0] });
    const mesh = this.tilePresentation.createMesh(kind);
    const entity = new Entity(`Gem-${this.nextTileId}`);
    entity.addComponent(transform);
    entity.addComponent(mesh);
    this.world.addEntity(entity);
    return {
      id: this.nextTileId++,
      kind,
      special: 'normal',
      row,
      column,
      entity,
      transform,
      mesh,
      displayX: targetX,
      displayY,
      displayZ: 0,
      displayScale: 1,
    };
  }

  private updateTiles(timeMs: number, deltaMs: number): boolean {
    const response = 1 - Math.exp(-Math.max(0, deltaMs) / 58);
    let settled = true;
    for (let row = 0; row < MATCH3_ROWS; row++) {
      for (let column = 0; column < MATCH3_COLUMNS; column++) {
        const tile = this.tileAt(row, column);
        if (!tile) continue;
        const [targetX, targetY] = cellWorldPosition(tile.row, tile.column);
        const selected = this.selected === tile;
        const targetZ = selected ? 0.20 : 0;
        const specialPulse = tile.special === 'normal'
          ? 1
          : 1 + Math.sin(timeMs * 0.008 + tile.id) * (this.phase === 'arming' ? 0.10 : 0.025);
        const targetScale = (selected ? 1.13 : 1) * specialPulse;
        tile.displayX += (targetX - tile.displayX) * response;
        tile.displayY += (targetY - tile.displayY) * response;
        tile.displayZ += (targetZ - tile.displayZ) * response;
        tile.displayScale += (targetScale - tile.displayScale) * response;
        const movement = Math.abs(targetX - tile.displayX)
          + Math.abs(targetY - tile.displayY)
          + Math.abs(targetZ - tile.displayZ);
        if (movement > MOVE_EPSILON) settled = false;
        const rotation = specialRotation(tile, timeMs);
        tile.transform
          .setPosition(tile.displayX, tile.displayY, tile.displayZ)
          .setScale(tile.displayScale, tile.displayScale, tile.displayScale)
          .setRotation(rotation[0], rotation[1], rotation[2]);
      }
    }
    return settled;
  }

  private swapTilePositions(first: Tile, second: Tile): void {
    const firstRow = first.row;
    const firstColumn = first.column;
    const secondRow = second.row;
    const secondColumn = second.column;
    this.setTile(firstRow, firstColumn, second);
    this.setTile(secondRow, secondColumn, first);
    first.row = secondRow;
    first.column = secondColumn;
    second.row = firstRow;
    second.column = firstColumn;
  }

  private pointerToCell(event: PointerEvent): GridPosition | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    const halfHeight = Math.tan(CAMERA_FOV / 2) * this.cameraDistance;
    const worldX = ndcX * halfHeight * (rect.width / rect.height);
    const worldY = ndcY * halfHeight;
    const column = Math.round(worldX / CELL_STEP + (MATCH3_COLUMNS - 1) / 2);
    const row = Math.round((MATCH3_ROWS - 1) / 2 - worldY / CELL_STEP);
    if (row < 0 || row >= MATCH3_ROWS || column < 0 || column >= MATCH3_COLUMNS) return null;
    const [cellX, cellY] = cellWorldPosition(row, column);
    if (Math.abs(worldX - cellX) > TILE_SIZE * 0.62 || Math.abs(worldY - cellY) > TILE_SIZE * 0.62) {
      return null;
    }
    return { row, column };
  }

  private fitCamera(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    if (width === this.fittedWidth && height === this.fittedHeight) return;
    this.fittedWidth = width;
    this.fittedHeight = height;
    const aspect = width / height;
    const verticalExtent = Math.max(BOARD_HALF_HEIGHT, BOARD_HALF_WIDTH / aspect);
    this.cameraDistance = verticalExtent / Math.tan(CAMERA_FOV / 2) * 1.08;
    this.cameraTransform.radius = this.cameraDistance;
  }

  private toGemGrid(): GemGrid {
    return this.board.map(line => line.map(tile => tile?.kind ?? null));
  }

  private toSpecialGrid(): SpecialGrid {
    return this.board.map(line => line.map(tile => tile
      ? { color: tile.kind, special: tile.special }
      : null));
  }

  private findPlayableMove(): readonly [GridPosition, GridPosition] | null {
    return findRainbowSwap(this.toSpecialGrid()) ?? findLegalGemSwap(this.toGemGrid());
  }

  private playLegalMove(): boolean {
    if (this.phase !== 'idle') return false;
    const move = this.findPlayableMove();
    if (!move) return false;
    this.selectCell(move[0].row, move[0].column);
    this.selectCell(move[1].row, move[1].column);
    return true;
  }

  private snapshot(): Match3Snapshot {
    const grid = this.toGemGrid();
    const specialGrid = this.toSpecialGrid();
    return {
      phase: this.phase,
      score: this.score,
      moves: this.moves,
      cascade: this.cascade,
      tileCount: this.board.flat().filter(tile => tile !== null).length,
      shardCount: this.shardEffect.particleCount,
      explosionParticleCount: this.explosionEffect.particleCount,
      lightningTargetCount: this.lightningEffect.activeTargetCount,
      grid: specialGrid,
      matches: findGemMatches(grid).size,
      legalMove: this.findPlayableMove(),
      specials: countSpecialTiles(specialGrid),
    };
  }

  private updateHud(): void {
    this.scoreText.textContent = String(this.score);
    this.movesText.textContent = String(this.moves);
    this.cascadeText.textContent = this.cascade > 1 ? `× ${this.cascade}` : '—';
    const specials = countSpecialTiles(this.toSpecialGrid());
    document.body.dataset.bombCount = String(specials.bomb);
    document.body.dataset.rainbowCount = String(specials.rainbow);
    document.body.dataset.superBombCount = String(specials['super-bomb']);
    if (this.validationFinished) this.publishDebugResult(document.body.dataset.renderStatus ?? 'pending');
  }

  private clearTileEntities(): void {
    for (let row = 0; row < MATCH3_ROWS; row++) {
      for (let column = 0; column < MATCH3_COLUMNS; column++) {
        const tile = this.tileAt(row, column);
        if (tile) this.world.removeEntity(tile.entity);
        this.setTile(row, column, null);
      }
    }
  }

  private clearShardEntities(): void {
    this.shardEffect.clear();
  }

  private tileAt(row: number, column: number): Tile | null {
    return this.board[row]?.[column] ?? null;
  }

  private setTile(row: number, column: number, tile: Tile | null): void {
    const line = this.board[row];
    if (!line || column < 0 || column >= MATCH3_COLUMNS) {
      throw new RangeError(`Invalid match-3 tile cell (${row}, ${column}).`);
    }
    line[column] = tile;
  }

  private async finishValidation(): Promise<void> {
    await this.engine.device.queue.onSubmittedWorkDone();
    const scopedError = await this.engine.device.popErrorScope();
    if (scopedError) this.validationErrors.push(scopedError.message);
    const snapshot = this.snapshot();
    if (snapshot.tileCount !== MATCH3_ROWS * MATCH3_COLUMNS) {
      this.validationErrors.push(`Expected 64 initial tiles, got ${snapshot.tileCount}.`);
    }
    if (snapshot.matches !== 0) {
      this.validationErrors.push(`Initial board unexpectedly has ${snapshot.matches} matched cells.`);
    }
    if (!snapshot.legalMove) this.validationErrors.push('Initial board has no legal move.');
    if (this.shardEffect.triangleCount !== 48) {
      this.validationErrors.push(`Expected 48 separated shard triangles, got ${this.shardEffect.triangleCount}.`);
    }
    const status = this.validationErrors.length === 0 ? 'passed' : 'failed';
    document.body.dataset.renderStatus = status;
    document.body.dataset.renderError = this.validationErrors.join('\n');
    document.body.dataset.separatedTriangleCount = String(this.shardEffect.triangleCount);
    this.publishDebugResult(status);
    if (this.regression) this.engine.stop();
  }

  private publishDebugResult(status: string): void {
    this.resultText.dataset.status = status;
    this.resultText.textContent = JSON.stringify({
      status,
      errors: this.validationErrors,
      ...this.snapshot(),
      separatedTriangleCount: this.shardEffect.triangleCount,
    });
  }
}

function cellWorldPosition(row: number, column: number): readonly [number, number] {
  return [
    (column - (MATCH3_COLUMNS - 1) / 2) * CELL_STEP,
    ((MATCH3_ROWS - 1) / 2 - row) * CELL_STEP,
  ];
}

function tilePosition(tile: Tile): GridPosition {
  return { row: tile.row, column: tile.column };
}

function specialRotation(tile: Tile, timeMs: number): readonly [number, number, number] {
  const phase = timeMs * 0.001;
  if (tile.special === 'rainbow') return [0, phase * 0.72, phase * 0.38];
  if (tile.special === 'super-bomb') {
    return [
      Math.PI / 2 + Math.sin(phase * 1.3 + tile.id) * 0.13,
      Math.cos(phase * 1.1 + tile.id) * 0.10,
      phase * 0.52,
    ];
  }
  return [0, 0, 0];
}

function specialLabel(special: Exclude<TileSpecial, 'normal'>): string {
  if (special === 'rainbow') return '彩色方块';
  if (special === 'super-bomb') return '超级炸弹';
  return '炸弹方块';
}

function randomGemKind(random: () => number = Math.random): GemKind {
  return Math.min(MATCH3_KIND_COUNT - 1, Math.floor(random() * MATCH3_KIND_COUNT)) as GemKind;
}

function requiredItem<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} is missing index ${index}.`);
  return value;
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element ${selector}.`);
  return element;
}

async function main(): Promise<void> {
  const game = new Match3Game();
  await game.init(query<HTMLCanvasElement>('#canvas'));
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.renderStatus = 'failed';
  document.body.dataset.renderError = message;
  const result = document.querySelector<HTMLElement>('#result');
  if (result) result.textContent = JSON.stringify({ status: 'failed', errors: [message] });
  const messageElement = document.querySelector<HTMLElement>('#message');
  if (messageElement) messageElement.textContent = `启动失败：${message}`;
  console.error(error);
});
