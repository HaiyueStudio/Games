import { RaceOpponent, AI_DIFFICULTIES, raceProgress, raceWinner, type RaceMode, type AiDifficulty, type RaceWinner } from './RaceOpponent';
import { readCameraMode, saveCameraMode, type CameraMode } from './CameraMode';
import { VolcanicHazards } from './VolcanicHazards';
import { VolcanoEnvironment } from './VolcanoEnvironment';
import {NeonAudio} from './audio/NeonAudio';
import {NeonBrowserAudio} from './audio/BrowserAudio';
import { TEXT, readLanguage, saveLanguage, lapNotice, type Language, type LanguageStorage } from './NeonLocale';
import { mat4 } from 'wgpu-matrix';
import { hudMapPoint } from './HudMapMath';
import { SunnyEnvironment } from './SunnyEnvironment';
import { cross, dot, unit, mixAxes, turnFrame, type TrackFrame, type TrackVector } from './RaceRules';
import { browserNeonRaster, uploadNeonCanvas, type NeonRaster } from './NeonRaster';
import type { GameSaveBackend } from '@haiyue/engine/save';
import type { GuiFontOptions } from '@haiyue/engine/gui';
import type { GltfModelSystemOptions } from '@haiyue/extensions/gltf';
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
  BOOST_PAD_LENGTH,
  BOOST_PADS,
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
  dynamicTextures: { encodes: number; submissions: number };
  readonly raceMode: RaceMode; readonly difficulty: AiDifficulty; readonly winner: RaceWinner; readonly opponent: RaceState | null; readonly opponentModel: string;
  readonly cameraMode: CameraMode;
  readonly fireballs: readonly import('./VolcanicHazards').FallingFireball[];
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
  readonly coaster: { section: string; roadUp: readonly number[]; cameraUp: readonly number[] } | null;
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

export interface NeonNativeOptions {
  raceMode?: RaceMode; difficulty?: AiDifficulty;
  haptic(impact:number):void;
  audio: NeonAudio;
  languageStorage: LanguageStorage;
  raster: NeonRaster;
  guiFont: GuiFontOptions;
  saveBackend: GameSaveBackend;
  modelOptions: GltfModelSystemOptions;
  safeInsets(): { top: number; right: number; bottom: number; left: number };
  changeCircuit(id: string): void;
  steering(): number;
}

export class NeonCircuitGame {
  private audio!: NeonAudio;
  get audioState() {return this.audio.snapshot();}
  private native: NeonNativeOptions | null = null;
  private language: Language = 'zh';
  private cameraMode: CameraMode = 'chase';
  private selectedCamera: CameraMode = 'chase';
  private changeCamera(mode: CameraMode): void {
    this.selectedCamera=mode;saveCameraMode(this.languageStorage,mode);this.gui.setCameraMode(mode);
  }
  private languageStorage: LanguageStorage | undefined;
  get locale(): Language {return this.language;}
  private changeLanguage(language: Language): void {
    this.language=language; saveLanguage(this.languageStorage,language); this.gui.setLanguage(language);
    if(!this.native) {document.title=TEXT[language].title;document.documentElement.lang=language === 'zh' ? 'zh-CN' : language;
      document.querySelector('canvas')?.setAttribute('aria-label',`${TEXT[language].title}. ${TEXT[language].keys}. ${TEXT[language].keysMore}`);}
    this.updateHud();
  }
  private raster: NeonRaster = browserNeonRaster;
  private disposed = false;
  private readonly onFrame = ({ detail }: { detail: { time: number; delta: number } }) => this.tick(detail.time, detail.delta);
  constructor(trackId: string | null = null) { this.circuit = circuitById(trackId); this.colors = CIRCUIT_PALETTES[this.circuit.theme]; this.track = circuitTrack(this.circuit); this.selectedCircuit = this.circuit.id; }

  private readonly circuit: ReturnType<typeof circuitById>;
  private readonly colors: typeof CIRCUIT_PALETTES[keyof typeof CIRCUIT_PALETTES];
  private rainbowRoad: RainbowRoadTexture | null = null;
  private space: SpaceEnvironment | null = null;
  private sunny: SunnyEnvironment | null = null;
  private volcano: VolcanoEnvironment | null = null;
  private hazards: VolcanicHazards | null = null;
  private readonly track: RaceTrack;
  private selectedCircuit: string;
  private saves!: SingleSlotGameSave<RacerSaveData>;
  private engine!: HaiyueEngine;
  private readonly textureWork = { encodes: 0, submissions: 0 };
  private world!: World;
  private camera!: SphericalTransform3D;
  private cameraComponent!: Camera3D;
  private readonly keys = new Set<string>();
  private readonly carParts: CarPart[] = [];
  private readonly materials = new Map<string, BlinnPhongMaterial>();
  private readonly validationErrors: string[] = [];
  private state = createInitialRaceState();
  private raceMode: RaceMode = 'time-trial';
  private selectedRaceMode: RaceMode = 'time-trial';
  private difficulty: AiDifficulty = 'normal';
  private selectedDifficulty: AiDifficulty = 'normal';
  private opponentState = {...createInitialRaceState(),lateral:-30};
  private opponent: RaceOpponent | null = null;
  private opponentModel: GltfModelComponent | null = null;
  private opponentTransform: CartesianTransform3D | null = null;
  private winner: RaceWinner = null;
  private changeRaceSetup(mode:RaceMode,difficulty:AiDifficulty):void {
    this.selectedRaceMode=mode;this.selectedDifficulty=difficulty;
    try {this.languageStorage?.setItem('neon.raceMode',mode);this.languageStorage?.setItem('neon.aiDifficulty',difficulty);} catch { /* Session choice still works. */ }
    this.gui.setRaceSetup(mode,difficulty);
  }

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
  private racerModel: GltfModelComponent | null = null;
  private styledOpponentRoot: Entity | null = null;
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
  private newRecord = false;
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
    await this.prepareScene();
    this.bindInput(canvas);

    window.__neonCircuit = {
      snapshot: () => this.snapshot(),
      gui: () => this.gui.snapshot,
      restart: () => this.restart(),
      setState: next => { this.state = { ...this.state, ...next }; },
    };
    if (new URLSearchParams(location.search).get('race') === '1') this.restart();
    this.engine.on('update', this.onFrame);
    window.addEventListener('pageshow', () => this.engine.run(), { signal: this.inputLifetime.signal });
    window.addEventListener('pagehide', event => {
      this.keys.clear(); this.touchKeys.clear();
      this.audio.suspend(); this.engine.stop();
      if (event.persisted) return;
      this.dispose();
      this.engine.destroy();
    }, { signal: this.inputLifetime.signal });
    this.engine.run();
  }

  async initNative(engine: HaiyueEngine, options: NeonNativeOptions, race = false): Promise<void> {
    this.engine = engine; this.native = options; this.raster = options.raster;
    await this.prepareScene();
    this.engine.on('update', this.onFrame);
    if (race) this.restart();
  }

  private async prepareScene(): Promise<void> {
    if(this.native) this.languageStorage=this.native.languageStorage;
    else {try {this.languageStorage = new URLSearchParams(location.search).has('verify') ? undefined : localStorage;} catch { /* Private browsing may block storage. */ }}
    try {
      this.raceMode=this.languageStorage?.getItem('neon.raceMode')==='duel'?'duel':'time-trial';
      const d=this.languageStorage?.getItem('neon.aiDifficulty');if(AI_DIFFICULTIES.includes(d as AiDifficulty))this.difficulty=d as AiDifficulty;
    } catch { /* Defaults remain usable. */ }
    if(!this.native) {
      const query=new URLSearchParams(location.search);
      if(query.has('mode'))this.raceMode=query.get('mode')==='duel'?'duel':'time-trial';
      if(AI_DIFFICULTIES.includes(query.get('difficulty') as AiDifficulty))this.difficulty=query.get('difficulty') as AiDifficulty;
    }
    if(this.native?.raceMode)this.raceMode=this.native.raceMode;
    if(this.native?.difficulty)this.difficulty=this.native.difficulty;
    this.selectedRaceMode=this.raceMode;this.selectedDifficulty=this.difficulty;
    if(this.raceMode==='duel')this.opponent=new RaceOpponent(this.difficulty);
    this.language=readLanguage(this.languageStorage);
    this.cameraMode=this.selectedCamera=readCameraMode(this.languageStorage);
    if(!this.native && new URLSearchParams(location.search).get('view')==='first-person') this.cameraMode=this.selectedCamera='first-person';
    if(this.native)this.audio=this.native.audio;
    else {const backend=new NeonBrowserAudio();await backend.load();this.audio=new NeonAudio(backend);}
    this.engine.clearColor = { r: this.colors.sky[0], g: this.colors.sky[1], b: this.colors.sky[2], a: 1 };
    this.saves = new SingleSlotGameSave<RacerSaveData>({ gameId: `neon-circuit-${this.circuit.id==='neon-city'?'v5':'v4'}-${this.circuit.id}`,
      name: '极速新星 最佳成绩', validateData: isRacerSaveData, ...(this.native ? { backend: this.native.saveBackend } : {}) });
    this.world = new World('Neon Circuit');
    this.setupRenderer();
    this.setupLighting();
    await this.loadEffectTextures();
    if ((this.circuit.theme === 'cosmic' || this.circuit.theme === 'mobius')) {
      this.space = await SpaceEnvironment.create(this.world, this.engine.device, TRACK_SCALE, this.raster);
      this.rainbowRoad = new RainbowRoadTexture(this.engine.device, this.circuit.theme === 'mobius' ? 'noise' : 'rainbow');
    } else if(this.circuit.theme === 'volcanic') {
      this.hazards=new VolcanicHazards(this.circuit.seed);
      this.volcano=await VolcanoEnvironment.create(this.world,this.engine.device,this.raster,this.track);
    } else if(this.circuit.theme === 'daylight') this.sunny = await SunnyEnvironment.create(this.world,this.engine.device,this.raster);
    else this.buildEnvironment();
    this.buildTrack();
    if(this.cameraMode==='chase')this.buildHoverCar();
    if(this.raceMode==='duel')this.buildOpponent();
    const saved = await this.saves.load();
    if (saved) this.bestTime = saved.bestTime;
    this.updateBestTime();

  }

  cancelInteraction(): void {
    this.keys.clear(); this.touchKeys.clear(); this.gui?.cancelCarouselPointer();
  }
  releaseControl(pointerId: number): void { this.touchKeys.delete(pointerId); }
  suspend(): void { this.audio?.suspend(); this.cancelInteraction(); if (this.phase === 'racing' || this.phase === 'countdown') this.togglePause(); }
  flushSave(): Promise<void> { return this.saves.flush(); }
  get guiView(): NeonCircuitGui { return this.gui; }
  /** Lightweight input gate; avoids constructing a diagnostic snapshot in the frame loop. */
  get canDrive(): boolean { return this.phase === 'racing' || this.phase === 'countdown'; }
  /** Diagnostic comparison against the real rendered chase camera, including its handedness. */
  get mapRoadAlignment() {
    const here = racePose(this.track,this.state), ahead = sampleTrack(this.track,this.state.distance+450);
    const m = this.gui.snapshot.minimap, matrix = this.camera.localMatrix;
    const next = hudMapPoint(m.projection,ahead,m.basis);
    return { viewSide: matrix[0]!*(ahead.x-here.x)+matrix[1]!*(ahead.y-here.y)+matrix[2]!*(ahead.z-here.z),
      mapSide: next.x-m.marker.x, next, marker:m.marker };
  }
  get modelStatus(): string { return this.racerModel?.status ?? 'skipped'; }
  private get vehicleReady(): boolean { return (this.cameraMode==='first-person' || this.modelStatus==='loaded') && (this.raceMode!=='duel' || this.opponentModel?.status==='loaded'); }
  setState(next: Partial<RaceState>): void { this.state = { ...this.state, ...next }; }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    if(this.native)this.audio.stopDrive();else this.audio?.dispose();
    this.cancelInteraction(); this.inputLifetime.abort(); this.engine.off('update', this.onFrame);
    this.world?.destroy(); this.gui?.dispose();
    this.boostStrip?.destroy(); this.rainbowRoad?.destroy(); this.space?.destroy(); this.sunny?.destroy(); this.volcano?.destroy();
    this.hullFire?.destroy(); this.thrusterFlame?.destroy();
    for (const texture of this.effectTextures) texture.destroy(); this.effectTextures.length = 0;
  }

  private async loadEffectTextures(): Promise<void> {
    const upload = async (name: string): Promise<GPUTexture> => {
      const texture = await this.raster.loadTexture(this.engine.device, name, 512);
      this.effectTextures.push(texture); return texture;
    };
    const results = await Promise.allSettled(['smoke-puff', 'boost-chevron', 'gui-button', 'gui-panel', 'gui-dial', 'gui-title', 'gui-timing', 'gui-pause'].map(upload));
    const [smoke, boost, button, panel, dial, title, timing, pause] = results.map(r => { if (r.status === 'rejected') throw r.reason; return r.value; }) as [GPUTexture, GPUTexture, GPUTexture, GPUTexture, GPUTexture, GPUTexture, GPUTexture, GPUTexture];
    const [gear,settings] = await Promise.all([upload('gui-settings-gear'),upload('gui-settings-panel')]);
    this.gui.setSkins(button, panel, dial, title, timing, pause, gear, settings);
    const [record, wheel] = await Promise.all([upload('gui-record'), upload('gui-wheel')]);
    this.gui.setInteractiveArt(record, wheel);
    this.gui.setLapArt(await upload('gui-lap'));
    const [instruments,compass] = await Promise.all([upload('gui-instruments-v2'),upload('gui-compass-v2')]);
    this.gui.setCompositeHudArt(instruments,compass);
    const sparkCanvas = this.raster.canvas(64, 64);
    const paint = sparkCanvas.getContext('2d') as CanvasRenderingContext2D;
    paint.strokeStyle = '#fff4c2'; paint.lineWidth = 3; paint.lineCap = 'round';
    paint.shadowColor = '#ff9d25'; paint.shadowBlur = 8;
    paint.beginPath(); paint.moveTo(15, 49); paint.lineTo(49, 15); paint.stroke();
    const spark = uploadNeonCanvas(this.engine.device, this.raster, sparkCanvas);
    this.effectTextures.push(spark);
    this.effects = new RaceParticles(this.world, smoke, spark);
    this.boostStrip = new BoostStripTexture(this.engine.device, boost);
    this.boostStrip.update(0);
  }

  private setupRenderer(): void {
    const start = racePose(this.track, this.state);
    this.cameraHeading = start.heading;
    const cameraEntity = new Entity('Chase camera');
    this.cameraComponent = new Camera3D({ type: 'perspective', fov: speedFov(0, BOOST_MAX_SPEED), near: 1, far: ((this.circuit.theme === 'cosmic' || this.circuit.theme === 'mobius') || this.circuit.theme === 'daylight' || this.circuit.theme === 'volcanic' ? 30000 : 9500) * TRACK_SCALE });
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

    if(this.cameraMode==='chase' || this.raceMode==='duel')this.world.addSystem(new GltfModelSystem({ priority: -20, loadTimeoutMs: 20_000, ...this.native?.modelOptions }));
    const render3D = new Render3DSystem(this.engine, cameraEntity, { priority: 10, loadOp: 'clear', msaaSamples: 4, reverseZ: true });
    this.world.addSystem(render3D);
    this.gui = new NeonCircuitGui(this.world, this.engine.device, this.circuit.id, {
      raceSetup: (mode,difficulty)=>this.changeRaceSetup(mode,difficulty),
      camera: mode => this.changeCamera(mode),
      stamp: () => this.audio.cue('record'),
      click: () => this.audio.click(),
      language: value => this.changeLanguage(value),
      select: id => { if(this.selectedCircuit!==id)this.audio.course(); this.selectedCircuit = id; }, start: mode => {this.changeRaceSetup(mode,this.selectedDifficulty);this.startSelectedCircuit();},
      restart: () => this.restart(), pause: () => this.togglePause(), home: () => this.showHome(),
      press: (key, pointer) => { if (this.phase === 'racing' || this.phase === 'countdown') this.touchKeys.set(pointer, key); },
      release: pointer => this.releaseControl(pointer),
    }, this.native ? true : matchMedia('(pointer: coarse)').matches, this.raster, this.native?.safeInsets);
    this.changeLanguage(this.language);
    this.gui.setCameraMode(this.selectedCamera);
    this.gui.setRaceSetup(this.selectedRaceMode,this.selectedDifficulty);
    this.world.addSystem(new GuiSystem(this.engine, { loadOp: 'load', font: {
      ...this.native?.guiFont, chars: NEON_GUI_GLYPHS, fontSize: 48, atlasSize: 2048, fontFamily: 'Arial, "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif',
    } }));
    const integration = new RenderIntegration(this.engine, { label: 'NeonCircuit.render' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world);
  }

  private get sunnyTheme(): boolean { return this.circuit.theme === 'daylight'; }

  private setupLighting(): void {
    const environment = new Entity('Racer environment reflections');
    environment.addComponent(new EnvironmentLight({ intensity: 1.25, diffuseColor: [0.70, 0.75, 0.82], specularColor: [0.22, 0.28, 0.4] }));
    this.world.addEntity(environment);
    const ambient = new Entity('Night ambient');
    ambient.addComponent(new AmbientLight({ color: this.sunnyTheme ? [0.82,0.9,1] : [0.22, 0.42, 0.72], intensity: this.sunnyTheme ? 1.15 : 0.72 }));
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
    const centerPath = this.extrusionPath();
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
      const railPath = this.extrusionPath(side * (ROAD_HALF_WIDTH + 3), 5);
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
      const right = sample.frame?.right ?? bankedRight(sample.heading, sample.pitch, sample.bank);
      const up = sample.frame?.up ?? bankedUp(sample.heading, sample.pitch, sample.bank);
      for (const side of [-1, 1]) {
        const x = sample.x + right[0] * side * (ROAD_HALF_WIDTH + 12) + up[0] * 18;
        const y = sample.y + right[1] * side * (ROAD_HALF_WIDTH + 12) + up[1] * 18;
        const z = sample.z + right[2] * side * (ROAD_HALF_WIDTH + 12) + up[2] * 18;
        const beacon = this.addBox(
          `Velocity beacon ${Math.round(distance)} ${side}`,
          x, y, z, 5, 36, 5,
          Math.floor(distance / 840) % 2 === 0 ? this.colors.rail : this.colors.accent,
          100,
          [-sample.pitch, sample.heading, sample.bank],
        );
        if(sample.frame) beacon.setMatrix(mat4.multiply(frameMatrix(sample.frame,[x,y,z]),mat4.scaling([5,36,5])));
      }
    }

    BOOST_PADS.forEach(({progress: center, lateral}, index) => {
      const boostGeometry = overlay(center * this.track.length - BOOST_PAD_LENGTH / 2, center * this.track.length + BOOST_PAD_LENGTH / 2,
        lateral - BOOST_PAD_HALF_WIDTH, lateral + BOOST_PAD_HALF_WIDTH, 0.55, [1 / 92, 1 / (BOOST_PAD_HALF_WIDTH * 2)]);
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

  private extrusionPath(lateral=0, vertical=0): PathExtrusionPoint[] {
    const path=this.track.samples.map(s=>this.extrusionPoint(s.distance,lateral,vertical));
    if(!this.track.samples[0]?.frame) return path;
    return path.map((point,i)=>{
      const prev=path[(i+path.length-1)%path.length]!.position, next=path[(i+1)%path.length]!.position;
      const f=unit(mixAxes(next,prev,1,-1)), r=unit(cross(Math.abs(f[1])<0.96?[0,1,0]:[0,0,1],f)), u=cross(f,r);
      const desired=this.track.samples[i]!.frame!.right;
      return {...point,roll:Math.atan2(dot(desired,u),dot(desired,r))};
    });
  }

  private extrusionPoint(distance: number, lateral = 0, vertical = 0): PathExtrusionPoint {
    const sample = sampleTrack(this.track, distance);
    const right = sample.frame?.right ?? bankedRight(sample.heading, sample.pitch, sample.bank);
    const up = sample.frame?.up ?? bankedUp(sample.heading, sample.pitch, sample.bank);
    return {
      position: [
        sample.x + right[0] * lateral + up[0] * vertical,
        sample.y + right[1] * lateral + up[1] * vertical,
        sample.z + right[2] * lateral + up[2] * vertical,
      ],
      roll: sample.bank,
    };
  }

  private buildOpponent():void {
    const entity=new Entity('AI rival · magenta');
    this.opponentTransform=new CartesianTransform3D({scale:[RACER_MODEL_SCALE,RACER_MODEL_SCALE,RACER_MODEL_SCALE],anchor:[0,60*RACER_MODEL_SCALE,0]});
    this.opponentModel=new GltfModelComponent({src:'./assets/wraith-raider.glb',autoLoad:true,clearPrevious:true,baseColorFactor:[1,.3,.8,1]});
    entity.addComponent(this.opponentTransform);entity.addComponent(this.opponentModel);this.world.addEntity(entity);
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
      this.audio.unlock();
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
      this.audio.suspend();
      this.keys.clear(); this.touchKeys.clear();
      this.gui.cancelCarouselPointer();
      if (this.phase === 'racing' || this.phase === 'countdown') this.togglePause();
    };
    window.addEventListener('blur', suspend, { signal: this.inputLifetime.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); }, { signal: this.inputLifetime.signal });
    // Pointer identity is independent of the GUI's current hover/press target, allowing two-finger driving.
    canvas.addEventListener('pointerdown', () => this.audio.unlock(), {signal:this.inputLifetime.signal});
    canvas.addEventListener('pointerup', event => this.releaseControl(event.pointerId), { signal: this.inputLifetime.signal });
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
    if (this.phase === 'countdown' && this.vehicleReady) {
      this.countdown -= seconds;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.announcementText = '';
      }
    } else if (this.phase === 'racing') {
      const controls = {
        throttle: this.held('w') || this.held('arrowup') ? 1 : 0,
        brake: this.held('s') || this.held('arrowdown') ? 1 : 0,
        steer: this.native ? this.native.steering() : (this.held('a') || this.held('arrowleft') ? 1 : 0) - (this.held('d') || this.held('arrowright') ? 1 : 0),
      };
      this.accumulator += seconds;
      const events: string[] = [];
      while (this.accumulator >= 1 / 120) {
        const before=this.state,oldOpponent=this.opponentState;
        const result = stepRace(this.track, this.state, controls, 1 / 120, this.raceMode!=='duel');
        this.state = result.state;
        events.push(...result.events);
        if(this.hazards) {
          const impact=this.hazards.step(before,this.state,this.track.length,1/120,this.raceMode!=='duel',false,this.opponent?oldOpponent:undefined);this.state=impact.state;
          if(impact.hit>0) {
            this.cameraImpact=Math.max(this.cameraImpact,impact.hit);this.native?.haptic(impact.hit);
            this.audio.cue('rail',impact.hit);
            const p=racePose(this.track,this.state);this.effects.collide([p.x,p.y+8,p.z],[0,1,0],[Math.sin(p.heading),0,Math.cos(p.heading)],impact.hit);
            if(this.state.destroyed)events.push('destroyed');
          }
        }
        if(this.opponent) {
          const aiControls=this.opponent.update(this.track,oldOpponent,1/120,this.hazards?.balls);
          this.opponentState=stepRace(this.track,oldOpponent,aiControls,1/120,false).state;
          if(this.hazards)this.opponentState=this.hazards.step(oldOpponent,this.opponentState,this.track.length,1/120,false,true).state;
          this.winner=raceWinner(this.track,before,this.state,oldOpponent,this.opponentState);
        }
        this.accumulator -= 1 / 120;
        if(this.winner) {this.accumulator=0;break;}
      }
      const result = { events };
      if(events.includes('boost')) this.audio.cue('boost');
      if (events.includes('wall')) {
        this.native?.haptic(this.state.impact);
        this.audio.cue('rail', .3+this.state.impact*.7,Math.sign(this.state.lateral)*.45);
        this.cameraImpact = Math.max(this.cameraImpact, this.state.impact);
        const center = sampleTrack(this.track, this.state.distance);
        const side = Math.sign(this.state.lateral);
        const right = center.frame?.right ?? bankedRight(center.heading, center.pitch, center.bank);
        const up = center.frame?.up ?? bankedUp(center.heading, center.pitch, center.bank);
        this.effects.collide([center.x + right[0] * side * (ROAD_HALF_WIDTH + 1) + up[0] * 5,
          center.y + right[1] * side * (ROAD_HALF_WIDTH + 1) + up[1] * 5,
          center.z + right[2] * side * (ROAD_HALF_WIDTH + 1) + up[2] * 5],
          [-right[0] * side, -right[1] * side, -right[2] * side], [Math.sin(center.heading), 0, Math.cos(center.heading)], this.state.impact);
      }
      if (result.events.includes('destroyed')) {
        this.phase = 'destroyed';
        this.keys.clear(); this.touchKeys.clear();
        this.flashAnnouncement(TEXT[this.language].destroyed, Number.POSITIVE_INFINITY);
      }
      if (result.events.includes('finish') || this.winner) this.finishRace();
      if (!this.winner && result.events.includes('lap')) {this.audio.cue('lap');this.flashAnnouncement(lapNotice(this.language,this.state.lap,TOTAL_LAPS));}
    }
    if (this.phase === 'racing' && this.state.elapsed >= this.announcementUntil) this.announcementText = '';
    if(this.phase==='countdown' && this.vehicleReady)this.audio.countdown(this.countdown<=.45?'GO':String(Math.max(1,Math.ceil(this.countdown-.4))) as '3'|'2'|'1');
    this.audio.update(seconds,this.phase === 'racing',this.held('w') || this.held('arrowup'),this.state.speed/BOOST_MAX_SPEED,this.held('s')||this.held('arrowdown'));
    // All procedural textures are ready before world rendering consumes them.
    // Each producer owns its uniforms and records at most once in this batch.
    let textureEncoder: GPUCommandEncoder | undefined;
    this.textureWork.encodes = this.textureWork.submissions = 0;
    const commands = () => {
      this.textureWork.encodes++;
      return textureEncoder ??= this.engine.device.createCommandEncoder({ label: 'NeonCircuit.dynamicTextures' });
    };
    this.updateVisuals(timeMs, seconds, commands);
    this.gui.animate(seconds, commands);
    this.updateHud(commands);
    if (textureEncoder) {
      this.engine.device.queue.submit([textureEncoder.finish()]);
      this.textureWork.submissions = 1;
    }
    this.world.update(timeMs, deltaMs);
    this.gui.flushCarouselCaptureLosses();
    if (!this.native && ++this.validationFrames >= 24 && this.validationFrames < 1_000_000 && this.vehicleReady) {
      this.validationFrames = 1_000_000;
      void this.finishValidation();
    }
  }

  private styleRacerMaterials(): void {
    for(const opponent of [false,true]) {
    const root = (opponent?this.opponentModel:this.racerModel)?.runtimeRoot;
    if (!root || root === (opponent?this.styledOpponentRoot:this.styledRacerRoot)) continue;
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
      if(opponent && !glass) {material.baseColor=[1,.25,.75,1];material.emissiveFactor=[.045,0,.065];}
      material.metallic = glass ? 0 : 0.12;
      material.roughness = glass ? 0.16 : 0.38;
      material.clearcoatFactor = glass ? 0 : 0.22;
      material.clearcoatRoughnessFactor = 0.22;
    }
    if(opponent)this.styledOpponentRoot=root;
    else {this.racerPbrMaterialCount = styled.size;this.styledRacerRoot = root;}
    }
  }

  private updateVisuals(timeMs: number, seconds: number, commands?: () => GPUCommandEncoder): void {
    this.styleRacerMaterials();
    if(this.opponentTransform) {
      const p=racePose(this.track,this.opponentState),t=this.opponentTransform;
      t.setScale(RACER_MODEL_SCALE,RACER_MODEL_SCALE,RACER_MODEL_SCALE);
      if(p.frame) {
        t.setPosition(0,0,0).setRotation(0,0,0);
        const origin=[p.x+p.frame.up[0]*4.5,p.y+p.frame.up[1]*4.5,p.z+p.frame.up[2]*4.5] as TrackVector;
        t.setMatrix(mat4.multiply(frameMatrix(p.frame,origin),t.localMatrix));
      } else t.setPosition(p.x,p.y+4.5,p.z).setRotation(-p.pitch,p.heading,p.bank);
    }
    const pose = racePose(this.track, this.state);
    const targetPitch = -pose.pitch;
    this.visualPitch += (targetPitch - this.visualPitch) * (1 - Math.exp(-seconds * 7));
    const steerAxis = this.native ? this.native.steering() : (this.held('a') || this.held('arrowleft') ? 1 : 0) - (this.held('d') || this.held('arrowright') ? 1 : 0);
    const targetBank = -steerAxis * Math.min(0.28, this.state.speed / CRUISE_MAX_SPEED * 0.28);
    this.visualBank += (targetBank - this.visualBank) * (1 - Math.exp(-seconds * 8));
    const hover = Math.sin(timeMs * 0.0065) * 0.75;
    const bank = pose.bank + this.visualBank;
    const bodyFrame=pose.frame ? turnFrame(pose.frame,0,this.visualBank) : null;
    const bodyPosition = (offset: readonly number[]): [number, number, number] => {
      if(bodyFrame) return [0,1,2].map(i=>[pose.x,pose.y,pose.z][i]!+bodyFrame.right[i]!*offset[0]!+bodyFrame.up[i]!*(offset[1]!+4.5+hover)+bodyFrame.forward[i]!*offset[2]!) as [number,number,number];
      const point = rotateBodyPoint(offset, this.visualPitch, pose.heading, bank);
      return [pose.x + point[0], pose.y + 4.5 + hover + point[1], pose.z + point[2]];
    };
    for (const part of this.carParts) {
      if(pose.frame) { part.transform.setPosition(...part.offset).setRotation(...part.localRotation); continue; }
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
    this.thrusterFlame?.update(this.effectClock, speedRatio, boostStrength, this.state.destroyed ? 0 : thrust ? 1 : 0.48, commands);
    const damage = damageEnvelope(this.state.health);
    this.hullFire?.update(this.effectClock, damage.fire, commands);
    for (const part of this.fireParts) part.setScale(1, 3.5 + damage.fire * 6, 1);
    if(bodyFrame) {
      const origin=bodyPosition([0,0,0]), basis=frameMatrix(bodyFrame,origin);
      for(const part of this.carParts) part.transform.setMatrix(mat4.multiply(basis,part.transform.localMatrix));
    }
    this.effects.update(seconds, bodyPosition([0, 3.8, -11]), pose.frame?.forward ?? [Math.sin(pose.heading), 0, Math.cos(pose.heading)],
      this.cameraMode==='first-person'?0:damage.smokeRate, damage.smokeOpacity, effectsRunning);
    this.boostStrip.update(this.effectClock, commands);
    this.rainbowRoad?.update(this.effectClock, commands);
    this.cameraImpact *= Math.exp(-seconds * 5);
    const shake = this.phase === 'paused' || this.phase === 'home' ? 0 : this.cameraImpact;

    const headingResponse = 1 - Math.exp(-seconds * (4.6 + speedRatio * 2.8));
    this.cameraHeading = lerpAngle(this.cameraHeading, pose.heading, headingResponse);
    this.camera.theta = this.cameraHeading + Math.PI + Math.sin(timeMs * 0.081) * shake * 0.038;
    const portraitFraming = Math.max(1, 0.65 / (this.engine.width / Math.max(1, this.engine.height)));
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
    if(pose.frame) {
      const f=pose.frame.forward,u=pose.frame.up,r=pose.frame.right;
      const phi=speedCameraPhi(this.state.speed,0,BOOST_MAX_SPEED), radius=this.camera.radius;
      const target=[pose.x+f[0]*lookAhead+u[0]*11,pose.y+f[1]*lookAhead+u[1]*11,pose.z+f[2]*lookAhead+u[2]*11] as TrackVector;
      const back=mixAxes(f,u,-Math.sin(phi),Math.cos(phi));
      const eye=[0,1,2].map(i=>target[i]!+back[i]!*radius+r[i]!*Math.sin(timeMs*.081)*shake*3) as unknown as TrackVector;
      const z=unit(mixAxes(eye,target,1,-1)), x=unit(cross(u,z)), y=cross(z,x);
      this.camera.setMatrix(frameMatrix({right:x,up:y,forward:z},eye));
    }
    if(this.cameraMode==='first-person') {
      const f=pose.frame?.forward ?? unit([Math.sin(pose.heading)*Math.cos(pose.pitch),Math.sin(pose.pitch),Math.cos(pose.heading)*Math.cos(pose.pitch)]);
      const u=pose.frame?.up ?? bankedUp(pose.heading,pose.pitch,pose.bank);
      const z=mixAxes(f,f,-1,0),x=unit(cross(u,z)),y=cross(z,x);
      const eye=[pose.x+u[0]*13,pose.y+u[1]*13+Math.sin(timeMs*.099)*shake*1.2,pose.z+u[2]*13] as TrackVector;
      this.camera.setMatrix(frameMatrix({right:x,up:y,forward:z},eye));
    }
    if (this.verificationOverview) {
      this.cameraComponent.fov = 0.96;
      if(this.sunny) this.camera.set(19500,-.1,.68).setTarget(-6100,3400,-2600);
      else this.camera.set(9800 * TRACK_SCALE, -0.45, 0.8).setTarget(0, 1200 * TRACK_SCALE, 0);
    }
    this.effects.faceCamera(this.camera.theta, this.camera.phi);
    this.space?.update(this.effectClock, this.camera.eyePosition);
    this.sunny?.update(this.camera.eyePosition);
    this.volcano?.update(this.effectClock,this.camera.eyePosition,this.hazards?.balls ?? []);
  }

  private updateHud(commands?: () => GPUCommandEncoder): void {
    if (this.phase === 'countdown') this.announcementText = !this.vehicleReady
      ? TEXT[this.language].loadingCar : this.countdown <= 0.45 ? 'GO' : String(Math.max(1, Math.ceil(this.countdown - 0.4)));
    this.gui.update({ raceMode:this.raceMode,position:raceProgress(this.state,this.track)>=raceProgress(this.opponentState,this.track)?1:2,winner:this.winner,
      ...(this.opponent?{opponentPose:racePose(this.track,this.opponentState)}:{}),cameraMode:this.cameraMode, pose: racePose(this.track, this.state), phase: this.phase, speed: formatSpeed(this.state.speed),
      lap: `${Math.min(this.state.lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`, time: formatTime(this.state.elapsed),
      best: Number.isFinite(this.bestTime) ? formatTime(this.bestTime) : '--:--.---', health: this.state.health, damageSide:this.state.damageSide,
      countdown: this.countdown, announcement: this.announcementText,
      newRecord: this.newRecord, throttle: this.held('w') || this.held('arrowup'), brake: this.held('s') || this.held('arrowdown'),
      impact: this.phase === 'racing' ? this.cameraImpact : 0 }, commands);
  }

  private finishRace(): void {
    this.phase = 'finished';
    if(this.raceMode==='duel') {
      this.newRecord=false;
      this.announcementText=`${TEXT[this.language][this.difficulty]} · ${formatTime(this.winner==='opponent'?this.opponentState.elapsed:this.state.elapsed)}`;
      this.keys.clear();this.touchKeys.clear();this.updateHud();return;
    }
    const isRecord = this.state.elapsed < this.bestTime;
    this.newRecord = isRecord;
    if (isRecord) {
      this.bestTime = this.state.elapsed;
      void this.saves.save({ bestTime: this.bestTime });
      this.updateBestTime();
    }
    this.announcementText = formatTime(this.state.elapsed);
    this.keys.clear(); this.touchKeys.clear(); this.updateHud();
  }

  restart(): void {
    this.audio.beginRace();
    this.newRecord = false;
    this.state = {...createInitialRaceState(),lateral:this.raceMode==='duel'?30:0};
    this.opponentState={...createInitialRaceState(),lateral:-30};
    this.winner=null;this.difficulty=this.selectedDifficulty;
    this.opponent=this.raceMode==='duel'?new RaceOpponent(this.difficulty):null;
    this.hazards?.reset();
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

  togglePause(): void {
    this.audio.stopDrive();
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
    if (this.selectedCircuit === this.circuit.id && this.selectedCamera===this.cameraMode && this.selectedRaceMode===this.raceMode) this.restart();
    else if (this.native) this.native.changeCircuit(this.selectedCircuit);
    else {
      const url = new URL(location.href);
      url.searchParams.set('track', this.selectedCircuit);
      url.searchParams.set('race', '1');
      url.searchParams.set('view',this.selectedCamera);
      url.searchParams.set('mode',this.selectedRaceMode);url.searchParams.set('difficulty',this.selectedDifficulty);
      location.assign(url.href);
    }
  }

  showHome(): void {
    this.audio.stopDrive();
    this.phase = 'home';
    this.keys.clear(); this.touchKeys.clear();
    this.announcementText = '';
    this.updateHud();
  }

  private updateBestTime(): void { this.updateHud(); }

  snapshot(): RacerSnapshot {
    return {
      raceMode:this.raceMode,difficulty:this.difficulty,winner:this.winner,opponent:this.opponent?{...this.opponentState}:null,opponentModel:this.opponentModel?.status??'skipped',
      cameraMode:this.cameraMode, fireballs:(this.hazards?.balls??[]).map(ball=>({...ball})),
      dynamicTextures: { ...this.textureWork },
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
      coaster: this.track.samples[0]?.frame ? {section:sampleTrack(this.track,this.state.distance).section!,roadUp:sampleTrack(this.track,this.state.distance).frame!.up,cameraUp:Array.from(this.camera.localMatrix.slice(4,7))} : null,
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
    output.textContent = JSON.stringify({ schemaVersion: 1, revision: 'neon-circuit-native-v14', status,
      errors: this.validationErrors, checks, audio:this.audioState, gui: this.gui.snapshot, modelStatus: this.modelStatus, ...this.snapshot() });
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
    if(new URLSearchParams(location.search).get('shot')?.startsWith('home-actions')) {
      this.showHome();await frames();const actions=this.gui.snapshot.homeActions;
      check(actions.solo.text===TEXT.zh.timeTrial && actions.duel.text===TEXT.zh.duel,'home exposes solo time trial and AI racing directly');
      check(actions.solo.y+actions.solo.height<=actions.duel.y && actions.duel.x+actions.duel.width<=actions.difficulty.x && actions.difficulty.x+actions.difficulty.width<=innerWidth,'stacked mode buttons and the secondary difficulty button fit the viewport');
      const view=this.gui.snapshot;
      const oldScale=Math.min((innerWidth-32)/1080,(innerHeight-32)/(innerHeight<550?480:660),1.2);
      check(innerWidth<760 ? view.carouselCardSize.cardWidth<view.carouselBounds.width : Math.abs(view.carouselCardSize.cardHeight-.94*(innerHeight<550?250:380)*oldScale*1.5)<.01,'carousel is 50 percent larger in landscape and fits portrait width');
      const original=this.selectedCircuit;await click('next-course');check(this.selectedCircuit!==original && view.arrowStyle==='translucent-glow','flat glowing right arrow changes the course');
      await click('previous-course');check(this.selectedCircuit===original,'flat glowing left arrow returns to the original course');
      for(const expected of ['hard','easy','normal'] as const) {await click('cycle-difficulty');check(this.selectedDifficulty===expected,`difficulty cycles to ${expected}`);}
      check(this.phase==='home','difficulty selection does not start a race');
      await click('start-race');check(this.phase==='countdown' && this.raceMode==='time-trial','solo main button starts time trial without a mode dialog');
      check(this.opponent===null && this.opponentModel===null,'solo mode loads no opponent');
      check(this.gui.snapshot.minimap.opponent[3]===0,'solo minimap hides the rival marker');
      this.showHome();await frames(2);return;
    }
    if(this.raceMode==='duel') {
      const shot=new URLSearchParams(location.search).get('shot')??'duel-race';
      this.showHome();await frames();
      check(this.opponentModel?.status==='loaded','duel loads a real visible rival ship');
      const actions=this.gui.snapshot.homeActions;
      check(actions.solo.y+actions.solo.height<=actions.duel.y && actions.duel.x+actions.duel.width<=actions.difficulty.x && Math.abs(actions.duel.y-actions.difficulty.y)<1,'home stacks solo and AI buttons with a separate difficulty action');
      check(actions.solo.text===TEXT[this.language].timeTrial && actions.duel.text===TEXT[this.language].duel,'both race modes are directly labelled on the home screen');
      for(const d of ['easy','normal','hard'] as const) {await click('cycle-difficulty');check(this.selectedDifficulty===d,`secondary button cycles ${d} difficulty`);}
      check(this.phase==='home' && this.opponentState.elapsed===0,'difficulty changes never start a race');
      await click('settings');await click('language-en');await click('settings-done');
      check(this.gui.snapshot.homeActions.solo.text===TEXT.en.timeTrial && this.gui.snapshot.homeActions.duel.text===TEXT.en.duel,'direct race buttons support English');
      this.changeLanguage('zh');
      await click('start-duel');check(this.phase==='countdown' && this.opponentState.elapsed===0,'AI main button starts the shared countdown directly');
      this.countdown=.01;await frames(12);
      check(this.opponentState.speed>0 && this.opponentState.distance>0,'AI accelerates and moves through real fixed-step driving');
      this.state={...this.state,speed:1000,lateral:RAIL_LIMIT,headingOffset:.9,lateralSpeed:700};await frames(3);
      check(this.state.wallHits>0 && this.state.health===100 && this.state.speed<700,'player wall impact slows without losing hull');
      this.opponentState={...this.opponentState,speed:1000,lateral:RAIL_LIMIT,headingOffset:.9,lateralSpeed:700};await frames(3);
      check(this.opponentState.wallHits>0 && this.opponentState.health===100,'AI receives the same non-damaging wall penalty');
      this.togglePause();const playerTime=this.state.elapsed,botTime=this.opponentState.elapsed;await frames(5);
      check(this.state.elapsed===playerTime && this.opponentState.elapsed===botTime,'pause freezes both racers');
      await click('resume');await frames(3);check(this.opponentState.elapsed>botTime,'resume restarts AI simulation');
      if(this.hazards) {
        this.hazards.balls.length=0;this.hazards.balls.push({id:9001,distance:this.state.distance,lateral:this.state.lateral,age:2,fallTime:1.9,radius:30,hit:false});
        this.state={...this.state,speed:600};const hitBefore=this.state.speed;await frames(2);
        check(this.hazards.balls[0]?.hit===true && this.state.health===100 && this.state.speed<hitBefore,'actual volcanic impact slows the player without hull loss');
      }
      const best=this.bestTime;
      this.state={...createInitialRaceState(),distance:this.track.length-1,lap:3,speed:500};await frames(3);
      check(this.winner==='player' && this.phase==='finished','player crossing first wins immediately');
      check(this.bestTime===best && !this.newRecord,'duels cannot replace time-trial records');
      await click('restart');check(this.winner===null && this.opponentState.elapsed===0 && this.opponentState.wallHits===0,'restart resets AI, winner and progress');
      this.countdown=.01;await frames(2);this.opponentState={...({...createInitialRaceState(),lateral:-30}),distance:this.track.length-1,lap:3,speed:500};await frames(3);
      check(this.winner==='opponent' && this.gui.snapshot.resultTitle===TEXT[this.language].opponentWin,'AI finishing first displays a loss');
      const finishTime=this.state.elapsed;await frames(4);check(this.state.elapsed===finishTime,'finish freezes the whole competition');
      this.restart();this.countdown=.01;await frames(2);
      this.state={...createInitialRaceState(),lateral:30};this.opponentState={...({...createInitialRaceState(),lateral:-30}),distance:85};await frames(2);
      check(this.gui.snapshot.minimap.opponent[3]===1,'spatial minimap tracks the opponent with a distinct marker');
      this.phase='countdown';this.countdown=3.4;this.opponentState={...this.state};this.updateHud();await frames(2);
      const overlapping=await this.gui.inspectMapMarkers();
      check(overlapping.playerPixels>20 && overlapping.opponentPixels>20,'GPU keeps both yellow player and magenta rival visible at the exact same map position');
      this.opponentState={...this.state,distance:(this.state.distance+this.track.length*.25)%this.track.length};this.updateHud();await frames(2);
      const separated=await this.gui.inspectMapMarkers(),map=this.gui.snapshot.minimap;
      check(separated.playerPixels>20 && separated.opponentPixels>20 && Math.hypot(map.opponent[0]!-map.marker.x,map.opponent[1]!-map.marker.y)>.05,'GPU renders a distinct opponent marker at its actual separated 3D position');
      this.phase='racing';this.announcementText='';
      if(shot!=='duel-marker-separated')this.opponentState={...this.state,distance:this.state.distance+25};
      if(shot==='duel-setup') {this.showHome();await frames(2);}
      if(shot==='duel-result') {this.state={...this.state,lap:3,distance:this.track.length-1,speed:500};await frames(3);}
      await frames(2);return;
    }
    if(this.cameraMode==='first-person') {
      this.showHome(); await frames();
      check(this.modelStatus==='skipped' && this.racerModel===null && this.carParts.length===0,'first person creates no glTF component or ship effects');
      check(this.gui.snapshot.routeCount===7,'seven distinct routes are available in first person');
      await click('settings'); await click('camera-chase');
      check(this.gui.snapshot.cameraMode==='chase','settings select chase view');
      await click('camera-first-person'); await click('language-ja');
      check(this.gui.snapshot.cameraMode==='first-person' && this.locale==='ja','first-person choice survives language change');
      await click('language-zh');await click('settings-done');await click('start-race');
      check(this.phase==='countdown' && this.vehicleReady,'first-person countdown does not wait for a model');
      this.countdown=.01;await frames(3);
      check(this.snapshot().phase==='racing','first-person countdown reaches the race');
      const pose=racePose(this.track,this.state),m=this.camera.localMatrix;
      check(Math.hypot(m[12]!-pose.x,m[13]!-pose.y,m[14]!-pose.z)<16,'first-person camera sits at the vehicle');
      check(!this.gui.snapshot.windshield.visible,'undamaged glass is completely clear');
      for(const [health,stage] of [[90,1],[60,2],[30,3],[10,4]] as const) {
        this.state={...createInitialRaceState(),health};await frames(2);
        check(this.gui.snapshot.windshield.visible && this.gui.snapshot.windshield.stage===stage,`windshield fracture severity ${stage} follows hull damage`);
      }
      this.restart();await frames(2);
      check(!this.gui.snapshot.windshield.visible && this.modelStatus==='skipped','restart clears cracks without loading a model');
      this.phase='racing';this.togglePause();const elapsed=this.state.elapsed;await frames(4);
      check(this.state.elapsed===elapsed && this.snapshot().phase==='paused','first-person pause freezes simulation');
      this.togglePause();
      check(this.snapshot().phase==='racing','first-person resumes normally');
      this.state=createInitialRaceState();await frames(2);
      let previousSeed=-1;
      for(const side of [1,1,-1]) {
        this.state={...this.state,distance:0,speed:650,lateral:side*RAIL_LIMIT,lateralSpeed:side*500,headingOffset:side*.7,collisionCooldown:0};
        await frames(2);
        const cracks=this.gui.snapshot.windshield.clusters,last=cracks[cracks.length-1]!;
        check(last.side===-side && (side>0?last.x<.25:last.x>.75),'actual rail impact fractures its visible glass side');
        if(previousSeed>=0 && side===1)check(last.seed!==previousSeed,'repeated same-side impacts generate a different fracture');
        previousSeed=last.seed;
      }
      this.state=createInitialRaceState();await frames(2);

      if(this.hazards) {
        this.hazards.reset();this.state={...createInitialRaceState(),speed:400};
        for(let i=0;i<300 && !this.hazards.balls.length;i++)await frames(1);
        check(this.hazards.balls.length>0,'volcano launches a timed warning ahead of the vehicle');
        const ball=this.hazards.balls[0]!;
        this.state={...createInitialRaceState(),distance:ball.distance,lateral:ball.lateral};
        this.togglePause();const age=ball.age;await frames(5);
        check(ball.age===age,'pause freezes falling fireballs');this.togglePause();
        for(let i=0;i<300 && this.state.health===100;i++)await frames(1);
        check(this.state.health<100 && this.gui.snapshot.windshield.visible,'actual fireball impact damages first-person glass');
        check((this.audioState.played.rail??0)>0,'fireball impact produces collision feedback');
      }
      const shot=new URLSearchParams(location.search).get('shot');
      this.hazards?.reset();this.state={...createInitialRaceState(),health:shot==='fp-damage'?25:100};
      if(this.sunny) {const rows=this.track.samples.filter(s=>s.section==='loop');this.state={...this.state,distance:rows[Math.floor(rows.length*.5)]!.distance};}
      if(this.hazards)this.hazards.balls.push({id:99,distance:380,lateral:-32,age:1.3,fallTime:1.8,radius:30,hit:false});
      if(shot==='fp-glass-left' || shot==='fp-glass-right') {
        this.state=createInitialRaceState();await frames(2);
        const side=shot==='fp-glass-left'?1:-1;
        this.state={...this.state,speed:650,lateral:side*RAIL_LIMIT,lateralSpeed:side*500,headingOffset:side*.7};await frames(2);
      }

      // Freeze simulation, retaining the racing HUD for a repeatable screenshot.
      await frames(2);this.engine.stop();return;
    }
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
          encoder.copyTextureToBuffer({ texture: texture.texture, origin: [224, 128] }, { buffer, bytesPerRow: 256 }, [64, 1]);
          this.engine.device.queue.submit([encoder.finish()]);
          await buffer.mapAsync(GPUMapMode.READ);
          return new Uint8Array(buffer.getMappedRange()).slice(0, 256);
        } finally { buffer.destroy(); }
      };
      texture.update(0); const before = await pixel();
      texture.update(4); const after = await pixel();
      check(before[3] === 255 && after[3] === 255 && before.some((value, i) => i % 4 !== 3 && Math.abs(value - after[i]!) > 20),
        'animated road shader changes actual GPU surface colours over time');
      texture.update(this.effectClock);
    }
    check(this.gui.snapshot.language === 'zh' && this.gui.snapshot.title === '极速新星','Chinese is the default locale');
    await click('settings'); await frames();
    check(this.gui.snapshot.settingsVisible,'gear opens settings');
    check(this.gui.snapshot.settingsBackdrop==='#020617a6','settings have a full screen translucent backdrop');
    const selectedBeforeSettings = this.gui.snapshot.selected;
    this.gui.keyboard('arrowright');
    check(this.gui.snapshot.selected === selectedBeforeSettings,'settings block carousel shortcuts');
    await click('language-en'); await frames();
    check(this.gui.snapshot.language === 'en' && document.title === 'VELOCITY NOVA','English updates live labels and page title');
    await click('language-ja'); await frames();
    check(this.gui.snapshot.language === 'ja' && this.gui.snapshot.title === 'スピードノヴァ','Japanese updates live labels');
    await click('language-zh'); await click('settings-done'); await frames();
    check(!this.gui.snapshot.settingsVisible,'done closes settings');
    check(this.gui.snapshot.routeCount === CIRCUITS.length, 'all actual route thumbnails');
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
    check(this.styledRacerRoot === this.racerModel?.runtimeRoot && this.racerPbrMaterialCount > 0,
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
      && hud.timingBounds.x >= hud.dialBounds.x + hud.dialBounds.width - .01
      && hud.timingBounds.x + hud.timingBounds.width < hud.instrumentsBounds.x + hud.instrumentsBounds.width
      && hud.instrumentsBounds.x + hud.instrumentsBounds.width < hud.minimap.frameBounds.x
      && hud.activeButtons.join() === 'pause' && this.gui.buttonRect('pause').width >= 44
      && this.gui.buttonRect('pause').x + this.gui.buttonRect('pause').width <= innerWidth + .01,
      'integrated left instrument/timing and right compass/pause stay separate and on screen');
    const beforeMap = this.gui.snapshot.minimap, savedMapState = this.state;
    this.state = {...this.state,headingOffset:.55}; await frames(3);
    check(Math.hypot(...this.gui.snapshot.minimap.basis.right.map((v,i)=>v-beforeMap.basis.right[i]!))>.2,
      'compass rotates with the actual racer heading');
    this.state = {...this.state,distance:this.track.length*.27,headingOffset:0}; await frames(3);
    const movedMap = this.gui.snapshot.minimap;
    check(movedMap.trackId === this.circuit.id && movedMap.visible
      && Math.hypot(movedMap.marker.x-beforeMap.marker.x,movedMap.marker.y-beforeMap.marker.y)>.03,
      'minimap uses the selected course and follows the racer position');
    await frames(40);
    const roadAlignment=this.mapRoadAlignment;
    check(roadAlignment.viewSide*roadAlignment.mapSide>0,'upcoming road lies on the same side in the actual chase camera and minimap');
    check(this.gui.snapshot.timingRows===2 && this.gui.snapshot.lapReadout.bounds.x>innerWidth/2
      && this.gui.buttonRect('pause').y<12 && this.gui.snapshot.lapReadout.text.includes(this.gui.snapshot.language==='zh'?'圈数':TEXT[this.language].lap),
      'two timing rows remain on the left, lap moves onto compass, pause docks at upper right');
    this.state = savedMapState; await frames(2);
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
    check(this.volcano ? this.circuit.theme==='volcanic' && this.hazards!==null && this.buildingCount===0 : this.sunny ? this.track.samples.some(s=>s.frame!.up[1]<-0.9) && this.buildingCount===0 : this.space ? this.space.counts.planets === 3 && this.space.counts.meteors === 36 && this.buildingCount === 0 : this.buildingCount > 150,
      this.sunny ? 'sunny panorama and an inverted coaster frame replace the city' : this.space ? 'cosmic panorama, three ringed planets and pooled meteor shower replace the city' : 'dense deterministic trackside skyline');
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
    const soundBank=this.audioState.backend as {error:string|null;buffers:number};
    check(soundBank.error===null && soundBank.buffers===14,'fourteen shipped MIDI-derived WAVs decode successfully');
    this.audio.unlock();this.audio.click();await frames(5);
    check((this.audioState.played.click??0)>0 && (this.audioState.played.course??0)>0,'GUI activation and carousel use distinct audio cues');
    this.state={...createInitialRaceState(),distance:this.track.length*BOOST_ZONES[0],speed:500};this.phase='racing';await frames(3);
    check((this.audioState.played.boost??0)>0,'boost entry triggers the rising sound');
    this.keys.add('w');await frames(20);
    check(this.audioState.loops===2,'held racing throttle owns exactly two engine registers');
    this.keys.clear();this.togglePause();await frames(2);
    check(this.audioState.loops===0,'pause retires both engine registers');
    this.restart();
    for(const value of [3.2,2.2,1.2,.3]){this.countdown=value;await frames(3);}
    check(['count-3','count-2','count-1','go'].every(id=>(this.audioState.played as Record<string,number>)[id]!>0),'countdown cues follow the displayed countdown');
    this.countdown=0;await frames(3);
    check(this.audioState.musicPlaying,'racing starts the thirty-second music loop');
    this.state={...createInitialRaceState(),distance:this.track.length-1,speed:500};await frames(3);
    check((this.audioState.played.lap??0)>0,'actual lap crossing plays a chime');
    this.keys.add('s');await frames(3);this.keys.clear();
    check((this.audioState.played.brake??0)>0,'moving brake input plays its cue');
    this.bestTime=Infinity;this.state={...createInitialRaceState(),lap:3,distance:this.track.length-1,speed:500,elapsed:120};await frames(3);
    for(let i=0;i<120 && this.gui.snapshot.recordStamp.age<.8;i++)await frames(1);
    check((this.audioState.played.record??0)>0 && this.gui.snapshot.recordStamp.age>=.5,'record sound accompanies the stamp landing');
    check(!this.audioState.musicPlaying,'music stops at the finish');
    if(this.circuit.theme==='mobius') {
      for(const index of [0,this.track.samples.length/2]) {
        const sample=this.track.samples[index]!;
        this.state={...createInitialRaceState(),distance:sample.distance};this.phase='racing';await frames(3);
        const view=this.snapshot().coaster!;
        check(dot(view.roadUp as TrackVector,view.cameraUp as TrackVector)>.8
          && Math.sign(view.roadUp[1]!)===(index===0?1:-1),`Mobius ${sample.section} face carries the ship and camera continuously`);
      }
    }
    this.showHome();
    const shot = new URLSearchParams(location.search).get('shot');
    if (shot?.startsWith('home')) {
      this.gui.select(shot === 'home-sky' ? 'sky-harbor' : shot === 'home-reactor' ? 'reactor-run' : shot === 'home-rainbow' ? 'rainbow-road' : shot === 'home-coaster' ? 'sky-coaster' : CIRCUITS[0]!.id);
      await settleCarousel();
      if(shot.includes('-en')) this.changeLanguage('en');
      if(shot.includes('-ja')) this.changeLanguage('ja');
      if(shot.includes('settings')) await click('settings');
      if (shot === 'home-swipe') { this.gui.select(CIRCUITS[1]!.id); await frames(3); }
    } else {
      this.restart();
      const onBoost = shot === 'boost';
      this.state = { ...createInitialRaceState(), distance: onBoost ? this.track.length * BOOST_ZONES[0] - BOOST_PAD_LENGTH / 2 - 45 : this.track.length * 0.18,
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
      if (shot === 'lap') {this.state={...this.state,lap:2};this.flashAnnouncement(lapNotice(this.language,2,3),5);}
      if (shot === 'compass-turn') this.state = {...this.state,distance:this.track.length*.18,headingOffset:0};
      if (shot === 'map-bend-right' || shot === 'map-bend-left') {
        const side=shot==='map-bend-right'?1:-1;
        const bend=this.track.samples.find(s=>{const a=sampleTrack(this.track,s.distance+450);return (-(a.x-s.x)*Math.cos(s.heading)+(a.z-s.z)*Math.sin(s.heading))*side>45;})!;
        this.state={...createInitialRaceState(),distance:bend.distance,lateral:30};this.cameraHeading=bend.heading;
      }
      if (shot === 'amber') this.state = { ...this.state, health: 55 };
      if (shot === 'paused') { this.phaseBeforePause = 'racing'; this.phase = 'paused'; this.announcementText = 'PAUSED'; }
      if (shot === 'destroyed') { this.state = { ...this.state, health: 0, destroyed: true }; this.phase = 'destroyed'; this.announcementText = TEXT[this.language].destroyed; }
      if (shot === 'finished') { this.state = { ...this.state, elapsed: 123.456, lap: 3 }; this.newRecord = true; this.phase = 'finished'; this.announcementText = '02:03.456'; }
    }
    if(shot==='volcano') {
      this.state={...createInitialRaceState()};this.cameraHeading=sampleTrack(this.track,0).heading;
      await frames(55);this.hazards!.balls.push({id:99,distance:300,lateral:25,age:1.5,fallTime:1.8,radius:32,hit:false});
    }
    if(shot?.startsWith('coaster-') && shot !== 'coaster-overlook') {
      const section=shot.slice(8), rows=this.track.samples.filter(s=>s.section===section);
      const at=rows[Math.floor(rows.length*(section==='loop' || section==='roll' ? .5 : .42))]!;
      this.state={...createInitialRaceState(),distance:at.distance};
    }
    await frames(shot === 'home-swipe' || shot==='volcano' ? 1 : shot === 'collision' || shot === 'countdown' ? 2 : 55);
    if(shot==='music-loop'){
      const starts=this.audioState.played.music??0;await new Promise(resolve=>setTimeout(resolve,31_000));
      check(this.audioState.musicPlaying && this.audioState.played.music===starts,'music crosses its thirty-second boundary without restarting its voice');
    }
    if (shot === 'high-speed') {
      // A stationary diagnostic pose isolates lens/paint/HUD changes from steering.
      this.state = { ...this.state, speed: BOOST_MAX_SPEED };
      for (let i = 0; i < 120; i++) this.updateVisuals(performance.now(), 1 / 60);
      await frames(2);
    }
    if(shot === 'coaster-overlook') {
      this.cameraComponent.fov=1.05;
      this.camera.set(19500,-.1,.68).setTarget(-6100,3400,-2600);
      this.sunny?.update(this.camera.eyePosition);
    this.volcano?.update(this.effectClock,this.camera.eyePosition,this.hazards?.balls ?? []);
      this.verificationOverview=true; await frames(2);
    }
    if (shot === 'map3d-twist') { this.state={...createInitialRaceState(),distance:this.track.samples[this.track.samples.length/4]!.distance}; await frames(3); }
    if (shot === 'map3d-loop') { const peak=this.track.samples.reduce((a,b)=>a.frame!.forward[1]>b.frame!.forward[1]?a:b);this.state={...createInitialRaceState(),distance:peak.distance};await frames(3); }
    if (shot === 'mobius-back') { this.state={...createInitialRaceState(),distance:this.track.samples[this.track.samples.length/2]!.distance}; await frames(3); }
    if (shot === 'space-overlook') { this.verificationOverview = true; await frames(2); }
    this.engine.stop();
  }

  showStartupError(): void {
    if (!this.gui || !this.engine || !this.world) return;
    this.phase = 'paused'; this.announcementText = TEXT[this.language].startupError; this.updateHud();
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

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
const game = new NeonCircuitGame(new URLSearchParams(location.search).get('track'));
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

}

function frameMatrix(frame:TrackFrame,position:TrackVector):Float32Array {
  return new Float32Array([...frame.right,0,...frame.up,0,...frame.forward,0,...position,1]);
}
