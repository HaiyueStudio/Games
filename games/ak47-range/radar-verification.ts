import type { RangeGame } from './RangeGame';
/** The radar deliberately reports threats that the world renderer hides behind cover or the player. */
export async function verifyRadar(game: RangeGame, frames: (count: number) => Promise<void>) {
  const checks: string[] = [];
  const check = (value: unknown, name: string) => { if (!value) throw new Error(name); checks.push(name); };
  game.restart(); await frames(2);
  game.rules.ammo = 1; game.rules.setFiring(true); await frames(2); game.rules.cancel();
  check(game.rules.ammo === 0 && game.rules.reloadRemaining > 0, 'last round automatically starts reloading');
  for (let i = 0; i < 500 && game.rules.reloadRemaining > 0; i++) await frames(1);
  check(game.rules.ammo === 30, 'automatic reload fills the magazine without a reload tap');
  game.restart();
  const behind = game.rules.spawnEnemy({ x: 0, z: 7 });
  const covered = game.rules.spawnEnemy({ x: 5, z: -6 });
  await frames(2);
  const state = game.snapshot(), { rect, contacts } = state.radar;
  check(Math.abs(state.fieldOfView.player - 120) < 1e-6 && Math.abs(state.fieldOfView.enemy - 60) < 1e-6, 'player and enemy have distinct 120/60-degree vision');
  check(contacts.some(c => c.id === behind.id && c.y > 0) && !state.enemies.find(e => e.id === behind.id)!.visible, 'radar reports a rear threat hidden by scene fog');
  check(contacts.some(c => c.id === covered.id) && !state.enemies.find(e => e.id === covered.id)!.visible, 'radar reports a threat hidden behind cover');
  check(contacts.every(c => c.rect.width === 6 && c.rect.height === 6 && c.rect.x >= rect.x && c.rect.y >= rect.y && c.rect.x + 6 <= rect.x + rect.width && c.rect.y + 6 <= rect.y + rect.height), 'enemy radar dots have visible GUI bounds inside the disc');
  const surface = game.engine.canvas!.getBoundingClientRect(), inset = state.safeInsets;
  check(rect.x >= inset.left && rect.y >= inset.top && rect.x + rect.width <= surface.width - inset.right && rect.y + rect.height + 18 <= surface.height - inset.bottom, 'radar is inside the top-right safe area');
  game.restart(); await frames(2);
  check(game.snapshot().radar.contacts.length === 0, 'restart clears radar contacts');
  return checks;
}
