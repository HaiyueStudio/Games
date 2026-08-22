import {
  Camera3D,
  CartesianTransform3D,
  DirectionalLight,
  Entity,
  EnvironmentLight,
  HaiyueEngine,
  System,
  type World as EngineWorld,
} from '@haiyue/engine';
import { FirstPersonControls } from '@haiyue/engine/controls';
import { InstancedMesh3DRenderSystem } from '@haiyue/engine/systems';
import { MinecraftInteractionSystem } from './MinecraftInteractionSystem';
import {
  DEFAULT_WORLD_SIZE,
  PLAYER_EYE_HEIGHT,
  PLAYER_GRAVITY,
  PLAYER_JUMP_HEIGHT,
  PLAYER_JUMP_SPEED,
  PLAYER_STEP_HEIGHT,
} from './MinecraftRules';
import { MinecraftVoxelRenderer } from './MinecraftVoxelRenderer';
import { MinecraftWorld, type MinecraftBlockEdit } from './MinecraftWorld';
import { SingleSlotGameSave, isFiniteNumber, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

interface MinecraftSaveData {
  seed: number;
  edits: MinecraftBlockEdit[];
  player: number[];
  rotation: number[];
  selectedPalette: number;
}

function isVector3(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isMinecraftSaveData(value: unknown): value is MinecraftSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.seed) && value.seed <= 0xffff_ffff
    && isVector3(value.player) && isVector3(value.rotation)
    && isNonNegativeInteger(value.selectedPalette) && value.selectedPalette < 10
    && Array.isArray(value.edits) && value.edits.every(edit => isRecord(edit)
      && isNonNegativeInteger(edit.x) && isNonNegativeInteger(edit.y) && isNonNegativeInteger(edit.z)
      && (edit.paletteIndex === null || (isNonNegativeInteger(edit.paletteIndex) && edit.paletteIndex < 10)));
}

async function main(): Promise<void> {
  const saves = new SingleSlotGameSave<MinecraftSaveData>({
    gameId: 'minecraft-lite',
    name: 'Minecraft Lite 自动存档',
    validateData: isMinecraftSaveData,
  });
  const saved = await saves.load();
  const canvas = requiredElement('canvas', HTMLCanvasElement);
  const seed = requestedSeed() ?? saved?.seed ?? randomSeed();
  const engine = new HaiyueEngine({
    canvas,
    clearColor: { r: 0.34, g: 0.62, b: 0.86, a: 1 },
    msaaSamples: 4,
    devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 1.75),
  });
  await engine.init();

  const validationErrors: string[] = [];
  engine.device.addEventListener('uncapturederror', event => validationErrors.push(event.error.message));
  engine.device.pushErrorScope('validation');

  const voxelWorld = new MinecraftWorld({ size: DEFAULT_WORLD_SIZE, seed });
  if (saved?.seed === seed) voxelWorld.applyEdits(saved.edits);
  const spawnSurface = voxelWorld.spawnPosition();
  const spawn: [number, number, number] = [
    spawnSurface[0],
    spawnSurface[1] + PLAYER_EYE_HEIGHT,
    spawnSurface[2],
  ];
  const restoredPlayer: [number, number, number] = saved?.seed === seed && saved.player.length === 3 ? saved.player as [number, number, number] : spawn;
  const restoredRotation: [number, number, number] = saved?.seed === seed && saved.rotation.length === 3 ? saved.rotation as [number, number, number] : [-0.2, 0, 0];
  const cameraTransform = new CartesianTransform3D({ position: restoredPlayer, rotation: restoredRotation });
  const camera = new Entity('Minecraft first-person camera')
    .addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 2.55, near: 0.05, far: 340 }))
    .addComponent(cameraTransform);
  const scene = engine.createScene({
    name: 'Minecraft Lite',
    camera,
    render3D: false,
    render2D: false,
    gui: false,
    pipelineLabel: 'MinecraftLite.render',
  });

  const renderer = new MinecraftVoxelRenderer();
  scene.add(renderer.entity);
  await renderer.buildInitial(voxelWorld);
  scene.add(new Entity('Sun').addComponent(new DirectionalLight({
    direction: [-0.48, -1, -0.34],
    color: [1, 0.96, 0.84],
    intensity: 2.25,
  })));
  scene.add(new Entity('Sky light').addComponent(new EnvironmentLight({
    intensity: 0.78,
    diffuseColor: [0.47, 0.68, 0.82],
    specularColor: [0.76, 0.9, 1],
  })));
  scene.addSystem(new InstancedMesh3DRenderSystem(engine, camera, {
    loadOp: 'clear',
    msaaSamples: 4,
    gpuCulling: true,
    indirect: true,
  }));

  const controls = new FirstPersonControls(canvas, cameraTransform, {
    moveSpeed: 6.2,
    sprintMultiplier: 1.55,
    lookSensitivity: 0.0018,
    jumpSpeed: PLAYER_JUMP_SPEED,
    gravity: PLAYER_GRAVITY,
    groundOffset: PLAYER_EYE_HEIGHT,
    maxStepHeight: PLAYER_STEP_HEIGHT,
    groundProbe: position => voxelWorld.surfaceHeightAtWorld(position[0]!, position[2]!),
  });
  scene.addSystem(controls, false);

  let selectedPalette = saved?.seed === seed ? saved.selectedPalette : 3;
  const saveState = (): void => saves.save({
    seed,
    edits: voxelWorld.snapshotEdits(),
    player: Array.from(cameraTransform.position),
    rotation: Array.from(cameraTransform.rotation),
    selectedPalette,
  });
  const interaction = new MinecraftInteractionSystem({
    canvas,
    cameraTransform,
    world: voxelWorld,
    renderer,
    hotbar: requiredElement('hotbar', HTMLElement),
    target: requiredElement('target-cell', HTMLElement),
    blockCount: requiredElement('block-count', HTMLElement),
    message: requiredElement('message', HTMLElement),
    initialPalette: selectedPalette,
    onStateChanged: palette => { selectedPalette = palette; saveState(); },
  });
  scene.addSystem(interaction, false);
  scene.addSystem(new PlayerSafetySystem(controls, cameraTransform, voxelWorld, spawn), false);

  const overlay = requiredElement('start-overlay', HTMLElement);
  const onPointerLockChange = (): void => {
    const locked = controls.pointerLocked;
    overlay.classList.toggle('hidden', locked);
    document.body.dataset.pointerLocked = String(locked);
  };
  const onStart = (event: Event): void => {
    event.stopPropagation();
    controls.requestPointerLock();
  };
  const onNewWorld = (event: Event): void => {
    event.stopPropagation();
    const next = randomSeed();
    const url = new URL(location.href);
    url.searchParams.set('seed', String(next));
    location.assign(url);
  };
  document.addEventListener('pointerlockchange', onPointerLockChange);
  requiredElement('start-button', HTMLButtonElement).addEventListener('click', onStart);
  requiredElement('new-world', HTMLButtonElement).addEventListener('click', onNewWorld);

  requiredElement('seed', HTMLElement).textContent = String(seed);
  requiredElement('map-size', HTMLElement).textContent = `${voxelWorld.size} × ${voxelWorld.size}`;
  requiredElement('jump-height', HTMLElement).textContent = `${PLAYER_JUMP_HEIGHT} 格`;
  document.body.dataset.renderStatus = 'pending';
  document.body.dataset.worldSize = `${voxelWorld.size}x${voxelWorld.size}`;
  document.body.dataset.paletteCount = '10';
  document.body.dataset.jumpHeight = String(PLAYER_JUMP_HEIGHT);
  document.body.dataset.stepHeight = '1';
  document.body.dataset.seed = String(seed);
  document.body.dataset.visibleBlocks = String(renderer.visibleBlockCount);

  engine.switchScene(scene);
  engine.run();

  let validationFrames = 0;
  engine.on('after-update', () => {
    document.body.dataset.playerGrounded = String(controls.grounded);
    if (++validationFrames === 8) void finishValidation();
    if (validationFrames % 120 === 0) saveState();
  });

  async function finishValidation(): Promise<void> {
    await engine.device.queue.onSubmittedWorkDone();
    const scopedError = await engine.device.popErrorScope();
    if (scopedError) validationErrors.push(scopedError.message);
    const result = requiredElement('result', HTMLElement);
    const status = validationErrors.length === 0 ? 'passed' : 'failed';
    document.body.dataset.renderStatus = status;
    result.dataset.status = status;
    result.textContent = JSON.stringify({
      schemaVersion: 1,
      suite: 'minecraft-lite-game',
      status,
      errors: validationErrors,
      seed,
      worldSize: [voxelWorld.size, voxelWorld.size],
      visibleBlocks: renderer.visibleBlockCount,
      paletteCount: 10,
      jumpHeight: PLAYER_JUMP_HEIGHT,
      autoStepHeight: 1,
    });
  }

  let disposed = false;
  window.addEventListener('pagehide', () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    requiredElement('start-button', HTMLButtonElement).removeEventListener('click', onStart);
    requiredElement('new-world', HTMLButtonElement).removeEventListener('click', onNewWorld);
    interaction.dispose();
    saveState();
    controls.dispose();
    engine.destroy();
  }, { once: true });
}

class PlayerSafetySystem extends System {
  constructor(
    private readonly _controls: FirstPersonControls,
    private readonly _transform: CartesianTransform3D,
    private readonly _voxelWorld: MinecraftWorld,
    private readonly _spawn: readonly [number, number, number],
  ) {
    super(() => false);
    this.name = 'MinecraftPlayerSafetySystem';
    this.priority = -80;
  }

  override update(_world: EngineWorld): this {
    const position = this._transform.position;
    const margin = this._voxelWorld.size * 0.5 + 2;
    if (position[1]! < -12 || Math.abs(position[0]!) > margin || Math.abs(position[2]!) > margin) {
      this._controls.teleport(this._spawn, true);
    }
    return this;
  }
}

function requestedSeed(): number | null {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw !== null && /^\d+$/.test(raw)) return Number(raw) >>> 0;
  return null;
}

function randomSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(buffer);
  return buffer[0] ?? Date.now() >>> 0;
}

function requiredElement<T extends Element>(id: string, type: { new(): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing required #${id} element.`);
  return element;
}

main().catch(error => {
  console.error(error);
  document.body.dataset.renderStatus = 'failed';
  const result = document.getElementById('result');
  if (result) {
    result.dataset.status = 'failed';
    result.textContent = JSON.stringify({ status: 'failed', errors: [String(error)] });
  }
});
