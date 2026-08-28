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
} from '@haiyue/engine';
import { ParticleEmitter3D } from '@haiyue/engine/components';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { createPathExtrusion3D, createRoundedBox3D, type Geometry3D, type PathExtrusionPoint } from '@haiyue/engine/geometry';
import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import {
  BlinnPhongRenderSystem,
  Particle3DRenderSystem,
  Particle3DSystem,
  Render3DSystem,
} from '@haiyue/engine/systems';
import { SingleSlotGameSave, isRecord } from '../save/SingleSlotGameSave';
import {
  BOOST_PAD_HALF_WIDTH,
  BOOST_ZONE_HALF_LENGTH,
  BOOST_ZONES,
  CRUISE_MAX_SPEED,
  ROAD_HALF_WIDTH,
  TOTAL_LAPS,
  createInitialRaceState,
  createRaceTrack,
  racePose,
  sampleTrack,
  stepRace,
  type RaceState,
  type RaceTrack,
} from './RaceRules';

type Color = readonly [number, number, number, number];
type Phase = 'countdown' | 'racing' | 'paused' | 'finished';

interface CarPart {
  readonly transform: CartesianTransform3D;
  readonly offset: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number];
}

interface RacerSaveData {
  readonly bestTime: number;
}

function isRacerSaveData(value: unknown): value is RacerSaveData {
  return isRecord(value) && typeof value.bestTime === 'number' && value.bestTime > 0;
}

interface RacerSnapshot {
  readonly phase: Phase;
  readonly lap: number;
  readonly speed: number;
  readonly elapsed: number;
  readonly progress: number;
  readonly lateral: number;
  readonly boostRemaining: number;
  readonly wallHits: number;
}

interface RacerDebugApi {
  snapshot(): RacerSnapshot;
  restart(): void;
  setState(next: Partial<RaceState>): void;
}

declare global {
  interface Window { __neonCircuit?: RacerDebugApi; }
}

const COLORS = {
  roadA: [0.055, 0.075, 0.115, 1] as Color,
  roadB: [0.075, 0.10, 0.15, 1] as Color,
  rail: [0.055, 0.72, 0.95, 1] as Color,
  boost: [0.08, 0.95, 1, 1] as Color,
  marker: [0.48, 0.65, 0.78, 1] as Color,
  ground: [0.016, 0.024, 0.048, 1] as Color,
  hull: [0.075, 0.12, 0.20, 1] as Color,
  hullLight: [0.12, 0.72, 0.98, 1] as Color,
  canopy: [0.28, 0.08, 0.46, 1] as Color,
  magenta: [0.95, 0.08, 0.58, 1] as Color,
  white: [0.88, 0.95, 1, 1] as Color,
} as const;

const CAR_SCALE = 0.78;

class NeonCircuitGame {
  private readonly track: RaceTrack = createRaceTrack(264);
  private readonly saves = new SingleSlotGameSave<RacerSaveData>({
    gameId: 'neon-circuit',
    name: 'Neon Circuit 最佳成绩',
    validateData: isRacerSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private camera!: SphericalTransform3D;
  private readonly keys = new Set<string>();
  private readonly carParts: CarPart[] = [];
  private readonly materials = new Map<string, BlinnPhongMaterial>();
  private readonly validationErrors: string[] = [];
  private state = createInitialRaceState();
  private phase: Phase = 'countdown';
  private phaseBeforePause: Exclude<Phase, 'paused'> = 'racing';
  private countdown = 3.4;
  private bestTime = Number.POSITIVE_INFINITY;
  private cameraHeading = 0;
  private visualBank = 0;
  private visualPitch = 0;
  private validationFrames = 0;
  private thrusterLeft!: CartesianTransform3D;
  private thrusterRight!: CartesianTransform3D;
  private thrusterEmitterLeft!: ParticleEmitter3D;
  private thrusterEmitterRight!: ParticleEmitter3D;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.012, g: 0.025, b: 0.065, a: 1 },
      msaaSamples: 4,
      devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 1.65),
    });
    await this.engine.init();
    this.engine.device.addEventListener('uncapturederror', event => this.validationErrors.push(event.error.message));
    this.engine.device.pushErrorScope('validation');
    this.world = new World('Neon Circuit');
    this.setupRenderer();
    this.setupLighting();
    this.buildEnvironment();
    this.buildTrack();
    this.buildHoverCar();
    this.bindInput(canvas);
    const saved = await this.saves.load();
    if (saved) this.bestTime = saved.bestTime;
    this.updateBestTime();

    window.__neonCircuit = {
      snapshot: () => this.snapshot(),
      restart: () => this.restart(),
      setState: next => { this.state = { ...this.state, ...next }; },
    };
    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    window.addEventListener('pagehide', () => this.engine.destroy(), { once: true });
    this.engine.run();
  }

  private setupRenderer(): void {
    const start = racePose(this.track, this.state);
    this.cameraHeading = start.heading;
    const cameraEntity = new Entity('Chase camera');
    cameraEntity.addComponent(new Camera3D({ type: 'perspective', fov: Math.PI / 3.55, near: 1, far: 3200 }));
    this.camera = new SphericalTransform3D({
      radius: 118,
      theta: start.heading + Math.PI,
      phi: 1.18,
      target: [start.x, start.y + 12, start.z],
    });
    cameraEntity.addComponent(this.camera);
    this.world.addEntity(cameraEntity);

    const render3D = new Render3DSystem(this.engine, cameraEntity, { priority: 10, loadOp: 'clear', msaaSamples: 4 });
    this.world.addSystem(new BlinnPhongRenderSystem(this.engine, cameraEntity, { priority: -1, render3DSystem: render3D }));
    this.world.addSystem(render3D);
    this.world.addSystem(new Particle3DSystem({ maxDeltaSeconds: 0.06, priority: -10 }));
    this.world.addSystem(new Particle3DRenderSystem(this.engine, cameraEntity, { priority: 20, loadOp: 'load' }));
    const integration = new RenderIntegration(this.engine, { label: 'NeonCircuit.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private setupLighting(): void {
    const ambient = new Entity('Night ambient');
    ambient.addComponent(new AmbientLight({ color: [0.22, 0.42, 0.72], intensity: 0.72 }));
    this.world.addEntity(ambient);
    const moon = new Entity('Moon light');
    moon.addComponent(new DirectionalLight({ color: [0.54, 0.70, 1], intensity: 1.6, direction: [-0.35, -1, -0.2] }));
    this.world.addEntity(moon);
    const rim = new Entity('Magenta rim');
    rim.addComponent(new DirectionalLight({ color: [1, 0.15, 0.55], intensity: 0.68, direction: [0.65, -0.4, 0.5] }));
    this.world.addEntity(rim);
  }

  private buildEnvironment(): void {
    this.addBox('Void floor', 0, -24, 0, 4_400, 12, 4_400, COLORS.ground, 5);
    let randomState = 0x91e10da5;
    const random = (): number => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
    for (let index = 0; index < 56; index++) {
      const angle = index / 56 * Math.PI * 2 + (random() - 0.5) * 0.08;
      const radius = 1_720 + random() * 580;
      const height = 55 + random() * 210;
      const width = 35 + random() * 65;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      this.addBox(`Skyline-${index}`, x, height * 0.5 - 18, z, width, height, width, index % 4 === 0 ? [0.12, 0.055, 0.18, 1] : [0.025, 0.055, 0.095, 1], 12);
      if (index % 3 === 0) this.addBox(`SkylineLight-${index}`, x, height - 17, z, width * 0.74, 2.5, width * 1.02, index % 2 ? COLORS.rail : COLORS.magenta, 90);
    }
  }

  private buildTrack(): void {
    const centerPath = this.track.samples.map(sample => this.extrusionPoint(sample.distance));
    this.addGeometry('Continuous road', createPathExtrusion3D({
      path: centerPath,
      shape: [
        [-ROAD_HALF_WIDTH, 0],
        [ROAD_HALF_WIDTH, 0],
        [ROAD_HALF_WIDTH, -5],
        [-ROAD_HALF_WIDTH, -5],
      ],
      closedPath: true,
      uvScale: [0.012, 0.02],
    }), COLORS.roadA, 30);

    for (const side of [-1, 1]) {
      const railPath = this.track.samples.map(sample => this.extrusionPoint(sample.distance, side * (ROAD_HALF_WIDTH + 3), 5));
      this.addGeometry(`Continuous rail ${side}`, createPathExtrusion3D({
        path: railPath,
        shape: [[-3.2, 5], [3.2, 5], [3.2, -5], [-3.2, -5]],
        closedPath: true,
        uvScale: [0.018, 0.08],
      }), COLORS.rail, 105);
    }

    for (const laneOffset of [-ROAD_HALF_WIDTH / 3, ROAD_HALF_WIDTH / 3]) {
      this.addGeometry(`Lane stripe ${laneOffset}`, createPathExtrusion3D({
        path: centerPath,
        shape: [[laneOffset - 0.85, 0.38], [laneOffset + 0.85, 0.38]],
        closedPath: true,
        closedShape: false,
        uvScale: [0.02, 1],
      }), COLORS.marker, 58);
    }

    BOOST_ZONES.forEach((center, index) => {
      const boostPath: PathExtrusionPoint[] = Array.from({ length: 13 }, (_, sampleIndex) => {
        const progress = center - BOOST_ZONE_HALF_LENGTH + BOOST_ZONE_HALF_LENGTH * 2 * sampleIndex / 12;
        return this.extrusionPoint(progress * this.track.length, 0, 0.55);
      });
      this.addGeometry(`Boost lane ${index}`, createPathExtrusion3D({
        path: boostPath,
        shape: [[-BOOST_PAD_HALF_WIDTH, 0], [BOOST_PAD_HALF_WIDTH, 0]],
        closedShape: false,
        uvScale: [0.035, 0.1],
      }), COLORS.boost, 120);
    });

    const start = sampleTrack(this.track, 0);
    const startLinePath = [-7, -3.5, 0, 3.5, 7].map(distance => this.extrusionPoint(distance, 0, 0.52));
    this.addGeometry('Start line', createPathExtrusion3D({
      path: startLinePath,
      shape: [[-ROAD_HALF_WIDTH * 0.96, 0], [ROAD_HALF_WIDTH * 0.96, 0]],
      closedShape: false,
      uvScale: [0.1, 0.04],
    }), COLORS.white, 100);
    const rightX = Math.cos(start.heading);
    const rightZ = -Math.sin(start.heading);
    for (const side of [-1, 1]) {
      const x = start.x + rightX * side * (ROAD_HALF_WIDTH + 11);
      const z = start.z + rightZ * side * (ROAD_HALF_WIDTH + 11);
      this.addBox(`StartPylon-${side}`, x, start.y + 28, z, 7, 56, 7, COLORS.magenta, 75);
    }
  }

  private extrusionPoint(distance: number, lateral = 0, vertical = 0): PathExtrusionPoint {
    const sample = sampleTrack(this.track, distance);
    const right = bankedRight(sample.heading, sample.pitch, sample.bank);
    const up = bankedUp(sample.heading, sample.pitch, sample.bank);
    return {
      position: [
        sample.x + right[0] * lateral + up[0] * vertical,
        sample.y + right[1] * lateral + up[1] * vertical,
        sample.z + right[2] * lateral + up[2] * vertical,
      ],
      roll: sample.bank,
    };
  }

  private buildHoverCar(): void {
    this.addCarPart('Main hull', [0, 6, 0], [0, 0, 0], 27, 7, 43, 7, COLORS.hull, 78);
    this.addCarPart('Nose', [0, 5, 22], [-0.08, 0, 0], 13, 5, 28, 5, COLORS.hullLight, 100);
    this.addCarPart('Canopy', [0, 11, 2], [0, 0, 0], 13, 7, 19, 5, COLORS.canopy, 108);
    this.addCarPart('Left wing', [-18, 4, -2], [0, 0, -0.08], 22, 3.5, 31, 3, COLORS.hull, 60);
    this.addCarPart('Right wing', [18, 4, -2], [0, 0, 0.08], 22, 3.5, 31, 3, COLORS.hull, 60);
    this.addCarPart('Left edge', [-24, 4, -3], [0, 0, 0], 3, 2.5, 29, 1, COLORS.magenta, 110);
    this.addCarPart('Right edge', [24, 4, -3], [0, 0, 0], 3, 2.5, 29, 1, COLORS.magenta, 110);
    this.addCarPart('Tail glow', [0, 5, -21], [0, 0, 0], 15, 3.5, 4, 1, COLORS.boost, 120);

    const left = this.createThruster('Left thruster', -9);
    this.thrusterLeft = left.transform;
    this.thrusterEmitterLeft = left.emitter;
    const right = this.createThruster('Right thruster', 9);
    this.thrusterRight = right.transform;
    this.thrusterEmitterRight = right.emitter;
  }

  private createThruster(name: string, offsetX: number): { transform: CartesianTransform3D; emitter: ParticleEmitter3D } {
    const transform = new CartesianTransform3D();
    const emitter = new ParticleEmitter3D({
      maxParticles: 95,
      emissionRate: 34,
      duration: Number.POSITIVE_INFINITY,
      loop: true,
      seed: offsetX < 0 ? 1031 : 2063,
      lifetime: [0.18, 0.48],
      speed: [10, 38],
      direction: [0, 0.15, 1],
      spread: 0.35,
      gravity: [0, 12, 0],
      startSize: [3.5, 7],
      endSize: [0.4, 2],
      startColor: [0.35, 0.95, 1, 0.95],
      endColor: [0.95, 0.05, 0.62, 0],
      blendMode: 'additive',
      radial: true,
      depthTest: true,
      depthWrite: false,
      sortMode: 'none',
    });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(emitter);
    this.world.addEntity(entity);
    return { transform, emitter };
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const controlled = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'p', 'r', ' ']);
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (controlled.has(key)) event.preventDefault();
      if (key === 'r' && !event.repeat) return this.restart();
      if ((key === 'p' || key === ' ') && !event.repeat) return this.togglePause();
      this.keys.add(key);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    query<HTMLButtonElement>('#restart').addEventListener('click', () => this.restart());
    query<HTMLButtonElement>('#pause').addEventListener('click', () => this.togglePause());
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      const key = button.dataset.control!;
      const press = (event: PointerEvent): void => { event.preventDefault(); this.keys.add(key); button.setPointerCapture(event.pointerId); };
      const release = (event: PointerEvent): void => { event.preventDefault(); this.keys.delete(key); };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', () => this.keys.delete(key));
    }
    canvas.addEventListener('pointerdown', () => canvas.focus());
  }

  private tick(timeMs: number, deltaMs: number): void {
    const seconds = Math.max(0, Math.min(0.05, deltaMs * 0.001));
    if (this.phase === 'countdown') {
      this.countdown -= seconds;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        query<HTMLElement>('#announcement').dataset.visible = 'false';
      }
    } else if (this.phase === 'racing') {
      const controls = {
        throttle: this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0,
        brake: this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0,
        steer: (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) - (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0),
      };
      const result = stepRace(this.track, this.state, controls, seconds);
      this.state = result.state;
      if (result.events.includes('finish')) this.finishRace();
      if (result.events.includes('lap')) this.flashAnnouncement(`LAP ${this.state.lap}`);
      if (result.events.includes('boost')) document.body.dataset.boostPulse = String(timeMs);
    }
    this.updateVisuals(timeMs, seconds);
    this.updateHud();
    this.world.update(timeMs, deltaMs);
    if (++this.validationFrames === 24) void this.finishValidation();
  }

  private updateVisuals(timeMs: number, seconds: number): void {
    const pose = racePose(this.track, this.state);
    const targetPitch = -pose.pitch;
    this.visualPitch += (targetPitch - this.visualPitch) * (1 - Math.exp(-seconds * 7));
    const steerAxis = (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) - (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0);
    const targetBank = -steerAxis * Math.min(0.28, this.state.speed / CRUISE_MAX_SPEED * 0.28);
    this.visualBank += (targetBank - this.visualBank) * (1 - Math.exp(-seconds * 8));
    const hover = Math.sin(timeMs * 0.0065) * 0.75;
    const cos = Math.cos(pose.heading);
    const sin = Math.sin(pose.heading);

    for (const part of this.carParts) {
      const [localX, localY, localZ] = part.offset;
      part.transform
        .setPosition(pose.x + localX * cos + localZ * sin, pose.y + localY + hover, pose.z - localX * sin + localZ * cos)
        .setRotation(this.visualPitch + part.localRotation[0], pose.heading + part.localRotation[1], pose.bank + this.visualBank + part.localRotation[2]);
    }
    for (const [transform, offsetX] of [[this.thrusterLeft, -9 * CAR_SCALE], [this.thrusterRight, 9 * CAR_SCALE]] as const) {
      transform.setPosition(
        pose.x + offsetX * cos - 20 * CAR_SCALE * sin,
        pose.y + 5 * CAR_SCALE + hover,
        pose.z - offsetX * sin - 20 * CAR_SCALE * cos,
      );
    }
    const trailRate = this.phase === 'racing' ? 24 + this.state.speed * 0.13 + (this.state.boostRemaining > 0 ? 52 : 0) : 8;
    this.thrusterEmitterLeft.emissionRate = trailRate;
    this.thrusterEmitterRight.emissionRate = trailRate;

    const headingResponse = 1 - Math.exp(-seconds * 5.5);
    this.cameraHeading = lerpAngle(this.cameraHeading, pose.heading, headingResponse);
    this.camera.theta = this.cameraHeading + Math.PI;
    this.camera.radius = 112 + Math.min(26, this.state.speed * 0.075);
    this.camera.setTarget(pose.x, pose.y + 13, pose.z);
  }

  private updateHud(): void {
    query<HTMLElement>('#speed').textContent = String(Math.round(this.state.speed * 1.45)).padStart(3, '0');
    query<HTMLElement>('#lap').textContent = `${Math.min(this.state.lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
    query<HTMLElement>('#timer').textContent = formatTime(this.state.elapsed);
    query<HTMLElement>('#boost-fill').style.width = `${Math.min(100, this.state.boostRemaining / 1.15 * 100)}%`;
    query<HTMLElement>('#boost-label').textContent = this.state.boostRemaining > 0 ? 'BOOST ACTIVE' : 'SEEK CYAN PAD';
    document.body.dataset.phase = this.phase;
    document.body.dataset.renderStatus ??= 'pending';
    document.body.dataset.speed = this.state.speed.toFixed(2);
    document.body.dataset.lap = String(this.state.lap);
    document.body.dataset.boost = this.state.boostRemaining.toFixed(2);
    if (this.phase === 'countdown') {
      const value = this.countdown <= 0.45 ? 'GO' : String(Math.max(1, Math.ceil(this.countdown - 0.4)));
      const announcement = query<HTMLElement>('#announcement');
      announcement.textContent = value;
      announcement.dataset.visible = 'true';
    }
  }

  private finishRace(): void {
    this.phase = 'finished';
    const isRecord = this.state.elapsed < this.bestTime;
    if (isRecord) {
      this.bestTime = this.state.elapsed;
      void this.saves.save({ bestTime: this.bestTime });
      this.updateBestTime();
    }
    const announcement = query<HTMLElement>('#announcement');
    announcement.textContent = `${isRecord ? 'NEW RECORD · ' : ''}${formatTime(this.state.elapsed)}`;
    announcement.dataset.visible = 'true';
  }

  private restart(): void {
    this.state = createInitialRaceState();
    this.phase = 'countdown';
    this.countdown = 3.4;
    this.keys.clear();
    query<HTMLElement>('#announcement').dataset.visible = 'true';
  }

  private togglePause(): void {
    if (this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
      query<HTMLElement>('#announcement').dataset.visible = this.phase === 'countdown' || this.phase === 'finished' ? 'true' : 'false';
      return;
    }
    if (this.phase === 'finished') return;
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    const announcement = query<HTMLElement>('#announcement');
    announcement.textContent = 'PAUSED';
    announcement.dataset.visible = 'true';
  }

  private flashAnnouncement(text: string): void {
    const announcement = query<HTMLElement>('#announcement');
    announcement.textContent = text;
    announcement.dataset.visible = 'true';
    window.setTimeout(() => {
      if (this.phase === 'racing' && announcement.textContent === text) announcement.dataset.visible = 'false';
    }, 950);
  }

  private updateBestTime(): void {
    query<HTMLElement>('#best').textContent = Number.isFinite(this.bestTime) ? formatTime(this.bestTime) : '--:--.---';
  }

  private snapshot(): RacerSnapshot {
    return {
      phase: this.phase,
      lap: this.state.lap,
      speed: this.state.speed,
      elapsed: this.state.elapsed,
      progress: this.state.distance / this.track.length,
      lateral: this.state.lateral,
      boostRemaining: this.state.boostRemaining,
      wallHits: this.state.wallHits,
    };
  }

  private async finishValidation(): Promise<void> {
    await this.engine.device.queue.onSubmittedWorkDone();
    const scopedError = await this.engine.device.popErrorScope();
    if (scopedError) this.validationErrors.push(scopedError.message);
    document.body.dataset.renderStatus = this.validationErrors.length === 0 ? 'passed' : 'failed';
    query<HTMLElement>('#result').textContent = JSON.stringify({ status: document.body.dataset.renderStatus, errors: this.validationErrors, ...this.snapshot() });
  }

  private addCarPart(
    name: string,
    offset: readonly [number, number, number],
    localRotation: readonly [number, number, number],
    width: number,
    height: number,
    depth: number,
    radius: number,
    color: Color,
    shininess: number,
  ): void {
    const scaledOffset: readonly [number, number, number] = [
      offset[0] * CAR_SCALE,
      offset[1] * CAR_SCALE,
      offset[2] * CAR_SCALE,
    ];
    const transform = new CartesianTransform3D();
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(createRoundedBox3D({
      width: width * CAR_SCALE,
      height: height * CAR_SCALE,
      depth: depth * CAR_SCALE,
      radius: radius * CAR_SCALE,
      segments: 3,
    }), this.material(color, shininess)));
    this.world.addEntity(entity);
    this.carParts.push({ transform, offset: scaledOffset, localRotation });
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

  private addGeometry(name: string, geometry: Geometry3D, color: Color, shininess: number): void {
    const entity = new Entity(name);
    entity.addComponent(new Mesh3D(geometry, this.material(color, shininess)));
    this.world.addEntity(entity);
  }

  private material(color: Color, shininess: number): BlinnPhongMaterial {
    const key = `${color.join(',')}:${shininess}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = new BlinnPhongMaterial({
      diffuse: [...color],
      ambient: [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, color[3]],
      specular: [0.78, 0.88, 1, 1],
      shininess,
    });
    this.materials.set(key, material);
    return material;
  }
}

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element ${selector}.`);
  return element;
}

function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

function bankedRight(heading: number, pitch: number, bank: number): readonly [number, number, number] {
  const baseRight: readonly [number, number, number] = [Math.cos(heading), 0, -Math.sin(heading)];
  const baseUp: readonly [number, number, number] = [
    -Math.sin(pitch) * Math.sin(heading),
    Math.cos(pitch),
    -Math.sin(pitch) * Math.cos(heading),
  ];
  return combineFrame(baseRight, baseUp, Math.cos(bank), Math.sin(bank));
}

function bankedUp(heading: number, pitch: number, bank: number): readonly [number, number, number] {
  const baseRight: readonly [number, number, number] = [Math.cos(heading), 0, -Math.sin(heading)];
  const baseUp: readonly [number, number, number] = [
    -Math.sin(pitch) * Math.sin(heading),
    Math.cos(pitch),
    -Math.sin(pitch) * Math.cos(heading),
  ];
  return combineFrame(baseUp, baseRight, Math.cos(bank), -Math.sin(bank));
}

function combineFrame(
  primary: readonly [number, number, number],
  secondary: readonly [number, number, number],
  cosine: number,
  sine: number,
): readonly [number, number, number] {
  return [
    primary[0] * cosine + secondary[0] * sine,
    primary[1] * cosine + secondary[1] * sine,
    primary[2] * cosine + secondary[2] * sine,
  ];
}

function formatTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.floor(seconds * 1000));
  const minutes = Math.floor(milliseconds / 60_000);
  const remainingSeconds = Math.floor(milliseconds % 60_000 / 1000);
  const remainder = milliseconds % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}

async function main(): Promise<void> {
  const game = new NeonCircuitGame();
  await game.init(query<HTMLCanvasElement>('#canvas'));
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.renderStatus = 'failed';
  document.body.dataset.renderError = message;
  const announcement = document.querySelector<HTMLElement>('#announcement');
  if (announcement) {
    announcement.textContent = `启动失败：${message}`;
    announcement.dataset.visible = 'true';
  }
  console.error(error);
});
