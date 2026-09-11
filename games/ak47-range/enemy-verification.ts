import type { RangeGame } from './RangeGame';

export async function verifyEnemies(game: RangeGame, frames: (count: number) => Promise<void>) {
  const checks: string[] = [];
  const check = (value: unknown, name: string) => { if (!value) throw new Error(name); checks.push(name); };
  game.restart(); await frames(2);
  const enemy = game.rules.spawnEnemy({ x: 0, z: -1 }); enemy.health = 1; enemy.cooldown = 100;
  const other = game.rules.spawnEnemy({ x: 2, z: -1 }); other.cooldown = 100;
  await frames(3);
  const views = game.snapshot().enemyModels;
  check(views.length === 2 && views.every(v => v.model === 'ren42' && v.weaponAttached), 'enemies use independent ren42 models with right-hand AK47s');
  check(game.snapshot().enemyFireRange === 10, 'enemy engagement range is ten metres');
  game.rules.setFiring(true);
  for (let i = 0; i < 90 && enemy.health > 0; i++) await frames(1);
  game.rules.cancel();
  check(enemy.health === 0 && enemy.deathAge !== null && game.rules.kills === 1, 'a lethal player shot starts enemy death');
  const deadView = () => game.snapshot().enemyModels.find(v => v.id === enemy.id);
  check(deadView()?.animation === 'death' && !game.snapshot().radar.contacts.some(c => c.id === enemy.id), 'death animation starts and the radar removes the threat immediately');
  check(game.snapshot().enemyModels.find(v => v.id === other.id)?.animation !== 'death', 'one skeleton dying does not change the other soldier animation');
  for (let i = 0; i < 400 && (enemy.deathAge ?? 0) < 2; i++) await frames(1);
  const settled = deadView();
  check(settled && settled.animationTime > 0.5 && settled.animationTime <= settled.deathDuration, 'death pose advances and remains attached to the corpse');
  // Game-over must not freeze corpse cleanup or the player's own death animation.
  game.rules.health = 0;
  for (let i = 0; i < 600 && game.rules.enemies.includes(enemy); i++) await frames(1);
  check(!game.rules.enemies.includes(enemy) && !deadView(), 'the enemy model is removed after five seconds, including at game over');
  check(game.snapshot().animation === 'death', 'player death also plays the death clip');
  for (let i = 0; i < 600 && game.snapshot().playerVisible; i++) await frames(1);
  check(!game.snapshot().playerVisible && game.snapshot().playerDeathAge >= 5, 'player corpse is removed after five seconds');
  game.restart(); await frames(2);
  check(game.snapshot().playerVisible && game.snapshot().animation === 'idle_bottom' && game.snapshot().enemyModels.length === 0, 'restart restores the player and clears corpse views');
  return checks;
}

/** Deterministic review frame: a living soldier alongside a settled death pose. */
export function stageEnemyPreview(game: RangeGame) {
  game.restart();
  const soldier = game.rules.spawnEnemy({ x: 1.6, z: -1.5 }); soldier.cooldown = 100;
  const corpse = game.rules.spawnEnemy({ x: -1.2, z: -0.5 });
  corpse.health = 0; corpse.deathAge = 1.7;
  game.rules.spawnEnemy({ x: 0, z: 9 }); game.rules.spawnEnemy({ x: 5, z: -6 });
}
