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
import { GuiSystem, type GuiPointerEvent } from '@haiyue/engine/gui';
import { NeonCircuitGui, NEON_GUI_GLYPHS, type RacePhase } from './NeonCircuitGui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { createPathExtrusion3D, Geometry3D, type PathExtrusionPoint } from '@haiyue/engine/geometry';
import { AmbientLight, EnvironmentLight } from '@haiyue/engine/lighting';
import { BlinnPhongMaterial, PbrMaterial } from '@haiyue/engine/material';
import { GltfModelComponent, GltfModelSystem } from '@haiyue/extensions/gltf';
import {
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
  BURN_HEALTH,
  ROAD_HALF_WIDTH,
  RAIL_LIMIT,
  TOTAL_LAPS,
  TRACK_SCALE,
  createInitialRaceState,
  racePose,
  sampleTrack,
  stepRace,
  type RaceState,
  type RaceTrack,
} from './RaceRules';
import { ThrusterFlameTexture } from './ThrusterFlameTexture';
import { HullFireTexture } from './HullFireTexture';
import { BoostStripTexture } from './BoostStripTexture';
import { CIRCUIT_PALETTES } from './CircuitThemes';
import { roadOverlay } from './RoadOverlay';
import { RainbowRoadTexture } from './RainbowRoadTexture';
import { SpaceEnvironment } from './SpaceEnvironment';
import { RaceParticles } from './RaceParticles';
import { EXHAUST_SOCKETS, damageEnvelope, propulsionEnvelope, rotateBodyPoint, speedFov, speedCameraPhi } from './RacerEffects';
import { CIRCUITS, circuitById, circuitTrack } from './RaceRules';
import { formatSpeed } from './RaceUnits';

type Color = readonly [number, number, number, number];
type Phase = RacePhase;

interface CarPart {
  readonly transform: CartesianTransform3D;
  readonly offset: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number];
}

interface RacerSaveData {
  readonly bestTime: number;
}

function isRacerSaveData(value: unknown): value is RacerSaveData {
  return isRecord(value) && typeof value.bestTime === 'number' && Number.isFinite(value.bestTime) && value.bestTime > 0;
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
  readonly health: number;
  readonly trackId: string;
  readonly headingOffset: number;
  readonly impact: number;
  readonly buildingCount: number;
  readonly exhaustLength: number;
  readonly fov: number;
  readonly cameraPhi: number;
  readonly reverseZ: boolean;
  readonly depthFormat: GPUTextureFormat;
  readonly theme: string;
  readonly space: { planets: number; meteors: number } | null;
  readonly rainbowTime: number | null;
  readonly particles: { smoke: number; sparks: number };
}

interface RacerDebugApi {
  snapshot(): RacerSnapshot;
  gui(): NeonCircuitGui['snapshot'];
  restart(): void;
  setState(next: Partial<RaceState>): void;
}

declare global {
  interface Window { __neonCircuit?: RacerDebugApi; }
}


const RACER_MODEL_SCALE = 0.078;
const THRUSTER_OFFSET_X = EXHAUST_SOCKETS[1][0];
const THRUSTER_OFFSET_Z = EXHAUST_SOCKETS[1][2];

class NeonCircuitGame {
  private readonly circuit = circuitById(new URLSearchParams(location.search).get('track'));
  private readonly colors = CIRCUIT_PALETTES[this.circuit.theme];
  private rainbowRoad: RainbowRoadTexture | null = null;
  private space: SpaceEnvironment | null = null;
  private readonly track: RaceTrack = circuitTrack(this.circuit);
  private selectedCircuit = this.circuit.id;
  private readonly saves = new SingleSlotGameSave<RacerSaveData>({
    gameId: `neon-circuit-v4-${this.circuit.id}`,
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
  private phase: Phase = 'home';
  private phaseBeforePause: Exclude<Phase, 'paused'> = 'racing';
  private countdown = 3.4;
  private bestTime = Number.POSITIVE_INFINITY;
  private cameraHeading = 0;
  private visualBank = 0;
  private visualPitch = 0;
  private validationFrames = 0;
  private verificationOverview = false;
  private thrusterFlame!: ThrusterFlameTexture;
  private racerModel!: GltfModelComponent;
  private styledRacerRoot: Entity | null = null;
  private racerPbrMaterialCount = 0;
  private hullFire!: HullFireTexture;
  private readonly fireParts: CartesianTransform3D[] = [];
  private readonly boxGeometry = createBox3D({ width: 1, height: 1, depth: 1 });
  private readonly inputLifetime = new AbortController();
  private announcementUntil = 0;
  private buildingCount = 0;
  private accumulator = 0;
  private cameraImpact = 0;
  private exhaustLength = 1.35;
  private readonly exhaustParts: CartesianTransform3D[] = [];
  private boostStrip!: BoostStripTexture;
  private effects!: RaceParticles;
  private readonly effectTextures: GPUTexture[] = [];
  private effectClock = 0;
  private gui!: NeonCircuitGui;
  private announcementText = '';
  private readonly touchKeys = new Map<number, string>();

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: this.colors.sky[0], g: this.colors.sky[1], b: this.colors.sky[2], a: 1 },
      msaaSamples: 4,
      reverseZ: true,
      devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 1.65),
    });
    await this.engine.init();
    this.engine.device.addEventListener('uncapturederror', event => this.validationErrors.push(event.error.message));
    this.engine.device.pushErrorScope('validation');
    this.world = new World('Neon Circuit');
    this.setupRenderer();
    this.setupLighting();
    await this.loadEffectTextures();
    if (this.circuit.theme === 'cosmic') {
      this.space = await SpaceEnvironment.create(this.world, this.engine.device, TRACK_SCALE);
      this.rainbowRoad = new RainbowRoadTexture(this.engine.device);
    } else this.buildEnvironment();
    this.buildTrack();
    this.buildHoverCar();
    this.bindInput(canvas);
    const saved = await this.saves.load();
    if (saved) this.bestTime = saved.bestTime;
    this.updateBestTime();

    window.__neonCircuit = {
      snapshot: () => this.snapshot(),
      gui: () => this.gui.snapshot,
      restart: () => this.restart(),
      setState: next => { this.state = { ...this.state, ...next }; },
    };
    if (new URLSearchParams(location.search).get('race') === '1') this.restart();
    this.engine.on('update', ({ detail: { time, delta } }) => this.tick(time, delta));
    window.addEventListener('pageshow', () => this.engine.run(), { signal: this.inputLifetime.signal });
    window.addEventListener('pagehide', event => {
      this.keys.clear(); this.touchKeys.clear();
      this.engine.stop();
      if (event.persisted) return;
      this.inputLifetime.abort();
      this.boostStrip.destroy();
      this.rainbowRoad?.destroy(); this.space?.destroy();
      for (const texture of this.effectTextures) texture.destroy();
      this.hullFire.destroy();
      this.thrusterFlame.destroy();
      this.world.destroy();
      this.gui.dispose();
      this.engine.destroy();
    }, { signal: this.inputLifetime.signal });
    this.engine.run();
  }

  private async loadEffectTextures(): Promise<void> {
    const upload = async (url: string): Promise<GPUTexture> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Effect texture failed: ${url} (${response.status})`);
      const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', resizeWidth: 512, resizeHeight: 512 });
      try {
        const texture = this.engine.device.createTexture({ label: url, size: [bitmap.width, bitmap.height], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        this.engine.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
        this.effectTextures.push(texture);
        return texture;
      } finally { bitmap.close(); }
    };
    const [smoke, boost, button, panel, dial, title, timing] = await Promise.all([upload('./assets/smoke-puff.png'), upload('./assets/boost-chevron.png'),
      upload('./assets/gui-button.png'), upload('./assets/gui-panel.png'), upload('./assets/gui-dial.png'), upload('./assets/gui-title.png'), upload('./assets/gui-timing.png')]);
    this.gui.setSkins(button, panel, dial, title, timing);
    const sparkCanvas = new OffscreenCanvas(64, 64);
    const paint = sparkCanvas.getContext('2d')!;
    paint.strokeStyle = '#fff4c2'; paint.lineWidth = 3; paint.lineCap = 'round';
    paint.shadowColor = '#ff9d25'; paint.shadowBlur = 8;
    paint.beginPath(); paint.moveTo(15, 49); paint.lineTo(49, 15); paint.stroke();
    const spark = this.engine.device.createTexture({ label: 'NeonCircuit.spark', size: [64, 64], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    this.engine.device.queue.copyExternalImageToTexture({ source: sparkCanvas }, { texture: spark }, [64, 64]);
    this.effectTextures.push(spark);
    this.effects = new RaceParticles(this.world, smoke, spark);
    this.boostStrip = new BoostStripTexture(this.engine.device, boost);
    this.boostStrip.update(0);
  }

  private setupRenderer(): void {
    const start = racePose(this.track, this.state);
    this.cameraHeading = start.heading;
    const cameraEntity = new Entity('Chase camera');
    this.cameraComponent = new Camera3D({ type: 'perspective', fov: speedFov(0, BOOST_MAX_SPEED), near: 1, far: (this.circuit.theme === 'cosmic' ? 30000 : 9500) * TRACK_SCALE });
    this.cameraComponent.reverseZ = true;
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
    const render3D = new Render3DSystem(this.engine, cameraEntity, { priority: 10, loadOp: 'clear', msaaSamples: 4, reverseZ: true });
    this.world.addSystem(render3D);
    this.gui = new NeonCircuitGui(this.world, this.engine.device, this.circuit.id, {
      select: id => { this.selectedCircuit = id; }, start: () => this.startSelectedCircuit(),
      restart: () => this.restart(), pause: () => this.togglePause(), home: () => this.showHome(),
      press: (key, pointer) => { if (this.phase === 'racing' || this.phase === 'countdown') this.touchKeys.set(pointer, key); },
      release: pointer => { this.touchKeys.delete(pointer); },
    }, matchMedia('(pointer: coarse)').matches);
    this.world.addSystem(new GuiSystem(this.engine, { loadOp: 'load', font: {
      chars: NEON_GUI_GLYPHS, fontSize: 48, atlasSize: 2048, fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    } }));
    const integration = new RenderIntegration(this.engine, { label: 'NeonCircuit.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world);
  }

  private setupLighting(): void {
    const environment = new Entity('Racer environment reflections');
    environment.addComponent(new EnvironmentLight({ intensity: 1.25, diffuseColor: [0.70, 0.75, 0.82], specularColor: [0.22, 0.28, 0.4] }));
    this.world.addEntity(environment);
    const ambient = new Entity('Night ambient');
    ambient.addComponent(new AmbientLight({ color: [0.22, 0.42, 0.72], intensity: 0.72 }));
    this.world.addEntity(ambient);
    const moon = new Entity('Moon light');
    moon.addComponent(new DirectionalLight({ color: [0.85, 0.92, 1], intensity: 2.2, direction: [-0.35, -1, -0.2] }));
    this.world.addEntity(moon);
    const rim = new Entity('Magenta rim');
    rim.addComponent(new DirectionalLight({ color: [this.colors.accent[0], this.colors.accent[1], this.colors.accent[2]], intensity: 0.68, direction: [0.65, -0.4, 0.5] }));
    this.world.addEntity(rim);
  }

  private buildEnvironment(): void {
    this.addBox('Void floor', 0, -24, 0, 9_200 * TRACK_SCALE, 12, 9_200 * TRACK_SCALE, this.colors.ground, 5);
    let randomState = this.circuit.seed;
    const random = (): number => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
    for (let index = 0; index < 88; index++) {
      const angle = index / 88 * Math.PI * 2 + (random() - 0.5) * 0.06;
      const radius = (3_650 + random() * 720) * TRACK_SCALE;
      const height = 220 + random() * 720;
      const width = 38 + random() * 78;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      this.buildingCount++;
      this.addBox(`Skyline-${index}`, x, height * 0.5 - 18, z, width, height, width, index % 4 === 0 ? this.colors.roadB : this.colors.roadA, 12);
      if (index % 3 === 0) this.addBox(`SkylineLight-${index}`, x, height - 17, z, width * 0.74, 2.5, width * 1.02, index % 2 ? this.colors.rail : this.colors.accent, 90);
    }
    // Deterministic districts follow both sides of the circuit. Check the entire
    // centerline so towers never intrude into a neighboring hairpin.
    for (let index = 0; index < 112; index++) {
      const sample = sampleTrack(this.track, index / 112 * this.track.length);
      const side = index % 2 ? -1 : 1;
      const offset = side * (230 + random() * 420);
      const x = sample.x + Math.cos(sample.heading) * offset;
      const z = sample.z - Math.sin(sample.heading) * offset;
      const width = 65 + random() * 90;
      if (this.track.samples.some(point => Math.hypot(point.x - x, point.z - z) < ROAD_HALF_WIDTH + width * 0.8 + 55)) continue;
      const height = sample.y + 110 + random() * 330;
      const accent = index % 3 ? this.colors.rail : this.colors.accent;
      this.buildingCount++;
      this.addBox(`District tower ${index}`, x, height / 2 - 18, z, width, height, width, index % 2 ? this.colors.roadA : this.colors.roadB, 30);
      this.addBox(`Tower crown ${index}`, x, height - 10, z, width * 1.08, 9, width * 1.08, accent, 100);
      for (let floor = 1; floor <= 3; floor++) {
        this.addBox(`Window belt ${index}-${floor}`, x, height * floor / 4, z, width * 1.015, 3, width * 1.015, accent, 80);
      }
      if (index % 3 === 0) this.addBox(`Tower antenna ${index}`, x, height + 35, z, 4, 80, 4, accent, 100);
    }
    for (let distance = 600; distance < this.track.length; distance += 1300) {
      const point = sampleTrack(this.track, distance);
      this.addBox(`Track foundation ${distance}`, point.x, (point.y - 25) / 2, point.z, 48, Math.max(10, point.y - 25), 48, this.colors.roadB, 20);
      for (const side of [-1, 1]) {
        const x = point.x + Math.cos(point.heading) * side * 126;
        const z = point.z - Math.sin(point.heading) * side * 126;
        this.addBox(`Portal ${distance}-${side}`, x, point.y + 62, z, 12, 144, 12, this.colors.roadB, 40);
      }
      this.addBox(`Overhead sign ${distance}`, point.x, point.y + 136, point.z, 264, 16, 14,
        this.circuit.id === 'reactor-run' ? this.colors.accent : this.colors.rail, 100, [0, point.heading, 0]);
    }
  }

  private buildTrack(): void {
    const centerPath = this.track.samples.map(sample => this.extrusionPoint(sample.distance));
    this.addGeometry('Continuous road', createPathExtrusion3D({
      path: centerPath,
      // The visible top is shared by all road markings; this mesh is only its underside/edges.
      shape: [[ROAD_HALF_WIDTH, 0], [ROAD_HALF_WIDTH, -5], [-ROAD_HALF_WIDTH, -5], [-ROAD_HALF_WIDTH, 0]],
      closedShape: false,
      closedPath: true,
      uvScale: [0.012, 0.02],
    }), this.colors.roadA, 30);

    const surface = createPathExtrusion3D({ path: centerPath,
      shape: [[-ROAD_HALF_WIDTH, 0], [ROAD_HALF_WIDTH, 0]], closedShape: false, closedPath: true,
      uvScale: [Math.round(this.track.length / 240) / this.track.length, 1 / (ROAD_HALF_WIDTH * 2)] });
    const overlay = (from: number, to: number, left: number, right: number, lift: number, uvScale: readonly [number, number]) =>
      new Geometry3D(roadOverlay(this.track, surface.positions, from, to, left, right, ROAD_HALF_WIDTH, lift, uvScale));
    if (this.rainbowRoad) {
      const entity = new Entity('Flowing rainbow road');
      entity.addComponent(new Mesh3D(surface, new BasicMaterial({ texture: this.rainbowRoad.texture, cullMode: 'none',
        sampler: { magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8,
          addressModeU: 'repeat', addressModeV: 'clamp-to-edge' } })));
      this.world.addEntity(entity);
    } else this.addGeometry('Road surface', surface, this.colors.roadA, 30);

    for (const side of [-1, 1]) {
      const railPath = this.track.samples.map(sample => this.extrusionPoint(sample.distance, side * (ROAD_HALF_WIDTH + 3), 5));
      this.addGeometry(`Continuous rail ${side}`, createPathExtrusion3D({
        path: railPath,
        shape: [[-3.2, 5], [3.2, 5], [3.2, -5], [-3.2, -5]],
        closedPath: true,
        uvScale: [0.018, 0.08],
      }), this.colors.rail, 105);
    }

    for (const laneOffset of this.rainbowRoad ? [] : [-ROAD_HALF_WIDTH / 3, ROAD_HALF_WIDTH / 3]) {
      this.addGeometry(`Lane stripe ${laneOffset}`, overlay(0, this.track.length, laneOffset - 0.85, laneOffset + 0.85, 0.38, [0.02, 1]), this.colors.marker, 58);
    }

    for (let distance = 220; distance < this.track.length; distance += this.rainbowRoad ? 1080 : 360) {
      this.addGeometry(`Velocity rib ${Math.round(distance)}`,
        overlay(distance - 2.2, distance + 2.2, -ROAD_HALF_WIDTH * 0.88, ROAD_HALF_WIDTH * 0.88, 0.48, [0.08, 0.03]),
        Math.floor(distance / 360) % 5 === 0 ? this.colors.accent : this.colors.marker, 88);
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
          Math.floor(distance / 840) % 2 === 0 ? this.colors.rail : this.colors.accent,
          100,
          [-sample.pitch, sample.heading, sample.bank],
        );
      }
    }

    BOOST_ZONES.forEach((center, index) => {
      const boostGeometry = overlay((center - BOOST_ZONE_HALF_LENGTH) * this.track.length, (center + BOOST_ZONE_HALF_LENGTH) * this.track.length,
        -BOOST_PAD_HALF_WIDTH, BOOST_PAD_HALF_WIDTH, 0.55, [1 / 92, 1 / (BOOST_PAD_HALF_WIDTH * 2)]);
      const entity = new Entity(`Boost lane ${index}`);
      entity.addComponent(new Mesh3D(boostGeometry, new BasicMaterial({ texture: this.boostStrip.texture,
        color: this.colors.boost, sampler: { magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' } })));
      this.world.addEntity(entity);
    });

    const start = sampleTrack(this.track, 0);
    this.addGeometry('Start line', overlay(-7, 7, -ROAD_HALF_WIDTH * 0.96, ROAD_HALF_WIDTH * 0.96, 0.52, [0.1, 0.04]), this.colors.white, 100);
    const rightX = Math.cos(start.heading);
    const rightZ = -Math.sin(start.heading);
    for (const side of [-1, 1]) {
      const x = start.x + rightX * side * (ROAD_HALF_WIDTH + 11);
      const z = start.z + rightZ * side * (ROAD_HALF_WIDTH + 11);
      this.addBox(`StartPylon-${side}`, x, start.y + 28, z, 7, 56, 7, this.colors.accent, 75);
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
    this.carParts.push({ transform: racerTransform, offset: [0, 0, 0], localRotation: [0, 0, 0] });

    this.thrusterFlame = new ThrusterFlameTexture(this.engine.device);
    const flameGeometry = createPlane3D({ width: 3.6, height: 1, normal: 'y' });
    // Place the leading edge at the socket; scaling only extends the jet backward.
    for (let index = 2; index < flameGeometry.positions.length; index += 3) flameGeometry.positions[index]! -= 0.5;
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
      this.exhaustParts.push(flameTransform);
      const flameEntity = new Entity(`Thruster flame ${index + 1}`);
      flameEntity.addComponent(flameTransform);
      flameEntity.addComponent(new Mesh3D(flameGeometry, flameMaterial));
      this.world.addEntity(flameEntity);
      this.carParts.push({
        transform: flameTransform,
        offset: [offsetX, EXHAUST_SOCKETS[0][1], THRUSTER_OFFSET_Z],
        localRotation: [0, 0, 0],
      });
    }

    this.hullFire = new HullFireTexture(this.engine.device);
    const fireMaterial = new BasicMaterial({ color: [1, 1, 1, 1], texture: this.hullFire.texture,
      blending: 'additive', depthWrite: false, cullMode: 'none' });
    const fireGeometry = createPlane3D({ width: 5.5, height: 1, normal: 'z' });
    for (let vertex = 1; vertex < fireGeometry.positions.length; vertex += 3) fireGeometry.positions[vertex]! += 0.5;
    for (let index = 0; index < 2; index++) {
      const transform = new CartesianTransform3D();
      const entity = new Entity(`Burning hull ${index}`);
      entity.addComponent(transform);
      entity.addComponent(new Mesh3D(fireGeometry, fireMaterial));
      this.world.addEntity(entity);
      this.carParts.push({ transform, offset: [index === 0 ? -3.5 : 3.5, 3.2, -10 - index * 3], localRotation: [0, index * Math.PI / 3, 0] });
      this.fireParts.push(transform);
    }
    this.hullFire.update(0, 0);

  }

  private held(key: string): boolean {
    if (this.keys.has(key)) return true;
    for (const held of this.touchKeys.values()) if (held === key) return true;
    return false;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const controlled = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'p', 'r', ' ', 'escape']);
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (!event.repeat && this.gui.keyboard(key, event.shiftKey)) { event.preventDefault(); return; }
      if (this.phase === 'home') return;
      if (controlled.has(key)) event.preventDefault();
      if (key === 'r' && !event.repeat) return this.restart();
      if ((key === 'p' || key === ' ' || key === 'escape') && !event.repeat) return this.togglePause();
      if (this.phase !== 'racing' && this.phase !== 'countdown') return;
      this.keys.add(key);
    }, { signal: this.inputLifetime.signal });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()), { signal: this.inputLifetime.signal });
    const suspend = (): void => {
      this.keys.clear(); this.touchKeys.clear();
      this.gui.cancelCarouselPointer();
      if (this.phase === 'racing' || this.phase === 'countdown') this.togglePause();
    };
    window.addEventListener('blur', suspend, { signal: this.inputLifetime.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); }, { signal: this.inputLifetime.signal });
    // Pointer identity is independent of the GUI's current hover/press target, allowing two-finger driving.
    canvas.addEventListener('pointercancel', event => {
      this.touchKeys.delete(event.pointerId);
      this.gui.cancelCarouselPointer(event.pointerId);
    }, { signal: this.inputLifetime.signal });
    canvas.addEventListener('lostpointercapture', event => {
      this.touchKeys.delete(event.pointerId);
      this.gui.carouselCaptureLost(event);
    }, { signal: this.inputLifetime.signal });
  }

  private tick(timeMs: number, deltaMs: number): void {
    const seconds = Math.max(0, Math.min(0.05, deltaMs * 0.001));
    if (this.phase === 'countdown' && this.racerModel.status === 'loaded') {
      this.countdown -= seconds;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.announcementText = '';
      }
    } else if (this.phase === 'racing') {
      const controls = {
        throttle: this.held('w') || this.held('arrowup') ? 1 : 0,
        brake: this.held('s') || this.held('arrowdown') ? 1 : 0,
        steer: (this.held('a') || this.held('arrowleft') ? 1 : 0) - (this.held('d') || this.held('arrowright') ? 1 : 0),
      };
      this.accumulator += seconds;
      const events: string[] = [];
      while (this.accumulator >= 1 / 120) {
        const result = stepRace(this.track, this.state, controls, 1 / 120);
        this.state = result.state;
        events.push(...result.events);
        this.accumulator -= 1 / 120;
      }
      const result = { events };
      if (events.includes('wall')) {
        this.cameraImpact = Math.max(this.cameraImpact, this.state.impact);
        const center = sampleTrack(this.track, this.state.distance);
        const side = Math.sign(this.state.lateral);
        const right = bankedRight(center.heading, center.pitch, center.bank);
        const up = bankedUp(center.heading, center.pitch, center.bank);
        this.effects.collide([center.x + right[0] * side * (ROAD_HALF_WIDTH + 1) + up[0] * 5,
          center.y + right[1] * side * (ROAD_HALF_WIDTH + 1) + up[1] * 5,
          center.z + right[2] * side * (ROAD_HALF_WIDTH + 1) + up[2] * 5],
          [-right[0] * side, -right[1] * side, -right[2] * side], [Math.sin(center.heading), 0, Math.cos(center.heading)], this.state.impact);
      }
      if (result.events.includes('destroyed')) {
        this.phase = 'destroyed';
        this.keys.clear(); this.touchKeys.clear();
        this.flashAnnouncement('赛车损毁', Number.POSITIVE_INFINITY);
      }
      if (result.events.includes('finish')) this.finishRace();
      if (result.events.includes('lap')) this.flashAnnouncement(`LAP ${this.state.lap}`);
    }
    if (this.phase === 'racing' && this.state.elapsed >= this.announcementUntil) this.announcementText = '';
    this.updateVisuals(timeMs, seconds);
    this.gui.animate(seconds);
    this.updateHud();
    this.world.update(timeMs, deltaMs);
    this.gui.flushCarouselCaptureLosses();
    if (++this.validationFrames >= 24 && this.validationFrames < 1_000_000 && this.racerModel.status === 'loaded') {
      this.validationFrames = 1_000_000;
      void this.finishValidation();
    }
  }

  private styleRacerMaterials(): void {
    const root = this.racerModel.runtimeRoot;
    if (!root || root === this.styledRacerRoot) return;
    const pending = [root], styled = new Set<PbrMaterial>();
    while (pending.length) {
      const node = pending.pop()!;
      pending.push(...node.children);
      const material = node.getComponent(Mesh3D)?.material;
      if (!(material instanceof PbrMaterial) || styled.has(material)) continue;
      styled.add(material);
      // Preserve imported colours/textures, with a polished paint finish and a
      // separate smooth dielectric windshield. The loader owns these materials.
      const glass = material.alphaMode === 'blend';
      material.metallic = glass ? 0 : 0.12;
      material.roughness = glass ? 0.16 : 0.38;
      material.clearcoatFactor = glass ? 0 : 0.22;
      material.clearcoatRoughnessFactor = 0.22;
    }
    this.racerPbrMaterialCount = styled.size;
    this.styledRacerRoot = root;
  }

  private updateVisuals(timeMs: number, seconds: number): void {
    this.styleRacerMaterials();
    const pose = racePose(this.track, this.state);
    const targetPitch = -pose.pitch;
    this.visualPitch += (targetPitch - this.visualPitch) * (1 - Math.exp(-seconds * 7));
    const steerAxis = (this.held('a') || this.held('arrowleft') ? 1 : 0) - (this.held('d') || this.held('arrowright') ? 1 : 0);
    const targetBank = -steerAxis * Math.min(0.28, this.state.speed / CRUISE_MAX_SPEED * 0.28);
    this.visualBank += (targetBank - this.visualBank) * (1 - Math.exp(-seconds * 8));
    const hover = Math.sin(timeMs * 0.0065) * 0.75;
    const bank = pose.bank + this.visualBank;
    const bodyPosition = (offset: readonly number[]): [number, number, number] => {
      const point = rotateBodyPoint(offset, this.visualPitch, pose.heading, bank);
      return [pose.x + point[0], pose.y + 4.5 + hover + point[1], pose.z + point[2]];
    };
    for (const part of this.carParts) {
      part.transform.setPosition(...bodyPosition(part.offset))
        .setRotation(this.visualPitch + part.localRotation[0], pose.heading + part.localRotation[1], bank + part.localRotation[2]);
    }
    const speedRatio = Math.min(1, this.state.speed / BOOST_MAX_SPEED);
    const boostStrength = Math.min(1, this.state.boostRemaining / BOOST_DURATION_SECONDS);
    const accelerating = this.held('w') || this.held('arrowup');
    const targetLength = propulsionEnvelope(this.state.speed, accelerating, this.phase === 'racing', boostStrength, this.state.destroyed, BOOST_MAX_SPEED);
    this.exhaustLength += (targetLength - this.exhaustLength) * (1 - Math.exp(-seconds * (targetLength < this.exhaustLength ? 22 : 9)));
    for (const part of this.exhaustParts) part.setScale(1, 1, Math.max(0.001, this.exhaustLength));
    const thrust = this.phase === 'racing' && accelerating && !this.state.destroyed;
    const effectsRunning = this.phase === 'racing' || this.phase === 'destroyed';
    if (this.phase !== 'paused') this.effectClock += seconds;
    this.thrusterFlame.update(this.effectClock, speedRatio, boostStrength, this.state.destroyed ? 0 : thrust ? 1 : 0.48);
    const damage = damageEnvelope(this.state.health);
    this.hullFire.update(this.effectClock, damage.fire);
    for (const part of this.fireParts) part.setScale(1, 3.5 + damage.fire * 6, 1);
    this.effects.update(seconds, bodyPosition([0, 3.8, -11]), [Math.sin(pose.heading), 0, Math.cos(pose.heading)],
      damage.smokeRate, damage.smokeOpacity, effectsRunning);
    this.boostStrip.update(this.effectClock);
    this.rainbowRoad?.update(this.effectClock);
    this.cameraImpact *= Math.exp(-seconds * 5);
    const shake = this.phase === 'paused' || this.phase === 'home' ? 0 : this.cameraImpact;

    const headingResponse = 1 - Math.exp(-seconds * (4.6 + speedRatio * 2.8));
    this.cameraHeading = lerpAngle(this.cameraHeading, pose.heading, headingResponse);
    this.camera.theta = this.cameraHeading + Math.PI + Math.sin(timeMs * 0.081) * shake * 0.038;
    const portraitFraming = Math.max(1, 0.65 / (innerWidth / Math.max(1, innerHeight)));
    this.camera.radius = (108 + speedRatio * 20) * portraitFraming;
    this.cameraComponent.fov += (speedFov(this.state.speed, BOOST_MAX_SPEED) - this.cameraComponent.fov) * (1 - Math.exp(-seconds * 3.5));
    this.camera.phi += (speedCameraPhi(this.state.speed, pose.pitch, BOOST_MAX_SPEED) - this.camera.phi) * (1 - Math.exp(-seconds * 3.5));
    const lookAhead = 12 + speedRatio * 24;
    const forwardHorizontal = Math.cos(pose.pitch);
    this.camera.setTarget(
      pose.x + Math.sin(pose.heading) * forwardHorizontal * lookAhead + Math.sin(timeMs * 0.067) * shake * 3.5,
      pose.y + 11 + Math.sin(pose.pitch) * lookAhead + Math.sin(timeMs * 0.099) * shake * 4.5,
      pose.z + Math.cos(pose.heading) * forwardHorizontal * lookAhead,
    );
    if (this.verificationOverview) {
      this.cameraComponent.fov = 0.96;
      this.camera.set(9800 * TRACK_SCALE, -0.45, 0.8).setTarget(0, 1200 * TRACK_SCALE, 0);
    }
    this.effects.faceCamera(this.camera.theta, this.camera.phi);
    this.space?.update(this.effectClock, this.camera.eyePosition);
  }

  private updateHud(): void {
    if (this.phase === 'countdown') this.announcementText = this.racerModel?.status !== 'loaded'
      ? '正在加载赛车…' : this.countdown <= 0.45 ? 'GO' : String(Math.max(1, Math.ceil(this.countdown - 0.4)));
    this.gui.update({ phase: this.phase, speed: formatSpeed(this.state.speed),
      lap: `${Math.min(this.state.lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`, time: formatTime(this.state.elapsed),
      best: Number.isFinite(this.bestTime) ? formatTime(this.bestTime) : '--:--.---', health: this.state.health,
      countdown: this.countdown, announcement: this.announcementText,
      impact: this.phase === 'racing' ? this.cameraImpact : 0 });
  }

  private finishRace(): void {
    this.phase = 'finished';
    const isRecord = this.state.elapsed < this.bestTime;
    if (isRecord) {
      this.bestTime = this.state.elapsed;
      void this.saves.save({ bestTime: this.bestTime });
      this.updateBestTime();
    }
    this.announcementText = `${isRecord ? 'NEW RECORD · ' : ''}${formatTime(this.state.elapsed)}`;
    this.keys.clear(); this.touchKeys.clear(); this.updateHud();
  }

  private restart(): void {
    this.state = createInitialRaceState();
    this.phase = 'countdown';
    this.countdown = 3.4;
    this.keys.clear();
    this.accumulator = 0;
    this.cameraImpact = 0;
    this.exhaustLength = 1.35;
    this.effects.reset();
    this.announcementUntil = 0;
    this.cameraHeading = sampleTrack(this.track, 0).heading;
    this.visualBank = 0;
    this.visualPitch = 0;
    this.touchKeys.clear();
    this.updateHud();
  }

  private togglePause(): void {
    this.keys.clear(); this.touchKeys.clear();
    if (this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
      this.announcementText = '';
    } else {
      if (this.phase === 'finished' || this.phase === 'destroyed' || this.phase === 'home') return;
      this.phaseBeforePause = this.phase;
      this.phase = 'paused'; this.announcementText = 'PAUSED';
    }
    this.updateHud();
  }

  private flashAnnouncement(text: string, duration = 0.95): void {
    this.announcementText = text;
    this.announcementUntil = this.state.elapsed + duration;
  }

  private startSelectedCircuit(): void {
    if (this.selectedCircuit === this.circuit.id) this.restart();
    else {
      const url = new URL(location.href);
      url.searchParams.set('track', this.selectedCircuit);
      url.searchParams.set('race', '1');
      location.assign(url.href);
    }
  }

  private showHome(): void {
    this.phase = 'home';
    this.keys.clear(); this.touchKeys.clear();
    this.announcementText = '';
    this.updateHud();
  }

  private updateBestTime(): void { this.updateHud(); }

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
      health: this.state.health,
      headingOffset: this.state.headingOffset,
      impact: this.state.impact,
      trackId: this.circuit.id,
      buildingCount: this.buildingCount,
      exhaustLength: this.exhaustLength,
      fov: this.cameraComponent.fov,
      reverseZ: this.engine.reverseZ && this.cameraComponent.reverseZ, depthFormat: this.engine.getDepthFormat(),
      cameraPhi: this.camera.phi, theme: this.circuit.theme, space: this.space?.counts ?? null, rainbowTime: this.rainbowRoad?.time ?? null,
      particles: this.effects.counts,
    };
  }

  private async finishValidation(): Promise<void> {
    const checks: string[] = [];
    try {
      if (new URLSearchParams(location.search).has('verify')) await this.verifyBrowser(checks);
      await this.engine.device.queue.onSubmittedWorkDone();
      const scopedError = await this.engine.device.popErrorScope();
      if (scopedError) this.validationErrors.push(scopedError.message);
    } catch (error) { this.validationErrors.push(String(error)); }
    const status = this.validationErrors.length === 0 ? 'passed' : 'failed';
    document.body.dataset.renderStatus = status;
    const output = query<HTMLElement>('#result');
    output.textContent = JSON.stringify({ schemaVersion: 1, revision: 'neon-circuit-speed-v13', status,
      errors: this.validationErrors, checks, gui: this.gui.snapshot, modelStatus: this.racerModel.status, ...this.snapshot() });
    output.dataset.status = status;
  }

  /** Browser fixture: engine GUI hit testing, input adapters and GPU passes with seeded states. */
  private async verifyBrowser(checks: string[]): Promise<void> {
    const check = (condition: boolean, label: string): void => { if (!condition) throw new Error(label); checks.push(label); };
    const frames = async (count = 4): Promise<void> => {
      for (let frame = 0; frame < count; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    };
    const settleCarousel = async (): Promise<void> => {
      for (let i=0;i<180 && Math.abs(this.gui.snapshot.carouselPosition-this.gui.snapshot.carouselTarget)>0.002;i++) await frames(1);
      await frames(2);
    };
    const click = async (id: string): Promise<void> => {
      if (id.startsWith('track-')) await settleCarousel();
      await frames(1);
      const rect = this.gui.buttonRect(id), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const target = this.gui.root.hitTest(x, y);
      if (target?.id !== id) throw new Error(`GUI hit test missed ${id}: ${target?.id}`);
      const event = { type: 'click', target, currentTarget: target, x, y, localX: x - rect.x, localY: y - rect.y,
        button: 0, buttons: 0, pointerId: 1, nativeEvent: new PointerEvent('pointerup'), stopped: false,
        defaultPrevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.defaultPrevented = true; },
      } satisfies GuiPointerEvent;
      target.handlePointerDown({ ...event, type: 'pointerdown' });
      // Native implicit capture loss is delivered before the GUI drains its
      // pointerup queue. Reproduce that ordering for taps as well as swipes.
      query<HTMLCanvasElement>('#canvas').dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));
      target.handlePointerUp({ ...event, type: 'pointerup' }); target.handleClick(event);
      this.gui.flushCarouselCaptureLosses();
    };
    this.showHome();
    await frames();
    check(this.engine.reverseZ && this.cameraComponent.reverseZ && this.engine.getDepthFormat() === 'depth32float',
      'scene and camera share reverse-Z with floating-point depth');
    if (this.rainbowRoad) {
      const texture = this.rainbowRoad;
      const pixel = async (): Promise<Uint8Array> => {
        const buffer = this.engine.device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        try {
          const encoder = this.engine.device.createCommandEncoder();
          encoder.copyTextureToBuffer({ texture: texture.texture, origin: [256, 128] }, { buffer, bytesPerRow: 256 }, [1, 1]);
          this.engine.device.queue.submit([encoder.finish()]);
          await buffer.mapAsync(GPUMapMode.READ);
          return new Uint8Array(buffer.getMappedRange()).slice(0, 4);
        } finally { buffer.destroy(); }
      };
      texture.update(0); const before = await pixel();
      texture.update(4); const after = await pixel();
      check(before[3] === 255 && after[3] === 255 && before.slice(0, 3).some((value, i) => Math.abs(value - after[i]!) > 20),
        'rainbow shader changes actual GPU surface colours over time');
      texture.update(this.effectClock);
    }
    check(this.gui.snapshot.routeCount === CIRCUITS.length, 'four actual route thumbnails');
    check(this.gui.snapshot.bounds.every(r => r.x >= 0 && r.y >= 0 && r.x + r.width <= innerWidth && r.y + r.height <= innerHeight), 'home fits viewport');
    check(document.querySelectorAll('button, svg, section, header, [data-control]').length === 0, 'all visible UI uses engine GUI');
    check(this.gui.snapshot.skinnedButtonsTransparent, 'image-skinned buttons and cards draw no extra rectangle or border');
    this.gui.select(CIRCUITS[0]!.id); await settleCarousel();
    for (const [index, circuit] of CIRCUITS.entries()) {
      await click(`track-${circuit.id}`);
      await settleCarousel();
      const position = ((this.gui.snapshot.carouselPosition % CIRCUITS.length) + CIRCUITS.length) % CIRCUITS.length;
      check(this.selectedCircuit === circuit.id && Math.abs(position - index) < 0.002, `GUI side-card tap centres and retains ${circuit.id} after capture release`);
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    check(this.selectedCircuit === CIRCUITS[0]!.id, 'keyboard navigates GUI course selection');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    const previousCourse = this.selectedCircuit;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    check(previousCourse === CIRCUITS[CIRCUITS.length - 1]!.id && this.selectedCircuit === CIRCUITS[0]!.id && !this.held('a') && !this.held('d'), 'A and D wrap carousel without leaking into driving');
    const swipe = async (dx: number, dy = 0, cancel = false, duration = 300): Promise<boolean> => {
      await settleCarousel();
      const rect = this.gui.snapshot.carouselBounds, x=rect.x+rect.width/2, y=rect.y+rect.height/2;
      const target = this.gui.root.hitTest(x,y)!;
      const startTime = performance.now();
      const native = (type: string): PointerEvent => {
        const event = new PointerEvent(type);
        Object.defineProperty(event, 'timeStamp', { value: startTime + (type === 'pointerdown' ? 0 : duration + (type === 'pointermove' ? 0 : 16)) });
        return event;
      };
      const event = (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'click', offset: number): GuiPointerEvent => ({
        type, target, currentTarget: target, x:x+offset,y:y+(offset ? dy : 0),localX:0,localY:0,button:0,buttons:type==='pointerup'?0:1,pointerId:71,
        nativeEvent:native(type),stopped:false,defaultPrevented:false,stopPropagation(){this.stopped=true;},preventDefault(){this.defaultPrevented=true;},
      });
      const before=this.gui.snapshot.carouselPosition;
      target.handlePointerDown(event('pointerdown',0)); target.handlePointerMove(event('pointermove',dx));
      const followed = Math.abs(this.gui.snapshot.carouselPosition-before)>0.1;
      query<HTMLCanvasElement>('#canvas').dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:71}));
      if (!cancel) { target.handlePointerUp(event('pointerup',dx)); target.handleClick(event('click',dx)); }
      this.gui.flushCarouselCaptureLosses();
      await settleCarousel();
      return followed;
    };
    const followed = await swipe(-100);
    check(followed && this.selectedCircuit === CIRCUITS[1]!.id && Math.abs(((this.gui.snapshot.carouselPosition % CIRCUITS.length) + CIRCUITS.length) % CIRCUITS.length - 1) < 0.002,
      'horizontal drag retains next card after implicit capture release and settles at its centre');
    await swipe(100); await swipe(100);
    check(this.selectedCircuit === CIRCUITS[CIRCUITS.length - 1]!.id, 'right swipe returns through first course and wraps to last');
    await swipe(-100,0,true); await settleCarousel(); await swipe(4,100);
    check(this.selectedCircuit === CIRCUITS[CIRCUITS.length - 1]!.id && Math.abs(this.gui.snapshot.carouselPosition-this.gui.snapshot.carouselTarget)<0.002, 'cancelled and vertical gestures leave selection unchanged');
    const shortOrigin = this.gui.snapshot.carouselTarget;
    await swipe(-10);
    check(this.gui.snapshot.carouselTarget === shortOrigin + 1 && Math.abs(this.gui.snapshot.carouselPosition - this.gui.snapshot.carouselTarget) < 0.002,
      'gentle 10px left drag advances one course without requiring release momentum');
    await swipe(10);
    check(this.gui.snapshot.carouselTarget === shortOrigin && Math.abs(this.gui.snapshot.carouselPosition - shortOrigin) < 0.002,
      'gentle 10px right drag advances to the previous course and stays selected');
    let origin = this.gui.snapshot.carouselTarget;
    await swipe(-180,0,false,40);
    check(this.gui.snapshot.carouselTarget - origin >= 2 && Math.abs(this.gui.snapshot.carouselPosition - this.gui.snapshot.carouselTarget) < 0.002,
      'fast left throw traverses multiple cards and settles without shortening the wrap');
    origin = this.gui.snapshot.carouselTarget;
    await swipe(180,0,false,40);
    check(origin - this.gui.snapshot.carouselTarget >= 2, 'fast right throw retains reverse momentum across multiple cards');
    check(this.styledRacerRoot === this.racerModel.runtimeRoot && this.racerPbrMaterialCount > 0,
      'loaded racer retains imported PBR materials with environment lighting and paint finish');
    this.gui.select(this.circuit.id); await settleCarousel();
    await click(`track-${this.circuit.id}`);
    await click('start-race');
    check(this.snapshot().phase === 'countdown', 'selected course starts countdown');
    check(this.exhaustLength < 2, 'countdown exhaust stays short');
    check(this.gui.snapshot.countdownVisible, 'countdown uses large transparent glowing digit sprites');
    const hud = this.gui.snapshot;
    check(hud.dialBounds.x < 32 && hud.dialBounds.y < innerHeight / 3
      && Math.abs(hud.courseBounds.x + hud.courseBounds.width / 2 - innerWidth / 2) < 1
      && (innerWidth < 760 || hud.courseBounds.x >= hud.dialBounds.x + hud.dialBounds.width)
      && this.gui.buttonRect('pause').x > innerWidth - 130 && hud.activeButtons.join() === 'pause'
      && hud.timingBounds.x >= 0 && hud.timingBounds.x + hud.timingBounds.width < this.gui.buttonRect('pause').x
      && hud.timingBounds.y === this.gui.buttonRect('pause').y,  'dial at upper left, centered course label, skinned timing left of the upper-right pause');
    await click('pause');
    const pausedCountdown = this.countdown, pausedEffectTime = this.effectClock;
    await frames(3);
    check(this.phase === 'paused' && this.countdown === pausedCountdown && this.effectClock === pausedEffectTime && (!this.rainbowRoad || this.rainbowRoad.time === pausedEffectTime), 'pause panel freezes countdown and scene animation');
    await click('resume');
    check(this.snapshot().phase === 'countdown' && !this.gui.snapshot.modalVisible, 'resume returns to countdown');
    this.countdown = 0;
    await frames();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    await frames(12);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    check(this.state.speed > 0, 'keyboard throttle reaches simulation');
    check(this.exhaustLength > 3, 'throttle extends exhaust');
    await frames(20);
    check(this.exhaustLength < 2, 'releasing throttle quickly contracts exhaust');
    // Isolate steering from the throttle/coast run, which can already reach a rail
    // on slow browser frames. Keep normal keyboard input and physics integration.
    this.state = { ...createInitialRaceState(), distance: this.track.length * 0.18, speed: 160 };
    const heading = this.state.headingOffset;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await frames(6);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
    check(this.state.wallHits === 0 && this.state.headingOffset > heading, 'keyboard steering changes ship heading');
    this.state = { ...createInitialRaceState(), speed: CRUISE_MAX_SPEED, lateral: RAIL_LIMIT - 0.01,
      lateralSpeed: CRUISE_MAX_SPEED * 0.88, headingOffset: 1.1, health: 55, boostRemaining: 1 };
    await frames(3);
    check(this.state.wallHits >= 1 && this.state.speed < CRUISE_MAX_SPEED * 0.5, 'wall strike sharply reduces speed');
    check(this.state.health < BURN_HEALTH && this.state.impact > 0, 'impact damages hull and drives shake');
    check(this.gui.snapshot.health < BURN_HEALTH, 'critical hull renders fire and HUD warning');
    check(this.effects.counts.sparks > 0 && this.effects.counts.smoke > 0, 'rail impact creates sparks and smoke');
    this.state = { ...this.state, health: 1, speed: CRUISE_MAX_SPEED, lateral: RAIL_LIMIT, lateralSpeed: CRUISE_MAX_SPEED * 0.88,
      headingOffset: 1.1, collisionCooldown: 0 };
    await frames();
    check(this.snapshot().phase === 'destroyed' && this.state.speed === 0, 'zero hull ends race');
    await click('restart');
    check(this.state.health === 100 && this.state.wallHits === 0 && this.state.impact === 0, 'restart restores hull and clears collision state');
    check(this.effects.counts.smoke === 0 && this.effects.counts.sparks === 0, 'restart clears all effect pools');
    this.countdown = 0;
    await frames();
    this.keys.add('w');
    await click('pause');
    check(!this.held('w'), 'pause releases active throttle');
    const elapsed = this.state.elapsed;
    await frames();
    check(this.snapshot().phase === 'paused' && this.state.elapsed === elapsed, 'pause freezes race time');
    check(this.gui.snapshot.modalVisible && !this.gui.snapshot.instrumentsVisible && this.gui.snapshot.activeButtons.join() === 'resume,home-button'
      && !this.gui.snapshot.touchVisible && this.gui.root.hitTest(4, innerHeight - 4)?.id === 'race-modal', 'pause modal blocks underlying controls and exposes only resume and home');
    await click('resume');
    check(this.snapshot().phase === 'racing' && !this.gui.snapshot.modalVisible && !this.held('w'), 'resume button restores race without stuck throttle');
    await click('pause');
    for (const [key, shiftKey] of [['Tab', false], ['Tab', true], ['Enter', false]] as const)
      window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey }));
    check(this.snapshot().phase === 'racing' && !this.gui.snapshot.modalVisible, 'keyboard focus remains inside pause panel and Enter resumes');
    await click('pause');
    await click('home-button');
    check(this.snapshot().phase === 'home' && this.gui.snapshot.homeVisible, 'return to course selection');
    check(this.space ? this.space.counts.planets === 3 && this.space.counts.meteors === 36 && this.buildingCount === 0 : this.buildingCount > 150,
      this.space ? 'cosmic panorama, three ringed planets and pooled meteor shower replace the city' : 'dense deterministic trackside skyline');
    this.restart();
    this.phase = 'racing';
    if (this.gui.snapshot.touchVisible) {
      await frames(1);
      const press = (key: string, pointerId: number): void => {
        const rect = this.gui.buttonRect(`control-${key}`), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        const target = this.gui.root.hitTest(x, y);
        if (target?.id !== `control-${key}`) throw new Error('Touch GUI hit target is obscured');
        target.handlePointerDown({ type: 'pointerdown', target, currentTarget: target, pointerId, x, y, localX: 1, localY: 1,
          button: 0, buttons: 1, stopped: false, defaultPrevented: false, nativeEvent: new PointerEvent('pointerdown'),
          preventDefault() {}, stopPropagation() {} });
      };
      press('w', 10); press('a', 11);
      check(this.held('w') && this.held('a'), 'two fingers hold acceleration and steering together');
      query<HTMLCanvasElement>('#canvas').dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 10 }));
      check(!this.held('w') && this.held('a'), 'releasing throttle preserves steering finger');
      query<HTMLCanvasElement>('#canvas').dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 11 }));
      check(!this.held('a') && this.touchKeys.size === 0, 'lost capture releases touch controls');
    }
    this.state = { ...createInitialRaceState(), health: 45 };
    await frames(40);
    check(this.effects.counts.smoke > 0 && damageEnvelope(45).fire === 0, 'half hull smokes without fire');
    this.state = { ...createInitialRaceState(), speed: BOOST_MAX_SPEED };
    const slowFov = this.cameraComponent.fov, slowPhi = this.camera.phi;
    await frames(18);
    check(this.cameraComponent.fov < slowFov && this.camera.phi > slowPhi, 'higher speed narrows FOV and raises the forward sightline');
    // Observe expiry immediately, before the unsteered ship reaches a bend.
    this.state = { ...createInitialRaceState(), speed: BOOST_MAX_SPEED, boostRemaining: 1 / 240 };
    await frames(2);
    check(this.state.boostRemaining === 0 && this.state.wallHits === 0 && this.state.speed > CRUISE_MAX_SPEED && this.state.speed < BOOST_MAX_SPEED
      && this.gui.snapshot.displaySpeed === formatSpeed(this.state.speed), 'overspeed decays gradually in simulation and speedometer');
    this.showHome();
    const shot = new URLSearchParams(location.search).get('shot');
    if (shot?.startsWith('home')) {
      this.gui.select(shot === 'home-sky' ? 'sky-harbor' : shot === 'home-reactor' ? 'reactor-run' : shot === 'home-rainbow' ? 'rainbow-road' : CIRCUITS[0]!.id);
      await settleCarousel();
      if (shot === 'home-swipe') { this.gui.select(CIRCUITS[1]!.id); await frames(3); }
    } else {
      this.restart();
      const onBoost = shot === 'boost';
      this.state = { ...createInitialRaceState(), distance: onBoost ? this.track.length * (BOOST_ZONES[0] - BOOST_ZONE_HALF_LENGTH) - 45 : this.track.length * 0.18,
        health: shot === 'fire' ? 18 : shot === 'smoke' ? 45 : 100,
        speed: shot === 'accelerating' || shot === 'coasting' ? CRUISE_MAX_SPEED * 0.92 : 0 };
      this.cameraHeading = sampleTrack(this.track, this.state.distance).heading;
      this.phase = 'racing';
      this.announcementText = '';
      if (shot === 'accelerating') this.keys.add('w');
      if (shot === 'collision') {
        this.state = { ...this.state, lateral: RAIL_LIMIT - 0.01, lateralSpeed: CRUISE_MAX_SPEED * 0.88, headingOffset: 1.1, speed: CRUISE_MAX_SPEED };
        await frames(9);
      }
      if (shot === 'countdown') { this.phase = 'countdown'; this.countdown = 2.8; }
      if (shot === 'amber') this.state = { ...this.state, health: 55 };
      if (shot === 'paused') { this.phaseBeforePause = 'racing'; this.phase = 'paused'; this.announcementText = 'PAUSED'; }
      if (shot === 'destroyed') { this.state = { ...this.state, health: 0, destroyed: true }; this.phase = 'destroyed'; this.announcementText = '赛车损毁'; }
      if (shot === 'finished') { this.state = { ...this.state, elapsed: 123.456, lap: 3 }; this.phase = 'finished'; this.announcementText = 'NEW RECORD · 02:03.456'; }
    }
    await frames(shot === 'home-swipe' ? 1 : shot === 'collision' || shot === 'countdown' ? 2 : 55);
    if (shot === 'high-speed') {
      // A stationary diagnostic pose isolates lens/paint/HUD changes from steering.
      this.state = { ...this.state, speed: BOOST_MAX_SPEED };
      for (let i = 0; i < 120; i++) this.updateVisuals(performance.now(), 1 / 60);
      await frames(2);
    }
    if (shot === 'space-overlook') { this.verificationOverview = true; await frames(2); }
    this.engine.stop();
  }

  showStartupError(): void {
    if (!this.gui || !this.engine || !this.world) return;
    this.phase = 'paused'; this.announcementText = '启动失败，请刷新页面重试。'; this.updateHud();
    this.engine.on('update', ({ detail: { time, delta } }) => this.world.update(time, delta));
    this.engine.run();
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
    const transform = new CartesianTransform3D({ position: [x, y, z], rotation: [...rotation], scale: [width, height, depth] });
    const entity = new Entity(name);
    entity.addComponent(transform);
    entity.addComponent(new Mesh3D(this.boxGeometry, this.material(color, shininess)));
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
      specular: shininess <= 12 ? [0.025, 0.035, 0.05, 1] : [0.78, 0.88, 1, 1],
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

const game = new NeonCircuitGame();
async function main(): Promise<void> {
  await game.init(query<HTMLCanvasElement>('#canvas'));
}

void main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.renderStatus = 'failed';
  document.body.dataset.renderError = message;
  document.body.dataset.phase = 'error';
  const output = document.querySelector<HTMLElement>('#result');
  if (output) { output.textContent = JSON.stringify({ status: 'failed', errors: [message] }); output.dataset.status = 'failed'; }
  game.showStartupError();
  console.error(error);
});
