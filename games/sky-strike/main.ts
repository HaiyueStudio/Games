import { HaiyueEngine, World } from '@haiyue/engine';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';
import {
  BLUE_ENEMY_BULLET_DAMAGE,
  BOMB_DAMAGE,
  BOSS_LASER_DAMAGE,
  BOSS_ENEMY,
  ENEMY_DEFINITIONS,
  INITIAL_BOMBS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_BOMBS,
  NORMAL_ENEMIES,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_LIVES,
  PLAYER_SPEED,
  POWERUP_FORM_INTERVAL_MS,
  RED_ENEMY_BULLET_DAMAGE,
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
  nextPowerupForm,
  regeneratePlayerHealth,
  requiredEnemyDefinition,
  selectLaserTarget,
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
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  hostile: boolean;
  color: string;
}

interface EnemyState {
  definition: EnemyDefinition;
  x: number;
  y: number;
  radius: number;
  originX: number;
  hitPoints: number;
  ageMs: number;
  fireCooldownMs: number;
  phaseOffset: number;
  entered: boolean;
  laserCooldownMs: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  damageEffectCooldownMs: number;
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
const BOMB_EFFECT_DURATION_MS = 1_050;
const LEVEL_ADVANCE_DELAY_MS = 2_600;
const BACKGROUND_TRANSITION_MS = 7_000;
const SAVE_NAME = 'Sky Strike 自动存档';
const DEFAULT_BACKGROUND: LevelBackground = Object.freeze({
  top: '#030617',
  middle: '#071d3a',
  bottom: '#02040d',
  nebula: '#4739b4',
});

function hexToRgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

function isSkyStrikeSaveData(value: unknown): value is SkyStrikeSaveData {
  return isRecord(value)
    && isNonNegativeInteger(value.highScore)
    && isNonNegativeInteger(value.bestWave)
    && isNonNegativeInteger(value.sorties)
    && isNonNegativeInteger(value.bossesDefeated);
}

class SkyStrikeGame {
  private readonly saves = new SingleSlotGameSave<SkyStrikeSaveData>({
    gameId: 'sky-strike',
    name: SAVE_NAME,
    validateData: isSkyStrikeSaveData,
  });
  private readonly random = createSeededRandom(0x51a7f11e);
  private readonly fixture = new URLSearchParams(location.search).get('fixture');
  private readonly keys = new Set<string>();
  private readonly stars: Star[] = [];
  private readonly playerBullets: Bullet[] = [];
  private readonly enemyBullets: Bullet[] = [];
  private readonly enemies: EnemyState[] = [];
  private readonly powerups: WeaponPowerup[] = [];
  private readonly bombPowerups: BombPowerup[] = [];
  private readonly sparks: Spark[] = [];
  private readonly impacts: ImpactEffect[] = [];
  private readonly energyImpacts: EnergyImpactEffect[] = [];
  private readonly debris: DebrisFragment[] = [];
  private readonly images = new Map<string, HTMLImageElement>();
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
  private levelElapsedMs = 0;
  private levelTimeline: readonly CompiledLevelSpawn[] = [];
  private nextLevelSpawnIndex = 0;
  private levelAdvanceMs = 0;
  private levelRandom = createSeededRandom(1);
  private bossWarningProgress = 0;
  private backgroundFrom = DEFAULT_BACKGROUND;
  private backgroundTo = DEFAULT_BACKGROUND;
  private backgroundTransitionMs = BACKGROUND_TRANSITION_MS;
  private pointerFiring = false;
  private boss: EnemyState | null = null;
  private bossLaser: BossLaserState | null = null;
  private weaponForm: WeaponForm = 'basic';
  private weaponLevel = 0;
  private laserFiring = false;
  private laserTarget: EnemyState | null = null;
  private laserDamageCooldownMs = 0;
  private shakeMs = 0;
  private spiralAngle = 0;
  private bombs = INITIAL_BOMBS;
  private bombBlast: BombBlast | null = null;

  private readonly scoreElement = document.querySelector('#score')!;
  private readonly bestElement = document.querySelector('#best')!;
  private readonly waveElement = document.querySelector('#wave')!;
  private readonly livesElement = document.querySelector('#lives')!;
  private readonly healthElement = document.querySelector('#health-value')!;
  private readonly healthFillElement = document.querySelector('#health-fill') as HTMLElement;
  private readonly weaponElement = document.querySelector('#weapon-value')!;
  private readonly weaponLevelElement = document.querySelector('#weapon-level')!;
  private readonly statusElement = document.querySelector('#status')!;
  private readonly statusTitleElement = document.querySelector('#status-title')!;
  private readonly statusCopyElement = document.querySelector('#status-copy')!;
  private readonly bossHudElement = document.querySelector('#boss-hud')!;
  private readonly bossNameElement = document.querySelector('#boss-name')!;
  private readonly bossFillElement = document.querySelector('#boss-fill') as HTMLElement;
  private readonly bombCountElement = document.querySelector('#bomb-count')!;
  private readonly bombButton = document.querySelector('#bomb-button') as HTMLButtonElement;
  private readonly pauseButton = document.querySelector('#pause-button') as HTMLButtonElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
  ) {}

  async init(): Promise<void> {
    this.levels = await loadSkyStrikeLevels();
    await this.loadImages();
    const saved = await this.saves.load();
    if (saved) {
      this.highScore = saved.highScore;
      this.bestWave = Math.max(1, saved.bestWave);
      this.sorties = saved.sorties;
      this.bossesDefeated = saved.bossesDefeated;
    }
    this.createStars();
    this.setupInput();
    this.syncHud();
    this.showStatus('SKY STRIKE', '移动：WASD / 方向键　射击：J / 按住屏幕　炸弹：K / B / 鼠标右键', '开始出击');
    this.render();
  }

  update(deltaMs: number): void {
    const delta = Math.min(34, Math.max(0, deltaMs));
    this.updateStars(delta);
    this.updateSparks(delta);
    if (this.phase !== 'playing') {
      this.render();
      return;
    }

    this.elapsedMs += delta;
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
    this.updateEnemies(delta);
    this.updateBossLaser(delta);
    this.updatePowerups(delta);
    this.updatePlayerLaser(delta);
    this.resolveCollisions();
    this.syncHud();
    this.render();
  }

  private async loadImages(): Promise<void> {
    const sources = [PLAYER_SPRITE, FIRE_EFFECT_SPRITE, ...ENEMY_DEFINITIONS.map(definition => definition.sprite)];
    await Promise.all(sources.map(source => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        this.images.set(source, image);
        resolve();
      };
      image.onerror = () => reject(new Error(`[SKY_STRIKE_ASSET_LOAD_FAILED] Unable to load ${source}.`));
      image.src = source;
    })));
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

  private setupInput(): void {
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
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
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));

    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (event.button === 2) {
        this.activateBomb();
        return;
      }
      if (event.button !== 0) return;
      this.canvas.setPointerCapture(event.pointerId);
      this.pointerFiring = true;
      this.movePlayerToPointer(event);
      if (this.phase === 'ready' || this.phase === 'game-over') this.startSortie();
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.pointerFiring) return;
      event.preventDefault();
      this.movePlayerToPointer(event);
    });
    const stopPointer = (event: PointerEvent) => {
      this.pointerFiring = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    this.canvas.addEventListener('pointerup', stopPointer);
    this.canvas.addEventListener('pointercancel', stopPointer);

    document.querySelector('#start-button')!.addEventListener('click', () => {
      if (this.phase === 'paused') this.togglePause();
      else this.startSortie();
    });
    document.querySelector('#restart-button')!.addEventListener('click', () => this.startSortie());
    this.bombButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      this.activateBomb();
    });
    this.pauseButton.addEventListener('click', () => this.togglePause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.pause();
    });
  }

  private movePlayerToPointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.player.x = clampToPlayfield((event.clientX - rect.left) / rect.width * LOGICAL_WIDTH, this.player.radius, LOGICAL_WIDTH);
    this.player.y = clampToPlayfield((event.clientY - rect.top) / rect.height * LOGICAL_HEIGHT, this.player.radius + 52, LOGICAL_HEIGHT - 18);
  }

  private startSortie(): void {
    this.phase = 'playing';
    this.score = 0;
    this.wave = 1;
    this.elapsedMs = 0;
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
    this.boss = null;
    this.bossLaser = null;
    this.weaponForm = 'basic';
    this.weaponLevel = 0;
    this.laserFiring = false;
    this.laserTarget = null;
    this.laserDamageCooldownMs = 0;
    this.bombs = INITIAL_BOMBS;
    this.bombBlast = null;
    this.levelAdvanceMs = 0;
    this.beginLevel(0);
    this.sorties++;
    this.applyBrowserFixture();
    this.hideStatus();
    this.pauseButton.textContent = '暂停';
    this.pauseButton.disabled = false;
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
    this.backgroundFrom = this.currentBackground();
    this.backgroundTo = level.background;
    this.backgroundTransitionMs = 0;
    this.levelIndex = index;
    this.wave = index + 1;
    this.levelElapsedMs = 0;
    this.nextLevelSpawnIndex = 0;
    this.levelAdvanceMs = 0;
    this.levelTimeline = compileLevelTimeline(level);
    this.levelRandom = createSeededRandom(level.seed + this.sorties * 997);
    this.bossWarningProgress = 0;
    this.enemyBullets.length = 0;
    this.bossLaser = null;
    this.player.invulnerableMs = Math.max(this.player.invulnerableMs, 1_200);
    this.addSparks(LOGICAL_WIDTH / 2, 150, 32, '#6eeaff');
  }

  private pause(): void {
    this.phase = 'paused';
    this.showStatus('已暂停', '按 P、Esc 或点击继续返回战场', '继续');
    this.pauseButton.textContent = '继续';
  }

  private togglePause(): void {
    if (this.phase === 'playing') {
      this.pause();
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.hideStatus();
      this.pauseButton.textContent = '暂停';
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
    this.player.x = clampToPlayfield(this.player.x + horizontal * PLAYER_SPEED * seconds, this.player.radius, LOGICAL_WIDTH);
    this.player.y = clampToPlayfield(this.player.y + vertical * PLAYER_SPEED * seconds, this.player.radius + 48, LOGICAL_HEIGHT - 18);
    this.player.invulnerableMs = Math.max(0, this.player.invulnerableMs - deltaMs);
    this.player.health = regeneratePlayerHealth(this.player.health, seconds);
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
    const count = profile.projectileCount;
    for (let index = 0; index < count; index++) {
      const normalized = count <= 1 ? 0 : index / (count - 1) * 2 - 1;
      const offset = profile.form === 'blue'
        ? (index - (count - 1) / 2) * 11
        : normalized * (profile.form === 'red' ? 30 : 11);
      const vx = profile.form === 'red' ? normalized * profile.spreadSpeed : profile.form === 'basic' ? offset * 0.42 : 0;
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

  private updatePlayerLaser(deltaMs: number): void {
    if (!this.laserFiring || this.weaponForm !== 'purple') {
      this.laserTarget = null;
      this.laserDamageCooldownMs = 0;
      return;
    }
    const profile = weaponProfile(this.weaponForm, this.weaponLevel);
    this.laserTarget = selectLaserTarget(this.player.x, this.player.y, profile.attractionRadius, this.enemies);
    this.laserDamageCooldownMs -= deltaMs;
    if (!this.laserTarget || this.laserDamageCooldownMs > 0) return;
    const targetIndex = this.enemies.indexOf(this.laserTarget);
    if (targetIndex < 0) {
      this.laserTarget = null;
      return;
    }
    this.laserTarget.hitPoints -= profile.beamDamagePerSecond * (LASER_DAMAGE_TICK_MS / 1000);
    this.addLaserImpact(this.laserTarget.x, this.laserTarget.y, 22 + this.weaponLevel * 5);
    this.addSparks(this.laserTarget.x, this.laserTarget.y, 2 + this.weaponLevel, '#65e8ff');
    this.addSparks(this.laserTarget.x, this.laserTarget.y, 2 + this.weaponLevel, '#bd5cff');
    this.laserDamageCooldownMs += LASER_DAMAGE_TICK_MS;
    if (this.laserTarget.hitPoints <= 0) {
      const destroyed = this.laserTarget;
      this.laserTarget = null;
      this.destroyEnemy(targetIndex, destroyed);
    }
  }

  private updateSpawns(): void {
    while (this.nextLevelSpawnIndex < this.levelTimeline.length) {
      const spawn = this.levelTimeline[this.nextLevelSpawnIndex];
      if (!spawn || spawn.atMs > this.levelElapsedMs) break;
      const definition = requiredEnemyDefinition(spawn.enemyId);
      const x = resolveSpawnX(spawn.position, this.levelRandom);
      this.spawnEnemy(definition, x);
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

  private spawnEnemy(definition: EnemyDefinition, requestedX?: number, requestedY?: number): void {
    const margin = definition.tier === 'boss' ? definition.size * 0.38 : definition.size * 0.35;
    const fallbackX = definition.tier === 'boss'
      ? LOGICAL_WIDTH / 2
      : margin + this.levelRandom() * (LOGICAL_WIDTH - margin * 2);
    const x = clampToPlayfield(requestedX ?? fallbackX, Math.min(margin, LOGICAL_WIDTH * 0.45), LOGICAL_WIDTH);
    const enemy: EnemyState = {
      definition,
      x,
      y: requestedY ?? -definition.size * 0.7,
      radius: definition.size * (definition.tier === 'boss' ? 0.31 : 0.28),
      originX: x,
      hitPoints: definition.hitPoints + (definition.tier === 'normal' ? Math.min(4, Math.floor(this.wave / 4)) : 0),
      ageMs: 0,
      fireCooldownMs: enemyFireIntervalMs(definition.fireIntervalMs, 0) * (0.45 + this.levelRandom() * 0.5),
      phaseOffset: this.levelRandom() * Math.PI * 2,
      entered: false,
      laserCooldownMs: definition.tier === 'boss' ? 3_600 : 0,
      velocityX: 0,
      velocityY: definition.speed,
      rotation: 0,
      damageEffectCooldownMs: 0,
    };
    this.enemies.push(enemy);
    if (definition.tier === 'boss') this.boss = enemy;
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
      enemy.ageMs += deltaMs;
      enemy.fireCooldownMs -= deltaMs;
      const movement = enemy.definition.flightPattern;

      if (enemy.definition.tier === 'boss') {
        if (enemy.y < 142) enemy.y += enemy.definition.speed * seconds;
        else enemy.entered = true;
        const travel = enemy.definition.id === 'star-carrier'
          ? 46
          : enemy.definition.id === 'void-mantis' ? 116 : enemy.definition.id === 'ion-seraph' ? 94 : 72;
        const frequency = enemy.definition.id === 'star-carrier'
          ? 0.00048
          : enemy.definition.id === 'void-mantis' ? 0.00105 : 0.00072;
        enemy.x = LOGICAL_WIDTH / 2 + Math.sin(enemy.ageMs * frequency) * travel;
        if (enemy.definition.id === 'void-mantis' && enemy.entered) {
          enemy.y = 142 + Math.sin(enemy.ageMs * 0.0017) * 24;
        }
        if (enemy.entered && (!this.bossLaser || enemy.definition.bossAttack !== 'laser')) {
          enemy.laserCooldownMs -= deltaMs;
          if (enemy.laserCooldownMs <= 0) this.triggerBossAttack(enemy);
        }
        this.updateBossDamageEffects(enemy, deltaMs);
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

      if (enemy.definition.bulletPattern !== 'none'
        && enemy.fireCooldownMs <= 0
        && enemy.y > 40
        && enemy.y < LOGICAL_HEIGHT * 0.72) {
        this.fireEnemyPattern(enemy);
        enemy.fireCooldownMs += enemyFireIntervalMs(enemy.definition.fireIntervalMs, this.wave);
      }

      if (enemy.y > LOGICAL_HEIGHT + enemy.definition.size) {
        this.enemies.splice(index, 1);
        if (this.boss === enemy) this.boss = null;
      }
    }
  }

  private fireEnemyPattern(enemy: EnemyState): void {
    const speed = ENEMY_BULLET_SPEED + Math.min(70, this.wave * 4);
    const aimed = aimedVelocity(enemy.x, enemy.y, this.player.x, this.player.y, speed);
    const projectile = enemyProjectileProfile(enemy.definition);
    const add = (velocity: { x: number; y: number }, radius = 6) => this.enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.definition.size * 0.25,
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

  private triggerBossAttack(enemy: EnemyState): void {
    if (enemy.definition.bossAttack === 'laser') {
      this.startBossLaser(enemy);
      return;
    }
    if (enemy.definition.bossAttack === 'carrier-deploy') {
      enemy.laserCooldownMs = 4_600;
      const activeSummons = this.enemies.filter(candidate => candidate.definition.id === 'saucer' || candidate.definition.id === 'kamikaze').length;
      if (activeSummons < 10) {
        const saucer = requiredEnemyDefinition('saucer');
        const kamikaze = requiredEnemyDefinition('kamikaze');
        this.spawnEnemy(saucer, enemy.x, enemy.y + enemy.definition.size * 0.22);
        this.spawnEnemy(kamikaze, enemy.x - 92, enemy.y + enemy.definition.size * 0.12);
        this.spawnEnemy(kamikaze, enemy.x + 92, enemy.y + enemy.definition.size * 0.12);
        this.addSparks(enemy.x, enemy.y + enemy.definition.size * 0.18, 42, '#70eaff');
        this.shakeMs = Math.max(this.shakeMs, 220);
      }
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

  private spawnWeaponPowerup(enemy: EnemyState): void {
    const initialForm: PowerupForm = enemy.definition.id === 'crimson-lance' ? 'red' : 'purple';
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

  private spawnBombPowerup(enemy: EnemyState): void {
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
        this.addSparks(powerup.x, powerup.y, 42, '#ffd75e');
        this.shakeMs = Math.max(this.shakeMs, 160);
        this.bombPowerups.splice(index, 1);
        continue;
      }
      if (powerup.y > LOGICAL_HEIGHT + 35) this.bombPowerups.splice(index, 1);
    }
  }

  private collectPowerup(powerup: WeaponPowerup): void {
    const upgraded = upgradeWeapon(this.weaponForm, this.weaponLevel, powerup.form);
    this.weaponForm = upgraded.form;
    this.weaponLevel = upgraded.level;
    this.player.fireCooldownMs = 0;
    this.addSparks(powerup.x, powerup.y, 36, this.powerupColor(powerup.form));
    this.shakeMs = Math.max(this.shakeMs, 180);
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
    for (let index = this.enemies.length - 1; index >= 0; index--) {
      const enemy = this.enemies[index]!;
      if (!isInsideBombArea(area, enemy)) continue;
      enemy.hitPoints -= BOMB_DAMAGE;
      this.addImpact(enemy.x, enemy.y, enemy.definition.tier === 'boss' ? 130 : 74);
      if (enemy.hitPoints <= 0) this.destroyEnemy(index, enemy, true);
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

  private updateBullets(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (const collection of [this.playerBullets, this.enemyBullets]) {
      for (let index = collection.length - 1; index >= 0; index--) {
        const bullet = collection[index]!;
        bullet.x += bullet.vx * seconds;
        bullet.y += bullet.vy * seconds;
        if (bullet.y < -30 || bullet.y > LOGICAL_HEIGHT + 30 || bullet.x < -30 || bullet.x > LOGICAL_WIDTH + 30) {
          collection.splice(index, 1);
        }
      }
    }
  }

  private resolveCollisions(): void {
    for (let bulletIndex = this.playerBullets.length - 1; bulletIndex >= 0; bulletIndex--) {
      const bullet = this.playerBullets[bulletIndex]!;
      let hit = false;
      for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
        const enemy = this.enemies[enemyIndex]!;
        if (!circlesOverlap(bullet, enemy)) continue;
        enemy.hitPoints -= bullet.damage;
        hit = true;
        this.addSparks(bullet.x, bullet.y, 7, '#ffbd62');
        this.addImpact(bullet.x, bullet.y, enemy.definition.tier === 'boss' ? 58 : 42);
        if (enemy.hitPoints <= 0) this.destroyEnemy(enemyIndex, enemy);
        break;
      }
      if (hit) this.playerBullets.splice(bulletIndex, 1);
    }

    if (this.player.invulnerableMs > 0) return;
    for (let bulletIndex = this.enemyBullets.length - 1; bulletIndex >= 0; bulletIndex--) {
      const bullet = this.enemyBullets[bulletIndex]!;
      if (!circlesOverlap(bullet, this.player)) continue;
      this.enemyBullets.splice(bulletIndex, 1);
      this.damagePlayer(bullet.damage);
      return;
    }

    for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
      const enemy = this.enemies[enemyIndex]!;
      const radius = enemy.definition.size * 0.25;
      if (circlesOverlap({ x: enemy.x, y: enemy.y, radius }, this.player)) {
        const contactDamage = enemy.definition.contactDamage ?? PLAYER_MAX_HEALTH;
        if (enemy.definition.contactDamage !== undefined) {
          this.enemies.splice(enemyIndex, 1);
          this.addImpact(enemy.x, enemy.y, 96);
          this.addSparks(enemy.x, enemy.y, 48, '#ff742f');
        }
        this.damagePlayer(contactDamage);
        return;
      }
    }
  }

  private destroyEnemy(index: number, enemy: EnemyState, suppressDeathBurst = false): void {
    this.enemies.splice(index, 1);
    if (!suppressDeathBurst && enemy.definition.deathBurstCount) this.fireDeathBurst(enemy);
    this.score += enemy.definition.score;
    this.highScore = Math.max(this.highScore, this.score);
    this.addEnemyDestructionEffects(enemy);
    this.shakeMs = enemy.definition.tier === 'boss' ? 900 : 180;
    if (enemy.definition.tier === 'elite') this.spawnWeaponPowerup(enemy);
    if (enemy.definition.tier === 'elite' && this.levelRandom() < 0.45) this.spawnBombPowerup(enemy);
    if (enemy.definition.tier === 'boss') this.spawnBombPowerup(enemy);
    if (this.boss === enemy) {
      this.boss = null;
      this.bossLaser = null;
      this.bossesDefeated++;
      this.levelAdvanceMs = LEVEL_ADVANCE_DELAY_MS;
      this.enemyBullets.length = 0;
      this.saveProgress();
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

  private damagePlayer(damage: number): void {
    if (this.player.invulnerableMs > 0 || this.phase !== 'playing') return;
    this.player.health = Math.max(0, this.player.health - Math.max(0, damage));
    this.shakeMs = damage >= BOSS_LASER_DAMAGE ? 760 : 420;
    this.addSparks(this.player.x, this.player.y, damage >= BLUE_ENEMY_BULLET_DAMAGE ? 54 : 34, '#ff9a49');
    this.addImpact(this.player.x, this.player.y - 6, damage >= BLUE_ENEMY_BULLET_DAMAGE ? 96 : 72);
    if (this.player.health > 0) {
      this.player.invulnerableMs = 520;
      return;
    }
    this.player.lives--;
    if (this.player.lives <= 0) {
      this.finishSortie();
      return;
    }
    this.player.health = PLAYER_MAX_HEALTH;
    this.player.invulnerableMs = 1_800;
    this.enemyBullets.splice(0, Math.floor(this.enemyBullets.length * 0.55));
  }

  private finishSortie(): void {
    this.phase = 'game-over';
    this.highScore = Math.max(this.highScore, this.score);
    this.pauseButton.disabled = true;
    this.saveProgress();
    this.showStatus('任务失败', `得分 ${this.score.toLocaleString()} · 抵达第 ${this.wave} 波`, '再次出击');
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

  private render(): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const scaleX = width / LOGICAL_WIDTH;
    const scaleY = height / LOGICAL_HEIGHT;
    const shake = this.shakeMs > 0 ? Math.min(7, this.shakeMs / 90) : 0;
    const shakeX = shake ? (this.random() - 0.5) * shake : 0;
    const shakeY = shake ? (this.random() - 0.5) * shake : 0;

    this.context.setTransform(scaleX, 0, 0, scaleY, shakeX * scaleX, shakeY * scaleY);
    this.drawSpace();
    this.drawBossWarning();
    this.drawBullets(this.playerBullets);
    this.drawEnemies();
    this.drawPowerups();
    this.drawPlayerLaser();
    this.drawBossLaser();
    this.drawPlayer();
    this.drawBullets(this.enemyBullets);
    this.drawImpacts();
    this.drawEnergyImpacts();
    this.drawDebris();
    this.drawBombBlast();
    this.drawSparks();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawSpace(): void {
    const background = this.currentBackground();
    const gradient = this.context.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    gradient.addColorStop(0, background.top);
    gradient.addColorStop(0.55, background.middle);
    gradient.addColorStop(1, background.bottom);
    this.context.fillStyle = gradient;
    this.context.fillRect(-12, -12, LOGICAL_WIDTH + 24, LOGICAL_HEIGHT + 24);

    const nebula = this.context.createRadialGradient(88, 340, 10, 88, 340, 260);
    nebula.addColorStop(0, hexToRgba(background.nebula, 0.2));
    nebula.addColorStop(1, hexToRgba(background.nebula, 0));
    this.context.fillStyle = nebula;
    this.context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    for (const star of this.stars) {
      this.context.globalAlpha = star.alpha;
      this.context.fillStyle = star.color;
      this.context.fillRect(star.x, star.y, star.size, star.size * (1 + star.speed / 40));
    }
    this.context.globalAlpha = 1;
  }

  private currentBackground(): LevelBackground {
    const progress = Math.min(1, this.backgroundTransitionMs / BACKGROUND_TRANSITION_MS);
    const easedProgress = progress * progress * (3 - 2 * progress);
    return mixLevelBackground(this.backgroundFrom, this.backgroundTo, easedProgress);
  }

  private drawBossWarning(): void {
    if (this.bossWarningProgress <= 0) return;
    const flash = Math.sin(this.bossWarningProgress * Math.PI * 3) ** 2;
    const intensity = flash * (0.3 + this.bossWarningProgress * 0.7);
    const warningWidth = 132;
    this.context.save();
    this.context.globalCompositeOperation = 'screen';

    const left = this.context.createLinearGradient(0, 0, warningWidth, 0);
    left.addColorStop(0, `rgba(255, 35, 35, ${intensity * 0.72})`);
    left.addColorStop(1, 'rgba(255, 20, 20, 0)');
    this.context.fillStyle = left;
    this.context.fillRect(0, 0, warningWidth, LOGICAL_HEIGHT);

    const right = this.context.createLinearGradient(LOGICAL_WIDTH, 0, LOGICAL_WIDTH - warningWidth, 0);
    right.addColorStop(0, `rgba(255, 35, 35, ${intensity * 0.72})`);
    right.addColorStop(1, 'rgba(255, 20, 20, 0)');
    this.context.fillStyle = right;
    this.context.fillRect(LOGICAL_WIDTH - warningWidth, 0, warningWidth, LOGICAL_HEIGHT);

    this.context.fillStyle = `rgba(255, 105, 80, ${intensity * 0.82})`;
    this.context.fillRect(0, 0, 5, LOGICAL_HEIGHT);
    this.context.fillRect(LOGICAL_WIDTH - 5, 0, 5, LOGICAL_HEIGHT);
    this.context.restore();
  }

  private drawEnemies(): void {
    for (const enemy of this.enemies) {
      const image = this.images.get(enemy.definition.sprite);
      if (!image) continue;
      const width = enemy.definition.size;
      const height = width * (enemy.definition.renderAspect ?? (enemy.definition.tier === 'boss' ? 1.18 : 1.3));
      this.context.save();
      this.context.translate(enemy.x, enemy.y);
      this.context.rotate(enemy.rotation);
      if (enemy.definition.tier === 'elite' || enemy.definition.tier === 'boss') {
        this.context.shadowColor = enemy.definition.tier === 'boss' ? '#ff244f' : '#b455ff';
        this.context.shadowBlur = enemy.definition.tier === 'boss' ? 28 : 18;
      }
      this.context.drawImage(image, -width / 2, -height / 2, width, height);
      this.context.restore();
    }
  }

  private drawPowerups(): void {
    for (const powerup of this.powerups) {
      const color = this.powerupColor(powerup.form);
      const pulse = 1 + Math.sin(powerup.ageMs * 0.007) * 0.08;
      this.context.save();
      this.context.translate(powerup.x, powerup.y);
      this.context.rotate(powerup.orbitAngle * 0.42);
      this.context.shadowColor = color;
      this.context.shadowBlur = 24;
      this.context.strokeStyle = color;
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.arc(0, 0, powerup.radius * pulse, 0, Math.PI * 2);
      this.context.stroke();
      this.context.fillStyle = 'rgba(5, 12, 31, 0.86)';
      this.context.fill();
      for (let orbit = 0; orbit < 3; orbit++) {
        const angle = powerup.orbitAngle * 1.8 + orbit * Math.PI * 2 / 3;
        this.context.fillStyle = color;
        this.context.beginPath();
        this.context.arc(Math.cos(angle) * 25, Math.sin(angle) * 11, 3.5, 0, Math.PI * 2);
        this.context.fill();
      }
      this.context.rotate(-powerup.orbitAngle * 0.42);
      this.context.fillStyle = '#ffffff';
      this.context.font = '900 16px ui-monospace, monospace';
      this.context.textAlign = 'center';
      this.context.textBaseline = 'middle';
      this.context.fillText(powerup.form === 'red' ? 'R' : powerup.form === 'blue' ? 'B' : 'P', 0, 1);
      this.context.restore();
    }
    for (const powerup of this.bombPowerups) {
      const pulse = 1 + Math.sin(powerup.ageMs * 0.009) * 0.12;
      this.context.save();
      this.context.translate(powerup.x, powerup.y);
      this.context.rotate(powerup.orbitAngle * 0.35);
      this.context.shadowColor = '#ffd75e';
      this.context.shadowBlur = 28;
      this.context.fillStyle = 'rgba(40, 22, 4, 0.9)';
      this.context.strokeStyle = '#ffd75e';
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.arc(0, 0, powerup.radius * pulse, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.rotate(-powerup.orbitAngle * 0.35);
      this.context.fillStyle = '#fff6ce';
      this.context.font = '900 18px ui-monospace, monospace';
      this.context.textAlign = 'center';
      this.context.textBaseline = 'middle';
      this.context.fillText('✦', 0, 1);
      this.context.restore();
    }
  }

  private drawPlayerLaser(): void {
    if (!this.laserFiring || this.weaponForm !== 'purple') return;
    const profile = weaponProfile(this.weaponForm, this.weaponLevel);
    const startX = this.player.x;
    const startY = this.player.y - 34;
    const endX = this.laserTarget?.x ?? startX;
    const endY = this.laserTarget?.y ?? -24;
    const bend = this.laserTarget ? Math.sin(this.elapsedMs * 0.009) * 18 : 0;
    const controlX = startX + (endX - startX) * 0.42 + bend;
    const controlY = startY + (endY - startY) * 0.48;

    this.context.save();
    this.context.lineCap = 'round';
    this.context.shadowColor = '#c05cff';
    this.context.shadowBlur = 24 + profile.beamWidth;
    this.context.strokeStyle = 'rgba(135, 48, 255, 0.42)';
    this.context.lineWidth = profile.beamWidth * 2.5;
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.quadraticCurveTo(controlX, controlY, endX, endY);
    this.context.stroke();
    const gradient = this.context.createLinearGradient(startX, startY, endX, endY);
    gradient.addColorStop(0, '#f6deff');
    gradient.addColorStop(0.35, '#df7dff');
    gradient.addColorStop(1, '#8738ff');
    this.context.strokeStyle = gradient;
    this.context.lineWidth = profile.beamWidth;
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.quadraticCurveTo(controlX, controlY, endX, endY);
    this.context.stroke();
    this.context.restore();
  }

  private drawBossLaser(): void {
    const laser = this.bossLaser;
    const boss = this.boss;
    if (!laser || !boss) return;
    const startX = boss.x;
    const startY = boss.y + boss.definition.size * 0.22;
    const pulse = 0.35 + Math.sin(this.elapsedMs * 0.026) * 0.18;
    this.context.save();
    this.context.lineCap = 'round';
    if (laser.phase === 'warning') {
      this.context.strokeStyle = `rgba(255, 218, 224, ${pulse})`;
      this.context.lineWidth = 3;
      this.context.setLineDash([18, 10]);
      this.context.shadowColor = '#ffd7df';
      this.context.shadowBlur = 13;
    } else {
      this.context.strokeStyle = 'rgba(255, 32, 70, 0.42)';
      this.context.lineWidth = 34;
      this.context.shadowColor = '#ff1749';
      this.context.shadowBlur = 38;
    }
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(laser.targetX, LOGICAL_HEIGHT + 20);
    this.context.stroke();
    if (laser.phase === 'active') {
      this.context.strokeStyle = '#fff1f4';
      this.context.lineWidth = 8;
      this.context.beginPath();
      this.context.moveTo(startX, startY);
      this.context.lineTo(laser.targetX, LOGICAL_HEIGHT + 20);
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawPlayer(): void {
    const image = this.images.get(PLAYER_SPRITE);
    if (!image) return;
    if (this.player.invulnerableMs > 0 && Math.floor(this.player.invulnerableMs / 90) % 2 === 0) return;
    this.context.save();
    this.context.shadowColor = '#42e8ff';
    this.context.shadowBlur = 22;
    this.context.drawImage(image, this.player.x - 42, this.player.y - 53, 84, 106);
    this.context.restore();
    const engineGradient = this.context.createLinearGradient(0, this.player.y + 28, 0, this.player.y + 66);
    engineGradient.addColorStop(0, 'rgba(92, 241, 255, 0.9)');
    engineGradient.addColorStop(1, 'rgba(92, 121, 255, 0)');
    this.context.fillStyle = engineGradient;
    this.context.beginPath();
    this.context.moveTo(this.player.x - 12, this.player.y + 26);
    this.context.lineTo(this.player.x, this.player.y + 64 + this.random() * 8);
    this.context.lineTo(this.player.x + 12, this.player.y + 26);
    this.context.fill();
  }

  private drawBullets(bullets: Bullet[]): void {
    for (const bullet of bullets) {
      this.context.save();
      this.context.fillStyle = bullet.color;
      this.context.shadowColor = bullet.color;
      this.context.shadowBlur = bullet.hostile ? 10 : 15;
      this.context.beginPath();
      if (bullet.hostile) {
        this.context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      } else {
        this.context.roundRect(bullet.x - 2.4, bullet.y - 13, 4.8, 22, 2.4);
      }
      this.context.fill();
      this.context.restore();
    }
  }

  private drawSparks(): void {
    for (const spark of this.sparks) {
      this.context.globalAlpha = Math.max(0, spark.lifeMs / spark.maxLifeMs);
      this.context.fillStyle = spark.color;
      this.context.fillRect(spark.x - spark.size / 2, spark.y - spark.size / 2, spark.size, spark.size);
    }
    this.context.globalAlpha = 1;
  }

  private drawImpacts(): void {
    const image = this.images.get(FIRE_EFFECT_SPRITE);
    if (!image) return;
    this.context.save();
    this.context.globalCompositeOperation = 'screen';
    for (const impact of this.impacts) {
      const progress = impact.ageMs / impact.durationMs;
      const alpha = Math.sin(Math.min(1, progress) * Math.PI) * 0.95;
      const size = impact.size * (0.72 + progress * 0.72);
      this.context.save();
      this.context.translate(impact.x, impact.y);
      this.context.rotate(impact.rotation);
      this.context.globalAlpha = alpha;
      this.context.drawImage(image, -size / 2, -size / 2, size, size);
      const glow = this.context.createRadialGradient(0, 0, 0, 0, 0, size * 0.42);
      glow.addColorStop(0, `rgba(255, 250, 210, ${alpha})`);
      glow.addColorStop(0.26, `rgba(255, 104, 24, ${alpha * 0.75})`);
      glow.addColorStop(1, 'rgba(255, 20, 0, 0)');
      this.context.fillStyle = glow;
      this.context.beginPath();
      this.context.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
    }
    this.context.restore();
  }

  private drawEnergyImpacts(): void {
    this.context.save();
    this.context.globalCompositeOperation = 'screen';
    for (const impact of this.energyImpacts) {
      const progress = Math.min(1, impact.ageMs / impact.durationMs);
      const fade = 1 - progress;
      const radius = impact.size * (0.4 + progress * 1.15);
      this.context.save();
      this.context.translate(impact.x, impact.y);
      this.context.rotate(impact.rotation + progress * 1.8);

      const glow = this.context.createRadialGradient(0, 0, 0, 0, 0, radius);
      glow.addColorStop(0, `rgba(244, 250, 255, ${fade})`);
      glow.addColorStop(0.2, `rgba(82, 225, 255, ${fade * 0.88})`);
      glow.addColorStop(0.58, `rgba(158, 66, 255, ${fade * 0.58})`);
      glow.addColorStop(1, 'rgba(75, 22, 255, 0)');
      this.context.fillStyle = glow;
      this.context.beginPath();
      this.context.arc(0, 0, radius, 0, Math.PI * 2);
      this.context.fill();

      this.context.strokeStyle = `rgba(112, 234, 255, ${fade * 0.95})`;
      this.context.lineWidth = Math.max(1.5, 4 * fade);
      this.context.setLineDash([8, 5]);
      this.context.lineDashOffset = -impact.ageMs * 0.08;
      this.context.beginPath();
      this.context.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
      this.context.stroke();

      this.context.strokeStyle = `rgba(201, 93, 255, ${fade * 0.75})`;
      this.context.lineWidth = 2;
      this.context.setLineDash([]);
      for (let ray = 0; ray < 4; ray++) {
        const angle = ray * Math.PI / 2;
        this.context.beginPath();
        this.context.moveTo(Math.cos(angle) * radius * 0.18, Math.sin(angle) * radius * 0.18);
        this.context.lineTo(Math.cos(angle) * radius * 1.1, Math.sin(angle) * radius * 1.1);
        this.context.stroke();
      }
      this.context.restore();
    }
    this.context.restore();
  }

  private drawDebris(): void {
    for (const fragment of this.debris) {
      const alpha = Math.max(0, fragment.lifeMs / fragment.maxLifeMs);
      this.context.save();
      this.context.translate(fragment.x, fragment.y);
      this.context.rotate(fragment.rotation);
      this.context.globalAlpha = alpha;
      this.context.fillStyle = fragment.color;
      this.context.shadowColor = alpha > 0.55 ? '#ff7b35' : fragment.color;
      this.context.shadowBlur = alpha > 0.55 ? 8 : 2;
      this.context.beginPath();
      this.context.moveTo(-fragment.size * 0.62, -fragment.size * 0.34);
      this.context.lineTo(fragment.size * 0.68, -fragment.size * 0.16);
      this.context.lineTo(fragment.size * 0.24, fragment.size * 0.56);
      this.context.lineTo(-fragment.size * 0.42, fragment.size * 0.28);
      this.context.closePath();
      this.context.fill();
      this.context.restore();
    }
  }

  private drawBombBlast(): void {
    const blast = this.bombBlast;
    if (!blast) return;
    const progress = Math.min(1, blast.ageMs / blast.durationMs);
    const eased = 1 - (1 - progress) ** 3;
    const radius = blast.radius * eased;
    const fade = 1 - progress;
    const image = this.images.get(FIRE_EFFECT_SPRITE);
    this.context.save();
    this.context.globalCompositeOperation = 'screen';
    if (image) {
      const coreSize = 135 + Math.sin(progress * Math.PI) * 225;
      this.context.globalAlpha = Math.min(1, fade * 1.7);
      this.context.drawImage(image, blast.x - coreSize / 2, blast.y - coreSize / 2, coreSize, coreSize);
    }
    const energy = this.context.createRadialGradient(blast.x, blast.y, radius * 0.05, blast.x, blast.y, Math.max(1, radius));
    energy.addColorStop(0, `rgba(255, 255, 238, ${fade * 0.84})`);
    energy.addColorStop(0.24, `rgba(255, 215, 68, ${fade * 0.58})`);
    energy.addColorStop(0.68, `rgba(255, 70, 26, ${fade * 0.18})`);
    energy.addColorStop(1, 'rgba(255, 32, 0, 0)');
    this.context.globalAlpha = 1;
    this.context.fillStyle = energy;
    this.context.beginPath();
    this.context.arc(blast.x, blast.y, radius, 0, Math.PI * 2);
    this.context.fill();
    for (let ring = 0; ring < 3; ring++) {
      const ringRadius = Math.max(2, radius * (0.62 + ring * 0.16));
      this.context.strokeStyle = ring === 0 ? `rgba(255,255,255,${fade})` : `rgba(255,190,52,${fade * 0.72})`;
      this.context.lineWidth = Math.max(2, 12 - progress * 9 - ring * 2);
      this.context.setLineDash([28 + ring * 7, 12 + ring * 4]);
      this.context.lineDashOffset = (ring % 2 ? -1 : 1) * blast.ageMs * 0.16;
      this.context.beginPath();
      this.context.arc(blast.x, blast.y, ringRadius, 0, Math.PI * 2);
      this.context.stroke();
    }
    this.context.restore();
    this.context.save();
    this.context.fillStyle = `rgba(255, 243, 190, ${Math.max(0, 0.28 - progress)})`;
    this.context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.context.restore();
  }

  private syncHud(): void {
    this.scoreElement.textContent = this.score.toLocaleString();
    this.bestElement.textContent = this.highScore.toLocaleString();
    this.waveElement.textContent = String(this.wave).padStart(2, '0');
    this.livesElement.textContent = '◆'.repeat(Math.max(0, this.player.lives));
    this.healthElement.textContent = `${Math.ceil(this.player.health)} / ${PLAYER_MAX_HEALTH}`;
    this.healthFillElement.style.width = `${Math.max(0, this.player.health)}%`;
    const weaponNames: Record<WeaponForm, string> = { basic: '基础机炮', red: '红色扩散', blue: '蓝色直射', purple: '紫色追踪激光' };
    this.weaponElement.textContent = weaponNames[this.weaponForm];
    this.weaponElement.setAttribute('data-form', this.weaponForm);
    this.weaponLevelElement.textContent = this.weaponLevel === 0 ? 'BASE' : `LV ${this.weaponLevel}`;
    this.bombCountElement.textContent = String(this.bombs);
    this.bombButton.disabled = this.phase !== 'playing' || this.bombs <= 0 || this.bombBlast !== null;
    this.bossHudElement.classList.toggle('visible', this.boss !== null);
    if (this.boss) {
      this.bossNameElement.textContent = this.boss.definition.id.replaceAll('-', ' ').toUpperCase();
      this.bossFillElement.style.width = `${Math.max(0, this.boss.hitPoints / this.boss.definition.hitPoints * 100)}%`;
    }
    document.body.dataset.phase = this.phase;
    document.body.dataset.health = this.player.health.toFixed(2);
    document.body.dataset.lives = String(this.player.lives);
    document.body.dataset.weapon = this.weaponForm;
    document.body.dataset.weaponLevel = String(this.weaponLevel);
    document.body.dataset.powerups = String(this.powerups.length);
    document.body.dataset.bombs = String(this.bombs);
    document.body.dataset.level = this.levels[this.levelIndex]?.id ?? 'unloaded';
    document.body.dataset.bossLaser = this.bossLaser?.phase ?? 'idle';
    document.body.dataset.redBulletDamage = String(RED_ENEMY_BULLET_DAMAGE);
    document.body.dataset.blueBulletDamage = String(BLUE_ENEMY_BULLET_DAMAGE);
    document.body.dataset.bossLaserDamage = String(BOSS_LASER_DAMAGE);
  }

  private showStatus(title: string, copy: string, action: string): void {
    this.statusTitleElement.textContent = title;
    this.statusCopyElement.textContent = copy;
    const startButton = document.querySelector('#start-button') as HTMLButtonElement;
    const restartButton = document.querySelector('#restart-button') as HTMLButtonElement;
    startButton.textContent = action;
    startButton.hidden = this.phase === 'game-over';
    restartButton.textContent = action;
    restartButton.hidden = this.phase !== 'game-over';
    this.statusElement.classList.add('visible');
  }

  private hideStatus(): void {
    this.statusElement.classList.remove('visible');
  }
}

function resizeGameCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

async function main(): Promise<void> {
  const engineCanvas = document.querySelector('#engine-canvas') as HTMLCanvasElement;
  const gameCanvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
  const context = gameCanvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('[SKY_STRIKE_CANVAS_UNAVAILABLE] Canvas 2D context is unavailable.');

  const engine = new HaiyueEngine({
    canvas: engineCanvas,
    clearColor: { r: 0.005, g: 0.01, b: 0.035, a: 1 },
    msaaSamples: 4,
    devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2),
  });
  await engine.init();
  const world = new World('Sky Strike');
  const game = new SkyStrikeGame(gameCanvas, context);
  await game.init();
  document.body.dataset.renderStatus = 'passed';

  const resize = () => resizeGameCanvas(gameCanvas);
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(gameCanvas);

  engine.on('update', ({ detail: { time, delta } }) => {
    world.update(time, delta);
    game.update(delta);
  });
  engine.run();
}

main().catch(error => {
  const fatal = document.querySelector('#fatal')!;
  fatal.textContent = error instanceof Error ? error.message : String(error);
  fatal.classList.add('visible');
  document.body.dataset.renderStatus = 'failed';
  document.body.dataset.renderError = error instanceof Error ? error.message : String(error);
  console.error(error);
});
