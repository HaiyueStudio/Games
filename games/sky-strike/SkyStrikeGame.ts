import { SkyStrikeFlames, IGNITION_DAMAGE } from './flames';
import { drawFlames } from './flameVisuals';
import {quantumPose,quantumPoint,quantumTurretPose,quantumCoreState,QUANTUM_TURRET_SPRITE,quantumBossX,quantumAttachment,quantumVelocity,quantumHardpoint,quantumGlitch,QUANTUM_GUN_MOUNTS} from './quantum';
import {mirrorHit,mirrorVertices,reflectedVelocity,consumeMirrorBudget,prismShards,PRISM_SHARD_STORM_MS,REFLECTED_BULLET_DAMAGE,type MirrorHull} from './mirrorPrism';
import {SkyStrikeBlackHole,advancePlayer} from './blackHole';
import {SkyStrikeBombCrates, BOMB_CRATE_HEALTH, type BombCrate} from './bombCrates';
import type { SkyStrikeAudio } from './audio/SkyStrikeAudio';
import { isAimingFighter, turnFighterToward, angleDifference, fighterMuzzle, FIGHTER_AIM_LEAD_MS, FIGHTER_AIM_HOLD_MS } from './fighterAim';
import { SkyStrikeAsteroids, ASTEROID_CONTACT_DAMAGE, sweptCircleTime, type Asteroid } from './asteroids';
import { drawMiningArms, drawAsteroids } from './asteroidVisuals';
import { SkyStrikeSpaceBackdrop, SPACE_FADE_MS } from './spaceBackdrop';
import { SkyStrikeCombatEffects } from './combatEffects';
import { drawShipDetails, drawSerpentSegment } from './shipDetails';
import { SkyStrikeLocale, browserSkyStrikeLocale } from './i18n';
import { HaiyueEngine, World } from '@haiyue/engine';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';
import {
  BLUE_ENEMY_BULLET_DAMAGE,
  BOMB_DAMAGE,
  TWIN_REVIVE_WINDOW_MS, TWIN_REVIVE_HEALTH_RATIO, TWIN_BUBBLE_HEALTH,
  TWIN_BUBBLE_BLAST_RADIUS, TWIN_BUBBLE_BLAST_DAMAGE, MAX_TWIN_BUBBLES,
  BOSS_BOMB_DAMAGE_MULTIPLIER,
  CARRIER_DEPLOY_INTERVAL_MS,
  CARRIER_ELITE_WAVE_INTERVAL,
  CARRIER_MAX_ELITES,
  ELITE_ENEMIES,
  shareSerpentDamage,
  BOSS_LASER_DAMAGE,
  BOSS_ENEMY,
  ENEMY_DEFINITIONS,
  INITIAL_BOMBS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_BOMBS,
  MAX_LEVEL_BONUS_BULLET_COUNT,
  NORMAL_ENEMIES,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_LIVES,
  PLAYER_SPEED,
  POWERUP_FORM_INTERVAL_MS,
  RED_ENEMY_BULLET_DAMAGE,
  SERPENT_SEGMENT_COUNT,
  SPACE_TRAIN_CAR_COUNT,
  aimedVelocity,
  bossCriticalDamageIntensity,
  calculateBossWarningProgress,
  circlesOverlap,
  clampToPlayfield,
  createBombArea,
  createRadialBurst,
  createSeededRandom,
  distancePointToSegment,
  enemyFireIntervalMs,
  enemyProjectileProfile,
  heliosEmitterCount,
  nextPowerupForm,
  regeneratePlayerHealth,
  resolveEnemyDamage,
  requiredEnemyDefinition,
  selectLaserTarget,
  serpentCruiseX,
  serpentSegmentPosition,
  serpentTurretFireIntervalMs,
  shouldRecycleSerpentCharge,
  shouldTriggerMaxLevelPickupBurst,
  shouldSerpentCharge,
  isInsideBombArea,
  stepFireCooldown,
  steerKamikazeVelocity,
  upgradeWeapon,
  velocityFromAngle,
  weaponProfile,
  type EnemyDefinition,
  type PowerupForm,
  type WeaponForm,
  type WeaponProfile,
} from './rules';
import {
  compileLevelTimeline,
  loadSkyStrikeLevels,
  mixLevelBackground,
  resolveSpawnX,
  type CompiledLevelSpawn,
  type LevelBackground,
  type SkyStrikeLevel,
} from './levels/loader';
import { SkyStrikeLevelCarousel } from './levelCarousel';
import { SkyStrikeGuiHud } from './guiHud';
import { SkyStrikeBattleLayer } from './battleLayer';
import type { SkyStrikeUi } from './presentation';
import type { GameSaveBackend } from '@haiyue/engine/save';
import type { GuiFontOptions } from '@haiyue/engine/gui';
import { skyStrikeViewport, skyStrikePointerX } from './viewport';

type GamePhase = 'ready' | 'playing' | 'paused' | 'game-over';

interface SkyStrikeSaveData {
  highScore: number;
  bestWave: number;
  sorties: number;
  bossesDefeated: number;
}

interface PlayerState {
  x: number;
  y: number;
  radius: number;
  lives: number;
  health: number;
  fireCooldownMs: number;
  invulnerableMs: number;
}

interface Bullet {
  reflected?:boolean;
  crystalShard?:boolean;
  lifeMs?:number;
  previousX?: number;
  previousY?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  hostile: boolean;
  bubbleHealth?: number;
  quantumOwner?: EnemyState;
  bubbleColor?: 'red' | 'blue';
  color: string;
  rotation?: number;
}

interface MirrorLaserState {source:EnemyState;x:number;y:number;endX:number;endY:number;warningMs:number}

interface EnemyState {
  quantumPaired: boolean;
  quantumTurretAngles?: number[];
  definition: EnemyDefinition;
  x: number;
  y: number;
  radius: number;
  originX: number;
  hitPoints: number;
  ageMs: number;
  fireCooldownMs: number;
  lastShotAgeMs?: number;
  phaseOffset: number;
  entered: boolean;
  laserCooldownMs: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  damageEffectCooldownMs: number;
  segmentOwner: EnemyState | null;
  segmentOrder: number;
  charging: boolean;
  chargeCooldownMs: number;
  deploymentWaves: number;
}

interface WeaponPowerup {
  x: number;
  y: number;
  baseX: number;
  ageMs: number;
  formTimerMs: number;
  orbitAngle: number;
  form: PowerupForm;
  radius: number;
}

interface BombPowerup {
  x: number;
  y: number;
  baseX: number;
  ageMs: number;
  orbitAngle: number;
  radius: number;
}

interface ImpactEffect {
  x: number;
  y: number;
  ageMs: number;
  durationMs: number;
  size: number;
  rotation: number;
}

interface EnergyImpactEffect {
  x: number;
  y: number;
  ageMs: number;
  durationMs: number;
  size: number;
  rotation: number;
}

interface DebrisFragment {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  angularVelocity: number;
  lifeMs: number;
  maxLifeMs: number;
  size: number;
  color: string;
}

interface BombBlast {
  x: number;
  y: number;
  ageMs: number;
  durationMs: number;
  radius: number;
}

interface BossLaserState {
  phase: 'warning' | 'active';
  timerMs: number;
  targetX: number;
  hitPlayer: boolean;
}

interface HostileLaserState {
  offsetX?: number;
  quantum?: boolean;
  source: EnemyState;
  phase: 'warning' | 'active';
  timerMs: number;
  targetX: number;
  hitPlayer: boolean;
}

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
  color: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  size: number;
  color: string;
}

const PLAYER_SPRITE = 'assets/player-fighter.png';
const FIRE_EFFECT_SPRITE = 'assets/fx-burning-impact.png';
const STAR_COUNT = 170;
const PLAYER_BULLET_SPEED = 690;
const ENEMY_BULLET_SPEED = 172;
const LASER_DAMAGE_TICK_MS = 80;
const BOSS_LASER_WARNING_MS = 1_250;
const BOSS_LASER_ACTIVE_MS = 460;
const HOSTILE_LASER_WARNING_MS = 920;
const HOSTILE_LASER_ACTIVE_MS = 520;
const BOMB_EFFECT_DURATION_MS = 1_050;
const LEVEL_ADVANCE_DELAY_MS = 2_600;
const BACKGROUND_TRANSITION_MS = SPACE_FADE_MS;
const DEFAULT_BACKGROUND: LevelBackground = Object.freeze({
  top: '#030617',
  middle: '#071d3a',
  bottom: '#02040d',
  nebula: '#4739b4',
});

function isSkyStrikeSaveData(value: unknown): value is SkyStrikeSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.highScore)
    && isNonNegativeInteger(value.bestWave)
    && isNonNegativeInteger(value.sorties)
    && isNonNegativeInteger(value.bossesDefeated);
}

export interface SkyStrikePlatform {
  audio?: SkyStrikeAudio;
  /** Native adapter owns hardware feedback; browser can omit it. */
  haptic?: (event: 'elite-defeated' | 'boss-defeated' | 'player-hit' | 'player-destroyed' | 'bomb') => void;
  ui?: SkyStrikeUi;
  locale?: SkyStrikeLocale;
  saveBackend?: GameSaveBackend;
  levels?: readonly SkyStrikeLevel[];
  guiFont?: GuiFontOptions;
  guiLoadOp?: 'clear' | 'load';
  keyboard?: boolean;
  fixture?: string | null;
  acceptsGameplayInput?: (x: number, y: number) => boolean;
}

export class SkyStrikeGame {
  private readonly flames=new SkyStrikeFlames<EnemyState>();
  private flameProtectionMs=0;
  private readonly saves: SingleSlotGameSave<SkyStrikeSaveData>;
  private readonly random = createSeededRandom(0x51a7f11e);
  private readonly fixture: string | null;
  private readonly ui: SkyStrikeUi;
  private readonly locale: SkyStrikeLocale;
  private readonly cleanup: (() => void)[] = [];
  private readonly pendingInput: (() => void)[] = [];
  private disposed = false;
  private pointerId = -1;
  private readonly keys = new Set<string>();
  private readonly stars: Star[] = [];
  private readonly playerBullets: Bullet[] = [];
  private readonly enemyBullets: Bullet[] = [];
  private readonly asteroids = new SkyStrikeAsteroids();
  private readonly bombCrates = new SkyStrikeBombCrates();
  private readonly blackHole=new SkyStrikeBlackHole();
  private pointerTarget:{x:number;y:number}|null=null;
  private holeSpawnMs=1600;
  private holeSpawnCount=0;
  private readonly enemies: EnemyState[] = [];
  private readonly powerups: WeaponPowerup[] = [];
  private readonly bombPowerups: BombPowerup[] = [];
  private readonly sparks: Spark[] = [];
  private readonly impacts: ImpactEffect[] = [];
  private readonly energyImpacts: EnergyImpactEffect[] = [];
  private readonly debris: DebrisFragment[] = [];
  private readonly hostileLasers: HostileLaserState[] = [];
  private mirrorLaser:MirrorLaserState|null=null;
  private readonly player: PlayerState = {
    x: LOGICAL_WIDTH / 2,
    y: LOGICAL_HEIGHT - 118,
    radius: 15,
    lives: PLAYER_MAX_LIVES,
    health: PLAYER_MAX_HEALTH,
    fireCooldownMs: 0,
    invulnerableMs: 0,
  };

  private phase: GamePhase = 'ready';
  private score = 0;
  private highScore = 0;
  private wave = 1;
  private bestWave = 1;
  private sorties = 0;
  private bossesDefeated = 0;
  private elapsedMs = 0;
  private levels: readonly SkyStrikeLevel[] = [];
  private levelIndex = 0;
  private selectedLevelIndex = 0;
  private levelElapsedMs = 0;
  private levelTimeline: readonly CompiledLevelSpawn[] = [];
  private nextLevelSpawnIndex = 0;
  private levelAdvanceMs = 0;
  private levelRandom = createSeededRandom(1);
  private bossWarningProgress = 0;
  private readonly spaceBackdrop = new SkyStrikeSpaceBackdrop();
  private backgroundFrom = DEFAULT_BACKGROUND;
  private backgroundTo = DEFAULT_BACKGROUND;
  private backgroundTransitionMs = BACKGROUND_TRANSITION_MS;
  private pointerFiring = false;
  private boss: EnemyState | null = null;
  private twins: [EnemyState, EnemyState] | null = null;
  private twinReviveMs = 0;
  private bossLaser: BossLaserState | null = null;
  private weaponForm: WeaponForm = 'basic';
  private weaponLevel = 0;
  private laserFiring = false;
  private laserTarget: EnemyState | Bullet | Asteroid | BombCrate | null = null;
  private laserDamageCooldownMs = 0;
  private shakeMs = 0;
  private readonly combatEffects = new SkyStrikeCombatEffects();
  private spiralAngle = 0;
  private bombs = INITIAL_BOMBS;
  private bombBlast: BombBlast | null = null;
  private levelCarousel: SkyStrikeLevelCarousel | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly battle: SkyStrikeBattleLayer,
    private readonly engine: HaiyueEngine,
    private readonly world: World,
    private readonly platform: SkyStrikePlatform = {},
  ) {
    this.locale = platform.locale ?? browserSkyStrikeLocale();
    this.ui = platform.ui ?? new SkyStrikeGuiHud(world, id => battle.guiImage(id), undefined, this.locale);
    this.fixture = platform.fixture ?? (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('fixture'));
    this.saves = new SingleSlotGameSave<SkyStrikeSaveData>({ gameId: 'sky-strike', name: this.locale.text('saveName'),
      validateData: isSkyStrikeSaveData, ...(platform.saveBackend ? { backend: platform.saveBackend } : {}) });
  }

  snapshot() {
    const viewport = skyStrikeViewport(this.engine.displayWidth, this.engine.displayHeight, this.player.x, this.player.radius);
    return { fire:this.flames.snapshot(), quantum:this.enemies.filter(e=>e.quantumPaired&&e.hitPoints>0).map(e=>({id:e.definition.id,body:{x:e.x,y:e.y,rotation:e.rotation},ghost:quantumPose(e,this.quantumCenterX()),health:e.hitPoints,turretAngles:e.quantumTurretAngles,core:e.definition.bossAttack==='quantum-broadside'?quantumCoreState(e.ageMs,e.hitPoints,e.definition.hitPoints):undefined})), quantumLasers:this.hostileLasers.filter(l=>l.source.quantumPaired).map(l=>({...this.hostileLaserPath(l),phase:l.phase,ghost:!!l.quantum})), mirrors:{hulls:this.enemies.filter(e=>!!e.definition.mirrorSides).map(e=>({id:e.definition.id,x:e.x,y:e.y,rotation:e.rotation,budget:e.hitPoints})),reflected:this.enemyBullets.filter(b=>b.reflected).length,shards:this.enemyBullets.filter(b=>b.crystalShard).length,laser:this.mirrorLaser?{x:this.mirrorLaser.x,y:this.mirrorLaser.y,endX:this.mirrorLaser.endX,endY:this.mirrorLaser.endY,warningMs:this.mirrorLaser.warningMs}:null}, blackHole:this.blackHole.snapshot(), bombCrates: this.bombCrates.snapshot(), audio: this.platform.audio?.snapshot() ?? null, asteroids: this.asteroids.snapshot(), phase: this.phase, language: this.locale.language, optionsOpen: this.levelCarousel?.optionsOpen ?? false, effects: this.combatEffects.snapshot(), background: this.spaceBackdrop.snapshot(), twins: this.twins?.map(t=>({id:t.definition.id,health:t.hitPoints})) ?? [], twinReviveMs:this.twinReviveMs, bubbles:this.enemyBullets.filter(b=>b.bubbleHealth!==undefined).length, player: { x: this.player.x, y: this.player.y, health: this.player.health },
      score: this.score, highScore: this.highScore, wave: this.wave, bombs: this.bombs,
      enemies: this.enemies.length, bullets: this.playerBullets.length + this.enemyBullets.length,
      selectedLevel: this.selectedLevelIndex, viewport, firing: this.pointerFiring, rendering: this.battle.stats() };
  }
  async flushSave(): Promise<void> { await this.saves.flush(); }
  suspend(): void {
    this.pendingInput.length = 0; this.keys.clear(); this.pointerTarget=null; this.pointerFiring = false; this.pointerId = -1;
    if (this.phase === 'playing') this.pause();
    this.platform.audio?.pause();
    void this.flushSave();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.suspend(); this.levelCarousel?.dispose();
    for (const off of this.cleanup.splice(0)) off();
    this.flames.clear(); this.ui.dispose(); this.mirrorLaser=null;this.blackHole.reset(); this.combatEffects.clear(); this.asteroids.clear(); this.bombCrates.clear(); this.platform.audio?.dispose();
  }
  private listen(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, type: string, handler: (event: any) => void): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  async init(): Promise<void> {
    this.levels = this.platform.levels ?? await loadSkyStrikeLevels();
    const saved = await this.saves.load();
    if (saved) {
      this.highScore = saved.highScore;
      this.bestWave = Math.max(1, saved.bestWave);
      this.sorties = saved.sorties;
      this.bossesDefeated = saved.bossesDefeated;
    }
    this.selectedLevelIndex = Math.min(this.levels.length - 1, Math.max(0, this.bestWave - 1));
    this.setupLevelCarousel();
    this.createStars();
    this.setupInput();
    this.syncHud();
    this.hideStatus();
    this.levelCarousel?.show(this.selectedLevelIndex);
    this.render();
  }

  update(deltaMs: number): void {
    if (this.disposed) return;
    for (const input of this.pendingInput.splice(0)) input();
    const delta = Math.min(34, Math.max(0, deltaMs));
    this.platform.audio?.update(delta);
    this.updateStars(delta);
    this.updateSparks(delta);
    if (this.phase !== 'playing') {
      this.render();
      return;
    }

    this.elapsedMs += delta;
    this.spaceBackdrop.update(delta);
    this.combatEffects.update(delta);
    this.levelElapsedMs += delta;
    this.backgroundTransitionMs = Math.min(BACKGROUND_TRANSITION_MS, this.backgroundTransitionMs + delta);
    this.bestWave = Math.max(this.bestWave, this.wave);
    this.shakeMs = Math.max(0, this.shakeMs - delta);
    this.updateImpacts(delta);
    this.updateEnergyImpacts(delta);
    this.updateDebris(delta);
    this.updateBombBlast(delta);
    this.updateLevelTransition(delta);
    this.updatePlayer(delta);
    this.updateSpawns();
    this.updateBullets(delta);
    this.updateTwins(delta);
    this.updateEnemies(delta);
    this.updateFlames(delta);
    this.updateAsteroids(delta);
    this.bombCrates.update(delta, this.levels[this.levelIndex]?.id === 'asteroid-forge' && this.boss?.definition.id === 'ore-reaper' && this.boss.entered && this.boss.hitPoints > 0 && this.levelAdvanceMs <= 0, this.bombPowerups.length);
    this.updateBossLaser(delta);
    this.updateHostileLasers(delta);
    this.updateBlackHole(delta);
    this.updatePowerups(delta);
    this.updatePlayerLaser(delta);
    this.resolveCollisions();
    this.resolveBubbleCollisions();
    this.platform.audio?.lasers(this.phase === 'playing' && this.laserFiring, this.phase === 'playing' && (this.bossLaser?.phase === 'active' || this.hostileLasers.some(l => l.phase === 'active') || (this.mirrorLaser!==null&&this.mirrorLaser.warningMs<=0)), this.player.x);
    this.syncHud();
    this.render();
  }

  private createStars(): void {
    const colors = ['#ffffff', '#72d9ff', '#889cff', '#d7e4ff'];
    for (let index = 0; index < STAR_COUNT; index++) {
      const depth = this.random();
      this.stars.push({
        x: this.random() * LOGICAL_WIDTH,
        y: this.random() * LOGICAL_HEIGHT,
        speed: 10 + depth * 46,
        size: 0.5 + depth * 1.7,
        alpha: 0.25 + depth * 0.7,
        color: colors[Math.floor(this.random() * colors.length)] ?? '#ffffff',
      });
    }
  }

  private setupLevelCarousel(): void {
    this.levelCarousel = new SkyStrikeLevelCarousel({
      locale: this.locale,
      audio: this.platform.audio,
      engine: this.engine,
      world: this.world,
      canvas: this.canvas,
      levels: this.levels,
      initialIndex: this.selectedLevelIndex,
      loadOp: 'load',
      ...(this.platform.guiFont ? { guiFont: this.platform.guiFont } : {}),
      guiImage: id => this.battle.guiImage(id),
      resolveBoss: level => {
        const definition = requiredEnemyDefinition(level.bossId);
        return {
          source: this.battle.guiImage(definition.id==='quantum-dreadnought'?'assets/fx-quantum-preview.png':definition.sprite),
          sourceKey: definition.id==='quantum-dreadnought'?'assets/fx-quantum-preview.png':definition.sprite,
          ...(definition.id==='twin-red'?{companion:{source:this.battle.guiImage('assets/boss-twin-blue.png'),sourceKey:'assets/boss-twin-blue.png'}}:{}),
          label: this.locale.named(definition.id),
          aspect: definition.renderAspect ?? 1.18,
        };
      },
      onSelectionChange: index => {
        this.selectedLevelIndex = index;
        this.ui.metadata({ selectedLevel: this.levels[index]?.id ?? 'unloaded' });
      },
      onStart: index => {
        this.selectedLevelIndex = index;
        this.startSortie();
      },
    });
    this.ui.metadata({ selectedLevel: this.levels[this.selectedLevelIndex]?.id ?? 'unloaded' });
  }

  private setupInput(): void {
    this.listen(this.canvas, 'pointerdown', () => this.platform.audio?.unlock());
    if (this.platform.keyboard !== false && typeof window !== 'undefined') this.listen(window, 'keydown', () => this.platform.audio?.unlock());
    if (this.platform.keyboard !== false && typeof window !== 'undefined') {
    this.listen(window, 'keydown', event => {
      const key = event.key.toLowerCase();
      if (this.levelCarousel?.optionsOpen) { event.preventDefault(); if (key === 'escape') this.levelCarousel.closeOptions(); return; }
      if (this.levelCarousel?.isVisible) {
        if (!event.repeat && (key === 'arrowleft' || key === 'a')) {
          event.preventDefault();
          this.levelCarousel.changeSelection(-1);
          return;
        }
        if (!event.repeat && (key === 'arrowright' || key === 'd')) {
          event.preventDefault();
          this.levelCarousel.changeSelection(1);
          return;
        }
        if (!event.repeat && (key === 'j' || key === 'enter')) {
          event.preventDefault();
          this.startSortie();
          return;
        }
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'j', 'k', 'b'].includes(key)) {
        event.preventDefault();
        this.keys.add(key);
      }
      if ((key === 'j' || key === 'enter') && (this.phase === 'ready' || this.phase === 'game-over')) {
        this.startSortie();
      } else if (key === 'p' || key === 'escape') {
        this.togglePause();
      } else if ((key === 'k' || key === 'b') && !event.repeat) {
        this.activateBomb();
      }
    });
    this.listen(window, 'keyup', event => this.keys.delete(event.key.toLowerCase()));
    }

    this.listen(this.canvas, 'contextmenu', event => event.preventDefault());
    this.listen(this.canvas, 'pointerdown', event => {
      event.preventDefault();
      if (event.button === 2) {
        this.activateBomb();
        return;
      }
      if (event.button !== 0 || this.levelCarousel?.isVisible || this.phase !== 'playing' || this.pointerId !== -1) return;
      const rect = this.canvas.getBoundingClientRect();
      const view = skyStrikeViewport(rect.width, rect.height);
      if (event.clientX - rect.left < view.left || event.clientX - rect.left > view.left + view.width) return;
      if (this.platform.acceptsGameplayInput && !this.platform.acceptsGameplayInput(event.clientX - rect.left, event.clientY - rect.top)) return;
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      this.pendingInput.push(() => { this.pointerFiring = true; this.movePlayerToPointer(event); });
    });
    this.listen(this.canvas, 'pointermove', event => {
      if (event.pointerId !== this.pointerId) return;
      event.preventDefault();
      this.pendingInput.push(() => this.movePlayerToPointer(event));
    });
    const stopPointer = (event: PointerEvent) => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = -1;
      this.pendingInput.push(() => { this.pointerFiring = false; this.pointerTarget=null; });
      if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    this.listen(this.canvas, 'pointerup', stopPointer);
    this.listen(this.canvas, 'pointercancel', stopPointer);

    this.cleanup.push(this.ui.bindActions({
      start: () => this.pendingInput.push(() => { if (this.phase === 'paused') this.togglePause(); else this.startSortie(); this.platform.audio?.click(); }),
      bomb: () => this.pendingInput.push(() => {this.activateBomb();this.platform.audio?.click();}),
      pause: () => this.pendingInput.push(() => {this.togglePause();this.platform.audio?.click();}),
      home: () => this.pendingInput.push(() => {this.returnHome();this.platform.audio?.click('back');}),
      suspend: () => this.suspend(),
    }));
  }

  private movePlayerToPointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerTarget={x:skyStrikePointerX(event.clientX - rect.left, rect.width, rect.height, this.player.radius),
      y:clampToPlayfield((event.clientY - rect.top) / rect.height * LOGICAL_HEIGHT,this.player.radius+52,LOGICAL_HEIGHT-18)};
  }

  private startSortie(): void {
    if (this.levelCarousel?.optionsOpen) return;
    this.platform.audio?.stop(); this.platform.audio?.resume();
    this.levelCarousel?.hide();
    this.phase = 'playing';
    this.pointerTarget=null;
    this.score = 0;
    this.wave = 1;
    this.elapsedMs = 0;
    this.combatEffects.clear(); this.shakeMs = 0;
    this.player.x = LOGICAL_WIDTH / 2;
    this.player.y = LOGICAL_HEIGHT - 118;
    this.player.lives = PLAYER_MAX_LIVES;
    this.player.health = PLAYER_MAX_HEALTH;
    this.player.fireCooldownMs = 0;
    this.player.invulnerableMs = 1_500;
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    this.enemies.length = 0;
    this.powerups.length = 0;
    this.bombPowerups.length = 0;
    this.sparks.length = 0;
    this.impacts.length = 0;
    this.energyImpacts.length = 0;
    this.debris.length = 0;
    this.hostileLasers.length = 0;this.mirrorLaser=null;
    this.boss = null;
    this.twins = null; this.twinReviveMs = 0;
    this.bossLaser = null;
    this.weaponForm = 'basic';
    this.weaponLevel = 0;
    this.laserFiring = false;
    this.laserTarget = null;
    this.laserDamageCooldownMs = 0;
    this.bombs = INITIAL_BOMBS;
    this.bombBlast = null;
    this.levelAdvanceMs = 0;
    this.beginLevel(this.selectedLevelIndex);
    this.sorties++;
    this.applyBrowserFixture();
    this.hideStatus();
    this.ui.pauseState(false, false);
    this.syncHud();
  }

  private applyBrowserFixture(): void {
    if (this.fixture === 'boss-laser') {
      this.levelTimeline = [];
      this.spawnEnemy(BOSS_ENEMY);
      if (this.boss) {
        this.boss.y = 142;
        this.boss.entered = true;
        this.boss.laserCooldownMs = 420;
        this.boss.hitPoints = this.boss.definition.hitPoints;
      }
      return;
    }
    if (this.fixture === 'powerup') {
      this.powerups.push({
        x: this.player.x,
        y: this.player.y - 105,
        baseX: this.player.x,
        ageMs: 0,
        formTimerMs: POWERUP_FORM_INTERVAL_MS,
        orbitAngle: 0,
        form: 'purple',
        radius: 18,
      });
      return;
    }
    if (this.fixture === 'purple-laser') {
      this.weaponForm = 'purple';
      this.weaponLevel = 3;
      this.pointerFiring = true;
      for (const definition of NORMAL_ENEMIES.slice(0, 3)) {
        this.spawnEnemy(definition);
        const enemy = this.enemies[this.enemies.length - 1];
        if (!enemy) continue;
        enemy.x = this.player.x + (this.enemies.length - 2) * 64;
        enemy.originX = enemy.x;
        enemy.y = 360 + this.enemies.length * 42;
        enemy.hitPoints = 80;
      }
      this.levelTimeline = [];
    }
  }

  private beginLevel(index: number): void {
    const level = this.levels[index];
    if (!level) return;
    this.flames.clear();this.flameProtectionMs=1500;
    this.spaceBackdrop.select(level.id, this.elapsedMs === 0);
    this.backgroundFrom = this.currentBackground();
    this.backgroundTo = level.background;
    this.backgroundTransitionMs = 0;
    this.levelIndex = index;
    this.selectedLevelIndex = index;
    this.wave = level.number ?? index + 1;
    this.levelElapsedMs = 0;
    this.nextLevelSpawnIndex = 0;
    this.levelAdvanceMs = 0;
    this.levelTimeline = compileLevelTimeline(level);
    this.levelRandom = createSeededRandom(level.seed + this.sorties * 997);
    this.asteroids.reset(createSeededRandom(level.seed ^ (this.sorties * 997) ^ 0xa57e));
    this.bombCrates.reset(createSeededRandom(level.seed ^ (this.sorties * 997) ^ 0xb04b));
    this.mirrorLaser=null;this.blackHole.reset(level.id==='event-horizon');this.holeSpawnMs=1600;this.holeSpawnCount=0;
    if(level.id==='event-horizon')this.updateSpawns();
    this.bossWarningProgress = 0;
    this.enemyBullets.length = 0;
    this.hostileLasers.length = 0;this.mirrorLaser=null;
    this.bossLaser = null;
    this.player.invulnerableMs = Math.max(this.player.invulnerableMs, 1_200);
    this.addSparks(LOGICAL_WIDTH / 2, 150, 32, '#6eeaff');
  }

  private pause(): void {
    this.pointerTarget=null; this.pointerFiring=false;
    this.platform.audio?.pause();
    this.phase = 'paused';
    this.ui.status({ gameOver: false });
    this.ui.pauseState(true, false);
  }

  private returnHome(): void {
    if (this.phase !== 'paused') return;
    this.saveProgress();
    this.phase = 'ready';
    this.flames.clear();
    this.asteroids.clear(); this.bombCrates.clear();
    this.pendingInput.length = 0; this.keys.clear();
    if (this.pointerId !== -1 && this.canvas.hasPointerCapture?.(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId);
    this.pointerId = -1; this.pointerFiring = false; this.pointerTarget=null; this.laserFiring = false;
    this.playerBullets.length = 0; this.enemyBullets.length = 0; this.enemies.length = 0;
    this.powerups.length = 0; this.bombPowerups.length = 0;
    this.sparks.length = 0; this.impacts.length = 0; this.energyImpacts.length = 0; this.debris.length = 0;
    this.hostileLasers.length = 0;this.mirrorLaser=null; this.twins = null; this.twinReviveMs = 0; this.boss = null; this.bossLaser = null; this.laserTarget = null;
    this.bombBlast = null; this.levelAdvanceMs = 0; this.shakeMs = 0; this.combatEffects.clear();
    this.mirrorLaser=null;this.blackHole.reset();
    this.selectedLevelIndex = this.levelIndex;
    this.hideStatus(); this.ui.pauseState(false, true);
    this.levelCarousel?.show(this.selectedLevelIndex);
    this.syncHud();
  }

  private togglePause(): void {
    if (this.phase === 'playing') {
      this.pause();
    } else if (this.phase === 'paused') {
      this.platform.audio?.resume();
      this.phase = 'playing';
      this.hideStatus();
      this.ui.pauseState(false, false);
    }
  }

  private updateStars(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (const star of this.stars) {
      star.y += star.speed * seconds;
      if (star.y > LOGICAL_HEIGHT + 4) {
        star.y = -4;
        star.x = this.random() * LOGICAL_WIDTH;
      }
    }
  }

  private updatePlayer(deltaMs: number): void {
    let horizontal = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    let vertical = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    if (horizontal !== 0 && vertical !== 0) {
      horizontal *= Math.SQRT1_2;
      vertical *= Math.SQRT1_2;
    }
    const seconds = deltaMs / 1000;
    const moved=advancePlayer(this.player,this.pointerTarget,{x:horizontal,y:vertical},this.blackHole.force(this.player.x,this.player.y),deltaMs);
    this.player.x=clampToPlayfield(moved.x,this.player.radius,LOGICAL_WIDTH);
    this.player.y=clampToPlayfield(moved.y,this.player.radius+48,LOGICAL_HEIGHT-18);
    this.player.invulnerableMs = Math.max(0, this.player.invulnerableMs - deltaMs);
    this.flameProtectionMs=Math.max(0,this.flameProtectionMs-deltaMs);
    if(this.flames.burnMs<=0)this.player.health = regeneratePlayerHealth(this.player.health, seconds);
    const firing = this.keys.has('j') || this.pointerFiring;
    const profile = weaponProfile(this.weaponForm, this.weaponLevel);
    this.laserFiring = firing && profile.form === 'purple';
    if (profile.form === 'purple') {
      this.player.fireCooldownMs = 0;
      return;
    }
    const cooldown = stepFireCooldown(this.player.fireCooldownMs, deltaMs, firing, profile.fireIntervalMs);
    this.player.fireCooldownMs = cooldown.cooldownMs;
    if (cooldown.shouldFire) {
      this.firePlayerWeapons(profile);
    }
  }

  private firePlayerWeapons(profile: WeaponProfile): void {
    this.platform.audio?.play(profile.form === 'red' ? 'shot-red' : profile.form === 'blue' ? 'shot-blue' : 'shot-basic', this.player.x);
    const count = profile.projectileCount;
    for (let index = 0; index < count; index++) {
      const normalized = count <= 1 ? 0 : index / (count - 1) * 2 - 1;
      const offset = profile.form === 'blue'
        ? (index - (count - 1) / 2) * 11
        : normalized * (profile.form === 'red' ? 30 : 11);
      const vx = profile.form === 'red' ? normalized * profile.spreadSpeed : profile.form === 'basic' ? offset * 0.42 : 0;
      this.combatEffects.shot(this.player, offset, -24, vx, -PLAYER_BULLET_SPEED, profile.form === 'red' ? '#ff6952' : profile.form === 'blue' ? '#55bdff' : '#ffe19a', profile.form);
      this.playerBullets.push({
        x: this.player.x + offset,
        y: this.player.y - 24,
        vx,
        vy: -PLAYER_BULLET_SPEED,
        radius: profile.form === 'blue' ? 5 : 4,
        damage: profile.damage,
        hostile: false,
        color: profile.form === 'red' ? '#ff4059' : profile.form === 'blue' ? '#4bb8ff' : '#55eaff',
      });
    }
  }

  private mirrorHull(enemy:EnemyState):MirrorHull {return{x:enemy.x,y:enemy.y,radius:enemy.radius,rotation:enemy.rotation,sides:enemy.definition.mirrorSides??3};}
  private spendMirrorBudget(enemy:EnemyState,damage:number):void {
    if(!this.enemies.includes(enemy)||enemy.hitPoints<=0)return;
    enemy.hitPoints=consumeMirrorBudget(enemy.hitPoints,damage);
    if(enemy.hitPoints<=0)this.destroyEnemy(this.enemies.indexOf(enemy),enemy);
  }
  private reflectProjectile(enemy:EnemyState,bullet:Bullet):void {
    const hit=mirrorHit({x:bullet.previousX??bullet.x,y:bullet.previousY??bullet.y},bullet,this.mirrorHull(enemy),bullet.radius);if(!hit)return;
    const v=reflectedVelocity(bullet.vx,bullet.vy,hit.nx,hit.ny),x=hit.x+hit.nx*2,y=hit.y+hit.ny*2;
    const budgetDamage=Math.min(Math.max(0,bullet.damage),enemy.hitPoints);
    this.spendMirrorBudget(enemy,budgetDamage);
    this.enemyBullets.push({...bullet,damage:REFLECTED_BULLET_DAMAGE,x,y,previousX:x,previousY:y,vx:v.x,vy:v.y,hostile:true,reflected:true,lifeMs:6500});
    this.addSparks(x,y,5,'#d3faff');this.platform.audio?.play('shot-blue',x);
  }
  private updateMirrorLaser(source:EnemyState,deltaMs:number):void {
    const from={x:this.player.x,y:this.player.y-34},hit=mirrorHit(from,source,this.mirrorHull(source));
    if(!hit){this.mirrorLaser=null;return;}
    const dx=source.x-from.x,dy=source.y-from.y,length=Math.max(1,Math.hypot(dx,dy)),v=reflectedVelocity(dx/length,dy/length,hit.nx,hit.ny);
    const warningMs=this.mirrorLaser?.source===source?Math.max(0,this.mirrorLaser.warningMs-deltaMs):350;
    this.mirrorLaser={source,x:hit.x,y:hit.y,endX:hit.x+v.x*1500,endY:hit.y+v.y*1500,warningMs};
  }
  private drawMirror(enemy:EnemyState):void {
    const r=this.battle,d=enemy.definition,strain=1-enemy.hitPoints/d.hitPoints,vertices=mirrorVertices(this.mirrorHull(enemy));
    r.glow(enemy.x,enemy.y,enemy.radius*1.45,'#667dff',.28);
    r.sprite(d.sprite,enemy.x,enemy.y,d.size,d.size,enemy.rotation);
    for(let i=0;i<vertices.length;i++){
      const a=vertices[i]!,b=vertices[(i+1)%vertices.length]!;
      r.line(a.x,a.y,b.x,b.y,d.tier==='boss'?2:1.3,strain>.72?'#ff9be9':'#b5f6ff',.7);
      r.glow(a.x,a.y,d.tier==='boss'?10:4,i%2?'#e49cff':'#84edff',.75);
      if(strain>.3){const t=Math.min(.9,(strain-.3)*1.3);r.line(enemy.x,enemy.y,enemy.x+(a.x-enemy.x)*t,enemy.y+(a.y-enemy.y)*t,1,'#ffd7f8',.85);}
    }
    r.glow(enemy.x,enemy.y,enemy.radius*.23,'#d4eaff',.4+.2*Math.sin(enemy.ageMs*.006));
  }

  private updatePlayerLaser(deltaMs: number): void {
    if (!this.laserFiring || this.weaponForm !== 'purple') {
      this.laserTarget = null;this.mirrorLaser=null;
      this.laserDamageCooldownMs = 0;
      return;
    }
    const profile = weaponProfile(this.weaponForm, this.weaponLevel);
    if(this.blackHole.feeding&&this.boss?.definition.id==='black-hole'&&this.player.y>this.blackHole.y&&Math.abs(this.player.x-this.blackHole.x)<profile.attractionRadius){
      this.laserTarget=this.boss;this.blackHole.absorb(deltaMs*.006);return;
    }
    const vulnerableTargets = this.enemies.filter(enemy => (!enemy.definition.directDamageImmune||!!enemy.definition.mirrorSides) && enemy.hitPoints > 0);
    const targets: (EnemyState | Bullet | Asteroid | BombCrate)[] = [...vulnerableTargets, ...this.enemyBullets.filter(b => b.bubbleHealth !== undefined), ...this.asteroids.rocks, ...this.bombCrates.crates];
    this.laserTarget = selectLaserTarget(this.player.x, this.player.y, profile.attractionRadius, targets);
    if(this.laserTarget&&'definition' in this.laserTarget&&this.laserTarget.definition.mirrorSides)this.updateMirrorLaser(this.laserTarget,deltaMs);
    else this.mirrorLaser=null;
    this.laserDamageCooldownMs -= deltaMs;
    if (!this.laserTarget || this.laserDamageCooldownMs > 0) return;
    const damage = profile.beamDamagePerSecond * (LASER_DAMAGE_TICK_MS / 1000);
    const target = this.laserTarget;
    if ('hostile' in target) this.damageBubble(target, damage);
    else if ('kind' in target) {if(target.kind==='bomb-crate')this.damageBombCrate(target,damage);else this.damageAsteroid(target, damage);}
    else if(target.definition.mirrorSides){
      const beam=this.mirrorLaser,reflectedDamage=Math.min(damage,target.hitPoints);
      if(beam&&beam.warningMs<=0&&distancePointToSegment(this.player.x,this.player.y,beam.x,beam.y,beam.endX,beam.endY)<=this.player.radius+profile.beamWidth/2)this.damagePlayer(reflectedDamage);
      this.spendMirrorBudget(target,reflectedDamage);
    }else this.damageEnemy(this.enemies.indexOf(target), target, damage);
    this.addLaserImpact(target.x, target.y, 22 + this.weaponLevel * 5);
    this.addSparks(target.x, target.y, 2 + this.weaponLevel, '#65e8ff');
    this.addSparks(target.x, target.y, 2 + this.weaponLevel, '#bd5cff');
    this.laserDamageCooldownMs += LASER_DAMAGE_TICK_MS;
    if ('hostile' in target ? !this.enemyBullets.includes(target) : 'kind' in target ? (target.kind==='bomb-crate' ? !this.bombCrates.crates.includes(target) : !this.asteroids.rocks.includes(target)) : !this.enemies.includes(target)) {
      this.laserTarget = null;
    }
  }

  private updateSpawns(): void {
    while (this.nextLevelSpawnIndex < this.levelTimeline.length) {
      const spawn = this.levelTimeline[this.nextLevelSpawnIndex];
      if (!spawn || spawn.atMs > this.levelElapsedMs) break;
      const definition = requiredEnemyDefinition(spawn.enemyId);
      const x = resolveSpawnX(spawn.position, this.levelRandom);
      this.spawnEnemy(definition, x, undefined, spawn.quantumPair);
      this.nextLevelSpawnIndex++;
    }
    this.updateBossWarning();
  }

  private updateBossWarning(): void {
    let nextBossSpawn: CompiledLevelSpawn | undefined;
    for (let index = this.nextLevelSpawnIndex; index < this.levelTimeline.length; index++) {
      const spawn = this.levelTimeline[index];
      if (spawn && requiredEnemyDefinition(spawn.enemyId).tier === 'boss') {
        nextBossSpawn = spawn;
        break;
      }
    }
    if (!nextBossSpawn) {
      this.bossWarningProgress = 0;
      return;
    }
    const timeUntilBossMs = nextBossSpawn.atMs - this.levelElapsedMs;
    this.bossWarningProgress = calculateBossWarningProgress(timeUntilBossMs);
  }

  private spawnEnemy(definition: EnemyDefinition, requestedX?: number, requestedY?: number, quantumPair = false): EnemyState {
    const margin = definition.tier === 'boss' ? definition.size * 0.38 : definition.size * 0.35;
    const fallbackX = definition.tier === 'boss'
      ? LOGICAL_WIDTH / 2
      : margin + this.levelRandom() * (LOGICAL_WIDTH - margin * 2);
    const x = clampToPlayfield(requestedX ?? fallbackX, Math.min(margin, LOGICAL_WIDTH * 0.45), LOGICAL_WIDTH);
    const enemy: EnemyState = {
      quantumPaired: quantumPair || !!definition.quantumPair,
      definition,
      x,
      y: requestedY ?? -definition.size * 0.7,
      radius: definition.size * (definition.tier === 'boss' ? 0.31 : 0.28),
      originX: x,
      hitPoints: definition.hitPoints + (definition.tier === 'normal' && !definition.segmentedPart && !definition.mirrorSides
        ? Math.min(4, Math.floor(this.wave / 4))
        : 0),
      ageMs: 0,
      fireCooldownMs: enemyFireIntervalMs(definition.fireIntervalMs, 0) * (0.45 + this.levelRandom() * 0.5),
      phaseOffset: this.levelRandom() * Math.PI * 2,
      entered: false,
      laserCooldownMs: definition.bossAttack === 'carrier-deploy' ? CARRIER_DEPLOY_INTERVAL_MS : definition.bossAttack === 'emitter-grid' ? 650 : definition.tier === 'boss' ? 3_600 : 0,
      velocityX: 0,
      velocityY: definition.speed,
      rotation: 0,
      damageEffectCooldownMs: 0,
      segmentOwner: null,
      segmentOrder: 0,
      charging: false,
      deploymentWaves: 0,
      chargeCooldownMs: definition.id === 'iron-serpent' ? 4_200 : 0,
    };
    if(definition.mirrorSides)enemy.radius=definition.size*.46;
    if(definition.bossAttack==='quantum-broadside'){enemy.x=enemy.originX=this.quantumBossPosition(0);enemy.quantumTurretAngles=QUANTUM_GUN_MOUNTS.map(([dx])=>dx<0?Math.PI:0);}
    this.enemies.push(enemy);
    if (definition.tier === 'boss') this.boss = enemy;
    if(definition.id==='black-hole'){enemy.x=this.blackHole.x;enemy.y=this.blackHole.y;enemy.entered=true;}
    if(this.levels[this.levelIndex]?.id==='event-horizon'&&definition.tier!=='boss'){enemy.x=x<240?-32:512;enemy.y=110+(this.holeSpawnCount%4)*65;enemy.originX=x<240?60:420;}
    if (definition.id === 'twin-red') {
      enemy.x = enemy.originX = 130;
      const blue = this.spawnEnemy(requiredEnemyDefinition('twin-blue'), 350, enemy.y);
      this.twins = [enemy, blue]; this.twinReviveMs = 0; this.boss = enemy;
      enemy.laserCooldownMs = blue.laserCooldownMs = 2000;
    }
    if (definition.id === 'space-train') {
      const carDefinition = requiredEnemyDefinition('space-train-car');
      for (let order = 1; order <= SPACE_TRAIN_CAR_COUNT; order++) {
        const car = this.spawnEnemy(carDefinition, x, enemy.y - order * 58);
        car.segmentOwner = enemy;
        car.segmentOrder = order;
      }
    } else if (definition.id === 'iron-serpent') {
      const segmentDefinition = requiredEnemyDefinition('iron-serpent-turret');
      for (let order = 1; order <= SERPENT_SEGMENT_COUNT; order++) {
        const segment = this.spawnEnemy(segmentDefinition, x, enemy.y - order * 44);
        segment.segmentOwner = enemy;
        segment.segmentOrder = order;
      }
    }
    return enemy;
  }

  private updateLevelTransition(deltaMs: number): void {
    if (this.levelAdvanceMs <= 0) return;
    this.levelAdvanceMs -= deltaMs;
    if (this.levelAdvanceMs > 0) return;
    this.enemies.length = 0;
    this.enemyBullets.length = 0;
    this.beginLevel((this.levelIndex + 1) % this.levels.length);
  }

  private updateEnemies(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (let index = this.enemies.length - 1; index >= 0; index--) {
      const enemy = this.enemies[index]!;
      if (enemy.hitPoints <= 0) continue;
      enemy.ageMs += deltaMs;
      enemy.fireCooldownMs -= deltaMs;
      const movement = enemy.definition.flightPattern;

      if(enemy.definition.id==='black-hole'){enemy.x=this.blackHole.x;enemy.y=this.blackHole.y;enemy.entered=true;continue;}
      if(this.levels[this.levelIndex]?.id==='event-horizon'&&enemy.definition.tier!=='boss'){
        const force=this.blackHole.force(enemy.x,enemy.y);
        const lane=enemy.originX<240?50:430;
        const steer=Math.max(-110,Math.min(110,(lane-enemy.x)*1.8));
        enemy.x+=(steer+force.x)*seconds;enemy.y+=(enemy.definition.speed*.55+force.y)*seconds;enemy.entered=enemy.x>0&&enemy.x<480;
      }else if (enemy.definition.tier === 'boss') {
        if (enemy.definition.bossAttack === 'twin-bubbles') {
          enemy.y = Math.min(180, enemy.y + enemy.definition.speed * seconds);
          enemy.entered = enemy.y >= 180;
          enemy.x = enemy.originX + Math.sin(enemy.ageMs * 0.00085) * 38;
        } else if(enemy.definition.bossAttack==='quantum-broadside'){
          enemy.y=Math.min(160,enemy.y+enemy.definition.speed*seconds);enemy.entered=enemy.y>=160;
          enemy.x=this.quantumBossPosition(enemy.ageMs);
        } else if (enemy.definition.id === 'iron-serpent') {
          this.updateIronSerpent(enemy, deltaMs);
        } else {
          if (enemy.y < 142) enemy.y += enemy.definition.speed * seconds;
          else enemy.entered = true;
          const travel = enemy.definition.id === 'ore-reaper' ? 30 : enemy.definition.id === 'helios-prism'
            ? 38
            : enemy.definition.id === 'star-carrier'
            ? 46
            : enemy.definition.id === 'void-mantis' ? 116 : enemy.definition.id === 'ion-seraph' ? 94 : 72;
          const frequency = enemy.definition.id === 'helios-prism'
            ? 0.0004
            : enemy.definition.id === 'star-carrier'
            ? 0.00048
            : enemy.definition.id === 'void-mantis' ? 0.00105 : 0.00072;
          enemy.x = LOGICAL_WIDTH / 2 + Math.sin(enemy.ageMs * frequency) * travel;
          if (enemy.definition.id === 'void-mantis' && enemy.entered) {
            enemy.y = 142 + Math.sin(enemy.ageMs * 0.0017) * 24;
          }
        }
        if (enemy.entered
          && enemy.definition.bossAttack !== 'serpent-barrage'
          && (!this.bossLaser || enemy.definition.bossAttack !== 'laser')) {
          enemy.laserCooldownMs -= deltaMs;
          if (enemy.laserCooldownMs <= 0) this.triggerBossAttack(enemy);
        }
        this.updateBossDamageEffects(enemy, deltaMs);
      } else if (enemy.definition.segmentedPart === 'serpent-turret') {
        if (!this.updateSerpentTurretPosition(enemy)) {
          this.enemies.splice(index, 1);
          continue;
        }
      } else if (movement === 'anchor') {
        enemy.entered = true;
      } else if (movement === 'rail') {
        enemy.y += enemy.definition.speed * seconds;
        enemy.x = enemy.originX;
      } else if (movement === 'kamikaze') {
        const velocity = steerKamikazeVelocity(
          { x: enemy.velocityX, y: enemy.velocityY },
          enemy.x,
          enemy.y,
          this.player.x,
          this.player.y,
          enemy.definition.speed,
          enemy.ageMs / 1000,
          seconds,
        );
        enemy.velocityX = velocity.x;
        enemy.velocityY = velocity.y;
        enemy.x += velocity.x * seconds;
        enemy.y += velocity.y * seconds;
        enemy.rotation = Math.atan2(velocity.x, -velocity.y);
      } else if (movement === 'fortress') {
        if (enemy.y < 180) enemy.y += enemy.definition.speed * seconds;
        else enemy.entered = true;
        enemy.x = enemy.originX + Math.sin(enemy.ageMs * 0.0011 + enemy.phaseOffset) * 48;
      } else {
        enemy.y += enemy.definition.speed * seconds;
        const amplitude = movement === 'weave' ? 76 : movement === 'sweep' ? 118 : movement === 'dive' ? 34 : 14;
        const frequency = movement === 'dive' ? 0.004 : 0.0018;
        enemy.x = clampToPlayfield(enemy.originX + Math.sin(enemy.ageMs * frequency + enemy.phaseOffset) * amplitude, 24, LOGICAL_WIDTH);
      }

      if(enemy.definition.mirrorSides)enemy.rotation=enemy.ageMs*(enemy.definition.tier==='boss'?.00165:.00032);
      if(enemy.quantumPaired&&!isAimingFighter(enemy.definition))enemy.rotation=Math.sin(enemy.ageMs*.0008)*.12;
      if(enemy.definition.bossAttack==='quantum-broadside'){
        enemy.quantumTurretAngles=QUANTUM_GUN_MOUNTS.map(([dx,dy],i)=>{const p=quantumHardpoint(enemy,enemy.definition.size,dx,dy);return turnFighterToward(enemy.quantumTurretAngles?.[i]??Math.PI/2,Math.atan2(this.player.y-p.y,this.player.x-p.x),deltaMs*.5);});
      }
      const aimsAtPlayer = isAimingFighter(enemy.definition);
      let aimReady = true;
      if (aimsAtPlayer) {
        const windingUp = enemy.fireCooldownMs <= FIGHTER_AIM_LEAD_MS && enemy.y > 40 && enemy.y < LOGICAL_HEIGHT * 0.72;
        const holdingShot = enemy.ageMs - (enemy.lastShotAgeMs ?? -10000) < FIGHTER_AIM_HOLD_MS;
        const targetAngle = windingUp ? Math.atan2(this.player.y-enemy.y, this.player.x-enemy.x)-Math.PI/2
          : holdingShot ? enemy.rotation : 0;
        enemy.rotation = turnFighterToward(enemy.rotation, targetAngle, deltaMs);
        aimReady = Math.abs(angleDifference(enemy.rotation,targetAngle)) < 0.025;
      }
      if (enemy.definition.bulletPattern !== 'none'
        && aimReady
        && enemy.fireCooldownMs <= 0
        && enemy.y > 40
        && enemy.y < LOGICAL_HEIGHT * 0.72) {
        this.fireEnemyPattern(enemy);
        const boss = this.boss;
        const interval = enemy.definition.segmentedPart === 'serpent-turret'
          && boss?.definition.bossAttack === 'serpent-barrage'
          ? serpentTurretFireIntervalMs(enemy.definition.fireIntervalMs, boss.hitPoints, boss.definition.hitPoints)
          : enemyFireIntervalMs(enemy.definition.fireIntervalMs, this.wave);
        enemy.fireCooldownMs = aimsAtPlayer ? interval : enemy.fireCooldownMs + interval;
      }
      if (enemy.definition.laserWeapon
        && enemy.fireCooldownMs <= 0
        && enemy.y > 40
        && enemy.y < LOGICAL_HEIGHT * 0.72
        && !this.hostileLasers.some(laser => laser.source === enemy)) {
        this.startHostileLaser(enemy);
        enemy.fireCooldownMs += enemyFireIntervalMs(enemy.definition.fireIntervalMs, this.wave);
      }

      if (enemy.y > LOGICAL_HEIGHT + enemy.definition.size
        && enemy.definition.segmentedPart !== 'serpent-turret'
        && enemy.definition.id !== 'iron-serpent') {
        this.enemies.splice(index, 1);
        if (this.boss === enemy) this.boss = null;
      }
    }
  }

  private updateIronSerpent(enemy: EnemyState, deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (enemy.charging) {
      enemy.x += enemy.velocityX * seconds;
      enemy.y += enemy.velocityY * seconds;
      if (shouldRecycleSerpentCharge(enemy.x, enemy.y, enemy.definition.size)) {
        enemy.charging = false;
        enemy.entered = false;
        enemy.x = serpentCruiseX(enemy.ageMs);
        enemy.originX = enemy.x;
        enemy.y = -enemy.definition.size * 0.72;
        enemy.chargeCooldownMs = 4_200;
      }
      return;
    }
    if (enemy.y < 360) {
      enemy.y = Math.min(360, enemy.y + enemy.definition.speed * seconds);
      enemy.x = serpentCruiseX(enemy.ageMs);
      enemy.entered = enemy.y >= 360;
    } else {
      enemy.entered = true;
      enemy.x = serpentCruiseX(enemy.ageMs);
    }
    if (!enemy.entered || !shouldSerpentCharge(enemy.hitPoints, enemy.definition.hitPoints)) return;
    enemy.chargeCooldownMs -= deltaMs;
    if (enemy.chargeCooldownMs > 0) return;
    const velocity = aimedVelocity(enemy.x, enemy.y, this.player.x, this.player.y, 520);
    enemy.velocityX = velocity.x;
    enemy.velocityY = Math.max(280, velocity.y);
    enemy.charging = true;
    enemy.chargeCooldownMs = 5_200;
    this.addSparks(enemy.x, enemy.y + 36, 52, '#ff4938');
    this.addImpact(enemy.x, enemy.y, 118);
    this.shakeMs = Math.max(this.shakeMs, 520);
  }

  private updateSerpentTurretPosition(enemy: EnemyState): boolean {
    const owner = enemy.segmentOwner;
    if (!owner || !this.enemies.includes(owner)) return false;
    const position = serpentSegmentPosition(
      owner.x,
      owner.y,
      owner.ageMs,
      enemy.segmentOrder,
      owner.charging,
      owner.velocityX,
      owner.velocityY,
    );
    enemy.x = position.x;
    enemy.y = position.y;
    enemy.entered = owner.entered;
    return true;
  }

  private fireEnemyPattern(enemy: EnemyState): void {
    this.platform.audio?.play('shot-enemy', enemy.x);
    enemy.lastShotAgeMs = enemy.ageMs;
    const speed = ENEMY_BULLET_SPEED + Math.min(70, this.wave * 4);
    const aimingFighter = isAimingFighter(enemy.definition);
    const muzzle = aimingFighter ? fighterMuzzle(enemy) : {x:enemy.x,y:enemy.y+enemy.definition.size*0.25,dx:0,dy:enemy.definition.size*0.25};
    const aimed = aimingFighter ? {x:-Math.sin(enemy.rotation)*speed,y:Math.cos(enemy.rotation)*speed}
      : aimedVelocity(enemy.x, enemy.y, this.player.x, this.player.y, speed);
    const projectile = enemyProjectileProfile(enemy.definition);
    if(enemy.definition.bossAttack==='quantum-broadside'){this.fireQuantumBroadside(enemy,speed);return;}
    this.combatEffects.shot(enemy, muzzle.dx, muzzle.dy, aimed.x, aimed.y, projectile.cssColor, enemy.definition.bulletPattern === 'spread' ? 'red' : 'blue');
    const add = (velocity: { x: number; y: number }, radius = 6) => this.emitEnemyBullet(enemy,{
      x: muzzle.x,
      y: muzzle.y,
      vx: velocity.x,
      vy: velocity.y,
      radius,
      damage: projectile.damage,
      hostile: true,
      color: projectile.cssColor,
    });

    switch (enemy.definition.bulletPattern) {
      case 'aimed':
        add(aimed);
        break;
      case 'spread': {
        const base = Math.atan2(aimed.y, aimed.x);
        for (const offset of [-0.32, 0, 0.32]) add(velocityFromAngle(base + offset, speed));
        break;
      }
      case 'burst': {
        const base = Math.atan2(aimed.y, aimed.x);
        for (const offset of [-0.12, 0, 0.12]) add(velocityFromAngle(base + offset, speed * (1 + Math.abs(offset))));
        break;
      }
      case 'ring':
        for (let index = 0; index < 12; index++) add(velocityFromAngle(index / 12 * Math.PI * 2, speed * 0.82), 5);
        break;
      case 'spiral':
        this.spiralAngle += 0.31;
        for (let arm = 0; arm < 3; arm++) add(velocityFromAngle(this.spiralAngle + arm * Math.PI * 2 / 3, speed * 0.92), 6);
        if (Math.floor(enemy.ageMs / 260) % 6 === 0) {
          const base = Math.atan2(aimed.y, aimed.x);
          for (const offset of [-0.42, -0.21, 0, 0.21, 0.42]) add(velocityFromAngle(base + offset, speed * 1.08), 5);
        }
        break;
      case 'arc': {
        const base = Math.atan2(aimed.y, aimed.x);
        for (const offset of [-0.82, -0.55, -0.28, 0, 0.28, 0.55, 0.82]) {
          add(velocityFromAngle(base + offset, speed * (0.88 + Math.abs(offset) * 0.16)), 5);
        }
        break;
      }
      case 'scythe':
        this.spiralAngle -= 0.23;
        for (let arm = 0; arm < 5; arm++) {
          const angle = this.spiralAngle + arm * Math.PI * 2 / 5;
          add(velocityFromAngle(angle, speed * 0.8), 5);
          add(velocityFromAngle(angle + 0.16, speed * 1.08), 4);
        }
        break;
    }
  }

  private quantumCenterX():number {
    const view=skyStrikeViewport(this.engine.displayWidth,this.engine.displayHeight,this.player.x);
    return view.cameraX+view.visibleWidth/2;
  }
  private quantumBossPosition(ageMs:number):number {
    const view=skyStrikeViewport(this.engine.displayWidth,this.engine.displayHeight,this.player.x);
    return quantumBossX(view.cameraX+view.visibleWidth/2,ageMs,view.visibleWidth);
  }
  private emitEnemyBullet(owner:EnemyState,bullet:Bullet):void {
    this.enemyBullets.push(bullet);
    if(!owner.quantumPaired)return;
    const p=quantumAttachment(owner,bullet,this.quantumCenterX()),v=quantumVelocity(bullet.vx,bullet.vy);
    this.enemyBullets.push({...bullet,...p,previousX:p.x,previousY:p.y,vx:v.x,vy:v.y,color:'#59baff',quantumOwner:owner,lifeMs:6500});
  }
  private quantumGun(enemy:EnemyState,index:number) {
    const recoil=Math.max(0,1-(enemy.ageMs-(enemy.lastShotAgeMs??-1000))/130)*2;
    return quantumTurretPose(enemy,enemy.definition.size,index,enemy.quantumTurretAngles?.[index]??Math.PI/2,recoil);
  }
  private fireQuantumBroadside(enemy:EnemyState,speed:number):void {
    for(let i=0;i<QUANTUM_GUN_MOUNTS.length;i++){
      const gun=this.quantumGun(enemy,i),base=gun.angle;
      for(const side of [-1,1]){
        const x=gun.muzzle.x-Math.sin(base)*side*gun.drawSize*.09,y=gun.muzzle.y+Math.cos(base)*side*gun.drawSize*.09;
        this.emitEnemyBullet(enemy,{x,y,vx:Math.cos(base+side*.12)*speed,vy:Math.sin(base+side*.12)*speed,radius:4,damage:25,hostile:true,color:'#ffac63'});
        this.combatEffects.shot(enemy,x-enemy.x,y-enemy.y,Math.cos(base),Math.sin(base),'#ffb668','red');
      }
    }
  }
  private hostileLaserPath(laser:HostileLaserState):{x:number;y:number;endX:number;endY:number} {
    const s=laser.source, p=s.definition.bossAttack==='quantum-broadside'
      ? quantumHardpoint(s,s.definition.size,laser.offsetX??0,.31)
      : {x:s.x,y:s.y+s.definition.size*.18};
    const end={x:laser.targetX,y:LOGICAL_HEIGHT+20};
    if(laser.quantum){const start=quantumAttachment(s,p,this.quantumCenterX()),e=quantumPoint(end,this.quantumCenterX());return {...start,endX:e.x,endY:e.y};}
    return {...p,endX:end.x,endY:end.y};
  }

  private triggerBossAttack(enemy: EnemyState): void {
    if(enemy.definition.bossAttack==='inferno'){
      enemy.laserCooldownMs=3200;
      const count=this.enemies.filter(e=>e.definition.tier==='normal').length;
      for(let i=0;i<Math.min(2,8-count);i++){const x=enemy.x+(i===0?-1:1)*(65+this.levelRandom()*55);this.spawnEnemy(requiredEnemyDefinition(this.levelRandom()<.5?'scout':'drone'),x,enemy.y+80);}
      return;
    }
    if(enemy.definition.bossAttack==='quantum-broadside'){
      enemy.laserCooldownMs=4600;
      for(const side of [-1,1]){
        const targetX=clampToPlayfield(this.player.x+side*110,24,480);
        for(const quantum of [false,true])this.hostileLasers.push({source:enemy,offsetX:side*.18,quantum,phase:'warning',timerMs:1200,targetX,hitPlayer:false});
      }
      return;
    }
    if(enemy.definition.bossAttack==='mirror-deploy'){
      enemy.laserCooldownMs=3600;
      const count=this.enemies.filter(e=>e.definition.id==='mirror-triangle').length;
      for(let i=0;i<Math.min(2,10-count);i++){
        const a=enemy.rotation+Math.PI/2+i*Math.PI,pad=enemy.radius+24;
        this.spawnEnemy(requiredEnemyDefinition('mirror-triangle'),Math.max(42,Math.min(438,enemy.x+Math.cos(a)*pad)),enemy.y+Math.sin(a)*pad);
      }
      this.addSparks(enemy.x,enemy.y,14,'#a9edff');return;
    }
    if (enemy.definition.bossAttack === 'asteroid-grab') {
      // Independent arm cadence is driven by actual hull health in the hazard simulation.
      enemy.laserCooldownMs = 1000; return;
    }
    if (enemy.definition.bossAttack === 'twin-bubbles') {
      enemy.laserCooldownMs = 2800;
      const color = enemy.definition.id === 'twin-red' ? 'red' : 'blue';
      if (this.enemyBullets.filter(b => b.bubbleHealth !== undefined).length >= MAX_TWIN_BUBBLES) return;
      this.enemyBullets.push({x:enemy.x,y:enemy.y+60,vx:color==='red'?32:-32,vy:85,radius:22,
        damage:35,hostile:true,color:color==='red'?'#ff415e':'#48a7ff',bubbleColor:color,bubbleHealth:TWIN_BUBBLE_HEALTH});
      this.combatEffects.shot(enemy,0,60,0,1,color==='red'?'#ff415e':'#48a7ff',color);
      return;
    }
    if (enemy.definition.bossAttack === 'laser') {
      this.startBossLaser(enemy);
      return;
    }
    if (enemy.definition.bossAttack === 'carrier-deploy') {
      enemy.laserCooldownMs = CARRIER_DEPLOY_INTERVAL_MS;
      const activeSummons = this.enemies.filter(candidate => candidate.definition.id === 'saucer' || candidate.definition.id === 'kamikaze').length;
      if (activeSummons <= 7) {
        const saucer = requiredEnemyDefinition('saucer');
        const kamikaze = requiredEnemyDefinition('kamikaze');
        this.spawnEnemy(saucer, enemy.x, enemy.y + enemy.definition.size * 0.22);
        this.spawnEnemy(kamikaze, enemy.x - 92, enemy.y + enemy.definition.size * 0.12);
        this.spawnEnemy(kamikaze, enemy.x + 92, enemy.y + enemy.definition.size * 0.12);
        enemy.deploymentWaves++;
        if (enemy.deploymentWaves % CARRIER_ELITE_WAVE_INTERVAL === 0
          && this.enemies.filter(candidate => candidate.definition.tier === 'elite').length < CARRIER_MAX_ELITES) {
          const elite = ELITE_ENEMIES[Math.floor(this.levelRandom() * ELITE_ENEMIES.length)]!;
          this.spawnEnemy(elite, enemy.x, enemy.y + enemy.definition.size * 0.3);
        }
        this.addSparks(enemy.x, enemy.y + enemy.definition.size * 0.18, 42, '#70eaff');
        this.shakeMs = Math.max(this.shakeMs, 220);
      }
      return;
    }
    if (enemy.definition.bossAttack === 'emitter-grid') {
      enemy.laserCooldownMs = 3_800;
      this.spawnHeliosEmitters(enemy);
      return;
    }
    const projectile = enemyProjectileProfile(enemy.definition);
    const add = (angle: number, speed: number, radius = 6) => this.enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.definition.size * 0.2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      damage: projectile.damage,
      hostile: true,
      color: projectile.cssColor,
    });
    if (enemy.definition.bossAttack === 'arc-storm') {
      enemy.laserCooldownMs = 4_800;
      for (let index = 0; index < 22; index++) {
        const angle = index / 22 * Math.PI * 2 + enemy.ageMs * 0.0004;
        add(angle, 128 + index % 2 * 42, 5);
      }
      const aimed = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      for (const offset of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]) add(aimed + offset, 225, 5);
      this.addSparks(enemy.x, enemy.y, 40, '#69eaff');
    } else {
      enemy.laserCooldownMs = 4_150;
      this.spiralAngle += 0.4;
      for (let arm = 0; arm < 8; arm++) {
        const angle = this.spiralAngle + arm * Math.PI / 4;
        for (let layer = 0; layer < 3; layer++) add(angle + layer * 0.1, 122 + layer * 46, 5);
      }
      this.addSparks(enemy.x, enemy.y, 46, '#d35cff');
    }
    this.shakeMs = Math.max(this.shakeMs, 300);
  }

  private spawnHeliosEmitters(boss: EnemyState): void {
    const emitterDefinition = requiredEnemyDefinition('helios-emitter');
    const desiredCount = heliosEmitterCount(boss.hitPoints, boss.definition.hitPoints);
    const activeEmitters = this.enemies.filter(enemy => enemy.definition.id === emitterDefinition.id);
    if (activeEmitters.length >= desiredCount) return;
    const slots = this.heliosSlots();
    const availableSlots = slots.filter(slot => !activeEmitters.some(emitter => (
      Math.hypot(emitter.x - slot.x, emitter.y - slot.y) < 48
    )));
    const spawnCount = Math.min(desiredCount - activeEmitters.length, availableSlots.length);
    for (let index = 0; index < spawnCount; index++) {
      const slotIndex = Math.floor(this.levelRandom() * availableSlots.length);
      const [slot] = availableSlots.splice(slotIndex, 1);
      if (!slot) continue;
      this.spawnEnemy(emitterDefinition, slot.x, slot.y);
      this.addSparks(slot.x, slot.y, 24, '#72efff');
      this.addLaserImpact(slot.x, slot.y, 42);
    }
    this.shakeMs = Math.max(this.shakeMs, 240);
  }

  private heliosSlots(): { x: number; y: number }[] {
    return [292, 420, 548].flatMap(y => [78, 186, 294, 402].map(x => ({ x, y })));
  }

  private relocateHeliosEmitter(emitter: EnemyState): void {
    const available = this.heliosSlots().filter(slot =>
      Math.hypot(slot.x - emitter.x, slot.y - emitter.y) >= 100
      && Math.hypot(slot.x - this.player.x, slot.y - this.player.y) >= 90
      && !this.enemies.some(other => other !== emitter && other.definition.id === 'helios-emitter'
        && Math.hypot(slot.x - other.x, slot.y - other.y) < 70));
    const slot = available[Math.floor(this.levelRandom() * available.length)];
    if (!slot) return;
    this.addLaserImpact(emitter.x, emitter.y, 36);
    emitter.x = emitter.originX = slot.x;
    emitter.y = slot.y;
    emitter.fireCooldownMs = enemyFireIntervalMs(emitter.definition.fireIntervalMs, this.wave);
    this.addLaserImpact(slot.x, slot.y, 42);
    this.addSparks(slot.x, slot.y, 18, '#72efff');
  }

  private startBossLaser(enemy: EnemyState): void {
    enemy.laserCooldownMs = 6_600;
    this.bossLaser = {
      phase: 'warning',
      timerMs: BOSS_LASER_WARNING_MS,
      targetX: this.player.x,
      hitPlayer: false,
    };
  }

  private updateBossLaser(deltaMs: number): void {
    const laser = this.bossLaser;
    const boss = this.boss;
    if (!laser || !boss || !this.enemies.includes(boss)) {
      this.bossLaser = null;
      return;
    }
    laser.timerMs -= deltaMs;
    if (laser.phase === 'warning' && laser.timerMs <= 0) {
      laser.phase = 'active';
      laser.timerMs = BOSS_LASER_ACTIVE_MS;
      this.shakeMs = Math.max(this.shakeMs, 320);
      this.addSparks(boss.x, boss.y + boss.definition.size * 0.28, 32, '#ff8ca6');
    }
    if (laser.phase === 'active' && !laser.hitPlayer && this.player.invulnerableMs <= 0) {
      const startY = boss.y + boss.definition.size * 0.22;
      const distance = distancePointToSegment(
        this.player.x,
        this.player.y,
        boss.x,
        startY,
        laser.targetX,
        LOGICAL_HEIGHT + 20,
      );
      if (distance <= this.player.radius + 15) {
        laser.hitPlayer = true;
        this.damagePlayer(BOSS_LASER_DAMAGE);
      }
    }
    if (laser.timerMs <= 0) this.bossLaser = null;
  }

  private startHostileLaser(source: EnemyState): void {
    this.hostileLasers.push({
      source,
      phase: 'warning',
      timerMs: HOSTILE_LASER_WARNING_MS,
      targetX: this.player.x,
      hitPlayer: false,
    });
    if(source.quantumPaired)this.hostileLasers.push({...this.hostileLasers[this.hostileLasers.length-1]!,quantum:true});
    if (this.hostileLasers.length > 12) this.hostileLasers.splice(0, this.hostileLasers.length - 12);
  }

  private updateHostileLasers(deltaMs: number): void {
    for (let index = this.hostileLasers.length - 1; index >= 0; index--) {
      const laser = this.hostileLasers[index]!;
      if (!this.enemies.includes(laser.source)) {
        this.hostileLasers.splice(index, 1);
        continue;
      }
      laser.timerMs -= deltaMs;
      if (laser.phase === 'warning' && laser.timerMs <= 0) {
        laser.phase = 'active';
        laser.timerMs = HOSTILE_LASER_ACTIVE_MS;
        this.addSparks(laser.source.x, laser.source.y, 18, '#88f5ff');
      }
      if (laser.phase === 'active' && !laser.hitPlayer && this.player.invulnerableMs <= 0) {
        const path=this.hostileLaserPath(laser);
        const distance = distancePointToSegment(this.player.x,this.player.y,path.x,path.y,path.endX,path.endY);
        if (distance <= this.player.radius + 10) {
          laser.hitPlayer = true;
          this.damagePlayer(laser.source.definition.laserDamage ?? BLUE_ENEMY_BULLET_DAMAGE);
        }
      }
      if (laser.timerMs <= 0) {
        this.hostileLasers.splice(index, 1);
        if (laser.source.definition.id === 'helios-emitter') this.relocateHeliosEmitter(laser.source);
      }
    }
  }

  private spawnWeaponPowerup(enemy: EnemyState): void {
    const initialForm: PowerupForm = enemy.definition.id === 'crimson-lance'
      ? 'red'
      : enemy.definition.id === 'prism-lancer' ? 'blue' : 'purple';
    this.powerups.push({
      x: enemy.x,
      y: enemy.y,
      baseX: enemy.x,
      ageMs: 0,
      formTimerMs: POWERUP_FORM_INTERVAL_MS,
      orbitAngle: this.random() * Math.PI * 2,
      form: initialForm,
      radius: 18,
    });
  }

  private spawnBombPowerup(enemy: {x:number;y:number}): void {
    this.bombPowerups.push({
      x: enemy.x,
      y: enemy.y,
      baseX: enemy.x,
      ageMs: 0,
      orbitAngle: this.levelRandom() * Math.PI * 2,
      radius: 19,
    });
  }

  private updatePowerups(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (let index = this.powerups.length - 1; index >= 0; index--) {
      const powerup = this.powerups[index]!;
      powerup.ageMs += deltaMs;
      powerup.formTimerMs -= deltaMs;
      powerup.orbitAngle += seconds * 2.15;
      powerup.y += 34 * seconds;
      powerup.x = clampToPlayfield(powerup.baseX + Math.sin(powerup.orbitAngle) * 27, powerup.radius, LOGICAL_WIDTH);
      if (powerup.formTimerMs <= 0) {
        powerup.form = nextPowerupForm(powerup.form);
        powerup.formTimerMs += POWERUP_FORM_INTERVAL_MS;
        this.addSparks(powerup.x, powerup.y, 18, this.powerupColor(powerup.form));
      }
      if (circlesOverlap(powerup, this.player)) {
        this.collectPowerup(powerup);
        this.powerups.splice(index, 1);
        continue;
      }
      if (powerup.y > LOGICAL_HEIGHT + 35) this.powerups.splice(index, 1);
    }
    for (let index = this.bombPowerups.length - 1; index >= 0; index--) {
      const powerup = this.bombPowerups[index]!;
      powerup.ageMs += deltaMs;
      powerup.orbitAngle += seconds * 2.8;
      powerup.y += 31 * seconds;
      powerup.x = clampToPlayfield(powerup.baseX + Math.sin(powerup.orbitAngle) * 22, powerup.radius, LOGICAL_WIDTH);
      if (circlesOverlap(powerup, this.player)) {
        this.bombs = Math.min(MAX_BOMBS, this.bombs + 1);
        this.platform.audio?.play('pickup-bomb',powerup.x);
        this.addSparks(powerup.x, powerup.y, 42, '#ffd75e');
        this.shakeMs = Math.max(this.shakeMs, 160);
        this.bombPowerups.splice(index, 1);
        continue;
      }
      if (powerup.y > LOGICAL_HEIGHT + 35) this.bombPowerups.splice(index, 1);
    }
  }

  private collectPowerup(powerup: WeaponPowerup): void {
    this.platform.audio?.play(powerup.form==='red'?'pickup-red':powerup.form==='blue'?'pickup-blue':'pickup-purple',powerup.x);
    const triggerBonusBurst = shouldTriggerMaxLevelPickupBurst(this.weaponForm, this.weaponLevel, powerup.form);
    const upgraded = upgradeWeapon(this.weaponForm, this.weaponLevel, powerup.form);
    this.weaponForm = upgraded.form;
    this.weaponLevel = upgraded.level;
    this.player.fireCooldownMs = 0;
    this.addSparks(powerup.x, powerup.y, 36, this.powerupColor(powerup.form));
    if (triggerBonusBurst) this.fireMaxLevelBonusBurst();
    this.shakeMs = Math.max(this.shakeMs, 180);
  }

  private fireMaxLevelBonusBurst(): void {
    const speed = PLAYER_BULLET_SPEED * 0.62;
    for (const velocity of createRadialBurst(MAX_LEVEL_BONUS_BULLET_COUNT, speed, -Math.PI / 2)) {
      const angle = Math.atan2(velocity.y, velocity.x);
      this.playerBullets.push({
        x: this.player.x + Math.cos(angle) * 18,
        y: this.player.y + Math.sin(angle) * 18,
        vx: velocity.x,
        vy: velocity.y,
        radius: 4,
        damage: weaponProfile('basic', 0).damage,
        hostile: false,
        color: '#70efff',
        rotation: angle + Math.PI / 2,
      });
    }
    this.addLaserImpact(this.player.x, this.player.y, 74);
    this.addSparks(this.player.x, this.player.y, 54, '#a9f8ff');
    this.shakeMs = Math.max(this.shakeMs, 260);
  }

  private powerupColor(form: PowerupForm): string {
    if (form === 'red') return '#ff4059';
    if (form === 'blue') return '#48a7ff';
    return '#c45cff';
  }

  private activateBomb(): void {
    if (this.phase !== 'playing' || this.bombs <= 0 || this.bombBlast) return;
    const area = createBombArea(this.player.x, this.player.y);
    this.bombs--;
    this.platform.haptic?.('bomb'); this.platform.audio?.play('bomb', this.player.x);
    this.bombBlast = {
      x: area.x,
      y: area.y,
      radius: area.radius,
      ageMs: 0,
      durationMs: BOMB_EFFECT_DURATION_MS,
    };
    for (let index = this.enemyBullets.length - 1; index >= 0; index--) {
      const bullet = this.enemyBullets[index]!;
      if (!isInsideBombArea(area, bullet)) continue;
      this.addSparks(bullet.x, bullet.y, 4, '#fff0a6');
      this.enemyBullets.splice(index, 1);
    }
    for (const rock of [...this.asteroids.rocks]) if (isInsideBombArea(area, rock)) this.damageAsteroid(rock, BOMB_DAMAGE);
    for (const crate of [...this.bombCrates.crates]) if (isInsideBombArea(area, crate)) this.damageBombCrate(crate, BOMB_DAMAGE);
    const hitSerpents = new Set<EnemyState>();
    for (const enemy of [...this.enemies].reverse()) {
      if (!this.enemies.includes(enemy) || !isInsideBombArea(area, enemy)) continue;
      const serpent = enemy.definition.id === 'iron-serpent' ? enemy
        : enemy.definition.segmentedPart === 'serpent-turret' ? enemy.segmentOwner : null;
      if (serpent && hitSerpents.has(serpent)) continue;
      if (serpent) hitSerpents.add(serpent);
      if (enemy.definition.directDamageImmune) this.addLaserImpact(enemy.x, enemy.y, 92);
      else this.addImpact(enemy.x, enemy.y, enemy.definition.tier === 'boss' ? 130 : 74);
      this.damageEnemy(this.enemies.indexOf(enemy), enemy, BOMB_DAMAGE, true, 'bomb');
    }
    this.addSparks(area.x, area.y, 120, '#ffe672');
    this.player.invulnerableMs = Math.max(this.player.invulnerableMs, 850);
    this.shakeMs = Math.max(this.shakeMs, 920);
    this.syncHud();
  }

  private updateBombBlast(deltaMs: number): void {
    if (!this.bombBlast) return;
    this.bombBlast.ageMs += deltaMs;
    const progress = Math.min(1, this.bombBlast.ageMs / this.bombBlast.durationMs);
    const activeArea = {
      x: this.bombBlast.x,
      y: this.bombBlast.y,
      radius: this.bombBlast.radius * (1 - (1 - progress) ** 3),
    };
    for (let index = this.enemyBullets.length - 1; index >= 0; index--) {
      const bullet = this.enemyBullets[index]!;
      if (!isInsideBombArea(activeArea, bullet)) continue;
      this.addSparks(bullet.x, bullet.y, 3, '#fff0a6');
      this.enemyBullets.splice(index, 1);
    }
    if (this.bombBlast.ageMs >= this.bombBlast.durationMs) this.bombBlast = null;
  }

  private updateTwins(deltaMs: number): void {
    if (!this.twins || this.twinReviveMs <= 0) return;
    this.twinReviveMs = Math.max(0, this.twinReviveMs - deltaMs);
    if (this.twinReviveMs > 0) return;
    for (const twin of this.twins) if (twin.hitPoints <= 0) {
      twin.hitPoints = twin.definition.hitPoints * TWIN_REVIVE_HEALTH_RATIO;
      twin.fireCooldownMs = 700; twin.laserCooldownMs = 1500;
      this.addLaserImpact(twin.x,twin.y,100);
    }
    this.boss = this.twins[0];
  }

  private damageBubble(bubble: Bullet, damage: number): void {
    if (bubble.bubbleHealth === undefined) return;
    bubble.bubbleHealth -= Math.max(0,damage);
    this.addSparks(bubble.x,bubble.y,4,bubble.color);
    if (bubble.bubbleHealth <= 0) {
      const index=this.enemyBullets.indexOf(bubble);
      if(index>=0)this.enemyBullets.splice(index,1);
      this.addLaserImpact(bubble.x,bubble.y,35);
    }
  }

  private resolveBubbleCollisions(): void {
    const bubbles=this.enemyBullets.filter(b=>b.bubbleHealth!==undefined);
    for(let i=0;i<bubbles.length;i++) {
      const a=bubbles[i]!;if(!this.enemyBullets.includes(a))continue;
      for(let j=i+1;j<bubbles.length;j++) {
        const b=bubbles[j]!;
        if(a.bubbleColor===b.bubbleColor || !this.enemyBullets.includes(b) || !circlesOverlap(a,b))continue;
        this.enemyBullets.splice(this.enemyBullets.indexOf(a),1);
        this.enemyBullets.splice(this.enemyBullets.indexOf(b),1);
        const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
        this.addLaserImpact(x,y,TWIN_BUBBLE_BLAST_RADIUS*1.4);
        this.addImpact(x,y,180);this.addSparks(x,y,60,'#ce8dff');this.shakeMs=Math.max(this.shakeMs,550);
        if(Math.hypot(this.player.x-x,this.player.y-y)<=TWIN_BUBBLE_BLAST_RADIUS+this.player.radius)
          this.damagePlayer(TWIN_BUBBLE_BLAST_DAMAGE);
        break;
      }
    }
  }

  private updateBullets(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (const collection of [this.playerBullets, this.enemyBullets]) {
      for (let index = collection.length - 1; index >= 0; index--) {
        const bullet = collection[index]!;
        if(bullet.quantumOwner&&!this.enemies.includes(bullet.quantumOwner)){collection.splice(index,1);continue;}
        if(bullet.lifeMs!==undefined){bullet.lifeMs-=deltaMs;if(bullet.lifeMs<=0){collection.splice(index,1);continue;}}
        if(bullet.crystalShard)bullet.rotation=(bullet.rotation??0)+deltaMs*.003;
        this.blackHole.bend(bullet,deltaMs);
        bullet.previousX = bullet.x; bullet.previousY = bullet.y;
        bullet.x += bullet.vx * seconds;
        bullet.y += bullet.vy * seconds;
        if (bullet.y < -30 || bullet.y > LOGICAL_HEIGHT + 30 || bullet.x < -30 || bullet.x > LOGICAL_WIDTH + 30) {
          collection.splice(index, 1);
        }
      }
    }
  }

  private updateAsteroids(deltaMs: number): void {
    const belt = this.levels[this.levelIndex]?.asteroidBelt;
    const miner = this.boss?.definition.bossAttack === 'asteroid-grab' ? this.boss : null;
    const active = !!belt && this.levelAdvanceMs <= 0 && (!!miner || (this.levelElapsedMs >= belt.startMs && this.levelElapsedMs < belt.endMs));
    this.asteroids.update(deltaMs, active, miner ? belt?.bossIntervalMs ?? 420 : belt?.intervalMs ?? 520, miner, this.player);
  }

  private updateBlackHole(deltaMs:number):void {
    const hole=this.blackHole;if(hole.phase==='inactive'||hole.phase==='spent')return;
    const detonate=hole.update(deltaMs);
    if(hole.feeding){
      this.holeSpawnMs-=deltaMs;
      if(this.holeSpawnMs<=0&&this.enemies.length<20){
        const ids=['scout','dart','drone','bomber'];this.holeSpawnCount++;
        this.spawnEnemy(requiredEnemyDefinition(ids[this.holeSpawnCount%ids.length]!),this.holeSpawnCount%2?24:456);
        this.holeSpawnMs=1450;
      }
      for(const collection of [this.playerBullets,this.enemyBullets])for(let i=collection.length-1;i>=0;i--){
        const b=collection[i]!;if(hole.contains(b)){hole.absorb(1);collection.splice(i,1);}
      }
      for(let i=this.enemies.length-1;i>=0;i--){const e=this.enemies[i]!;if(e.definition.id==='black-hole')continue;
        if(hole.contains(e)){hole.absorb(12+e.definition.size*.12);this.enemies.splice(i,1);this.addSparks(e.x,e.y,8,'#b98dff');}
      }
      for(const r of [...this.asteroids.rocks]){const force=hole.force(r.x,r.y);r.x+=force.x*deltaMs/1000;r.y+=force.y*deltaMs/1000;
        if(hole.contains(r)){hole.absorb(8+r.size*r.size*.003);this.asteroids.remove(r);}
      }
      if(hole.contains(this.player))this.damagePlayer(100);
    }
    if(detonate){
      const boss=this.boss;
      if(boss?.definition.id==='black-hole'){
        this.enemies.splice(this.enemies.indexOf(boss),1);this.boss=null;this.bossesDefeated++;
        this.score+=boss.definition.score;this.highScore=Math.max(this.highScore,this.score);
        this.platform.haptic?.('boss-defeated');this.platform.audio?.play('explosion-boss',hole.x);
      }
      for(const list of [this.enemies,this.playerBullets,this.enemyBullets,this.powerups,this.bombPowerups]){
        for(let i=list.length-1;i>=0;i--)if(hole.inBlast(list[i]!))list.splice(i,1);
      }
      for(const r of [...this.asteroids.rocks])if(hole.inBlast(r))this.asteroids.remove(r);
      this.bombCrates.clear();this.hostileLasers.length=0;this.laserTarget=null;
      this.combatEffects.detonate(hole.x,hole.y,360);this.addSparks(hole.x,hole.y,90,'#bcefff');
      this.levelAdvanceMs=3600;
      if(hole.inBlast(this.player))this.damagePlayer(100);
    }
  }

  private damageAsteroid(rock: Asteroid, damage: number): void {
    const broken = this.asteroids.damage(rock, damage);
    this.addSparks(rock.x, rock.y, broken ? 18 : 3, '#c4a179');
    if (broken) { this.platform.audio?.play('explosion-small', rock.x); this.addImpact(rock.x, rock.y, rock.size * 0.75); this.addDebris(rock.x, rock.y, 8, rock.size, 'normal'); }
  }

  private damageBombCrate(crate: BombCrate, damage: number): void {
    if(!this.bombCrates.crates.includes(crate))return;
    const broken=this.bombCrates.damage(crate,damage);
    this.addSparks(crate.x,crate.y,broken?28:5,'#ffd568');
    if(broken){this.spawnBombPowerup(crate);this.addImpact(crate.x,crate.y,48);this.platform.audio?.play('explosion-small',crate.x);}
  }

  private resolveCollisions(): void {
    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const bullet = this.playerBullets[i]!;
      let target: EnemyState | Bullet | Asteroid | BombCrate | null = null, first = Infinity;
      const consider = (candidate: EnemyState | Bullet | Asteroid | BombCrate) => {
        const t = 'definition' in candidate&&candidate.definition.mirrorSides ? mirrorHit({x:bullet.previousX??bullet.x,y:bullet.previousY??bullet.y},bullet,this.mirrorHull(candidate),bullet.radius)?.t??null : sweptCircleTime(bullet, candidate);
        if (t !== null && t < first) { first = t; target = candidate; }
      };
      for (const rock of this.asteroids.rocks) consider(rock);
      for (const crate of this.bombCrates.crates) consider(crate);
      for (const bubble of this.enemyBullets) if (bubble.bubbleHealth !== undefined) consider(bubble);
      for (const enemy of this.enemies) if (enemy.hitPoints > 0 && enemy.definition.id!=='black-hole') consider(enemy);
      if (!target) continue;
      const hit = target as EnemyState | Bullet | Asteroid | BombCrate;
      if ('kind' in hit) {if(hit.kind==='bomb-crate')this.damageBombCrate(hit,bullet.damage);else this.damageAsteroid(hit, bullet.damage);}
      else if ('hostile' in hit) this.damageBubble(hit, bullet.damage);
      else if(hit.definition.mirrorSides)this.reflectProjectile(hit,bullet);
      else {
        this.addSparks(bullet.x, bullet.y, 7, hit.definition.directDamageImmune ? '#82efff' : '#ffbd62');
        this.addImpact(bullet.x, bullet.y, hit.definition.tier === 'boss' ? 58 : 42);
        this.damageEnemy(this.enemies.indexOf(hit), hit, bullet.damage);
      }
      this.playerBullets.splice(i, 1);
    }
    // Losing a life can clear part of this array; snapshot identities keep traversal valid.
    // Neutral cover still intercepts hostile fire during player invulnerability.
    for (const bullet of [...this.enemyBullets].reverse()) {
      const i = this.enemyBullets.indexOf(bullet);
      if (i < 0) continue;
      let rock: Asteroid | null = null, first = Infinity;
      for (const candidate of this.asteroids.rocks) {
        const t = sweptCircleTime(bullet, candidate);
        if (t !== null && t < first) { first = t; rock = candidate; }
      }
      const playerHit = this.player.invulnerableMs <= 0 ? sweptCircleTime(bullet, this.player) : null;
      if (rock && (playerHit === null || first <= playerHit)) {
        this.damageAsteroid(rock, bullet.damage); this.enemyBullets.splice(i, 1);
      } else if (playerHit !== null) { this.enemyBullets.splice(i, 1); this.damagePlayer(bullet.damage); }
    }
    if (this.player.invulnerableMs > 0) return;
    for (const rock of this.asteroids.rocks) if (sweptCircleTime(rock, this.player) !== null) {
      this.damageAsteroid(rock, rock.health); this.damagePlayer(ASTEROID_CONTACT_DAMAGE); return;
    }

    for(const owner of this.enemies){
      if(!owner.quantumPaired||owner.hitPoints<=0)continue;
      const ghost=quantumPose(owner,this.quantumCenterX());
      if(circlesOverlap({...ghost,radius:owner.radius},this.player)){this.damagePlayer(owner.definition.tier==='boss'?70:35);return;}
    }
    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
      const enemy = this.enemies[enemyIndex]!;
      if (enemy.hitPoints <= 0) continue;
      const radius = enemy.definition.size * 0.25;
      if (circlesOverlap({ x: enemy.x, y: enemy.y, radius }, this.player)) {
        const contactDamage = enemy.definition.contactDamage ?? PLAYER_MAX_HEALTH;
        if (enemy.definition.contactDamage !== undefined) {
          if (enemy.definition.damageProxyMultiplier
            || enemy.definition.segmentedPart === 'train-head'
            || enemy.definition.segmentedPart === 'train-car') {
            this.damageEnemy(enemyIndex, enemy, enemy.hitPoints);
          } else {
            this.enemies.splice(enemyIndex, 1);
          }
          this.addImpact(enemy.x, enemy.y, 96);
          this.addSparks(enemy.x, enemy.y, 48, '#ff742f');
        }
        this.damagePlayer(contactDamage);
        return;
      }
    }
  }

  private destroyEnemy(index: number, enemy: EnemyState, suppressDeathBurst = false): void {
    if (this.twins?.includes(enemy)) {
      if (enemy.hitPoints > 0) enemy.hitPoints = 0;
      if (this.twins.every(twin => twin.hitPoints <= 0)) {
        const pair = this.twins; this.twins = null; this.twinReviveMs = 0;
        this.boss = pair[1];
        for (const twin of pair) this.destroyEnemy(this.enemies.indexOf(twin), twin, suppressDeathBurst);
      } else if (this.twinReviveMs <= 0) {
        this.twinReviveMs = TWIN_REVIVE_WINDOW_MS;
        this.addEnemyDestructionEffects(enemy); this.combatEffects.detonate(enemy.x, enemy.y, enemy.definition.size);
        this.boss = this.twins.find(twin => twin.hitPoints > 0)!;
      }
      return;
    }
    const actualIndex = this.enemies[index] === enemy ? index : this.enemies.indexOf(enemy);
    if (actualIndex < 0) return;
    this.flames.detach(enemy);
    this.enemies.splice(actualIndex, 1);
    if(enemy.quantumPaired){
      const ghost=quantumPose(enemy,this.quantumCenterX());this.addSparks(ghost.x,ghost.y,28,'#62baff');
      for(let i=this.enemyBullets.length-1;i>=0;i--)if(this.enemyBullets[i]!.quantumOwner===enemy)this.enemyBullets.splice(i,1);
    }
    if(this.mirrorLaser?.source===enemy)this.mirrorLaser=null;
    for (let laserIndex = this.hostileLasers.length - 1; laserIndex >= 0; laserIndex--) {
      if (this.hostileLasers[laserIndex]?.source === enemy) this.hostileLasers.splice(laserIndex, 1);
    }
    if(enemy.definition.mirrorSides){this.addSparks(enemy.x,enemy.y,35,'#bcf5ff');this.addDebris(enemy.x,enemy.y,18,enemy.definition.size,'normal');}
    if (enemy.definition.splitsInto) {
      for (const side of [-1, 1]) {
        const child = this.spawnEnemy(requiredEnemyDefinition(enemy.definition.splitsInto), enemy.x + side * 38, enemy.y + 18);
        child.fireCooldownMs = 650;
      }
    }
    if (!suppressDeathBurst && enemy.definition.deathBurstCount) this.fireDeathBurst(enemy);
    if (enemy.definition.segmentedPart === 'serpent-turret') {
      this.compactSerpentSegments(enemy.segmentOwner);
    }
    this.score += enemy.definition.score;
    this.highScore = Math.max(this.highScore, this.score);
    this.addEnemyDestructionEffects(enemy);
    this.shakeMs = Math.max(this.shakeMs, enemy.definition.tier === 'boss' ? 900 : 180);
    if (enemy.definition.tier === 'boss') this.combatEffects.detonate(enemy.x, enemy.y, enemy.definition.size);
    if (enemy.definition.tier !== 'boss') this.platform.audio?.play(enemy.definition.tier === 'elite' ? 'explosion-large' : 'explosion-small', enemy.x);
    if (enemy.definition.tier === 'elite') { this.spawnWeaponPowerup(enemy); this.platform.haptic?.('elite-defeated'); }
    if (enemy.definition.tier === 'elite' && this.levelRandom() < 0.45) this.spawnBombPowerup(enemy);
    if (enemy.definition.tier === 'boss') this.spawnBombPowerup(enemy);
    if (this.boss === enemy) {
      this.platform.haptic?.('boss-defeated'); this.platform.audio?.play('explosion-boss', enemy.x);
      if (enemy.definition.bossAttack === 'asteroid-grab') this.asteroids.clear();
      this.bombCrates.clear();
      if (enemy.definition.bossAttack === 'emitter-grid') this.removeHeliosEmitters();
      if (enemy.definition.bossAttack === 'serpent-barrage') this.removeIronSerpentSegments();
      this.boss = null;
      this.twins = null; this.twinReviveMs = 0;
      this.bossLaser = null;
      this.bossesDefeated++;
      this.levelAdvanceMs = Math.max(LEVEL_ADVANCE_DELAY_MS,...this.flames.charges.map(c=>c.remainingMs+300));
      this.enemyBullets.length = 0;
      if(enemy.definition.id==='crystal-prism'){this.enemyBullets.push(...prismShards(enemy.x,enemy.y,enemy.rotation));this.levelAdvanceMs=PRISM_SHARD_STORM_MS;}
      this.saveProgress();
    }
  }

  private damageEnemy(index: number, enemy: EnemyState, damage: number, suppressDeathBurst = false, source: 'weapon' | 'bomb' = 'weapon'): boolean {
    if (!this.enemies.includes(enemy) || enemy.hitPoints <= 0) return true;
    if(enemy.definition.id==='black-hole'||enemy.definition.mirrorSides)return false;
    const boss = this.boss;
    const bossScale = source === 'bomb' ? BOSS_BOMB_DAMAGE_MULTIPLIER : 1;
    if (boss?.definition.id === 'iron-serpent'
      && (enemy === boss || enemy.segmentOwner === boss)) {
      const totalDamage = Math.max(0, Number.isFinite(damage) ? damage : 0) * bossScale;
      const parts = this.enemies.filter(part => part.segmentOwner === boss && part.hitPoints > 0);
      const shares = shareSerpentDamage(totalDamage, parts.map(part => part.hitPoints));
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        part.hitPoints -= shares[i]!;
        if (shares[i]! > 0) this.addLaserImpact(part.x, part.y, 22);
        if (part.hitPoints <= 1e-8) this.destroyEnemy(this.enemies.indexOf(part), part, suppressDeathBurst);
      }
      // Body HP is distributed armor; the boss pool receives this hit exactly once.
      boss.hitPoints -= totalDamage;
      if (boss.hitPoints <= 0) this.destroyEnemy(this.enemies.indexOf(boss), boss, suppressDeathBurst);
      return !this.enemies.includes(enemy);
    }
    const resolvedDamage = resolveEnemyDamage(enemy.definition, damage * (enemy.definition.tier === 'boss' ? bossScale : source === 'bomb' && enemy.definition.tier === 'elite' ? 0.5 : 1));
    if (resolvedDamage.targetDamage <= 0) return false;
    const effectiveDamage = Math.min(resolvedDamage.targetDamage, Math.max(0, enemy.hitPoints));
    enemy.hitPoints -= effectiveDamage;
    if (resolvedDamage.relayedBossDamage > 0
      && boss
      && enemy.definition.damageProxyBossAttack === boss.definition.bossAttack) {
      const relayedDamage = effectiveDamage * (enemy.definition.damageProxyMultiplier ?? 0) * bossScale;
      boss.hitPoints -= relayedDamage;
      this.addLaserImpact(boss.x, boss.y, 30 + Math.min(28, relayedDamage * 0.08));
      this.addSparks(boss.x, boss.y, 5, '#7cecff');
    }
    if (enemy.hitPoints <= 0) this.destroyEnemy(index, enemy, suppressDeathBurst);
    if (boss && boss.hitPoints <= 0 && this.enemies.includes(boss)) {
      this.destroyEnemy(this.enemies.indexOf(boss), boss);
    }
    return !this.enemies.includes(enemy);
  }

  private removeHeliosEmitters(): void {
    for (let index = this.enemies.length - 1; index >= 0; index--) {
      if (this.enemies[index]?.definition.id === 'helios-emitter') this.enemies.splice(index, 1);
    }
    for (let index = this.hostileLasers.length - 1; index >= 0; index--) {
      if (this.hostileLasers[index]?.source.definition.id === 'helios-emitter') this.hostileLasers.splice(index, 1);
    }
  }

  private compactSerpentSegments(owner: EnemyState | null): void {
    if (!owner) return;
    const segments = this.enemies
      .filter(candidate => candidate.segmentOwner === owner && candidate.definition.segmentedPart === 'serpent-turret')
      .sort((left, right) => left.segmentOrder - right.segmentOrder);
    segments.forEach((segment, index) => {
      segment.segmentOrder = index + 1;
    });
  }

  private removeIronSerpentSegments(): void {
    for (let index = this.enemies.length - 1; index >= 0; index--) {
      if (this.enemies[index]?.definition.segmentedPart === 'serpent-turret') this.enemies.splice(index, 1);
    }
    for (let index = this.hostileLasers.length - 1; index >= 0; index--) {
      if (this.hostileLasers[index]?.source.definition.segmentedPart === 'serpent-turret') {
        this.hostileLasers.splice(index, 1);
      }
    }
  }

  private fireDeathBurst(enemy: EnemyState): void {
    const count = enemy.definition.deathBurstCount ?? 0;
    const projectile = enemyProjectileProfile(enemy.definition);
    for (const velocity of createRadialBurst(count, ENEMY_BULLET_SPEED * 0.92, enemy.phaseOffset)) {
      this.enemyBullets.push({
        x: enemy.x,
        y: enemy.y,
        vx: velocity.x,
        vy: velocity.y,
        radius: 5,
        damage: projectile.damage,
        hostile: true,
        color: '#42e7df',
      });
    }
    this.addSparks(enemy.x, enemy.y, 34, '#55fff1');
    this.shakeMs = Math.max(this.shakeMs, 240);
  }

  private updateFlames(deltaMs:number):void {
    const step=this.flames.update(deltaMs,this.enemies,this.player,this.flameProtectionMs>0);
    if(step.damage>0)this.damagePlayer(step.damage,true);
    for(const blast of step.explosions){
      if(this.phase!=='playing')break;
      this.addImpact(blast.x,blast.y,blast.radius*2);this.addSparks(blast.x,blast.y,45,'#ff8d35');
      this.platform.audio?.play('explosion-large',blast.x);this.shakeMs=Math.max(this.shakeMs,320);
      if(Math.hypot(this.player.x-blast.x,this.player.y-blast.y)<=blast.radius+this.player.radius)this.damagePlayer(IGNITION_DAMAGE);
      for(const e of [...this.enemies]){
        if(e===blast.source)this.destroyEnemy(this.enemies.indexOf(e),e,true);
        else if(Math.hypot(e.x-blast.x,e.y-blast.y)<=blast.radius+e.radius)this.damageEnemy(this.enemies.indexOf(e),e,IGNITION_DAMAGE);
      }
    }
  }

  private damagePlayer(damage: number, continuous=false): void {
    if ((continuous?this.flameProtectionMs>0:this.player.invulnerableMs>0) || this.phase !== 'playing') return;
    const previousHealth = this.player.health;
    this.player.health = Math.max(0, this.player.health - Math.max(0, damage));
    if (this.player.health < previousHealth && (!continuous || this.player.health<=0)) {
      this.platform.haptic?.(this.player.health <= 0 ? 'player-destroyed' : 'player-hit');
      this.platform.audio?.play(this.player.health <= 0 ? 'explosion-large' : 'hit', this.player.x);
    }
    if(!continuous){
    this.shakeMs = damage >= BOSS_LASER_DAMAGE ? 760 : 420;
    this.addSparks(this.player.x, this.player.y, damage >= BLUE_ENEMY_BULLET_DAMAGE ? 54 : 34, '#ff9a49');
    this.addImpact(this.player.x, this.player.y - 6, damage >= BLUE_ENEMY_BULLET_DAMAGE ? 96 : 72);
    }
    if (this.player.health > 0) {
      if(!continuous)this.player.invulnerableMs = 520;
      return;
    }
    this.flames.clearBurn();this.flameProtectionMs=1800;
    this.player.lives--;
    if (this.player.lives <= 0) {
      this.finishSortie();
      return;
    }
    this.player.health = PLAYER_MAX_HEALTH;
    this.player.x=240;this.player.y=842;this.pointerTarget=null;
    this.player.invulnerableMs = 1_800;
    this.enemyBullets.splice(0, Math.floor(this.enemyBullets.length * 0.55));
  }

  private finishSortie(): void {
    this.flames.clear();
    this.mirrorLaser=null;this.blackHole.reset();this.pointerTarget=null;
    this.bombCrates.clear();
    this.platform.audio?.stopLasers();
    this.phase = 'game-over';
    this.highScore = Math.max(this.highScore, this.score);
    this.ui.pauseState(false, true);
    this.saveProgress();
    this.hideStatus();
    this.levelCarousel?.show(this.levelIndex, true);
  }

  private saveProgress(): void {
    this.saves.save({
      highScore: this.highScore,
      bestWave: this.bestWave,
      sorties: this.sorties,
      bossesDefeated: this.bossesDefeated,
    });
  }

  private addSparks(x: number, y: number, count: number, color: string): void {
    for (let index = 0; index < count; index++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 30 + this.random() * 220;
      const lifeMs = 180 + this.random() * 620;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        lifeMs,
        maxLifeMs: lifeMs,
        size: 1 + this.random() * 4,
        color,
      });
    }
    if (this.sparks.length > 360) this.sparks.splice(0, this.sparks.length - 360);
  }

  private updateBossDamageEffects(enemy: EnemyState, deltaMs: number): void {
    const intensity = bossCriticalDamageIntensity(enemy.hitPoints, enemy.definition.hitPoints);
    if (!enemy.entered || intensity <= 0) {
      enemy.damageEffectCooldownMs = 0;
      return;
    }
    enemy.damageEffectCooldownMs -= deltaMs;
    if (enemy.damageEffectCooldownMs > 0) return;
    const x = enemy.x + (this.levelRandom() - 0.5) * enemy.definition.size * 0.58;
    const y = enemy.y + (this.levelRandom() - 0.5) * enemy.definition.size * 0.42;
    this.addImpact(x, y, 30 + intensity * 30);
    this.addSparks(x, y, 4 + Math.round(intensity * 5), intensity > 0.62 ? '#ff492d' : '#ffb13d');
    enemy.damageEffectCooldownMs = 430 - intensity * 205 + this.levelRandom() * 110;
  }

  private addEnemyDestructionEffects(enemy: EnemyState): void {
    const tier = enemy.definition.tier;
    const mainSize = tier === 'boss'
      ? enemy.definition.size * 0.9
      : tier === 'elite' ? enemy.definition.size * 1.25 : Math.max(76, enemy.definition.size * 1.35);
    const secondaryCount = tier === 'boss' ? 8 : tier === 'elite' ? 4 : 2;
    const sparkCount = tier === 'boss' ? 120 : tier === 'elite' ? 62 : 34;
    const debrisCount = tier === 'boss' ? 30 : tier === 'elite' ? 17 : 9;
    this.addImpact(enemy.x, enemy.y, mainSize);
    for (let index = 0; index < secondaryCount; index++) {
      const angle = this.random() * Math.PI * 2;
      const distance = enemy.definition.size * (0.12 + this.random() * 0.32);
      this.addImpact(
        enemy.x + Math.cos(angle) * distance,
        enemy.y + Math.sin(angle) * distance,
        mainSize * (0.32 + this.random() * 0.28),
      );
    }
    this.addSparks(enemy.x, enemy.y, sparkCount, tier === 'boss' ? '#ff365f' : '#ffc15a');
    this.addSparks(enemy.x, enemy.y, Math.ceil(sparkCount * 0.45), '#fff2ae');
    this.addDebris(enemy.x, enemy.y, debrisCount, enemy.definition.size, tier);
  }

  private addDebris(x: number, y: number, count: number, sourceSize: number, tier: EnemyDefinition['tier']): void {
    const colors = tier === 'boss'
      ? ['#812e42', '#e25349', '#5e2635']
      : tier === 'elite' ? ['#733b91', '#d16bcb', '#482a64'] : ['#788697', '#d57042', '#3f4b5d'];
    for (let index = 0; index < count; index++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 70 + this.random() * (tier === 'boss' ? 280 : 210);
      const lifeMs = 520 + this.random() * 720;
      this.debris.push({
        x: x + (this.random() - 0.5) * sourceSize * 0.24,
        y: y + (this.random() - 0.5) * sourceSize * 0.2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: this.random() * Math.PI * 2,
        angularVelocity: (this.random() - 0.5) * 12,
        lifeMs,
        maxLifeMs: lifeMs,
        size: 4 + this.random() * Math.max(5, sourceSize * 0.07),
        color: colors[Math.floor(this.random() * colors.length)] ?? colors[0]!,
      });
    }
    if (this.debris.length > 140) this.debris.splice(0, this.debris.length - 140);
  }

  private addLaserImpact(x: number, y: number, size: number): void {
    this.energyImpacts.push({
      x,
      y,
      ageMs: 0,
      durationMs: 260,
      size,
      rotation: this.random() * Math.PI * 2,
    });
    if (this.energyImpacts.length > 36) this.energyImpacts.splice(0, this.energyImpacts.length - 36);
  }

  private addImpact(x: number, y: number, size: number): void {
    this.impacts.push({
      x,
      y,
      ageMs: 0,
      durationMs: 440 + this.levelRandom() * 260,
      size,
      rotation: (this.levelRandom() - 0.5) * 0.75,
    });
    if (this.impacts.length > 48) this.impacts.splice(0, this.impacts.length - 48);
  }

  private updateImpacts(deltaMs: number): void {
    for (let index = this.impacts.length - 1; index >= 0; index--) {
      const impact = this.impacts[index]!;
      impact.ageMs += deltaMs;
      impact.y -= deltaMs * 0.012;
      if (impact.ageMs >= impact.durationMs) this.impacts.splice(index, 1);
    }
  }

  private updateEnergyImpacts(deltaMs: number): void {
    for (let index = this.energyImpacts.length - 1; index >= 0; index--) {
      const impact = this.energyImpacts[index]!;
      impact.ageMs += deltaMs;
      if (impact.ageMs >= impact.durationMs) this.energyImpacts.splice(index, 1);
    }
  }

  private updateDebris(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (let index = this.debris.length - 1; index >= 0; index--) {
      const fragment = this.debris[index]!;
      fragment.lifeMs -= deltaMs;
      fragment.x += fragment.vx * seconds;
      fragment.y += fragment.vy * seconds;
      fragment.vy += 86 * seconds;
      fragment.rotation += fragment.angularVelocity * seconds;
      fragment.vx *= 0.985;
      if (fragment.lifeMs <= 0) this.debris.splice(index, 1);
    }
  }

  private updateSparks(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (let index = this.sparks.length - 1; index >= 0; index--) {
      const spark = this.sparks[index]!;
      spark.lifeMs -= deltaMs;
      spark.x += spark.vx * seconds;
      spark.y += spark.vy * seconds;
      spark.vx *= 0.975;
      spark.vy *= 0.975;
      if (spark.lifeMs <= 0) this.sparks.splice(index, 1);
    }
  }

  private currentBackground(): LevelBackground {
    const p = Math.min(1, this.backgroundTransitionMs / BACKGROUND_TRANSITION_MS);
    return mixLevelBackground(this.backgroundFrom, this.backgroundTo, p * p * (3 - 2 * p));
  }
  private render(): void {
    this.battle.setBlackHole(this.blackHole.phase==='inactive'||this.blackHole.phase==='spent'?null:this.blackHole.snapshot());
    const shake = this.shakeMs > 0 ? Math.min(7, this.shakeMs / 90) : 0;
    // Visual jitter does not consume the combat random stream.
    const blast = this.combatEffects.shake();
    this.battle.begin(this.player.x, blast.x + Math.sin(this.elapsedMs * 0.071) * shake, blast.y + Math.cos(this.elapsedMs * 0.093) * shake);
    this.drawSpace();
    if (this.phase === 'ready' || this.phase === 'game-over') return;
    this.drawBossWarning(); this.drawBullets(this.playerBullets);
    this.drawSerpentLinks();
    if (this.boss?.definition.bossAttack === 'asteroid-grab') drawMiningArms(this.battle, this.asteroids, this.boss);
    this.drawEnemies(); this.drawQuantumEnemies(); drawAsteroids(this.battle, this.asteroids); this.drawBombCrates(); this.drawPowerups(); this.drawPlayerLaser();
    this.drawBossLaser(); this.drawHostileLasers();
    drawFlames(this.battle,this.flames.cones,this.flames.charges,this.player,this.flames.burnMs,this.elapsedMs); this.drawPlayer(); this.drawBullets(this.enemyBullets);
    this.drawImpacts(); this.drawEnergyImpacts(); this.drawDebris(); this.drawBombBlast(); this.drawSparks(); this.combatEffects.draw(this.battle);
  }
  private drawSpace(): void {
    const b = this.currentBackground(), r = this.battle;
    r.rect(240,480,520,1000,b.bottom);
    r.sprite('fx:fade',240,270,520,560,0,1,b.top);
    r.glow(260,440,550,b.middle,0.8); r.glow(80,340,340,b.nebula,0.5);
    if (this.phase === 'ready' || this.phase === 'game-over') r.sprite('assets/gui-space.png',240,480,480,960);
    else this.spaceBackdrop.draw(r, skyStrikeViewport(this.engine.displayWidth, this.engine.displayHeight, this.player.x).cameraX, this.player.x);
    for (const s of this.stars) r.rect(s.x,s.y,s.size,s.size*(1+s.speed/40),s.color,s.alpha*0.6);
  }
  private drawBossWarning(): void {
    if (this.bossWarningProgress <= 0) return;
    const intensity = Math.sin(this.bossWarningProgress*Math.PI*3)**2*(0.3+this.bossWarningProgress*0.7);
    for (const x of [0,480]) { this.battle.glow(x,480,540,'#ff2323',intensity*0.65); this.battle.rect(x,480,5,960,'#ff6950',intensity); }
  }
  private drawEnemies(): void {
    for (const segment of this.enemies.filter(e=>e.definition.segmentedPart==='serpent-turret').sort((a,b)=>b.segmentOrder-a.segmentOrder)) this.drawIronSerpentTurret(segment);
    for (const enemy of this.enemies) {
      const d = enemy.definition, r = this.battle;
      if(d.id==='black-hole')continue;
      if(d.mirrorSides){this.drawMirror(enemy);continue;}
      if (d.id === 'helios-emitter') { this.drawHeliosEmitter(enemy); continue; }
      if (d.segmentedPart === 'train-car') { this.drawSpaceTrainCar(enemy); continue; }
      if (d.segmentedPart === 'serpent-turret') continue;
      if(enemy.hitPoints<=0) { r.sprite(d.sprite,enemy.x,enemy.y,d.size,d.size,enemy.rotation,0.22);r.ring(enemy.x,enemy.y,d.size*0.45,enemy.definition.id==='twin-red'?'#ff415e':'#48a7ff',0.7);continue; }
      const w=d.size, h=w*(d.renderAspect??(d.tier==='boss'?1.18:1.3));
      if (d.tier==='boss'||d.tier==='elite') r.glow(enemy.x,enemy.y,w*0.75,d.tier==='boss'?'#ff244f':'#b455ff',0.3);
      drawShipDetails(r,enemy,this.player,true);
      r.sprite(d.sprite,enemy.x,enemy.y,w,h,enemy.rotation);
      drawShipDetails(r,enemy,this.player,false);
      if(d.flameStyle){const intensity=.3+.25*Math.sin(enemy.ageMs*.009);r.glow(enemy.x,enemy.y-w*.075,w*.10,'#ff871f',intensity);}
      if(d.bossAttack==='quantum-broadside')this.drawQuantumTurrets(enemy,false);
      if (d.directDamageImmune) r.ring(enemy.x,enemy.y,w*0.54,'#69e8ff',0.35+Math.sin(this.elapsedMs*0.006)*0.12,h/w*0.88,enemy.rotation);
    }
  }
  private drawQuantumTurrets(e:EnemyState,ghost:boolean):void {
    const r=this.battle,center=this.quantumCenterX();
    this.drawQuantumCore(e,ghost);
    for(let i=0;i<QUANTUM_GUN_MOUNTS.length;i++){
      const gun=this.quantumGun(e,i),p=ghost?quantumAttachment(e,gun.center,center):gun.center;
      const angle=ghost?Math.PI-gun.angle:gun.angle;
      r.sprite(ghost?`quantum:${QUANTUM_TURRET_SPRITE}`:QUANTUM_TURRET_SPRITE,p.x,p.y,gun.drawSize,gun.drawSize,angle+Math.PI/2,ghost?.52:1);
      const flash=Math.max(0,1-(e.ageMs-(e.lastShotAgeMs??-1000))/130),tip=ghost?quantumAttachment(e,gun.muzzle,center):gun.muzzle;
      r.glow(tip.x,tip.y,18,ghost?'#49bdff':'#ffb655',flash*(ghost?.45:.8));
    }
  }
  private drawQuantumCore(e:EnemyState,ghost:boolean):void {
    const r=this.battle,state=quantumCoreState(e.ageMs,e.hitPoints,e.definition.hitPoints),w=e.definition.size;
    const source=quantumHardpoint(e,w,0,-.042),p=ghost?quantumAttachment(e,source,this.quantumCenterX()):source;
    const color=ghost&&!state.critical?'#55caff':state.color,alpha=ghost?.6:1,angle=ghost?-e.rotation:e.rotation;
    r.glow(p.x,p.y,w*.105,color,state.intensity*.75*alpha);
    r.disc(p.x,p.y,w*.031,color,state.intensity*alpha);
    r.ring(p.x,p.y,w*.037,color,state.intensity*.85*alpha,1,angle);
    // Preserve the four structural spokes over the lit reactor glass.
    for(let i=0;i<4;i++){const a=angle+i*Math.PI/2;r.line(p.x,p.y,p.x+Math.cos(a)*w*.033,p.y+Math.sin(a)*w*.033,1.4,'#27343b',alpha);}
    r.disc(p.x,p.y,1.7,'#a7b5b8',alpha);
  }
  private drawQuantumEnemies():void {
    const r=this.battle;
    for(const e of this.enemies){
      if(!e.quantumPaired||e.hitPoints<=0)continue;
      const p=quantumPose(e,this.quantumCenterX()),d=e.definition,w=d.size,h=w*(d.renderAspect??(d.tier==='boss'?1.18:1.3));
      const glitch=quantumGlitch(e.ageMs,e.phaseOffset);
      r.glow(p.x,p.y,w*.6,'#146fff',.2);
      r.sprite(`quantum:${d.sprite}`,p.x+glitch.offset,p.y,w,h,p.rotation,glitch.opacity+.1);
      if(glitch.offset)r.sprite(`quantum:${d.sprite}`,p.x-glitch.offset,p.y+2,w,h,p.rotation,.22,'#8ae5ff',true);
      for(let i=0;i<4;i++){
        const lineY=p.y+(((glitch.scan+i*.23)%1)-.5)*h*.8;
        r.rect(p.x+glitch.offset,lineY,w*(.38+.16*Math.sin(i+e.phaseOffset)),1.5,'#8de8ff',.35);
      }
      if(d.bossAttack==='quantum-broadside')this.drawQuantumTurrets(e,true);
    }
  }
  private drawSerpentLinks(): void {
    const segments=this.enemies.filter(e=>e.definition.segmentedPart==='serpent-turret'&&e.segmentOwner).sort((a,b)=>a.segmentOrder-b.segmentOrder);
    let previous=segments[0]?.segmentOwner;
    if (!previous || !this.enemies.includes(previous)) return;
    for (const s of segments) {
      const dx=s.x-previous.x,dy=s.y-previous.y,distance=Math.hypot(dx,dy);
      this.battle.sprite('assets/part-serpent-joint.png',(previous.x+s.x)/2,(previous.y+s.y)/2,31,distance+12,Math.atan2(dy,dx)-Math.PI/2);
      previous=s;
    }
  }
  private drawSpaceTrainCar(e: EnemyState): void {
    const r=this.battle;
    r.rect(e.x,e.y,44,56,'#b75a25'); r.rect(e.x,e.y,38,50,'#151d26'); r.rect(e.x,e.y,30,36,'#263340');
    r.rect(e.x,e.y-10,20,8,'#37e1ff'); r.rect(e.x,e.y+10,20,7,'#37e1ff');
    r.ring(e.x,e.y,8,'#ffc06a',Math.max(0.15,e.hitPoints/e.definition.hitPoints));
    r.rect(e.x,e.y-31,10,7,'#56616b'); r.rect(e.x,e.y+31,10,7,'#56616b');
  }
  private drawIronSerpentTurret(e: EnemyState): void {
    const previous=this.enemies.find(s=>s.segmentOwner===e.segmentOwner&&s.segmentOrder===e.segmentOrder-1)??e.segmentOwner;
    if(previous)drawSerpentSegment(this.battle,e,previous,this.player);
  }
  private drawHeliosEmitter(e: EnemyState): void {
    const r=this.battle, p=0.82+Math.sin(this.elapsedMs*0.012+e.phaseOffset)*0.18;
    r.glow(e.x,e.y,48,'#60ecff',p*0.65); r.disc(e.x,e.y,26,'#0e2434');
    for(let i=0;i<6;i++) { const a=i*Math.PI/3+e.ageMs*0.00045, b=a+Math.PI/3; r.line(e.x+Math.cos(a)*27,e.y+Math.sin(a)*27,e.x+Math.cos(b)*27,e.y+Math.sin(b)*27,3,'#79efff'); }
    r.disc(e.x,e.y,9*p,'#d9fbff'); r.ring(e.x,e.y,19,'#c957ff',Math.max(0.15,e.hitPoints/e.definition.hitPoints));
  }
  private drawBombCrates(): void {
    const r=this.battle;
    for(const c of this.bombCrates.crates){
      const pulse=0.65+Math.sin(c.ageMs*.007)*.15, color=c.flashMs>0?'#fff8ce':'#eeb557';
      r.glow(c.x,c.y,47,'#ffbe47',pulse*.6);
      r.rect(c.x,c.y,57,55,'#080e18');r.rect(c.x,c.y,51,49,'#7c622f');r.rect(c.x,c.y,43,43,'#172534');
      for(const dx of [-23,23]){r.line(c.x+dx,c.y-23,c.x+dx,c.y+23,3,color);r.disc(c.x+dx,c.y-20,2,'#fff0b5');r.disc(c.x+dx,c.y+20,2,'#fff0b5');}
      for(const dy of [-24,24])r.line(c.x-20,c.y+dy,c.x+20,c.y+dy,3,color);
      r.disc(c.x,c.y+2,10,'#ffcd68');r.disc(c.x-3,c.y-1,3,'#fff7d2');
      r.line(c.x+4,c.y-6,c.x+8,c.y-13,3,'#ffcd68');r.line(c.x+8,c.y-13,c.x+13,c.y-10,2,'#fff2b8');
      for(let i=0;i<3;i++)r.rect(c.x-12+i*12,c.y+18,7,3,c.health/BOMB_CRATE_HEALTH>i/3?'#ffe18e':'#493e2d');
      if(c.flashMs>0)r.rect(c.x,c.y,47,45,'#fff3bd',c.flashMs/500);
    }
  }
  private drawPowerups(): void {
    const r=this.battle;
    for(const p of this.powerups) {
      const color=this.powerupColor(p.form), radius=p.radius*(1+Math.sin(p.ageMs*0.007)*0.08);
      r.glow(p.x,p.y,radius*2,color,0.7); r.disc(p.x,p.y,radius,'#050c1f',0.9); r.ring(p.x,p.y,radius,color);
      // Distinct weapon silhouettes remain readable without tiny font labels.
      for(let i=0;i<3;i++) { const a=p.orbitAngle*1.8+i*Math.PI*2/3; r.disc(p.x+Math.cos(a)*25,p.y+Math.sin(a)*11,3.5,color); }
      if(p.form==='red') for(const dx of [-5,0,5]) r.line(p.x+dx,p.y+7,p.x+dx*1.8,p.y-7,2,'#ffffff');
      else if(p.form==='blue') { r.line(p.x-7,p.y+5,p.x,p.y-6,3,'#ffffff'); r.line(p.x,p.y-6,p.x+7,p.y+5,3,'#ffffff'); }
      else r.beam(p.x,p.y+8,p.x,p.y-8,4,'#c957ff');
    }
    for(const p of this.bombPowerups) {
      r.glow(p.x,p.y,45,'#ffd75e',0.75); r.disc(p.x,p.y,p.radius,'#281604'); r.ring(p.x,p.y,p.radius*(1+Math.sin(p.ageMs*0.009)*0.12),'#ffd75e');
      r.rect(p.x,p.y,4,18,'#fff6ce',1,Math.PI/4); r.rect(p.x,p.y,4,18,'#fff6ce',1,-Math.PI/4);
    }
  }
  private drawPlayerLaser(): void {
    if(!this.laserFiring||this.weaponForm!=='purple') return;
    const x=this.player.x,y=this.player.y-34,ex=this.mirrorLaser?.x??this.laserTarget?.x??x,ey=this.mirrorLaser?.y??this.laserTarget?.y??-24;
    const cx=x+(ex-x)*0.42+(this.laserTarget?Math.sin(this.elapsedMs*0.009)*18:0),cy=y+(ey-y)*0.48;
    let px=x,py=y; const width=weaponProfile(this.weaponForm,this.weaponLevel).beamWidth;
    if(this.mirrorLaser){this.battle.beam(x,y,ex,ey,width,'#c05cff');return;}
    for(let i=1;i<=18;i++) { const t=i/18,u=1-t,nx=u*u*x+2*u*t*cx+t*t*ex,ny=u*u*y+2*u*t*cy+t*t*ey; this.battle.beam(px,py,nx,ny,width,'#c05cff'); px=nx;py=ny; }
  }
  private drawBossLaser(): void {
    if(this.bossLaser&&this.boss) this.battle.beam(this.boss.x,this.boss.y+this.boss.definition.size*0.22,this.bossLaser.targetX,980,28,'#ff2046',this.bossLaser.phase==='warning');
  }
  private drawHostileLasers(): void {
    const m=this.mirrorLaser;if(m)this.battle.beam(m.x,m.y,m.endX,m.endY,weaponProfile(this.weaponForm,this.weaponLevel).beamWidth,'#ffacec',m.warningMs>0);
    for(const l of this.hostileLasers){const p=this.hostileLaserPath(l);this.battle.beam(p.x,p.y,p.endX,p.endY,l.source.definition.tier==='device'?22:26,l.quantum?'#53bfff':l.source.definition.tier==='device'?'#49e2ff':'#cc3cff',l.phase==='warning');}
  }
  private drawPlayer(): void {
    if(this.player.invulnerableMs>0&&Math.floor(this.player.invulnerableMs/90)%2===0) return;
    const r=this.battle,p=this.player;
    r.glow(p.x,p.y,66,'#42e8ff',0.5);
    r.sprite('assets/fx-flame.png',p.x,p.y+51,25,46+Math.sin(this.elapsedMs*0.04)*7,0,0.9,'#5cf1ff',true);
    r.sprite(PLAYER_SPRITE,p.x,p.y,84,106);
    if(this.weaponForm !== 'purple') {
      const profile=weaponProfile(this.weaponForm,this.weaponLevel),count=profile.projectileCount;
      for(let i=0;i<count;i++) {
        const normalized=count<=1?0:i/(count-1)*2-1;
        const dx=profile.form==='blue'?(i-(count-1)/2)*11:normalized*(profile.form==='red'?30:11);
        // Small weapon pods identify the muzzle hardpoints independently of the base hull art.
        r.line(p.x+dx,p.y-17,p.x+dx,p.y-24,4,'#486477');
        r.disc(p.x+dx,p.y-24,2,profile.form==='red'?'#ff785e':profile.form==='blue'?'#64c7ff':'#ffe6b0');
      }
    }
    if(this.laserFiring) { const pulse=1+Math.sin(this.elapsedMs*0.04)*0.18; r.ring(p.x,p.y-28,11*pulse,'#cb66ff',0.9,0.6); r.glow(p.x,p.y-28,22*pulse,'#bc65ff',0.8); }
  }
  private drawBullets(bullets: Bullet[]): void {
    for(const b of bullets) {
      if(b.crystalShard){this.battle.glow(b.x,b.y,20,b.color,.55);this.battle.sprite('fx:mirror-triangle',b.x,b.y,19,29,b.rotation??0,1,b.color);continue;}
      if(b.reflected){this.battle.glow(b.x,b.y,18,'#ff80d9',.75);this.battle.sprite('fx:disc',b.x,b.y,7,19,Math.atan2(b.vy,b.vx)+Math.PI/2,1,'#ffe7fc');continue;}
      if(b.bubbleHealth!==undefined) {
        this.battle.glow(b.x,b.y,b.radius*1.8,b.color,0.32);
        this.battle.disc(b.x,b.y,b.radius,b.color,0.18);
        this.battle.ring(b.x,b.y,b.radius,b.color,0.85);
        this.battle.ring(b.x,b.y,b.radius*0.78,b.color,0.25+0.5*b.bubbleHealth/TWIN_BUBBLE_HEALTH);
        this.battle.disc(b.x-6,b.y-7,4,'#ffffff',0.8);continue;
      }
      this.battle.glow(b.x,b.y,b.hostile?b.radius*3:16,b.color,0.65);
      if(b.hostile) { this.battle.disc(b.x,b.y,b.radius,b.color); this.battle.disc(b.x,b.y,b.radius*0.4,'#fff4ff',0.85); }
      else this.battle.sprite('fx:disc',b.x,b.y,4.8,22,b.rotation??0,1,b.color);
    }
  }
  private drawImpacts(): void {
    for(const p of this.impacts) { const t=p.ageMs/p.durationMs,a=Math.sin(Math.min(1,t)*Math.PI)*0.95,s=p.size*(0.72+t*0.72); this.battle.sprite(FIRE_EFFECT_SPRITE,p.x,p.y,s,s,p.rotation,a,'#ffffff',true); this.battle.glow(p.x,p.y,s*0.42,'#ff6818',a); }
  }
  private drawEnergyImpacts(): void {
    for(const p of this.energyImpacts) { const t=Math.min(1,p.ageMs/p.durationMs),f=1-t,r=p.size*(0.4+t*1.15); this.battle.glow(p.x,p.y,r,'#9e42ff',f); this.battle.ring(p.x,p.y,r*0.72,'#70eaff',f); for(let i=0;i<4;i++) { const a=i*Math.PI/2+p.rotation+t*1.8; this.battle.line(p.x,p.y,p.x+Math.cos(a)*r*1.1,p.y+Math.sin(a)*r*1.1,2,'#c95dff',f*0.75); } }
  }
  private drawDebris(): void {
    for(const p of this.debris) this.battle.sprite('fx:triangle',p.x,p.y,p.size*1.3,p.size,p.rotation,Math.max(0,p.lifeMs/p.maxLifeMs),p.color);
  }
  private drawBombBlast(): void {
    const p=this.bombBlast;if(!p)return;
    const t=Math.min(1,p.ageMs/p.durationMs),f=1-t,r=p.radius*(1-(1-t)**3),s=135+Math.sin(t*Math.PI)*225;
    this.battle.sprite(FIRE_EFFECT_SPRITE,p.x,p.y,s,s,0,Math.min(1,f*1.7),'#ffffff',true);
    this.battle.glow(p.x,p.y,r,'#ffd744',f*0.85);
    for(let i=0;i<3;i++) this.battle.ring(p.x,p.y,Math.max(2,r*(0.62+i*0.16)),i===0?'#ffffff':'#ffbe34',f);
    this.battle.rect(240,480,480,960,'#fff3be',Math.max(0,0.28-t));
  }
  private drawSparks(): void { for(const p of this.sparks) this.battle.rect(p.x,p.y,p.size,p.size,p.color,Math.max(0,p.lifeMs/p.maxLifeMs)); }

  private syncHud(): void {
    this.ui.update({ score: this.score, highScore: this.highScore, wave: this.wave, lives: this.player.lives,
      health: this.player.health, weapon: this.weaponForm, weaponLevel: this.weaponLevel,
      bombs: this.bombs, bombDisabled: this.phase !== 'playing' || this.bombs <= 0 || this.bombBlast !== null,
      ...(this.twins?{twinHealth:this.twins.map(t=>Math.max(0,t.hitPoints)/t.definition.hitPoints)}:{}), twinReviveMs:this.twinReviveMs,
      quantumEncounter:this.enemies.some(e=>e.quantumPaired),
      crystalStorm:this.enemyBullets.some(b=>b.crystalShard),
      holeWarningMs:this.blackHole.phase==='warning'?Math.max(0,2000-this.blackHole.phaseMs):0,
      bossName: this.boss?.definition.id ?? '',
      bossHealth: this.boss?.definition.id==='black-hole'?this.blackHole.progress:this.boss ? this.boss.hitPoints / this.boss.definition.hitPoints : 0 });
    this.ui.metadata({ phase: this.phase, health: this.player.health.toFixed(2), lives: String(this.player.lives),
      weapon: this.weaponForm, weaponLevel: String(this.weaponLevel), powerups: String(this.powerups.length),
      bombs: String(this.bombs), level: this.levels[this.levelIndex]?.id ?? 'unloaded', bossLaser: this.bossLaser?.phase ?? 'idle',
      redBulletDamage: String(RED_ENEMY_BULLET_DAMAGE), blueBulletDamage: String(BLUE_ENEMY_BULLET_DAMAGE), bossLaserDamage: String(BOSS_LASER_DAMAGE) });
  }

  private hideStatus(): void { this.ui.status(null); }

}
