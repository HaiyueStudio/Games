import {
  BasicMaterial,
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
} from '@haiyue/engine';
import { ParticleEmitter3D } from '@haiyue/engine/components';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { createPathExtrusion3D, type Geometry3D, type PathExtrusionPoint } from '@haiyue/engine/geometry';
import { AmbientLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import { GltfModelComponent, GltfModelSystem } from '@haiyue/extensions/gltf';
import {
  Particle3DRenderSystem,
  Particle3DSystem,
  Render3DSystem,
} from '@haiyue/engine/systems';
import { SingleSlotGameSave, isRecord } from '../save/SingleSlotGameSave';
import {
  BOOST_DURATION_SECONDS,
  BOOST_MAX_SPEED,
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
import { ThrusterFlameTexture } from './ThrusterFlameTexture';

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
  magenta: [0.95, 0.08, 0.58, 1] as Color,
  white: [0.88, 0.95, 1, 1] as Color,
} as const;

const RACER_MODEL_SCALE = 0.078;
const THRUSTER_OFFSET_X = 5.6;
const THRUSTER_OFFSET_Z = -20.8;

class NeonCircuitGame {
  private readonly track: RaceTrack = createRaceTrack(520);
  private readonly saves = new SingleSlotGameSave<RacerSaveData>({
    gameId: 'neon-circuit',
    name: 'Neon Circuit 最佳成绩',
    validateData: isRacerSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private camera!: SphericalTransform3D;
  private cameraComponent!: Camera3D;
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
  private thrusterFlame!: ThrusterFlameTexture;
  private racerModel!: GltfModelComponent;

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
    window.addEventListener('pagehide', () => {
      this.thrusterFlame.destroy();
      this.engine.destroy();
    }, { once: true });
    this.engine.run();
  }

  private setupRenderer(): void {
    const start = racePose(this.track, this.state);
    this.cameraHeading = start.heading;
    const cameraEntity = new Entity('Chase camera');
    this.cameraComponent = new Camera3D({ type: 'perspective', fov: Math.PI / 3.55, near: 1, far: 9_500 });
    cameraEntity.addComponent(this.cameraComponent);
    this.camera = new SphericalTransform3D({
      radius: 106,
      theta: start.heading + Math.PI,
      phi: 1.18,
      target: [start.x, start.y + 12, start.z],
    });
    cameraEntity.addComponent(this.camera);
    this.world.addEntity(cameraEntity);

    this.world.addSystem(new GltfModelSystem({ priority: -20, loadTimeoutMs: 20_000 }));
    const render3D = new Render3DSystem(this.engine, cameraEntity, { priority: 10, loadOp: 'clear', msaaSamples: 4 });
    this.world.addSystem(render3D);
    this.world.addSystem(new Particle3DSystem({ maxDeltaSeconds: 0.06, priority: -10 }));
    this.world.addSystem(new Particle3DRenderSystem(this.engine, cameraEntity, { priority: 20, loadOp: 'load' }));
    const integration = new RenderIntegration(this.engine, { label: 'NeonCircuit.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world);
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
    this.addBox('Void floor', 0, -24, 0, 9_200, 12, 9_200, COLORS.ground, 5);
    let randomState = 0x91e10da5;
    const random = (): number => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
    for (let index = 0; index < 88; index++) {
      const angle = index / 88 * Math.PI * 2 + (random() - 0.5) * 0.06;
      const radius = 3_650 + random() * 720;
      const height = 70 + random() * 280;
      const width = 38 + random() * 78;
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

    for (let distance = 220; distance < this.track.length; distance += 360) {
      const ribPath = [-2.2, 2.2].map(offset => this.extrusionPoint(distance + offset, 0, 0.48));
      this.addGeometry(`Velocity rib ${Math.round(distance)}`, createPathExtrusion3D({
        path: ribPath,
        shape: [[-ROAD_HALF_WIDTH * 0.88, 0], [ROAD_HALF_WIDTH * 0.88, 0]],
        closedShape: false,
        uvScale: [0.08, 0.03],
      }), Math.floor(distance / 360) % 5 === 0 ? COLORS.magenta : COLORS.marker, 88);
    }

    for (let distance = 520; distance < this.track.length; distance += 840) {
      const sample = sampleTrack(this.track, distance);
      const right = bankedRight(sample.heading, sample.pitch, sample.bank);
      const up = bankedUp(sample.heading, sample.pitch, sample.bank);
      for (const side of [-1, 1]) {
        const x = sample.x + right[0] * side * (ROAD_HALF_WIDTH + 12) + up[0] * 18;
        const y = sample.y + right[1] * side * (ROAD_HALF_WIDTH + 12) + up[1] * 18;
        const z = sample.z + right[2] * side * (ROAD_HALF_WIDTH + 12) + up[2] * 18;
        this.addBox(
          `Velocity beacon ${Math.round(distance)} ${side}`,
          x, y, z, 5, 36, 5,
          Math.floor(distance / 840) % 2 === 0 ? COLORS.rail : COLORS.magenta,
          100,
          [-sample.pitch, sample.heading, sample.bank],
        );
      }
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
    const racerTransform = new CartesianTransform3D({
      scale: [RACER_MODEL_SCALE, RACER_MODEL_SCALE, RACER_MODEL_SCALE],
      anchor: [0, 60 * RACER_MODEL_SCALE, 0],
    });
    const racerEntity = new Entity('Wraith Raider racer');
    this.racerModel = new GltfModelComponent({
      src: './assets/wraith-raider.glb',
      autoLoad: true,
      clearPrevious: true,
      baseColorFactor: [1, 1, 1, 1],
    });
    racerEntity.addComponent(racerTransform);
    racerEntity.addComponent(this.racerModel);
    this.world.addEntity(racerEntity);
    this.carParts.push({ transform: racerTransform, offset: [0, 4.5, 0], localRotation: [0, 0, 0] });

    this.thrusterFlame = new ThrusterFlameTexture(this.engine.device);
    const flameGeometry = createPlane3D({ width: 8.5, height: 42, normal: 'y' });
    const flameMaterial = new BasicMaterial({
      color: [1, 1, 1, 1],
      texture: this.thrusterFlame.texture,
      blending: 'additive',
      depthWrite: false,
      cullMode: 'none',
      sampler: {
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      },
    });
    for (const [index, offsetX] of [-THRUSTER_OFFSET_X, THRUSTER_OFFSET_X].entries()) {
      const flameTransform = new CartesianTransform3D();
      const flameEntity = new Entity(`Thruster flame ${index + 1}`);
      flameEntity.addComponent(flameTransform);
      flameEntity.addComponent(new Mesh3D(flameGeometry, flameMaterial));
      this.world.addEntity(flameEntity);
      this.carParts.push({
        transform: flameTransform,
        offset: [offsetX, 3.9, THRUSTER_OFFSET_Z - 21],
        localRotation: [0, 0, 0],
      });
    }

    const left = this.createThruster('Left thruster', -THRUSTER_OFFSET_X);
    this.thrusterLeft = left.transform;
    this.thrusterEmitterLeft = left.emitter;
    const right = this.createThruster('Right thruster', THRUSTER_OFFSET_X);
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
      speed: [28, 92],
      direction: [0, 0.15, 1],
      spread: 0.35,
      gravity: [0, 12, 0],
      startSize: [2.8, 5.2],
      endSize: [0.3, 1.2],
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
    for (const [transform, offsetX] of [[this.thrusterLeft, -THRUSTER_OFFSET_X], [this.thrusterRight, THRUSTER_OFFSET_X]] as const) {
      transform
        .setPosition(
          pose.x + offsetX * cos + THRUSTER_OFFSET_Z * sin,
          pose.y + 4.8 + hover,
          pose.z - offsetX * sin + THRUSTER_OFFSET_Z * cos,
        )
        .setRotation(this.visualPitch, pose.heading, pose.bank + this.visualBank);
    }
    const speedRatio = Math.min(1, this.state.speed / BOOST_MAX_SPEED);
    const boostStrength = Math.min(1, this.state.boostRemaining / BOOST_DURATION_SECONDS);
    const trailRate = this.phase === 'racing' ? 28 + this.state.speed * 0.16 + boostStrength * 88 : 8;
    this.thrusterEmitterLeft.emissionRate = trailRate;
    this.thrusterEmitterRight.emissionRate = trailRate;
    this.thrusterFlame.update(timeMs * 0.001, speedRatio, boostStrength);

    const headingResponse = 1 - Math.exp(-seconds * (4.6 + speedRatio * 2.8));
    this.cameraHeading = lerpAngle(this.cameraHeading, pose.heading, headingResponse);
    this.camera.theta = this.cameraHeading + Math.PI;
    this.camera.radius = 106 - speedRatio * 15 + boostStrength * 3;
    this.cameraComponent.fov = 0.88 + speedRatio * 0.28 + boostStrength * 0.10;
    const lookAhead = 12 + speedRatio * 44;
    const forwardHorizontal = Math.cos(pose.pitch);
    this.camera.setTarget(
      pose.x + Math.sin(pose.heading) * forwardHorizontal * lookAhead,
      pose.y + 11 + Math.sin(pose.pitch) * lookAhead,
      pose.z + Math.cos(pose.heading) * forwardHorizontal * lookAhead,
    );
  }

  private updateHud(): void {
    query<HTMLElement>('#speed').textContent = String(Math.round(this.state.speed * 1.45)).padStart(3, '0');
    query<HTMLElement>('#lap').textContent = `${Math.min(this.state.lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
    query<HTMLElement>('#timer').textContent = formatTime(this.state.elapsed);
    query<HTMLElement>('#boost-fill').style.width = `${Math.min(100, this.state.boostRemaining / BOOST_DURATION_SECONDS * 100)}%`;
    query<HTMLElement>('#boost-label').textContent = this.state.boostRemaining > 0 ? 'BOOST ACTIVE' : 'SEEK CYAN PAD';
    document.body.dataset.phase = this.phase;
    document.body.dataset.renderStatus ??= 'pending';
    document.body.dataset.speed = this.state.speed.toFixed(2);
    document.body.dataset.lap = String(this.state.lap);
    document.body.dataset.boost = this.state.boostRemaining.toFixed(2);
    document.body.dataset.modelStatus = this.racerModel.status;
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
