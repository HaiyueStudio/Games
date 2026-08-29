import { Camera2D, ColorSRGB, Entity, Material2D, Mesh2D, Transform2D, HaiyueEngine, World } from '@haiyue/engine';
import { Mesh2DRenderSystem } from '@haiyue/engine/systems';
import { createCircle2D, createRect2D } from '@haiyue/engine/geometry';
import {
  Physics2DBody,
  Physics2DSystem,
} from '@haiyue/engine/physics';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiSystem } from '@haiyue/engine/gui';
import { SingleSlotGameSave, isFiniteNumber, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';
import { BilliardsHud } from './BilliardsHud';

interface BilliardsSaveData {
  potted: number;
  balls: Array<{ x: number; y: number; active: boolean }>;
}

function isBilliardsSaveData(value: unknown): value is BilliardsSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.potted) && value.potted <= 10
    && Array.isArray(value.balls) && value.balls.length === 11
    && value.balls.every(ball => isRecord(ball)
      && isFiniteNumber(ball.x) && isFiniteNumber(ball.y)
      && typeof ball.active === 'boolean');
}

interface Ball {
  entity: Entity;
  body: Physics2DBody;
  transform: Transform2D;
  material: Material2D;
  kind: 'cue' | 'red';
  active: boolean;
}

const TABLE_W = 760;
const TABLE_H = 420;
const BALL_R = 14;
const POCKET_R = 27;
const MAX_PULL = 150;
const IMPULSE_SCALE = 0.022;
const STOP_SPEED = 0.045;

const POCKETS: Array<[number, number]> = [
  [-TABLE_W / 2, -TABLE_H / 2],
  [0, -TABLE_H / 2 - 4],
  [TABLE_W / 2, -TABLE_H / 2],
  [-TABLE_W / 2, TABLE_H / 2],
  [0, TABLE_H / 2 + 4],
  [TABLE_W / 2, TABLE_H / 2],
];

function screenToWorld(canvas: HTMLCanvasElement, camera: Camera2D, event: PointerEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * camera.width / camera.zoom;
  const y = (0.5 - (event.clientY - rect.top) / rect.height) * camera.height / camera.zoom;
  return [x, y];
}

function clampPull(dx: number, dy: number): [number, number] {
  const length = Math.hypot(dx, dy);
  if (length <= MAX_PULL || length === 0) return [dx, dy];
  const scale = MAX_PULL / length;
  return [dx * scale, dy * scale];
}

class BilliardsGame {
  private readonly saves = new SingleSlotGameSave<BilliardsSaveData>({
    gameId: 'billiards',
    name: 'Billiards 自动存档',
    validateData: isBilliardsSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private cameraEntity!: Entity;
  private camera!: Camera2D;
  private physics!: Physics2DSystem;
  private hud!: BilliardsHud;
  private aimTransform!: Transform2D;
  private aimMesh!: Mesh2D;

  private balls: Ball[] = [];
  private tableEntities: Entity[] = [];
  private cueBall!: Ball;
  private potted = 0;
  private aiming = false;
  private aimStart: [number, number] = [0, 0];
  private pointerId = -1;
  private readonly velocityScratch = { x: 0, y: 0 };
  private wasMoving = false;
  private newGameRequested = false;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.06, g: 0.16, b: 0.12, a: 1 },
    });
    await this.engine.init();
    this.engine.resizeToDisplaySize(true);

    this.world = new World('Billiards');
    this.camera = new Camera2D({
      width: 900,
      height: 600,
      designWidth: 900,
      designHeight: 600,
      viewportMode: 'expand',
    });
    this.cameraEntity = new Entity('Camera');
    this.cameraEntity.addComponent(this.camera);
    this.world.addEntity(this.cameraEntity);

    this.physics = new Physics2DSystem({
      gravity: [0, 0],
      pixelsPerMeter: 100,
      velocityIterations: 10,
      positionIterations: 6,
      priority: 0,
    });
    this.world.addSystem(this.physics);
    this.world.addSystem(new Mesh2DRenderSystem(this.engine, this.cameraEntity, { loadOp: 'clear', priority: 10 }));
    this.hud = new BilliardsHud(this.world, () => this.requestNewGame());
    const guiSystem = new GuiSystem(this.engine, { loadOp: 'load' });
    guiSystem.priority = 20;
    this.world.addSystem(guiSystem);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Billiards.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));

    await this.loadOrStart();
    this.setupAimGuide();
    this.setupInput(canvas);

    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    this.engine.run();
  }

  private newGame(save = true): void {
    for (const ball of this.balls) this.world.removeEntity(ball.entity);
    for (const entity of this.tableEntities) this.world.removeEntity(entity);
    this.balls = [];
    this.tableEntities = [];
    this.potted = 0;
    this.aiming = false;
    this.hideAim();

    this.createTable();
    this.cueBall = this.createBall('cue', -235, 0, [0.96, 0.94, 0.86, 1]);

    let index = 0;
    const startX = 135;
    const spacing = BALL_R * 2.18;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col <= row; col++) {
        if (index >= 10) break;
        const x = startX + row * spacing;
        const y = (col - row * 0.5) * spacing;
        this.createBall('red', x, y, [0.86, 0.06, 0.08, 1]);
        index++;
      }
    }

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
    // Initial physics bodies must exist before a saved position can be restored.
    // This runs before the engine loop starts, so it cannot re-enter GUI dispatch.
    this.world.update(0, 0);
    if (!saved) {
      this.saveState();
      return;
    }
    this.potted = saved.potted;
    saved.balls.forEach((data, index) => {
      const ball = this.balls[index];
      if (!ball) return;
      ball.active = data.active;
      if (!data.active) this.world.removeEntity(ball.entity);
      else {
        this.physics.teleportBody(ball.body, data.x, data.y, 0);
        ball.transform.x = data.x;
        ball.transform.y = data.y;
      }
    });
    this.updateHud();
  }

  private saveState(): void {
    this.saves.save({
      potted: this.potted,
      balls: this.balls.map(ball => ({ x: ball.transform.x, y: ball.transform.y, active: ball.active })),
    });
  }

  private createTable(): void {
    const felt = new Entity('Felt');
    felt.addComponent(new Transform2D({ x: 0, y: 0 }));
    felt.addComponent(new Mesh2D(
      createRect2D({ width: TABLE_W + 54, height: TABLE_H + 54 }),
      new Material2D({ color: new ColorSRGB(0.08, 0.34, 0.22, 1) }),
    ));
    this.world.addEntity(felt);
    this.tableEntities.push(felt);

    const play = new Entity('Playfield');
    play.addComponent(new Transform2D({ x: 0, y: 0 }));
    play.addComponent(new Mesh2D(
      createRect2D({ width: TABLE_W, height: TABLE_H }),
      new Material2D({ color: new ColorSRGB(0.05, 0.43, 0.25, 1) }),
    ));
    this.world.addEntity(play);
    this.tableEntities.push(play);

    const railColor: [number, number, number, number] = [0.30, 0.13, 0.05, 1];
    this.createWall('TopRail', 0, TABLE_H / 2 + 23, TABLE_W + 78, 38, railColor);
    this.createWall('BottomRail', 0, -TABLE_H / 2 - 23, TABLE_W + 78, 38, railColor);
    this.createWall('LeftRail', -TABLE_W / 2 - 23, 0, 38, TABLE_H + 78, railColor);
    this.createWall('RightRail', TABLE_W / 2 + 23, 0, 38, TABLE_H + 78, railColor);

    for (const [x, y] of POCKETS) {
      const pocket = new Entity('Pocket');
      pocket.addComponent(new Transform2D({ x, y }));
      pocket.addComponent(new Mesh2D(
        createCircle2D({ radius: POCKET_R, segments: 48 }),
        new Material2D({ color: new ColorSRGB(0.015, 0.014, 0.012, 1) }),
      ));
      this.world.addEntity(pocket);
      this.tableEntities.push(pocket);
    }
  }

  private createWall(name: string, x: number, y: number, width: number, height: number, color: [number, number, number, number]): void {
    const wall = new Entity(name);
    wall.addComponent(new Transform2D({ x, y }));
    wall.addComponent(new Mesh2D(
      createRect2D({ width, height }),
      new Material2D({ color: new ColorSRGB(...color) }),
    ));
    wall.addComponent(new Physics2DBody({
      type: 'static',
      shape: 'box',
      width,
      height,
      friction: 0.08,
      restitution: 0.92,
    }));
    this.world.addEntity(wall);
    this.tableEntities.push(wall);
  }

  private createBall(kind: 'cue' | 'red', x: number, y: number, color: [number, number, number, number]): Ball {
    const entity = new Entity(kind === 'cue' ? 'CueBall' : 'RedBall');
    const transform = new Transform2D({ x, y });
    const material = new Material2D({ color: new ColorSRGB(...color), blending: 'normal' });
    const body = new Physics2DBody({
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
    entity.addComponent(transform);
    entity.addComponent(new Mesh2D(createCircle2D({ radius: BALL_R, segments: 48 }), material));
    entity.addComponent(body);
    this.world.addEntity(entity);

    const ball: Ball = { entity, body, transform, material, kind, active: true };
    this.balls.push(ball);
    return ball;
  }

  private setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.canShoot()) return;
      const target = screenToWorld(canvas, this.camera, event);
      if (Math.hypot(target[0] - this.cueBall.transform.x, target[1] - this.cueBall.transform.y) > BALL_R * 1.8) return;
      this.aiming = true;
      this.pointerId = event.pointerId;
      this.aimStart = [this.cueBall.transform.x, this.cueBall.transform.y];
      canvas.setPointerCapture(event.pointerId);
      this.updateAim(target);
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.aiming || event.pointerId !== this.pointerId) return;
      this.updateAim(screenToWorld(canvas, this.camera, event));
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      if (!this.aiming || event.pointerId !== this.pointerId) return;
      const target = screenToWorld(canvas, this.camera, event);
      this.shoot(target);
      this.aiming = false;
      this.pointerId = -1;
      this.hideAim();
      event.preventDefault();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  private updateAim(pointer: [number, number]): void {
    const [pullX, pullY] = clampPull(pointer[0] - this.aimStart[0], pointer[1] - this.aimStart[1]);
    const length = Math.hypot(pullX, pullY);
    this.aimTransform.setPosition(this.aimStart[0] + pullX * 0.5, this.aimStart[1] + pullY * 0.5);
    this.aimTransform.rotation = Math.atan2(pullY, pullX);
    this.aimTransform.setScale(Math.max(0.001, length), 1);
    this.hud.setState(`Power ${Math.round(length / MAX_PULL * 100)}%`);
  }

  private shoot(pointer: [number, number]): void {
    const [pullX, pullY] = clampPull(pointer[0] - this.aimStart[0], pointer[1] - this.aimStart[1]);
    if (Math.hypot(pullX, pullY) < 8) {
      this.updateHud();
      return;
    }
    if (!this.physics.applyLinearImpulse(
      this.cueBall.body,
      -pullX * IMPULSE_SCALE,
      -pullY * IMPULSE_SCALE,
    )) return;
    this.hud.setState('Rolling');
  }

  private tick(time: number, delta: number): void {
    if (this.newGameRequested) {
      this.newGameRequested = false;
      this.newGame();
    }
    this.world.update(time, delta);
    this.checkPockets();
    this.settleSlowBalls();
    const moving = this.balls.some(ball => ball.active && this.physics.getLinearVelocity(ball.body, this.velocityScratch)
      && Math.hypot(this.velocityScratch.x, this.velocityScratch.y) >= STOP_SPEED);
    if (this.wasMoving && !moving) this.saveState();
    this.wasMoving = moving;
    if (!this.aiming) this.updateHud();
  }

  private checkPockets(): void {
    for (const ball of this.balls) {
      if (!ball.active) continue;
      const inPocket = POCKETS.some(([x, y]) => Math.hypot(ball.transform.x - x, ball.transform.y - y) <= POCKET_R - 3);
      if (!inPocket) continue;
      if (ball.kind === 'cue') {
        this.resetCueBall();
      } else {
        ball.active = false;
        this.potted++;
        this.world.removeEntity(ball.entity);
      }
    }
  }

  private resetCueBall(): void {
    if (!this.physics.setLinearVelocity(this.cueBall.body, 0, 0)) return;
    this.physics.setAngularVelocity(this.cueBall.body, 0);
    this.physics.teleportBody(this.cueBall.body, -235, 0, 0);
    this.cueBall.transform.x = -235;
    this.cueBall.transform.y = 0;
  }

  private settleSlowBalls(): void {
    for (const ball of this.balls) {
      if (!ball.active || !this.physics.getLinearVelocity(ball.body, this.velocityScratch)) continue;
      if (Math.hypot(this.velocityScratch.x, this.velocityScratch.y) <= STOP_SPEED) {
        this.physics.setLinearVelocity(ball.body, 0, 0);
        this.physics.setAngularVelocity(ball.body, 0);
      }
    }
  }

  private canShoot(): boolean {
    if (this.potted >= 10 || !this.cueBall?.active) return false;
    return this.balls.every(ball => {
      if (!ball.active || !this.physics.getLinearVelocity(ball.body, this.velocityScratch)) return true;
      return Math.hypot(this.velocityScratch.x, this.velocityScratch.y) < STOP_SPEED;
    });
  }

  private updateHud(): void {
    this.hud.setScore(this.potted);
    if (this.potted >= 10) {
      this.hud.setState('Cleared');
    } else if (this.canShoot()) {
      this.hud.setState('Ready');
    } else {
      this.hud.setState('Rolling');
    }
  }

  private hideAim(): void {
    if (this.aimTransform) this.aimTransform.setScale(0, 0);
  }

  private setupAimGuide(): void {
    const entity = new Entity('Aim Guide');
    this.aimTransform = new Transform2D();
    this.aimTransform.setScale(0, 0);
    this.aimMesh = new Mesh2D(
      createRect2D({ width: 1, height: 4 }),
      new Material2D({ color: new ColorSRGB(1, 1, 1, 0.8), blending: 'normal' }),
    );
    entity.addComponent(this.aimTransform);
    entity.addComponent(this.aimMesh);
    this.world.addEntity(entity);
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
new BilliardsGame().init(canvas);
