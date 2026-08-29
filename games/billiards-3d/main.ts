import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial, RadialShadowMaterial } from '@haiyue/engine/material';
import { RadialShadowRenderFeature, Render3DSystem } from '@haiyue/engine/systems';
import { Camera3D, CartesianTransform3D, DirectionalLight, Entity, Mesh3D, OrbitControl, SphericalTransform3D, Transform2D, HaiyueEngine, World, createBox3D, createPlane3D, createSphere3D } from '@haiyue/engine';
import {
  Physics2DBody,
  Physics2DSystem,
} from '@haiyue/engine/physics';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiSystem } from '@haiyue/engine/gui';
import { mat4 } from 'wgpu-matrix';
import { requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave, isFiniteNumber, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';
import { Billiards3DHud } from './Billiards3DHud';
import { projectToScreen } from './input';

interface Billiards3DSaveData {
  potted: number;
  balls: Array<{ x: number; z: number; active: boolean }>;
}

function isBilliards3DSaveData(value: unknown): value is Billiards3DSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.potted) && value.potted <= 10
    && Array.isArray(value.balls) && value.balls.length === 11
    && value.balls.every(ball => isRecord(ball)
      && isFiniteNumber(ball.x) && isFiniteNumber(ball.z)
      && typeof ball.active === 'boolean');
}

interface Ball {
  entity: Entity;
  shadow: Entity;
  physics: Physics2DBody;
  t2d: Transform2D;
  t3d: CartesianTransform3D;
  kind: 'cue' | 'red';
  active: boolean;
}

type CameraMode = 'aim' | 'top' | 'transition';

const TABLE_W = 760;
const TABLE_H = 420;
const BALL_R = 14;
const POCKET_R = 27;
const MAX_DRAG = 190;
const IMPULSE_SCALE = 0.020;
const STOP_SPEED = 0.045;
const BALL_Y = BALL_R + 8;
const SHADOW_Y = 5.85;
const AIM_RADIUS = 175;
const AIM_PHI = Math.PI * 0.45;
const AIM_THETA_TO_RACK = -Math.PI / 2;
const TOP_RADIUS = 980;
const TOP_THETA = 0;
const TOP_PHI = Math.PI * 0.035;

const POCKETS: Array<[number, number]> = [
  [-TABLE_W / 2, -TABLE_H / 2],
  [0, -TABLE_H / 2 - 4],
  [TABLE_W / 2, -TABLE_H / 2],
  [-TABLE_W / 2, TABLE_H / 2],
  [0, TABLE_H / 2 + 4],
  [TABLE_W / 2, TABLE_H / 2],
];

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

class Billiards3DGame {
  private readonly saves = new SingleSlotGameSave<Billiards3DSaveData>({
    gameId: 'billiards-3d',
    name: 'Billiards 3D 自动存档',
    validateData: isBilliards3DSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private camera!: Camera3D;
  private cameraEntity!: Entity;
  private orbitTransform!: SphericalTransform3D;
  private orbit!: OrbitControl;
  private physics!: Physics2DSystem;
  private hud!: Billiards3DHud;
  private viewProj = new Float32Array(16);
  private projection = new Float32Array(16);
  private viewMatrix = new Float32Array(16);

  private balls: Ball[] = [];
  private tableEntities: Entity[] = [];
  private cueBall!: Ball;
  private potted = 0;
  private mode: CameraMode = 'aim';
  private charging = false;
  private chargeStartY = 0;
  private chargePower = 0;
  private pointerId = -1;
  private readonly velocityScratch = { x: 0, y: 0 };
  private wasMoving = false;
  private newGameRequested = false;
  private transition: {
    startTime: number;
    duration: number;
    from: { radius: number; theta: number; phi: number; target: [number, number, number] };
    to: { radius: number; theta: number; phi: number; target: [number, number, number] };
    done: () => void;
  } | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.03, g: 0.07, b: 0.06, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    this.engine.resizeToDisplaySize(true);
    this.world = new World('Billiards3D');

    this.setupCamera(canvas);
    this.setupLights();
    this.physics = new Physics2DSystem({
      gravity: [0, 0],
      pixelsPerMeter: 100,
      velocityIterations: 10,
      positionIterations: 6,
      priority: 0,
    });
    this.world.addSystem(this.physics);
    const render3DSystem = new Render3DSystem(this.engine, this.cameraEntity, { priority: 10, loadOp: 'clear' });
    this.world.addSystem(render3DSystem);
    this.world.addSystem(new RadialShadowRenderFeature(this.engine, this.cameraEntity, { priority: 20, loadOp: 'load' }));
    this.hud = new Billiards3DHud(this.world, () => this.requestNewGame());
    const guiSystem = new GuiSystem(this.engine, { loadOp: 'load' });
    guiSystem.priority = 30;
    this.world.addSystem(guiSystem);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Billiards3D.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));

    await this.loadOrStart();
    this.setupInput(canvas);

    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    this.camera = new Camera3D({ type: 'perspective', fov: Math.PI / 4.2, near: 1, far: 3000 });
    this.orbitTransform = new SphericalTransform3D({
      radius: AIM_RADIUS,
      theta: AIM_THETA_TO_RACK,
      phi: AIM_PHI,
      target: [-235, BALL_Y, 0],
    });
    this.cameraEntity = new Entity('Camera');
    this.cameraEntity.addComponent(this.camera);
    this.cameraEntity.addComponent(this.orbitTransform);
    this.world.addEntity(this.cameraEntity);
    this.orbit = new OrbitControl(canvas, this.orbitTransform, {
      minRadius: 95,
      maxRadius: 280,
      minPhi: Math.PI * 0.26,
      maxPhi: Math.PI * 0.49,
      enablePan: false,
      rotateSpeed: 0.72,
      zoomSpeed: 0.35,
    });
  }

  private setupLights(): void {
    const ambient = new Entity('Ambient');
    ambient.addComponent(new AmbientLight({ color: [1, 1, 1], intensity: 0.34 }));
    this.world.addEntity(ambient);
    const key = new Entity('KeyLight');
    key.addComponent(new DirectionalLight({ color: [1, 0.96, 0.88], intensity: 1.35, direction: [-0.35, -1, -0.25] }));
    this.world.addEntity(key);
  }

  private newGame(save = true): void {
    for (const ball of this.balls) this.removeBallEntities(ball);
    for (const entity of this.tableEntities) this.world.removeEntity(entity);
    this.balls = [];
    this.tableEntities = [];
    this.potted = 0;
    this.charging = false;
    this.transition = null;
    this.hidePower();
    this.buildTable();
    this.cueBall = this.createBall('cue', -235, 0, [0.96, 0.94, 0.86, 1]);

    let index = 0;
    const startX = 135;
    const spacing = BALL_R * 2.18;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col <= row; col++) {
        if (index >= 10) break;
        this.createBall('red', startX + row * spacing, (col - row * 0.5) * spacing, [0.86, 0.06, 0.08, 1]);
        index++;
      }
    }

    this.world.update(0, 0);
    this.syncBallMeshes();
    this.snapToCueCamera();
    this.updateHud();
    this.wasMoving = false;
    if (save) this.saveState();
  }

  private requestNewGame(): void {
    this.newGameRequested = true;
  }

  private async loadOrStart(): Promise<void> {
    const saved = await this.saves.load();
    this.newGame(false);
    if (!saved) {
      this.saveState();
      return;
    }
    this.potted = saved.potted;
    saved.balls.forEach((data, index) => {
      const ball = this.balls[index];
      if (!ball) return;
      ball.active = data.active;
      if (!data.active) this.removeBallEntities(ball);
      else {
        this.physics.teleportBody(ball.physics, data.x, data.z, 0);
        ball.t2d.x = data.x;
        ball.t2d.y = data.z;
      }
    });
    this.syncBallMeshes();
    this.updateHud();
  }

  private saveState(): void {
    this.saves.save({
      potted: this.potted,
      balls: this.balls.map(ball => ({ x: ball.t2d.x, z: ball.t2d.y, active: ball.active })),
    });
  }

  private buildTable(): void {
    this.addBox('TableBase', 0, -8, 0, TABLE_W + 92, 16, TABLE_H + 92, [0.18, 0.08, 0.035, 1]);
    this.addBox('Felt', 0, 0, 0, TABLE_W, 10, TABLE_H, [0.04, 0.37, 0.22, 1]);
    this.addRail('TopRail', 0, TABLE_H / 2 + 24, TABLE_W + 80, 38);
    this.addRail('BottomRail', 0, -TABLE_H / 2 - 24, TABLE_W + 80, 38);
    this.addRail('LeftRail', -TABLE_W / 2 - 24, 0, 38, TABLE_H + 80);
    this.addRail('RightRail', TABLE_W / 2 + 24, 0, 38, TABLE_H + 80);
    for (const [x, z] of POCKETS) {
      const pocket = new Entity('Pocket');
      pocket.addComponent(new CartesianTransform3D({ position: [x, 3, z], scale: [1, 0.16, 1] }));
      pocket.addComponent(new Mesh3D(
        createSphere3D({ radius: POCKET_R, widthSegments: 32, heightSegments: 12 }),
        new BlinnPhongMaterial({ diffuse: [0.01, 0.01, 0.01, 1], ambient: [0, 0, 0, 1], specular: [0.02, 0.02, 0.02, 1] }),
      ));
      this.world.addEntity(pocket);
      this.tableEntities.push(pocket);
    }
  }

  private addBox(name: string, x: number, y: number, z: number, width: number, height: number, depth: number, color: [number, number, number, number]): Entity {
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D({ position: [x, y, z] }));
    entity.addComponent(new Mesh3D(
      createBox3D({ width, height, depth }),
      new BlinnPhongMaterial({ diffuse: color, ambient: [color[0] * 0.25, color[1] * 0.25, color[2] * 0.25, 1], specular: [0.22, 0.18, 0.12, 1], shininess: 20 }),
    ));
    this.world.addEntity(entity);
    this.tableEntities.push(entity);
    return entity;
  }

  private addRail(name: string, x: number, z: number, width: number, depth: number): void {
    const rail = this.addBox(name, x, 16, z, width, 30, depth, [0.30, 0.13, 0.05, 1]);
    rail.addComponent(new Transform2D({ x, y: z }));
    rail.addComponent(new Physics2DBody({
      type: 'static',
      shape: 'box',
      width,
      height: depth,
      friction: 0.08,
      restitution: 0.92,
    }));
  }

  private createBall(kind: 'cue' | 'red', x: number, z: number, color: [number, number, number, number]): Ball {
    const entity = new Entity(kind === 'cue' ? 'CueBall' : 'RedBall');
    const t2d = new Transform2D({ x, y: z });
    const t3d = new CartesianTransform3D({ position: [x, BALL_Y, z] });
    const physics = new Physics2DBody({
      type: 'dynamic',
      shape: 'circle',
      radius: BALL_R,
      density: 1,
      friction: 0.02,
      restitution: 0.96,
      linearDamping: 1.35,
      angularDamping: 2.2,
      bullet: true,
    });
    entity.addComponent(t2d);
    entity.addComponent(t3d);
    entity.addComponent(new Mesh3D(
      createSphere3D({ radius: BALL_R, widthSegments: 32, heightSegments: 16 }),
      new BlinnPhongMaterial({ diffuse: color, ambient: [color[0] * 0.20, color[1] * 0.20, color[2] * 0.20, 1], specular: [0.95, 0.95, 0.9, 1], shininess: 78 }),
    ));
    entity.addComponent(physics);
    this.world.addEntity(entity);
    const ball: Ball = { entity, shadow: this.createBallShadow(x, z), physics, t2d, t3d, kind, active: true };
    this.balls.push(ball);
    return ball;
  }

  private createBallShadow(x: number, z: number): Entity {
    const shadow = new Entity('BallShadow');
    shadow.addComponent(new CartesianTransform3D({
      position: [x + 4, SHADOW_Y, z - 5],
      scale: [BALL_R * 4.25, 1, BALL_R * 4.25],
    }));
    shadow.addComponent(new Mesh3D(
      createPlane3D({ width: 1, height: 1, normal: 'y' }),
      new RadialShadowMaterial({ opacity: 0.26, innerRadius: 0.10 }),
    ));
    this.world.addEntity(shadow);
    return shadow;
  }

  private removeBallEntities(ball: Ball): void {
    this.world.removeEntity(ball.entity);
    this.world.removeEntity(ball.shadow);
  }

  private setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (event) => {
      if (this.mode !== 'aim' || !this.canShoot() || !this.pointerNearCue(canvas, event)) return;
      this.charging = true;
      this.pointerId = event.pointerId;
      this.chargeStartY = event.clientY;
      this.chargePower = 0;
      this.orbit.enableRotate = false;
      this.orbit.enableZoom = false;
      canvas.setPointerCapture(event.pointerId);
      this.showPower(0);
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.charging || event.pointerId !== this.pointerId) return;
      this.chargePower = clamp01((event.clientY - this.chargeStartY) / MAX_DRAG);
      this.showPower(this.chargePower);
      event.preventDefault();
    });
    const release = (event: PointerEvent) => {
      if (!this.charging || event.pointerId !== this.pointerId) return;
      const power = this.chargePower;
      this.charging = false;
      this.pointerId = -1;
      this.hidePower();
      this.orbit.enableRotate = false;
      this.orbit.enableZoom = false;
      if (power > 0.04) this.shoot(power);
      else this.enableAimControls();
      event.preventDefault();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  private pointerNearCue(canvas: HTMLCanvasElement, event: PointerEvent): boolean {
    const rect = canvas.getBoundingClientRect();
    const pos = projectToScreen(
      this.cueBall.t2d.x,
      BALL_Y,
      this.cueBall.t2d.y,
      this.viewProj,
      rect.width,
      rect.height,
    );
    if (pos.behind) return false;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return Math.hypot(x - pos.x, y - pos.y) <= 44;
  }

  private shoot(power: number): void {
    const direction = this.shotDirection();
    if (!this.physics.applyLinearImpulse(
      this.cueBall.physics,
      direction[0] * power * MAX_DRAG * IMPULSE_SCALE,
      direction[1] * power * MAX_DRAG * IMPULSE_SCALE,
    )) return;
    this.hud.setState('Rolling');
    this.transitionToTopView();
  }

  private shotDirection(): [number, number] {
    const eye = this.orbitTransform.eyePosition;
    const target = this.orbitTransform.target;
    const dx = requiredNumberAt(target, 0, 'billiards orbit target') - requiredNumberAt(eye, 0, 'billiards eye position');
    const dz = requiredNumberAt(target, 2, 'billiards orbit target') - requiredNumberAt(eye, 2, 'billiards eye position');
    const len = Math.hypot(dx, dz) || 1;
    return [dx / len, dz / len];
  }

  private tick(time: number, delta: number): void {
    if (this.newGameRequested) {
      this.newGameRequested = false;
      this.newGame();
    }
    this.updateCameraTransition(time);
    this.world.update(time, delta);
    this.syncBallMeshes();
    this.checkPockets();
    this.settleSlowBalls();
    const moving = this.balls.some(ball => ball.active && this.physics.getLinearVelocity(ball.physics, this.velocityScratch)
      && Math.hypot(this.velocityScratch.x, this.velocityScratch.y) >= STOP_SPEED);
    if (this.wasMoving && !moving) this.saveState();
    this.wasMoving = moving;
    this.updateViewProj();
    if (this.mode === 'aim' && !this.charging) this.followCueTarget();
    if (this.mode === 'top' && this.canShoot() && this.potted < 10) this.transitionToCueView();
    if (!this.charging) this.updateHud();
  }

  private syncBallMeshes(): void {
    for (const ball of this.balls) {
      if (!ball.active) continue;
      ball.t3d.setPosition(ball.t2d.x, BALL_Y, ball.t2d.y);
      const transform = ball.shadow.getComponent(CartesianTransform3D);
      if (transform) transform.setPosition(ball.t2d.x + 4, SHADOW_Y, ball.t2d.y - 5);
    }
  }

  private checkPockets(): void {
    for (const ball of this.balls) {
      if (!ball.active) continue;
      const inPocket = POCKETS.some(([x, z]) => Math.hypot(ball.t2d.x - x, ball.t2d.y - z) <= POCKET_R - 3);
      if (!inPocket) continue;
      if (ball.kind === 'cue') this.resetCueBall();
      else {
        ball.active = false;
        this.potted++;
        this.removeBallEntities(ball);
      }
    }
  }

  private resetCueBall(): void {
    if (!this.physics.setLinearVelocity(this.cueBall.physics, 0, 0)) return;
    this.physics.setAngularVelocity(this.cueBall.physics, 0);
    this.physics.teleportBody(this.cueBall.physics, -235, 0, 0);
    this.cueBall.t2d.x = -235;
    this.cueBall.t2d.y = 0;
    this.cueBall.t3d.setPosition(-235, BALL_Y, 0);
  }

  private settleSlowBalls(): void {
    for (const ball of this.balls) {
      if (!ball.active || !this.physics.getLinearVelocity(ball.physics, this.velocityScratch)) continue;
      if (Math.hypot(this.velocityScratch.x, this.velocityScratch.y) <= STOP_SPEED) {
        this.physics.setLinearVelocity(ball.physics, 0, 0);
        this.physics.setAngularVelocity(ball.physics, 0);
      }
    }
  }

  private canShoot(): boolean {
    if (this.transition || this.potted >= 10) return false;
    return this.balls.every(ball => {
      if (!ball.active || !this.physics.getLinearVelocity(ball.physics, this.velocityScratch)) return true;
      return Math.hypot(this.velocityScratch.x, this.velocityScratch.y) < STOP_SPEED;
    });
  }

  private transitionToTopView(): void {
    this.mode = 'transition';
    this.startCameraTransition({
      radius: TOP_RADIUS,
      theta: TOP_THETA,
      phi: TOP_PHI,
      target: [0, 0, 0],
    }, 760, () => {
      this.mode = 'top';
      this.orbit.enableRotate = false;
      this.orbit.enableZoom = false;
    });
  }

  private transitionToCueView(): void {
    this.mode = 'transition';
    const theta = this.orbitTransform.theta;
    this.startCameraTransition({
      radius: AIM_RADIUS,
      theta,
      phi: AIM_PHI,
      target: [this.cueBall.t2d.x, BALL_Y, this.cueBall.t2d.y],
    }, 720, () => {
      this.mode = 'aim';
      this.enableAimControls();
    });
  }

  private snapToCueCamera(): void {
    this.mode = 'aim';
    this.orbitTransform.setTarget(this.cueBall.t2d.x, BALL_Y, this.cueBall.t2d.y);
    this.orbitTransform.set(AIM_RADIUS, AIM_THETA_TO_RACK, AIM_PHI);
    this.enableAimControls();
    this.updateViewProj();
  }

  private followCueTarget(): void {
    this.orbitTransform.setTarget(this.cueBall.t2d.x, BALL_Y, this.cueBall.t2d.y);
  }

  private enableAimControls(): void {
    this.orbit.enableRotate = true;
    this.orbit.enableZoom = true;
  }

  private startCameraTransition(to: { radius: number; theta: number; phi: number; target: [number, number, number] }, duration: number, done: () => void): void {
    this.transition = {
      startTime: performance.now(),
      duration,
      from: {
        radius: this.orbitTransform.radius,
        theta: this.orbitTransform.theta,
        phi: this.orbitTransform.phi,
        target: [
          requiredNumberAt(this.orbitTransform.target, 0, 'billiards orbit target'),
          requiredNumberAt(this.orbitTransform.target, 1, 'billiards orbit target'),
          requiredNumberAt(this.orbitTransform.target, 2, 'billiards orbit target'),
        ],
      },
      to,
      done,
    };
  }

  private updateCameraTransition(_time: number): void {
    if (!this.transition) return;
    const t = ease(clamp01((performance.now() - this.transition.startTime) / this.transition.duration));
    const { from, to } = this.transition;
    this.orbitTransform.setTarget(
      lerp(from.target[0], to.target[0], t),
      lerp(from.target[1], to.target[1], t),
      lerp(from.target[2], to.target[2], t),
    );
    this.orbitTransform.set(lerp(from.radius, to.radius, t), lerp(from.theta, to.theta, t), lerp(from.phi, to.phi, t));
    if (t >= 1) {
      const done = this.transition.done;
      this.transition = null;
      done();
    }
  }

  private updateViewProj(): void {
    this.orbitTransform.updateWorldMatrix(undefined, 0);
    const aspect = Math.max(1, this.engine.displayWidth) / Math.max(1, this.engine.displayHeight);
    const projection = this.camera.writeProjectionMatrix(this.projection, aspect);
    const view = mat4.inverse(this.orbitTransform.worldMatrix, this.viewMatrix);
    mat4.multiply(projection, view, this.viewProj);
  }

  private showPower(power: number): void {
    this.hud.showPower(power);
  }

  private hidePower(): void {
    this.hud.hidePower();
  }

  private updateHud(): void {
    this.hud.setScore(this.potted);
    if (this.potted >= 10) this.hud.setState('Cleared');
    else if (this.mode === 'aim' && this.canShoot()) this.hud.setState('Ready');
    else this.hud.setState('Rolling');
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new Billiards3DGame().init(canvas);
