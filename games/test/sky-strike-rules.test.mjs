import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BOSS_ENEMY,
  ELITE_ENEMIES,
  ENEMY_DEFINITIONS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  NORMAL_ENEMIES,
  aimedVelocity,
  circlesOverlap,
  createNormalSpawnSequence,
  createSeededRandom,
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
  assert.match(html, /height:\s*100dvh/);
  assert.match(html, /width:\s*min\(100vw,\s*50dvh\)/);
});
