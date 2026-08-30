import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BOSS_ENEMY,
  BOSS_ENEMIES,
  BOSS_LASER_DAMAGE,
  BOSS_CRITICAL_HEALTH_RATIO,
  BOSS_WARNING_LEAD_MS,
  BOMB_DAMAGE,
  BOMB_RADIUS,
  BLUE_ENEMY_BULLET_DAMAGE,
  ELITE_ENEMIES,
  ENEMY_DEFINITIONS,
  ENEMY_FIRE_INTERVAL_MULTIPLIER,
  KAMIKAZE_COLLISION_DAMAGE,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  NORMAL_ENEMIES,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_LIVES,
  PLAYER_REGEN_PER_SECOND,
  RED_ENEMY_BULLET_DAMAGE,
  SAUCER_DEATH_BULLET_COUNT,
  aimedVelocity,
  bossCriticalDamageIntensity,
  calculateBossWarningProgress,
  circlesOverlap,
  createBombArea,
  createNormalSpawnSequence,
  createRadialBurst,
  createSeededRandom,
  distancePointToSegment,
  enemyFireIntervalMs,
  enemyProjectileProfile,
  isInsideBombArea,
  nextPowerupForm,
  regeneratePlayerHealth,
  selectLaserTarget,
  stepFireCooldown,
  steerKamikazeVelocity,
  upgradeWeapon,
  weaponProfile,
} from '../sky-strike/rules.ts';
import {
  compileLevelTimeline,
  mixHexColor,
  mixLevelBackground,
  resolveSpawnX,
} from '../sky-strike/levels/loader.ts';

test('Sky Strike defines nine regular enemies, two elites, and four distinct bosses', () => {
  assert.equal(ENEMY_DEFINITIONS.length, 15);
  assert.equal(NORMAL_ENEMIES.length, 9);
  assert.equal(ELITE_ENEMIES.length, 2);
  assert.equal(BOSS_ENEMIES.length, 4);
  assert.equal(BOSS_ENEMY.tier, 'boss');
  assert.equal(BOSS_ENEMY.hitPoints, 1_300);
  assert.deepEqual(BOSS_ENEMIES.map(enemy => enemy.bossAttack), ['laser', 'arc-storm', 'gravity-fan', 'carrier-deploy']);
  assert.equal(new Set(ENEMY_DEFINITIONS.map(enemy => enemy.id)).size, 15);
  assert.ok(ENEMY_DEFINITIONS.every(enemy => enemy.hitPoints > 0 && enemy.size > 0));
});

test('enemy selection is deterministic for a seeded sortie', () => {
  const first = createNormalSpawnSequence(0x51a7f11e, 20);
  const second = createNormalSpawnSequence(0x51a7f11e, 20);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, createNormalSpawnSequence(1234, 20));

  const randomA = createSeededRandom(99);
  const randomB = createSeededRandom(99);
  assert.deepEqual([randomA(), randomA(), randomA()], [randomB(), randomB(), randomB()]);
});

test('enemy health bands and projectile damage match the combat roles', () => {
  const smallIds = new Set(['scout', 'dart', 'stealth', 'drone']);
  const mediumIds = new Set(['bomber', 'splitter', 'gunship']);
  assert.ok(NORMAL_ENEMIES.filter(enemy => smallIds.has(enemy.id)).every(enemy => enemy.hitPoints >= 5 && enemy.hitPoints <= 8));
  assert.ok(NORMAL_ENEMIES.filter(enemy => mediumIds.has(enemy.id)).every(enemy => enemy.hitPoints >= 15 && enemy.hitPoints <= 40));
  assert.ok(ELITE_ENEMIES.every(enemy => enemy.hitPoints >= 60));
  assert.equal(enemyProjectileProfile(NORMAL_ENEMIES.find(enemy => enemy.id === 'scout')).damage, RED_ENEMY_BULLET_DAMAGE);
  assert.equal(enemyProjectileProfile(NORMAL_ENEMIES.find(enemy => enemy.id === 'gunship')).damage, BLUE_ENEMY_BULLET_DAMAGE);
  assert.equal(BOSS_LASER_DAMAGE, 100);
  assert.equal(PLAYER_MAX_LIVES, 3);
  assert.equal(PLAYER_MAX_HEALTH, 100);
  assert.equal(PLAYER_REGEN_PER_SECOND, 1);
  assert.equal(regeneratePlayerHealth(35, 8), 43);
  assert.equal(regeneratePlayerHealth(99.5, 8), 100);
  assert.equal(ENEMY_FIRE_INTERVAL_MULTIPLIER, 2);
  assert.equal(enemyFireIntervalMs(1_000, 0), 2_000);
  assert.equal(enemyFireIntervalMs(1_000, 100), 1_240);
});

test('three-color weapons upgrade independently and stop at level three', () => {
  assert.equal(weaponProfile('basic', 0).damage, 2);
  assert.deepEqual(upgradeWeapon('basic', 0, 'purple'), { form: 'purple', level: 1 });
  assert.deepEqual(upgradeWeapon('purple', 1, 'purple'), { form: 'purple', level: 2 });
  assert.deepEqual(upgradeWeapon('purple', 3, 'purple'), { form: 'purple', level: 3 });
  assert.deepEqual(upgradeWeapon('purple', 3, 'blue'), { form: 'blue', level: 1 });
  assert.ok(weaponProfile('purple', 3).beamWidth > weaponProfile('purple', 1).beamWidth);
  assert.ok(weaponProfile('red', 3).projectileCount > weaponProfile('red', 1).projectileCount);
  assert.ok(weaponProfile('blue', 3).projectileCount > weaponProfile('blue', 1).projectileCount);
  assert.ok(weaponProfile('blue', 3).damage > weaponProfile('red', 3).damage);
  assert.deepEqual([1, 2, 3].map(level => weaponProfile('red', level).damage), [2, 2, 2]);
  assert.deepEqual([1, 2, 3].map(level => weaponProfile('blue', level).damage), [4, 4, 4]);
  assert.deepEqual([1, 2, 3].map(level => weaponProfile('red', level).spreadSpeed), [120, 180, 240]);
  assert.deepEqual([1, 2, 3].map(level => {
    const profile = weaponProfile('red', level);
    return profile.damage * profile.projectileCount;
  }), [6, 10, 14]);
  assert.deepEqual([1, 2, 3].map(level => {
    const profile = weaponProfile('blue', level);
    return profile.damage * profile.projectileCount;
  }), [8, 12, 16]);
  assert.deepEqual([1, 2, 3].map(level => weaponProfile('purple', level).beamDamagePerSecond), [25, 35, 45]);
  assert.ok(weaponProfile('blue', 3).damage * weaponProfile('blue', 3).projectileCount
    > weaponProfile('red', 3).damage * weaponProfile('red', 3).projectileCount);
  assert.equal(nextPowerupForm(nextPowerupForm(nextPowerupForm('red'))), 'red');
});

test('player firing cooldown never accumulates a pointer-down catch-up burst', () => {
  assert.deepEqual(stepFireCooldown(-850, 16, false, 105), { shouldFire: false, cooldownMs: 0 });
  assert.deepEqual(stepFireCooldown(-850, 16, true, 105), { shouldFire: true, cooldownMs: 105 });
  assert.deepEqual(stepFireCooldown(105, 16, true, 105), { shouldFire: false, cooldownMs: 89 });
  assert.deepEqual(stepFireCooldown(5, 16, true, 105), { shouldFire: true, cooldownMs: 105 });
});

test('boss warning starts three seconds before its scheduled appearance', () => {
  assert.equal(BOSS_WARNING_LEAD_MS, 3_000);
  assert.equal(calculateBossWarningProgress(3_001), 0);
  assert.equal(calculateBossWarningProgress(3_000), 0);
  assert.equal(calculateBossWarningProgress(1_500), 0.5);
  assert.equal(calculateBossWarningProgress(1), 1 - 1 / 3_000);
  assert.equal(calculateBossWarningProgress(0), 0);
});

test('boss damage effects only intensify inside the critical health band', () => {
  assert.equal(BOSS_CRITICAL_HEALTH_RATIO, 0.3);
  assert.equal(bossCriticalDamageIntensity(301, 1_000), 0);
  assert.equal(bossCriticalDamageIntensity(300, 1_000), 0);
  assert.ok(Math.abs(bossCriticalDamageIntensity(150, 1_000) - 0.5) < 1e-8);
  assert.equal(bossCriticalDamageIntensity(0, 1_000), 1);
});

test('purple laser attracts a nearby forward target and boss beam geometry is stable', () => {
  const targets = [
    { id: 'near', x: 130, y: 420, radius: 20 },
    { id: 'far-side', x: 410, y: 300, radius: 20 },
    { id: 'behind', x: 120, y: 900, radius: 20 },
  ];
  assert.equal(selectLaserTarget(120, 820, 130, targets)?.id, 'near');
  assert.equal(selectLaserTarget(100, 820, 4, targets), null);
  assert.equal(distancePointToSegment(10, 50, 0, 0, 0, 100), 10);
  assert.equal(distancePointToSegment(0, 50, 0, 0, 0, 100), 0);
});

test('bullet aiming and circular hit tests remain stable', () => {
  const velocity = aimedVelocity(0, 0, 3, 4, 100);
  assert.equal(Math.round(velocity.x), 60);
  assert.equal(Math.round(velocity.y), 80);
  assert.equal(circlesOverlap({ x: 0, y: 0, radius: 5 }, { x: 9, y: 0, radius: 5 }), true);
  assert.equal(circlesOverlap({ x: 0, y: 0, radius: 5 }, { x: 11, y: 0, radius: 5 }), false);
  assert.equal(LOGICAL_WIDTH * 2, LOGICAL_HEIGHT);
});

test('saucer death burst is radial and kamikaze steering accelerates toward the player', () => {
  const saucer = ENEMY_DEFINITIONS.find(enemy => enemy.id === 'saucer');
  const kamikaze = ENEMY_DEFINITIONS.find(enemy => enemy.id === 'kamikaze');
  assert.equal(saucer?.bulletPattern, 'none');
  assert.equal(saucer?.deathBurstCount, SAUCER_DEATH_BULLET_COUNT);
  assert.equal(kamikaze?.flightPattern, 'kamikaze');
  assert.equal(kamikaze?.contactDamage, KAMIKAZE_COLLISION_DAMAGE);
  assert.equal(KAMIKAZE_COLLISION_DAMAGE, 90);

  const burst = createRadialBurst(SAUCER_DEATH_BULLET_COUNT, 200);
  assert.equal(burst.length, 16);
  assert.ok(burst.every(velocity => Math.abs(Math.hypot(velocity.x, velocity.y) - 200) < 1e-8));
  assert.ok(Math.abs(burst.reduce((sum, velocity) => sum + velocity.x, 0)) < 1e-8);
  assert.ok(Math.abs(burst.reduce((sum, velocity) => sum + velocity.y, 0)) < 1e-8);

  const steered = steerKamikazeVelocity({ x: 0, y: 112 }, 0, 0, 100, 100, 112, 2, 0.5);
  assert.ok(steered.x > 0);
  assert.ok(Math.hypot(steered.x, steered.y) > 112);
});

test('bomb area is forward-facing and includes nearby enemies and projectiles', () => {
  const area = createBombArea(240, 820);
  assert.equal(area.x, 240);
  assert.ok(area.y < 820);
  assert.equal(area.radius, BOMB_RADIUS);
  assert.equal(BOMB_DAMAGE, 420);
  assert.equal(isInsideBombArea(area, { x: 240, y: area.y - 100, radius: 10 }), true);
  assert.equal(isInsideBombArea(area, { x: 20, y: 900, radius: 4 }), false);
});

test('level timelines expand grouped spawns and resolve deterministic positions', async () => {
  const levelUrls = [1, 2, 3, 4].map(index => new URL(`../sky-strike/levels/level-0${index}.json`, import.meta.url));
  const levels = await Promise.all(levelUrls.map(async url => JSON.parse(await readFile(url, 'utf8'))));
  assert.deepEqual(levels.map(level => level.bossId), ['dreadnought', 'ion-seraph', 'void-mantis', 'star-carrier']);
  assert.deepEqual(levels.map(level => level.background.top), ['#030617', '#140307', '#0d0418', '#281307']);
  for (const level of levels) {
    const timeline = compileLevelTimeline(level);
    assert.ok(timeline.length >= level.spawns.length);
    assert.ok(timeline.every((spawn, index) => index === 0 || spawn.atMs >= timeline[index - 1].atMs));
    assert.equal(timeline.some(spawn => spawn.enemyId === level.bossId), true);
  }
  const randomA = createSeededRandom(44);
  const randomB = createSeededRandom(44);
  const position = { mode: 'random', minX: 100, maxX: 200 };
  assert.deepEqual(
    [resolveSpawnX(position, randomA), resolveSpawnX(position, randomA)],
    [resolveSpawnX(position, randomB), resolveSpawnX(position, randomB)],
  );

  assert.equal(mixHexColor('#000000', '#ffffff', 0.5), '#808080');
  assert.deepEqual(
    mixLevelBackground(levels[0].background, levels[1].background, 1),
    levels[1].background,
  );
});

test('manifest assets, one-slot save, and keyboard/pointer controls are wired', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const entry = manifest.entries.find(candidate => candidate.id === 'sky-strike');
  assert.ok(entry);
  assert.equal(entry.assets.length, 21);
  for (const asset of entry.assets) {
    assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), `${asset} must exist`);
  }

  const source = await readFile(new URL('../sky-strike/main.ts', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sky-strike/index.html', import.meta.url), 'utf8');
  assert.match(source, /new SingleSlotGameSave<SkyStrikeSaveData>/);
  assert.match(source, /'arrowup'.*'arrowdown'.*'arrowleft'.*'arrowright'.*'w'.*'a'.*'s'.*'d'.*'j'.*'k'.*'b'/s);
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /addEventListener\('pointermove'/);
  assert.match(source, /addEventListener\('contextmenu'.*preventDefault/s);
  assert.match(source, /event\.button === 2.*activateBomb\(\)/s);
  assert.match(source, /POWERUP_FORM_INTERVAL_MS/);
  assert.match(source, /BOSS_LASER_WARNING_MS/);
  assert.match(source, /damagePlayer\(bullet\.damage\)/);
  assert.match(source, /activateBomb\(\)/);
  assert.match(source, /loadSkyStrikeLevels\(\)/);
  assert.match(source, /bossAttack === 'carrier-deploy'/);
  assert.match(source, /steerKamikazeVelocity\(/);
  assert.match(source, /stepFireCooldown\(/);
  assert.match(source, /drawBossWarning\(\)/);
  assert.match(source, /updateBossDamageEffects\(/);
  assert.match(source, /addEnemyDestructionEffects\(/);
  assert.match(source, /addLaserImpact\(/);
  assert.match(source, /drawEnergyImpacts\(\)/);
  assert.match(source, /drawDebris\(\)/);
  assert.doesNotMatch(source, /definition\.tier === 'boss'\) this\.enemyBullets\.length = 0/);
  assert.match(html, /height:\s*100dvh/);
  assert.match(html, /width:\s*min\(100vw,\s*50dvh\)/);
});
