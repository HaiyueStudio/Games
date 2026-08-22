import { HaiyueEngine, World } from '@haiyue/engine';
import { SingleSlotGameSave, isNonNegativeInteger, isRecord } from '../save/SingleSlotGameSave';
import {
  BOSS_ENEMY,
  BOSS_FIRST_APPEARANCE_MS,
  ELITE_ENEMIES,
  ENEMY_DEFINITIONS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  NORMAL_ENEMIES,
  PLAYER_FIRE_INTERVAL_MS,
  PLAYER_SPEED,
  aimedVelocity,
  circlesOverlap,
  clampToPlayfield,
  createSeededRandom,
  velocityFromAngle,
  type EnemyDefinition,
} from './rules';

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
  originX: number;
  hitPoints: number;
  ageMs: number;
  fireCooldownMs: number;
  phaseOffset: number;
  entered: boolean;
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
const STAR_COUNT = 170;
const PLAYER_BULLET_SPEED = 690;
const ENEMY_BULLET_SPEED = 172;
const SAVE_NAME = 'Sky Strike 自动存档';

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
  private readonly keys = new Set<string>();
  private readonly stars: Star[] = [];
  private readonly playerBullets: Bullet[] = [];
  private readonly enemyBullets: Bullet[] = [];
  private readonly enemies: EnemyState[] = [];
  private readonly sparks: Spark[] = [];
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly player: PlayerState = {
    x: LOGICAL_WIDTH / 2,
    y: LOGICAL_HEIGHT - 118,
    radius: 15,
    lives: 3,
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
  private spawnCooldownMs = 500;
  private nextEliteAtMs = 16_000;
  private nextBossAtMs = BOSS_FIRST_APPEARANCE_MS;
  private pointerFiring = false;
  private boss: EnemyState | null = null;
  private shakeMs = 0;
  private spiralAngle = 0;

  private readonly scoreElement = document.querySelector('#score')!;
  private readonly bestElement = document.querySelector('#best')!;
  private readonly waveElement = document.querySelector('#wave')!;
  private readonly livesElement = document.querySelector('#lives')!;
  private readonly statusElement = document.querySelector('#status')!;
  private readonly statusTitleElement = document.querySelector('#status-title')!;
  private readonly statusCopyElement = document.querySelector('#status-copy')!;
  private readonly bossHudElement = document.querySelector('#boss-hud')!;
  private readonly bossFillElement = document.querySelector('#boss-fill') as HTMLElement;
  private readonly pauseButton = document.querySelector('#pause-button') as HTMLButtonElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
  ) {}

  async init(): Promise<void> {
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
    this.showStatus('SKY STRIKE', '移动：WASD / 方向键　射击：J / 按住屏幕', '开始出击');
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
    this.wave = 1 + Math.floor(this.elapsedMs / 15_000);
    this.bestWave = Math.max(this.bestWave, this.wave);
    this.shakeMs = Math.max(0, this.shakeMs - delta);
    this.updatePlayer(delta);
    this.updateSpawns(delta);
    this.updateBullets(delta);
    this.updateEnemies(delta);
    this.resolveCollisions();
    this.syncHud();
    this.render();
  }

  private async loadImages(): Promise<void> {
    const sources = [PLAYER_SPRITE, ...ENEMY_DEFINITIONS.map(definition => definition.sprite)];
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
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'j'].includes(key)) {
        event.preventDefault();
        this.keys.add(key);
      }
      if ((key === 'j' || key === 'enter') && (this.phase === 'ready' || this.phase === 'game-over')) {
        this.startSortie();
      } else if (key === 'p' || key === 'escape') {
        this.togglePause();
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));

    this.canvas.addEventListener('pointerdown', event => {
      event.preventDefault();
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
    this.spawnCooldownMs = 400;
    this.nextEliteAtMs = 16_000;
    this.nextBossAtMs = BOSS_FIRST_APPEARANCE_MS;
    this.player.x = LOGICAL_WIDTH / 2;
    this.player.y = LOGICAL_HEIGHT - 118;
    this.player.lives = 3;
    this.player.fireCooldownMs = 0;
    this.player.invulnerableMs = 1_500;
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    this.enemies.length = 0;
    this.sparks.length = 0;
    this.boss = null;
    this.sorties++;
    this.hideStatus();
    this.pauseButton.textContent = '暂停';
    this.pauseButton.disabled = false;
    this.syncHud();
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
    this.player.fireCooldownMs -= deltaMs;
    if ((this.keys.has('j') || this.pointerFiring) && this.player.fireCooldownMs <= 0) {
      this.firePlayerWeapons();
      this.player.fireCooldownMs += PLAYER_FIRE_INTERVAL_MS;
    }
  }

  private firePlayerWeapons(): void {
    for (const offset of [-11, 11]) {
      this.playerBullets.push({
        x: this.player.x + offset,
        y: this.player.y - 24,
        vx: offset * 0.42,
        vy: -PLAYER_BULLET_SPEED,
        radius: 4,
        damage: 4,
        hostile: false,
        color: '#55eaff',
      });
    }
  }

  private updateSpawns(deltaMs: number): void {
    const bossAlive = this.boss !== null;
    this.spawnCooldownMs -= deltaMs;
    if (this.spawnCooldownMs <= 0 && !bossAlive) {
      const definition = NORMAL_ENEMIES[Math.floor(this.random() * NORMAL_ENEMIES.length)] ?? NORMAL_ENEMIES[0]!;
      this.spawnEnemy(definition);
      this.spawnCooldownMs = Math.max(430, 1_080 - this.wave * 42) * (0.82 + this.random() * 0.4);
    }

    if (this.elapsedMs >= this.nextEliteAtMs && !bossAlive) {
      const elite = ELITE_ENEMIES[Math.floor(this.elapsedMs / 16_000) % ELITE_ENEMIES.length] ?? ELITE_ENEMIES[0]!;
      this.spawnEnemy(elite);
      this.nextEliteAtMs += 18_000;
    }

    if (this.elapsedMs >= this.nextBossAtMs && !bossAlive) {
      this.spawnEnemy(BOSS_ENEMY);
      this.nextBossAtMs += 68_000;
      this.enemyBullets.length = 0;
    }
  }

  private spawnEnemy(definition: EnemyDefinition): void {
    const margin = definition.tier === 'boss' ? definition.size * 0.38 : definition.size * 0.35;
    const x = definition.tier === 'boss'
      ? LOGICAL_WIDTH / 2
      : margin + this.random() * (LOGICAL_WIDTH - margin * 2);
    const enemy: EnemyState = {
      definition,
      x,
      y: -definition.size * 0.7,
      originX: x,
      hitPoints: definition.hitPoints + (definition.tier === 'normal' ? Math.floor(this.wave / 4) : 0),
      ageMs: 0,
      fireCooldownMs: definition.fireIntervalMs * (0.45 + this.random() * 0.5),
      phaseOffset: this.random() * Math.PI * 2,
      entered: false,
    };
    this.enemies.push(enemy);
    if (definition.tier === 'boss') this.boss = enemy;
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
        enemy.x = LOGICAL_WIDTH / 2 + Math.sin(enemy.ageMs * 0.00072) * 72;
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

      if (enemy.fireCooldownMs <= 0 && enemy.y > 40 && enemy.y < LOGICAL_HEIGHT * 0.72) {
        this.fireEnemyPattern(enemy);
        enemy.fireCooldownMs += enemy.definition.fireIntervalMs * Math.max(0.62, 1 - this.wave * 0.018);
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
    const color = enemy.definition.tier === 'boss' ? '#ff335f' : enemy.definition.tier === 'elite' ? '#cf5cff' : '#ffb347';
    const add = (velocity: { x: number; y: number }, radius = 6) => this.enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.definition.size * 0.25,
      vx: velocity.x,
      vy: velocity.y,
      radius,
      damage: 1,
      hostile: true,
      color,
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
    }
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
        const radius = enemy.definition.size * (enemy.definition.tier === 'boss' ? 0.31 : 0.28);
        if (!circlesOverlap(bullet, { x: enemy.x, y: enemy.y, radius })) continue;
        enemy.hitPoints -= bullet.damage;
        hit = true;
        this.addSparks(bullet.x, bullet.y, 3, '#68efff');
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
      this.damagePlayer();
      return;
    }

    for (const enemy of this.enemies) {
      const radius = enemy.definition.size * 0.25;
      if (circlesOverlap({ x: enemy.x, y: enemy.y, radius }, this.player)) {
        this.damagePlayer();
        return;
      }
    }
  }

  private destroyEnemy(index: number, enemy: EnemyState): void {
    this.enemies.splice(index, 1);
    this.score += enemy.definition.score;
    this.highScore = Math.max(this.highScore, this.score);
    const sparkCount = enemy.definition.tier === 'boss' ? 84 : enemy.definition.tier === 'elite' ? 36 : 14;
    this.addSparks(enemy.x, enemy.y, sparkCount, enemy.definition.tier === 'boss' ? '#ff365f' : '#ffb84c');
    this.shakeMs = enemy.definition.tier === 'boss' ? 900 : 180;
    if (this.boss === enemy) {
      this.boss = null;
      this.bossesDefeated++;
      this.enemyBullets.length = 0;
      this.saveProgress();
    }
  }

  private damagePlayer(): void {
    this.player.lives--;
    this.player.invulnerableMs = 1_800;
    this.shakeMs = 560;
    this.enemyBullets.splice(0, Math.floor(this.enemyBullets.length * 0.55));
    this.addSparks(this.player.x, this.player.y, 34, '#66efff');
    if (this.player.lives <= 0) this.finishSortie();
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
    this.drawBullets(this.playerBullets);
    this.drawEnemies();
    this.drawPlayer();
    this.drawBullets(this.enemyBullets);
    this.drawSparks();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawSpace(): void {
    const gradient = this.context.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    gradient.addColorStop(0, '#030617');
    gradient.addColorStop(0.55, '#07132b');
    gradient.addColorStop(1, '#02040d');
    this.context.fillStyle = gradient;
    this.context.fillRect(-12, -12, LOGICAL_WIDTH + 24, LOGICAL_HEIGHT + 24);

    const nebula = this.context.createRadialGradient(88, 340, 10, 88, 340, 260);
    nebula.addColorStop(0, 'rgba(71, 57, 180, 0.16)');
    nebula.addColorStop(1, 'rgba(20, 30, 90, 0)');
    this.context.fillStyle = nebula;
    this.context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    for (const star of this.stars) {
      this.context.globalAlpha = star.alpha;
      this.context.fillStyle = star.color;
      this.context.fillRect(star.x, star.y, star.size, star.size * (1 + star.speed / 40));
    }
    this.context.globalAlpha = 1;
  }

  private drawEnemies(): void {
    for (const enemy of this.enemies) {
      const image = this.images.get(enemy.definition.sprite);
      if (!image) continue;
      const width = enemy.definition.size;
      const height = enemy.definition.tier === 'boss' ? width * 1.18 : width * 1.3;
      this.context.save();
      if (enemy.definition.tier === 'elite' || enemy.definition.tier === 'boss') {
        this.context.shadowColor = enemy.definition.tier === 'boss' ? '#ff244f' : '#b455ff';
        this.context.shadowBlur = enemy.definition.tier === 'boss' ? 28 : 18;
      }
      this.context.drawImage(image, enemy.x - width / 2, enemy.y - height / 2, width, height);
      this.context.restore();
    }
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

  private syncHud(): void {
    this.scoreElement.textContent = this.score.toLocaleString();
    this.bestElement.textContent = this.highScore.toLocaleString();
    this.waveElement.textContent = String(this.wave).padStart(2, '0');
    this.livesElement.textContent = '◆'.repeat(Math.max(0, this.player.lives));
    this.bossHudElement.classList.toggle('visible', this.boss !== null);
    if (this.boss) {
      this.bossFillElement.style.width = `${Math.max(0, this.boss.hitPoints / this.boss.definition.hitPoints * 100)}%`;
    }
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
    devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2),
  });
  await engine.init();
  const world = new World('Sky Strike');
  const game = new SkyStrikeGame(gameCanvas, context);
  await game.init();

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
  console.error(error);
});
