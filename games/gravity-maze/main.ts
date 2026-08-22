import {
  Camera3D,
  DirectionalLight,
  Entity,
  EnvironmentLight,
  HaiyueEngine,
  Mesh3D,
  PbrMaterial,
  SphericalTransform3D,
  createBox3D,
  createSphere3D,
  type Scene,
} from '@haiyue/engine';
import { Transform3D } from '@haiyue/engine/components';
import { Physics3DBody, Physics3DSystem } from '@haiyue/engine/physics';
import { createRapierPhysics3DBackend } from '@haiyue/engine/physics/backend';
import { mat4 } from 'wgpu-matrix';
import { GravityMazeGame, MazeOutcomeSystem } from './GravityMazeGame';
import { BALL_RADIUS } from './MazeConfig';
import { MazeTiltSystem } from './MazeTiltSystem';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

interface GravityMazeSaveData {
  baseSeed: number;
  level: number;
}

function isGravityMazeSaveData(value: unknown): value is GravityMazeSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.baseSeed) && value.baseSeed <= 0xffff_ffff
    && isNonNegativeInteger(value.level) && value.level >= 1;
}

async function main(): Promise<void> {
  const saves = new SingleSlotGameSave<GravityMazeSaveData>({
    gameId: 'gravity-maze',
    name: 'Gravity Maze 自动存档',
    validateData: isGravityMazeSaveData,
  });
  const saved = await saves.load();
  const rayTracingEvidence = new URLSearchParams(location.search).get('rayTracing') === '1';
  const canvas = requiredElement('canvas', HTMLCanvasElement);
  const engine = new HaiyueEngine({
    canvas,
    clearColor: { r: 0.025, g: 0.045, b: 0.075, a: 1 },
    msaaSamples: 4,
    devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 1.75),
  });
  await engine.init();
  const backend = await createRapierPhysics3DBackend();

  const camera = new Entity('Gravity maze camera')
    .addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 4.25, near: 0.1, far: 90 }))
    .addComponent(new SphericalTransform3D({
      radius: 20.5,
      theta: -Math.PI * 0.14,
      phi: Math.PI * 0.27,
      target: [0, 0, 0],
    }));
  const scene = engine.createScene({
    name: 'Gravity Maze',
    camera,
    render3D: { loadOp: 'clear' },
    render2D: false,
    gui: false,
    pipelineLabel: 'GravityMaze.render',
  });
  addLighting(scene);
  addVoidBackdrop(scene);

  const tilt = new MazeTiltSystem(canvas, (pitch, roll) => {
    requiredElement('tilt-x', HTMLElement).textContent = `${degrees(pitch)}°`;
    requiredElement('tilt-z', HTMLElement).textContent = `${degrees(roll)}°`;
    requiredElement('tilt-indicator', HTMLElement).style.transform = (
      `rotateX(${degrees(pitch)}deg) rotateZ(${degrees(roll)}deg)`
    );
  });
  const physics = new Physics3DSystem({
    backend,
    gravity: [0, -24, 0],
    fixedTimeStep: 1 / 120,
    maxSubSteps: 10,
    solverIterations: 12,
    syncStaticBodiesFromTransform: true,
    priority: -10,
  });
  scene.addSystem(tilt, false);
  scene.addSystem(physics, false);

  const ballTransform = new Transform3D();
  const ballBody = new Physics3DBody({
    type: 'dynamic',
    shape: 'sphere',
    radius: BALL_RADIUS,
    density: 1.1,
    friction: 0.78,
    restitution: 0.06,
    linearDamping: 0.035,
    angularDamping: 0.055,
    ccd: true,
    allowSleep: false,
  });
  scene.add(new Entity('Player ball')
    .addComponent(ballTransform)
    .addComponent(new Mesh3D(
      createSphere3D({ radius: BALL_RADIUS, widthSegments: 32, heightSegments: 20 }),
      new PbrMaterial({
        baseColor: [0.98, 0.67, 0.16, 1],
        metallic: 0.72,
        roughness: 0.2,
        emissiveFactor: [0.12, 0.04, 0.005],
      }),
    ))
    .addComponent(ballBody));

  const baseSeed = saved?.baseSeed ?? requestedSeed();
  const game = new GravityMazeGame(scene, physics, tilt, ballTransform, ballBody, baseSeed, level => {
    saves.save({ baseSeed, level });
  });
  scene.addSystem(new MazeOutcomeSystem(game), false);
  game.loadLevel(saved?.level ?? 1);

  const errors: string[] = [];
  engine.device.addEventListener('uncapturederror', event => errors.push(event.error.message));
  engine.device.pushErrorScope('validation');
  document.body.dataset.renderStatus = 'pending';
  document.body.dataset.physicsBackend = physics.backendId;
  document.body.dataset.mazeSize = '9x9';

  engine.switchScene(scene);
  if (rayTracingEvidence) {
    const rayContext = Object.freeze({
      scene,
      device: engine.device,
      fixedSceneId: 'gravity-maze-level-1-ray-v1',
      fixedCameraReplayId: 'gravity-maze-camera-v1',
      seed: game.seed,
      mazeSize: [game.layout.columns, game.layout.rows] as const,
      renderRasterEvidenceFrame: () => renderSingleEvidenceFrame(engine),
    });
    try {
      const module = await import('./rayTracingPreview');
      await module.startGravityMazeRayTracingPreview(rayContext);
    } catch {
      publishRayBootstrapFailure('RAY_GAME_CANDIDATE_MODULE_FAILED');
    }
  }
  if (!rayTracingEvidence) engine.run();
  let frames = 0;
  engine.on('after-update', () => {
    if (++frames === 8) void finishValidation();
  });

  async function finishValidation(): Promise<void> {
    await engine.device.queue.onSubmittedWorkDone();
    const scopedError = await engine.device.popErrorScope();
    if (scopedError) errors.push(scopedError.message);
    const status = errors.length === 0 ? (rayTracingEvidence ? 'pending' : 'passed') : 'failed';
    document.body.dataset.renderStatus = status;
    const result = requiredElement('result', HTMLElement);
    if (status === 'pending') return;
    result.dataset.status = status;
    result.textContent = JSON.stringify({
      schemaVersion: 1,
      suite: 'gravity-maze-game',
      status,
      errors,
      physicsBackend: physics.backendId,
      mazeSize: [9, 9],
      level: game.level,
      seed: game.seed,
      holeCount: game.layout.holes.length,
      rayTracingEvidence,
    });
  }

  let disposed = false;
  window.addEventListener('pagehide', () => {
    if (disposed) return;
    disposed = true;
    game.dispose();
    engine.destroy();
  }, { once: true });
}

function renderSingleEvidenceFrame(engine: HaiyueEngine): Promise<void> {
  return new Promise(resolve => {
    engine.once('after-update', () => {
      engine.stop();
      resolve();
    });
    engine.run();
  });
}

function publishRayBootstrapFailure(code: string): void {
  document.body.dataset.renderStatus = 'failed';
  const result = document.getElementById('result');
  if (!result) return;
  result.dataset.status = 'failed';
  result.textContent = JSON.stringify({ schemaVersion: 1, suite: 'gravity-maze-ray-tracing-candidate', status: 'failed', diagnostics: [{ code, severity: 'error' }], unclassifiedFailureCount: 0 });
}

function addLighting(scene: Scene): void {
  scene.add(new Entity('Sun').addComponent(new DirectionalLight({
    direction: [-0.55, -1, -0.32],
    color: [1, 0.94, 0.82],
    intensity: 2.7,
  })));
  scene.add(new Entity('Environment').addComponent(new EnvironmentLight({
    intensity: 0.72,
    diffuseColor: [0.12, 0.24, 0.38],
    specularColor: [0.62, 0.78, 0.94],
  })));
}

function addVoidBackdrop(scene: Scene): void {
  scene.add(new Entity('Void backdrop')
    .addComponent(new Transform3D().setMatrix(mat4.translation([0, -3.4, 0])))
    .addComponent(new Mesh3D(
      createBox3D({ width: 24, height: 0.25, depth: 24 }),
      new PbrMaterial({ baseColor: [0.018, 0.025, 0.045, 1], metallic: 0.04, roughness: 0.92 }),
    )));
}

function requestedSeed(): number {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw !== null && /^\d+$/.test(raw)) return Number(raw) >>> 0;
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(values);
  return values[0] ?? Date.now() >>> 0;
}

function degrees(radians: number): string { return (radians * 180 / Math.PI).toFixed(1); }

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
  const status = document.getElementById('status');
  if (status) status.textContent = `启动失败：${String(error)}`;
});
