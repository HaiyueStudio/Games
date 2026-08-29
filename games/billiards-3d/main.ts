import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial, RadialShadowMaterial } from '@haiyue/engine/material';
import { RadialShadowRenderFeature, Render3DSystem } from '@haiyue/engine/systems';
import { Camera3D, CartesianTransform3D, DirectionalLight, Entity, Mesh3D, OrbitControl, SphericalTransform3D, Transform2D, HaiyueEngine, World, createBox3D, createPlane3D, createSphere3D } from '@haiyue/engine';
import {
  Physics2DBody,
  Physics2DSystem,
} from '@haiyue/engine/physics';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave, isFiniteNumber, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';

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

function projectToScreen(x: number, y: number, z: number, viewProj: Float32Array): { x: number; y: number; behind: boolean } {
  const cx = requiredNumberAt(viewProj, 0, 'billiards view projection') * x + requiredNumberAt(viewProj, 4, 'billiards view projection') * y + requiredNumberAt(viewProj, 8, 'billiards view projection') * z + requiredNumberAt(viewProj, 12, 'billiards view projection');
  const cy = requiredNumberAt(viewProj, 1, 'billiards view projection') * x + requiredNumberAt(viewProj, 5, 'billiards view projection') * y + requiredNumberAt(viewProj, 9, 'billiards view projection') * z + requiredNumberAt(viewProj, 13, 'billiards view projection');
  const cw = requiredNumberAt(viewProj, 3, 'billiards view projection') * x + requiredNumberAt(viewProj, 7, 'billiards view projection') * y + requiredNumberAt(viewProj, 11, 'billiards view projection') * z + requiredNumberAt(viewProj, 15, 'billiards view projection');
  return { x: (cx / cw + 1) * 450, y: (1 - cy / cw) * 300, behind: cw < 0 };
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
  private viewProj = new Float32Array(16);

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
  private transition: {
    startTime: number;
    duration: number;
    from: { radius: number; theta: number; phi: number; target: [number, number, number] };
    to: { radius: number; theta: number; phi: number; target: [number, number, number] };
    done: () => void;
  } | null = null;

  private elScore = document.getElementById('score')!;
  private elState = document.getElementById('state')!;
  private elPowerWrap = document.getElementById('power-wrap') as HTMLElement;
  private elPower = document.getElementById('power') as HTMLElement;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.03, g: 0.07, b: 0.06, a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
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
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Billiards3D.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));

    await this.loadOrStart();
    this.setupInput(canvas);
    document.getElementById('btn-new')!.addEventListener('click', () => this.newGame());

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
    });
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
    const pos = projectToScreen(this.cueBall.t2d.x, BALL_Y, this.cueBall.t2d.y, this.viewProj);
    if (pos.behind) return false;
    const rect = canvas.getBoundingClientRect();
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
    this.elState.textContent = 'Rolling';
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
    const view = this.orbitTransform.worldMatrix;
    const inv = new Float32Array(view);
    const m = this.camera.projectionMatrix;
    const viewMatrix = invert4(inv);
    multiply4(m, viewMatrix, this.viewProj);
  }

  private showPower(power: number): void {
    this.elPowerWrap.style.display = 'block';
    this.elPower.style.width = `${Math.round(power * 100)}%`;
    this.elState.textContent = `Power ${Math.round(power * 100)}%`;
  }

  private hidePower(): void {
    this.elPowerWrap.style.display = 'none';
    this.elPower.style.width = '0%';
  }

  private updateHud(): void {
    this.elScore.textContent = `${this.potted} / 10`;
    if (this.potted >= 10) this.elState.textContent = 'Cleared';
    else if (this.mode === 'aim' && this.canShoot()) this.elState.textContent = 'Ready';
    else this.elState.textContent = 'Rolling';
  }
}

function multiply4(a: Float32Array, b: Float32Array, out: Float32Array): void {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        requiredNumberAt(a, r, 'left billiards matrix') * requiredNumberAt(b, c * 4, 'right billiards matrix') +
        requiredNumberAt(a, 4 + r, 'left billiards matrix') * requiredNumberAt(b, c * 4 + 1, 'right billiards matrix') +
        requiredNumberAt(a, 8 + r, 'left billiards matrix') * requiredNumberAt(b, c * 4 + 2, 'right billiards matrix') +
        requiredNumberAt(a, 12 + r, 'left billiards matrix') * requiredNumberAt(b, c * 4 + 3, 'right billiards matrix');
    }
  }
}

function invert4(m: Float32Array): Float32Array {
  const inv = new Float32Array(16);
  const n = Array.from(m);
  const a00 = requiredNumberAt(n, 0, 'billiards matrix'), a01 = requiredNumberAt(n, 1, 'billiards matrix'), a02 = requiredNumberAt(n, 2, 'billiards matrix'), a03 = requiredNumberAt(n, 3, 'billiards matrix');
  const a10 = requiredNumberAt(n, 4, 'billiards matrix'), a11 = requiredNumberAt(n, 5, 'billiards matrix'), a12 = requiredNumberAt(n, 6, 'billiards matrix'), a13 = requiredNumberAt(n, 7, 'billiards matrix');
  const a20 = requiredNumberAt(n, 8, 'billiards matrix'), a21 = requiredNumberAt(n, 9, 'billiards matrix'), a22 = requiredNumberAt(n, 10, 'billiards matrix'), a23 = requiredNumberAt(n, 11, 'billiards matrix');
  const a30 = requiredNumberAt(n, 12, 'billiards matrix'), a31 = requiredNumberAt(n, 13, 'billiards matrix'), a32 = requiredNumberAt(n, 14, 'billiards matrix'), a33 = requiredNumberAt(n, 15, 'billiards matrix');
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return inv;
  det = 1 / det;
  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return inv;
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new Billiards3DGame().init(canvas);
