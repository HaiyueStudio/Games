import {
  Camera3D,
  CartesianTransform3D,
  DirectionalLight,
  Entity,
  HaiyueEngine,
  Mesh3D,
  SphericalTransform3D,
  World,
  createBox3D,
  createPlane3D,
  createSphere3D,
} from '@haiyue/engine';
import { ParticleEmitter3D } from '@haiyue/engine/components';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { createRoundedBox3D } from '@haiyue/engine/geometry';
import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial, RadialShadowMaterial } from '@haiyue/engine/material';
import {
  BlinnPhongRenderSystem,
  Particle3DRenderSystem,
  Particle3DSystem,
  RadialShadowRenderFeature,
  Render3DSystem,
} from '@haiyue/engine/systems';
import {
  BALL_RADIUS,
  INITIAL_BALL_SPEED,
  MAX_BALL_SPEED,
  PADDLE_LIMIT_Z,
  PADDLE_X,
  TABLE_HALF_WIDTH,
  WALL_Z,
  clampPaddleZ,
  serveVelocity,
  stepPongBall,
  type PongBallState,
  type PongCollisionEvent,
} from './PongRules';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

type Color = readonly [number, number, number, number];
type GamePhase = 'serving' | 'playing' | 'paused' | 'finished';

interface PaddleVisual {
  readonly transform: CartesianTransform3D;
  readonly shadow: CartesianTransform3D;
  z: number;
  velocity: number;
  lean: number;
  leanVelocity: number;
}

interface ActiveEffect {
  readonly entity: Entity;
  readonly emitter: ParticleEmitter3D;
}

interface HeadPart {
  readonly transform: CartesianTransform3D;
  readonly offset: readonly [number, number, number];
}

interface PongSnapshot {
  readonly phase: GamePhase;
  readonly score: readonly [number, number];
  readonly rally: number;
  readonly bounceCount: number;
  readonly speed: number;
  readonly ball: PongBallState;
  readonly paddles: readonly [number, number];
  readonly faceYaw: number;
  readonly particles: number;
}

interface PongDebugApi {
  snapshot(): PongSnapshot;
  restart(): void;
  serve(): void;
  setBall(state: PongBallState): void;
}

interface PongSaveData {
  readonly left: number;
  readonly right: number;
}

function isPongSaveData(value: unknown): value is PongSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.left) && value.left <= WINNING_SCORE
    && isNonNegativeInteger(value.right) && value.right <= WINNING_SCORE;
}

declare global {
  interface Window {
    __pong?: PongDebugApi;
  }
}

const PADDLE_SPEED = 365;
const WINNING_SCORE = 7;
const BALL_Y = 42;
const SURFACE_Y = 13;
const CHARACTER_HEAD: readonly [number, number, number] = [0, 174, -300];

const COLORS = {
  felt: [0.08, 0.48, 0.17, 1] as Color,
  feltLight: [0.11, 0.57, 0.20, 1] as Color,
  line: [0.90, 1, 0.87, 1] as Color,
  wood: [0.48, 0.23, 0.075, 1] as Color,
  woodLight: [0.70, 0.40, 0.13, 1] as Color,
  blue: [0.03, 0.26, 0.88, 1] as Color,
  red: [0.94, 0.08, 0.10, 1] as Color,
  gold: [1, 0.62, 0.04, 1] as Color,
  skin: [0.86, 0.57, 0.43, 1] as Color,
} as const;

class PongGame {
  private readonly saves = new SingleSlotGameSave<PongSaveData>({
    gameId: 'pong',
    name: 'Pong 自动存档',
    validateData: isPongSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private canvas!: HTMLCanvasElement;
  private ballTransform!: CartesianTransform3D;
  private ballShadow!: CartesianTransform3D;
  private trailTransform!: CartesianTransform3D;
  private trailEmitter!: ParticleEmitter3D;
  private readonly effects: ActiveEffect[] = [];
  private readonly headParts: HeadPart[] = [];
  private readonly keys = new Set<string>();
  private leftPaddle!: PaddleVisual;
  private rightPaddle!: PaddleVisual;
  private ball: PongBallState = { x: 0, z: 0, vx: 0, vz: 0 };
  private scoreLeft = 0;
  private scoreRight = 0;
  private rally = 0;
  private bounceCount = 0;
  private phase: GamePhase = 'serving';
  private phaseBeforePause: Exclude<GamePhase, 'paused'> = 'serving';
  private serveTimer = 0.9;
  private serveDirection: -1 | 1 = 1;
  private faceYaw = 0;
  private randomState = new URLSearchParams(location.search).get('regression') === '1' ? 0x51f15e : 0;
  private validationFrames = 0;
  private validationErrors: string[] = [];

  private readonly leftScore = query<HTMLElement>('#left-score');
  private readonly rightScore = query<HTMLElement>('#right-score');
  private readonly rallyText = query<HTMLElement>('#rally');
  private readonly speedText = query<HTMLElement>('#speed');
  private readonly statusText = query<HTMLElement>('#status');
  private readonly announcement = query<HTMLElement>('#announcement');

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.025, g: 0.095, b: 0.19, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    this.engine.device.addEventListener('uncapturederror', event => this.validationErrors.push(event.error.message));
    this.engine.device.pushErrorScope('validation');
    this.world = new World('PongGL');
    this.setupCameraAndRenderer();
    this.setupLights();
    this.buildArena();
    this.buildCharacter();
    this.leftPaddle = this.createPaddle('LeftPaddle', -PADDLE_X, COLORS.blue);
    this.rightPaddle = this.createPaddle('RightPaddle', PADDLE_X, COLORS.red);
    this.createBall();
    this.bindInput();
    await this.loadOrStart();

    window.__pong = {
      snapshot: () => this.snapshot(),
      restart: () => this.restart(),
      serve: () => this.launchServe(),
      setBall: state => { this.ball = { ...state }; this.phase = 'playing'; },
    };

    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private setupCameraAndRenderer(): void {
    const cameraEntity = new Entity('Camera');
    cameraEntity.addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 4.1, near: 1, far: 2600 }));
    cameraEntity.addComponent(new SphericalTransform3D({
      radius: 1040,
      theta: 0,
      phi: 1.08,
      target: [0, 48, 12],
    }));
    this.world.addEntity(cameraEntity);

    const render3D = new Render3DSystem(this.engine, cameraEntity, { priority: 10, loadOp: 'clear', msaaSamples: 4 });
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, cameraEntity, { priority: -1, render3DSystem: render3D }));
    this.world.addSystem(render3D);
    this.world.addSystem(new RadialShadowRenderFeature(this.engine, cameraEntity, { priority: 15, loadOp: 'load' }));
    this.world.addSystem(new Particle3DSystem({ maxDeltaSeconds: 0.08, priority: -10 }));
    this.world.addSystem(new Particle3DRenderSystem(this.engine, cameraEntity, { priority: 20, loadOp: 'load' }));
    const integration = new RenderIntegration(this.engine, { label: 'Pong.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private setupLights(): void {
    const ambient = new Entity('Ambient');
    ambient.addComponent(new AmbientLight({ color: [0.62, 0.76, 1], intensity: 0.58 }));
    this.world.addEntity(ambient);

    const key = new Entity('Key');
    key.addComponent(new DirectionalLight({ color: [1, 0.91, 0.73], intensity: 1.75, direction: [-0.35, -1, -0.42] }));
    this.world.addEntity(key);

    const fill = new Entity('Fill');
    fill.addComponent(new DirectionalLight({ color: [0.25, 0.55, 1], intensity: 0.64, direction: [0.72, -0.35, 0.3] }));
    this.world.addEntity(fill);
  }

  private buildArena(): void {
    this.addBox('TableBase', 0, 1, 0, 950, 24, 520, [0.035, 0.095, 0.045, 1], 10);
    this.addBox('Felt', 0, SURFACE_Y - 2, 0, 900, 7, 480, COLORS.felt, 8);
    for (let index = 0; index < 8; index++) {
      if (index % 2 === 0) this.addBox(`GrassStripe-${index}`, 0, SURFACE_Y + 1.9, -210 + index * 60, 892, 0.8, 59, COLORS.feltLight, 3);
    }

    this.addBox('CenterLine', 0, SURFACE_Y + 3, 0, 5, 1.4, 440, COLORS.line, 2);
    this.addBox('TopLine', 0, SURFACE_Y + 3, -WALL_Z + 15, 870, 1.4, 4, COLORS.line, 2);
    this.addBox('BottomLine', 0, SURFACE_Y + 3, WALL_Z - 15, 870, 1.4, 4, COLORS.line, 2);
    for (const x of [-210, 210]) this.addBox(`ServiceLine-${x}`, x, SURFACE_Y + 3, 0, 4, 1.4, 440, COLORS.line, 2);

    this.addRoundedBox('FarRail', 0, 38, -252, 960, 38, 30, 13, COLORS.woodLight, 38);
    this.addRoundedBox('NearRail', 0, 38, 252, 960, 38, 30, 13, COLORS.woodLight, 38);
    this.addBox('FarRailCore', 0, 31, -252, 950, 24, 38, COLORS.wood, 24);
    this.addBox('NearRailCore', 0, 31, 252, 950, 24, 38, COLORS.wood, 24);
    for (const x of [-405, 405]) {
      this.addBox(`LegFront-${x}`, x, -55, 205, 46, 120, 46, COLORS.wood, 22);
      this.addBox(`LegBack-${x}`, x, -55, -205, 46, 120, 46, COLORS.wood, 22);
    }
  }

  private buildCharacter(): void {
    const black: Color = [0.025, 0.035, 0.055, 1];
    const white: Color = [0.88, 0.93, 0.98, 1];
    const charcoal: Color = [0.10, 0.13, 0.18, 1];
    this.addBox('RefereeTorso', 0, 112, -302, 66, 78, 32, black, 25);
    this.addBox('RefereeShirt', 0, 115, -283, 25, 72, 7, white, 18);
    this.addBox('RefereeTie', 0, 117, -278, 7, 51, 5, charcoal, 35);
    this.addBox('LeftArm', -43, 112, -300, 18, 72, 25, black, 22, [0, 0, -0.12]);
    this.addBox('RightArm', 43, 112, -300, 18, 72, 25, black, 22, [0, 0, 0.12]);
    this.addBox('LeftHand', -47, 76, -291, 19, 18, 23, COLORS.skin, 12);
    this.addBox('RightHand', 47, 76, -291, 19, 18, 23, COLORS.skin, 12);
    this.addBox('LeftLeg', -17, 55, -302, 20, 58, 24, charcoal, 18);
    this.addBox('RightLeg', 17, 55, -302, 20, 58, 24, charcoal, 18);
    this.addBox('LeftShoe', -17, 25, -289, 26, 13, 45, black, 14);
    this.addBox('RightShoe', 17, 25, -289, 26, 13, 45, black, 14);

    this.addHeadSphere('Head', [0, 0, 0], 30, COLORS.skin, [1, 1.05, 0.88]);
    this.addHeadBox('Hair', [0, 24, -2], 55, 18, 47, [0.10, 0.045, 0.018, 1], 10);
    this.addHeadSphere('LeftEye', [-9, 5, 23], 6.2, white, [1, 1.05, 0.45]);
    this.addHeadSphere('RightEye', [9, 5, 23], 6.2, white, [1, 1.05, 0.45]);
    this.addHeadSphere('LeftPupil', [-9, 5, 27], 2.8, [0.02, 0.035, 0.045, 1], [1, 1, 0.45]);
    this.addHeadSphere('RightPupil', [9, 5, 27], 2.8, [0.02, 0.035, 0.045, 1], [1, 1, 0.45]);
    this.addHeadBox('Nose', [0, -2, 28], 7, 8, 11, [0.78, 0.43, 0.32, 1], 8);
    this.addHeadBox('Mouth', [0, -12, 26], 15, 3, 4, [0.24, 0.045, 0.05, 1], 6);
  }

  private createPaddle(name: string, x: number, color: Color): PaddleVisual {
    const transform = new CartesianTransform3D({ position: [x, 56, 0] });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(
      createRoundedBox3D({ width: 36, height: 86, depth: 116, radius: 14, segments: 4 }),
      this.material(color, 70),
    ));
    this.world.addEntity(entity);
    const shadow = this.addShadow(`${name}Shadow`, x + (x < 0 ? 10 : -10), SURFACE_Y + 1.5, 6, 105, 150, 0.34);
    return { transform, shadow, z: 0, velocity: 0, lean: 0, leanVelocity: 0 };
  }

  private createBall(): void {
    this.ballTransform = new CartesianTransform3D({ position: [0, BALL_Y, 0] });
    const ball = new Entity('Ball');
    ball.addComponent(this.ballTransform);
    ball.addComponent(new Mesh3D(
      createSphere3D({ radius: BALL_RADIUS, widthSegments: 28, heightSegments: 16 }),
      this.material(COLORS.gold, 96, [1, 0.88, 0.38, 1]),
    ));
    this.world.addEntity(ball);
    this.ballShadow = this.addShadow('BallShadow', 5, SURFACE_Y + 1.6, 5, 62, 62, 0.42);

    this.trailTransform = new CartesianTransform3D({ position: [0, BALL_Y, 0] });
    this.trailEmitter = new ParticleEmitter3D({
      maxParticles: 90,
      emissionRate: 35,
      duration: Number.POSITIVE_INFINITY,
      loop: true,
      seed: 7727,
      lifetime: [0.18, 0.38],
      speed: [0, 6],
      direction: [0, 1, 0],
      spread: Math.PI,
      gravity: [0, 8, 0],
      startSize: [5, 10],
      endSize: [0.5, 2.5],
      startColor: [1, 0.72, 0.08, 0.48],
      endColor: [1, 0.18, 0.01, 0],
      blendMode: 'additive',
      radial: true,
      depthTest: true,
      depthWrite: false,
      sortMode: 'none',
    });
    const trail = new Entity('BallTrail');
    trail.addComponent(this.trailTransform);
    trail.addComponent(this.trailEmitter);
    this.world.addEntity(trail);
  }

  private bindInput(): void {
    const controlled = new Set(['w', 's', 'arrowup', 'arrowdown', 'r', 'p', ' ']);
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (controlled.has(key)) event.preventDefault();
      if (key === 'r') {
        if (!event.repeat) this.restart();
        return;
      }
      if ((key === 'p' || key === ' ') && !event.repeat) {
        this.togglePause();
        return;
      }
      this.keys.add(key);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    query<HTMLButtonElement>('#restart').addEventListener('click', () => this.restart());
    query<HTMLButtonElement>('#pause').addEventListener('click', () => this.togglePause());
  }

  private tick(timeMs: number, deltaMs: number): void {
    const seconds = Math.min(0.034, Math.max(0, deltaMs * 0.001));
    if (this.phase !== 'paused') {
      this.updatePaddles(seconds);
      if (this.phase === 'serving') {
        this.serveTimer -= seconds;
        if (this.serveTimer <= 0) this.launchServe();
      } else if (this.phase === 'playing') {
        this.updateBall(seconds);
      }
      this.updateLean(seconds);
    }
    this.updateTransforms(timeMs);
    this.cleanupEffects();
    this.world.update(timeMs, deltaMs);
    this.updateHud();
    if (++this.validationFrames === 24) void this.finishValidation();
  }

  private updatePaddles(seconds: number): void {
    const leftAxis = (this.keys.has('s') ? 1 : 0) - (this.keys.has('w') ? 1 : 0);
    const rightAxis = (this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('arrowup') ? 1 : 0);
    this.movePaddle(this.leftPaddle, leftAxis, seconds);
    this.movePaddle(this.rightPaddle, rightAxis, seconds);
  }

  private movePaddle(paddle: PaddleVisual, axis: number, seconds: number): void {
    const targetVelocity = axis * PADDLE_SPEED;
    const response = 1 - Math.exp(-seconds * 18);
    paddle.velocity += (targetVelocity - paddle.velocity) * response;
    if (axis === 0) paddle.velocity *= Math.exp(-seconds * 12);
    paddle.z = clampPaddleZ(paddle.z + paddle.velocity * seconds);
    if (Math.abs(paddle.z) >= PADDLE_LIMIT_Z - 0.01) paddle.velocity = 0;
  }

  private updateBall(seconds: number): void {
    const result = stepPongBall(this.ball, seconds, this.leftPaddle.z, this.rightPaddle.z);
    this.ball = result.ball;
    for (const event of result.events) this.handleCollision(event);
  }

  private handleCollision(event: PongCollisionEvent): void {
    if (event.type === 'goal') {
      if (event.scorer === 'left') this.scoreLeft++;
      else this.scoreRight++;
      this.saveState();
      const winner = this.scoreLeft >= WINNING_SCORE ? 'BLUE WINS' : this.scoreRight >= WINNING_SCORE ? 'RED WINS' : null;
      this.spawnImpact(this.ball.x > 0 ? TABLE_HALF_WIDTH : -TABLE_HALF_WIDTH, BALL_Y, this.ball.z, this.ball.x > 0 ? -1 : 1, 0, true);
      if (winner) {
        this.phase = 'finished';
        this.announcement.textContent = `${winner} · 按 R 再来一局`;
        this.announcement.dataset.visible = 'true';
      } else {
        this.serveDirection = event.scorer === 'left' ? -1 : 1;
        this.prepareServe(`${event.scorer === 'left' ? 'BLUE' : 'RED'} SCORES`);
      }
      return;
    }

    this.bounceCount++;
    if (event.type === 'paddle') {
      this.rally++;
      const paddle = event.side === 'left' ? this.leftPaddle : this.rightPaddle;
      paddle.leanVelocity += event.side === 'left' ? -3.8 : 3.8;
      this.spawnImpact(event.x, BALL_Y, event.z, event.side === 'left' ? 1 : -1, event.offset * 0.35, true);
    } else {
      this.spawnImpact(event.x, BALL_Y, event.z, 0, event.side === 'top' ? 1 : -1, false);
    }
  }

  private updateLean(seconds: number): void {
    for (const paddle of [this.leftPaddle, this.rightPaddle]) {
      paddle.leanVelocity += -paddle.lean * 48 * seconds;
      paddle.leanVelocity *= Math.exp(-seconds * 10);
      paddle.lean += paddle.leanVelocity * seconds;
      paddle.lean = Math.max(-0.24, Math.min(0.24, paddle.lean));
    }
  }

  private updateTransforms(timeMs: number): void {
    const bob = this.phase === 'serving' ? Math.sin(timeMs * 0.008) * 5 : 0;
    this.ballTransform.setPosition(this.ball.x, BALL_Y + bob, this.ball.z).setRotation(timeMs * 0.003, timeMs * 0.004, 0);
    this.ballShadow.setPosition(this.ball.x + 6, SURFACE_Y + 1.6, this.ball.z + 6);
    this.trailTransform.setPosition(this.ball.x, BALL_Y + bob, this.ball.z);
    this.trailEmitter.emitting = this.phase === 'playing';
    this.leftPaddle.transform.setPosition(-PADDLE_X, 56, this.leftPaddle.z).setRotation(0, 0, this.leftPaddle.lean);
    this.rightPaddle.transform.setPosition(PADDLE_X, 56, this.rightPaddle.z).setRotation(0, 0, this.rightPaddle.lean);
    this.leftPaddle.shadow.setPosition(-PADDLE_X + 10, SURFACE_Y + 1.5, this.leftPaddle.z + 8);
    this.rightPaddle.shadow.setPosition(PADDLE_X - 10, SURFACE_Y + 1.5, this.rightPaddle.z + 8);
    this.updateCharacterFace();
  }

  private updateCharacterFace(): void {
    const dx = this.ball.x - CHARACTER_HEAD[0];
    const dz = this.ball.z - CHARACTER_HEAD[2];
    this.faceYaw = Math.atan2(dx, dz);
    const cos = Math.cos(this.faceYaw);
    const sin = Math.sin(this.faceYaw);
    for (const part of this.headParts) {
      const [localX, localY, localZ] = part.offset;
      part.transform
        .setPosition(
          CHARACTER_HEAD[0] + localX * cos + localZ * sin,
          CHARACTER_HEAD[1] + localY,
          CHARACTER_HEAD[2] - localX * sin + localZ * cos,
        )
        .setRotation(0, this.faceYaw, 0);
    }
  }

  private spawnImpact(x: number, y: number, z: number, directionX: number, directionZ: number, strong: boolean): void {
    const smoke = new ParticleEmitter3D({
      maxParticles: strong ? 54 : 34,
      emissionRate: 0,
      burst: strong ? 34 : 22,
      duration: 0.02,
      loop: false,
      seed: 1103 + this.bounceCount * 97,
      lifetime: [0.45, 1.0],
      speed: [24, strong ? 82 : 58],
      direction: [directionX, 0.9, directionZ],
      spread: 1.05,
      gravity: [0, 30, 0],
      startSize: [7, 17],
      endSize: [24, 47],
      rotation: [0, Math.PI * 2],
      angularVelocity: [-1.4, 1.4],
      startColor: strong ? [0.62, 0.69, 0.72, 0.48] : [0.66, 0.75, 0.64, 0.38],
      endColor: [0.08, 0.10, 0.12, 0],
      shape: 'sphere',
      shapeRadius: 8,
      blendMode: 'normal',
      radial: true,
      depthTest: true,
      depthWrite: false,
      sortMode: 'back-to-front',
    });
    this.addEffect(`ImpactSmoke-${this.bounceCount}`, x, y, z, smoke);

    const sparks = new ParticleEmitter3D({
      maxParticles: strong ? 30 : 20,
      emissionRate: 0,
      burst: strong ? 24 : 14,
      duration: 0.01,
      loop: false,
      seed: 1907 + this.bounceCount * 131,
      lifetime: [0.16, 0.42],
      speed: [55, strong ? 150 : 105],
      direction: [directionX, 0.5, directionZ],
      spread: 1.2,
      gravity: [0, -180, 0],
      startSize: [3, 6],
      endSize: [0.2, 1],
      startColor: [1, 0.78, 0.12, 1],
      endColor: [1, 0.08, 0.01, 0],
      blendMode: 'additive',
      radial: true,
      depthTest: true,
      depthWrite: false,
      sortMode: 'none',
    });
    this.addEffect(`ImpactSparks-${this.bounceCount}`, x, y, z, sparks);
  }

  private addEffect(name: string, x: number, y: number, z: number, emitter: ParticleEmitter3D): void {
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D({ position: [x, y, z] }));
    entity.addComponent(emitter);
    this.world.addEntity(entity);
    this.effects.push({ entity, emitter });
  }

  private cleanupEffects(): void {
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      if (!effect || effect.emitter.simulationTime < 1.25 || effect.emitter.activeParticles > 0) continue;
      this.world.removeEntity(effect.entity);
      this.effects.splice(index, 1);
    }
  }

  private restart(save = true): void {
    this.scoreLeft = 0;
    this.scoreRight = 0;
    this.serveDirection = this.random() < 0.5 ? -1 : 1;
    this.leftPaddle.z = 0;
    this.rightPaddle.z = 0;
    this.leftPaddle.velocity = 0;
    this.rightPaddle.velocity = 0;
    this.leftPaddle.lean = 0;
    this.rightPaddle.lean = 0;
    this.prepareServe('READY');
    if (save) this.saveState();
  }

  private async loadOrStart(): Promise<void> {
    const saved = await this.saves.load();
    this.restart(false);
    if (!saved || saved.left >= WINNING_SCORE || saved.right >= WINNING_SCORE) {
      this.saveState();
      return;
    }
    this.scoreLeft = saved.left;
    this.scoreRight = saved.right;
    if (saved.left > 0 || saved.right > 0) this.prepareServe('继续对战');
  }

  private saveState(): void {
    this.saves.save({ left: this.scoreLeft, right: this.scoreRight });
  }

  private prepareServe(message: string): void {
    this.phase = 'serving';
    this.serveTimer = 0.9;
    this.rally = 0;
    this.ball = { x: 0, z: 0, vx: 0, vz: 0 };
    this.announcement.textContent = message;
    this.announcement.dataset.visible = 'true';
  }

  private launchServe(): void {
    if (this.phase === 'finished') return;
    const angle = (this.random() * 2 - 1) * 0.38;
    const [vx, vz] = serveVelocity(this.serveDirection, angle);
    this.ball = { x: 0, z: 0, vx, vz };
    this.phase = 'playing';
    this.announcement.dataset.visible = 'false';
  }

  private togglePause(): void {
    if (this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
      this.announcement.dataset.visible = this.phase === 'serving' ? 'true' : 'false';
      return;
    }
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    this.announcement.textContent = 'PAUSED';
    this.announcement.dataset.visible = 'true';
  }

  private updateHud(): void {
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    this.leftScore.textContent = String(this.scoreLeft);
    this.rightScore.textContent = String(this.scoreRight);
    this.rallyText.textContent = String(this.rally).padStart(2, '0');
    this.speedText.textContent = `${Math.round(speed)} / ${MAX_BALL_SPEED}`;
    this.statusText.textContent = this.phase === 'paused'
      ? '暂停'
      : this.phase === 'finished'
        ? '本局结束'
        : this.phase === 'serving'
          ? '准备发球'
          : speed > INITIAL_BALL_SPEED * 1.7
            ? '高速对拉'
            : '对战中';
    document.body.dataset.phase = this.phase;
    document.body.dataset.rally = String(this.rally);
    document.body.dataset.ballSpeed = speed.toFixed(2);
    document.body.dataset.particles = String(this.effects.reduce((sum, effect) => sum + effect.emitter.activeParticles, 0));
    document.body.dataset.leftPaddleZ = this.leftPaddle.z.toFixed(2);
    document.body.dataset.rightPaddleZ = this.rightPaddle.z.toFixed(2);
    document.body.dataset.leftLean = this.leftPaddle.lean.toFixed(4);
    document.body.dataset.rightLean = this.rightPaddle.lean.toFixed(4);
    document.body.dataset.faceYaw = this.faceYaw.toFixed(4);
  }

  private snapshot(): PongSnapshot {
    return {
      phase: this.phase,
      score: [this.scoreLeft, this.scoreRight],
      rally: this.rally,
      bounceCount: this.bounceCount,
      speed: Math.hypot(this.ball.vx, this.ball.vz),
      ball: { ...this.ball },
      paddles: [this.leftPaddle.z, this.rightPaddle.z],
      faceYaw: this.faceYaw,
      particles: this.effects.reduce((sum, effect) => sum + effect.emitter.activeParticles, 0),
    };
  }

  private random(): number {
    if (this.randomState === 0) return Math.random();
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }

  private async finishValidation(): Promise<void> {
    await this.engine.device.queue.onSubmittedWorkDone();
    const scopedError = await this.engine.device.popErrorScope();
    if (scopedError) this.validationErrors.push(scopedError.message);
    const status = this.validationErrors.length === 0 ? 'passed' : 'failed';
    document.body.dataset.renderStatus = status;
    document.body.dataset.renderError = this.validationErrors.join('\n');
    query<HTMLElement>('#result').textContent = JSON.stringify({ status, errors: this.validationErrors, ...this.snapshot() });
  }

  private addBox(
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: Color,
    shininess: number,
    rotation: readonly [number, number, number] = [0, 0, 0],
  ): CartesianTransform3D {
    const transform = new CartesianTransform3D({ position: [x, y, z], rotation: [...rotation] });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createBox3D({ width, height, depth }), this.material(color, shininess)));
    this.world.addEntity(entity);
    return transform;
  }

  private addRoundedBox(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, radius: number, color: Color, shininess: number): CartesianTransform3D {
    const transform = new CartesianTransform3D({ position: [x, y, z] });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createRoundedBox3D({ width, height, depth, radius, segments: 4 }), this.material(color, shininess)));
    this.world.addEntity(entity);
    return transform;
  }

  private addShadow(name: string, x: number, y: number, z: number, width: number, depth: number, opacity: number): CartesianTransform3D {
    const transform = new CartesianTransform3D({ position: [x, y, z], scale: [width, 1, depth] });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createPlane3D({ width: 1, height: 1, normal: 'y' }), new RadialShadowMaterial({ opacity, innerRadius: 0.08 })));
    this.world.addEntity(entity);
    return transform;
  }

  private addHeadSphere(name: string, offset: readonly [number, number, number], radius: number, color: Color, scale: readonly [number, number, number]): void {
    const transform = new CartesianTransform3D({ position: [...CHARACTER_HEAD], scale: [...scale] });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createSphere3D({ radius, widthSegments: 18, heightSegments: 10 }), this.material(color, 40)));
    this.world.addEntity(entity);
    this.headParts.push({ transform, offset });
  }

  private addHeadBox(name: string, offset: readonly [number, number, number], width: number, height: number, depth: number, color: Color, shininess: number): void {
    const transform = new CartesianTransform3D({ position: [...CHARACTER_HEAD] });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createRoundedBox3D({ width, height, depth, radius: Math.min(width, height, depth) * 0.18, segments: 2 }), this.material(color, shininess)));
    this.world.addEntity(entity);
    this.headParts.push({ transform, offset });
  }

  private material(color: Color, shininess: number, specular: Color = [0.38, 0.38, 0.38, 1]): BlinnPhongMaterial {
    return new BlinnPhongMaterial({
      diffuse: [...color],
      ambient: [color[0] * 0.24, color[1] * 0.24, color[2] * 0.24, color[3]],
      specular: [...specular],
      shininess,
    });
  }
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element ${selector}.`);
  return element;
}

async function main(): Promise<void> {
  const game = new PongGame();
  await game.init(query<HTMLCanvasElement>('#canvas'));
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.renderStatus = 'failed';
  document.body.dataset.renderError = message;
  query<HTMLElement>('#announcement').textContent = `启动失败：${message}`;
  query<HTMLElement>('#announcement').dataset.visible = 'true';
  query<HTMLElement>('#result').textContent = JSON.stringify({ status: 'failed', errors: [message] });
  console.error(error);
});
