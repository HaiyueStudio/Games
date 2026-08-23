import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BOSS_ENEMY,
  BOSS_LASER_DAMAGE,
  BLUE_ENEMY_BULLET_DAMAGE,
  ELITE_ENEMIES,
  ENEMY_DEFINITIONS,
  ENEMY_FIRE_INTERVAL_MULTIPLIER,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  NORMAL_ENEMIES,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_LIVES,
  PLAYER_REGEN_PER_SECOND,
  RED_ENEMY_BULLET_DAMAGE,
  aimedVelocity,
  circlesOverlap,
  createNormalSpawnSequence,
  createSeededRandom,
  distancePointToSegment,
  enemyFireIntervalMs,
  enemyProjectileProfile,
  nextPowerupForm,
  regeneratePlayerHealth,
  selectLaserTarget,
  upgradeWeapon,
  weaponProfile,
} from '../sky-strike/rules.ts';

test('Sky Strike defines seven regular enemies, two elites, and one boss', () => {
  assert.equal(ENEMY_DEFINITIONS.length, 10);
  assert.equal(NORMAL_ENEMIES.length, 7);
  assert.equal(ELITE_ENEMIES.length, 2);
  assert.equal(BOSS_ENEMY.tier, 'boss');
  assert.equal(new Set(ENEMY_DEFINITIONS.map(enemy => enemy.id)).size, 10);
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
  assert.deepEqual([1, 2, 3].map(level => weaponProfile('red', level).damage), [2, 2.75, 3.5]);
  assert.deepEqual([1, 2, 3].map(level => weaponProfile('blue', level).damage), [5, 7.5, 10]);
  assert.deepEqual([1, 2, 3].map(level => weaponProfile('purple', level).beamDamagePerSecond), [21, 31, 43]);
  assert.ok(weaponProfile('blue', 3).damage * weaponProfile('blue', 3).projectileCount
    > weaponProfile('red', 3).damage * weaponProfile('red', 3).projectileCount);
  assert.equal(nextPowerupForm(nextPowerupForm(nextPowerupForm('red'))), 'red');
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

test('manifest assets, one-slot save, and keyboard/pointer controls are wired', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const entry = manifest.entries.find(candidate => candidate.id === 'sky-strike');
  assert.ok(entry);
  assert.equal(entry.assets.length, 11);
  for (const asset of entry.assets) {
    assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), `${asset} must exist`);
  }

  const source = await readFile(new URL('../sky-strike/main.ts', import.meta.url), 'utf8');
  const html = await readFile(new URL('../sky-strike/index.html', import.meta.url), 'utf8');
  assert.match(source, /new SingleSlotGameSave<SkyStrikeSaveData>/);
  assert.match(source, /'arrowup'.*'arrowdown'.*'arrowleft'.*'arrowright'.*'w'.*'a'.*'s'.*'d'.*'j'/s);
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /addEventListener\('pointermove'/);
  assert.match(source, /POWERUP_FORM_INTERVAL_MS/);
  assert.match(source, /BOSS_LASER_WARNING_MS/);
  assert.match(source, /damagePlayer\(bullet\.damage\)/);
  assert.match(html, /height:\s*100dvh/);
  assert.match(html, /width:\s*min\(100vw,\s*50dvh\)/);
});
