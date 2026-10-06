import type { RangeGame } from './RangeGame';
type Send = (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', id: number, x: number, y: number) => unknown;
/** Shared browser/native pointer fixture: movement, facing, muzzle, FOV and presentation agree. */
export async function verifyTwinStick(game: RangeGame, send: Send, frames: (count: number) => Promise<void>, ids: [number, number]) {
  const checks: string[] = [];
  const check = (value: unknown, message: string) => { if (!value) throw new Error(message); checks.push(message); };
  game.restart(); await frames(2);
  const move = game.controls.state.center, aim = game.aimControls.state.center;
  const [left, right] = ids;
  check(game.snapshot().fireButtonVisible && !game.aimControls.state.active, 'idle shooting control displays only the fire button');
  send('pointerdown', left, move.x, move.y); send('pointermove', left, move.x + 44, move.y);
  await frames(12);
  const heading = game.snapshot().heading!, shots = game.rules.shots;
  send('pointerdown', right, aim.x, aim.y);
  await frames(12);
  check(game.rules.shots > shots && !game.snapshot().fireButtonVisible && game.aimControls.state.active, 'holding fire immediately shoots and expands the aiming joystick');
  check(Math.abs(game.snapshot().heading! - heading) < 1e-6, 'center hold preserves facing while the movement stick remains active');
  const before = game.snapshot().player;
  send('pointermove', right, aim.x - 38, aim.y); await frames(12);
  const bullet = game.rules.bullets.filter(b => b.team === 'player').at(-1);
  check(game.snapshot().player[0]! > before[0]! + 0.1 && bullet && bullet.dx < -0.99, 'moving right and shooting left are independent');
  const muzzle = game.muzzle();
  check(muzzle.x < game.snapshot().player[0]! && Math.abs(game.rules.player.heading - Math.PI / 2) < 1e-5, 'weapon muzzle and visibility cone follow right-stick aiming');
  send('pointermove', right, aim.x, aim.y); await frames(3);
  check(Math.abs(game.snapshot().heading! - Math.PI / 2) < 1e-5, 'returning aim to center retains the last shooting direction');
  send('pointermove', right, aim.x, aim.y - 38); await frames(12);
  check(Math.abs(game.snapshot().heading!) < 1e-5, 'dragging the right stick updates aiming direction');
  send('pointerup', left, move.x, move.y);
  const stationary = game.snapshot().player, previousShots = game.rules.shots;
  await frames(12);
  check(game.rules.shots > previousShots && game.snapshot().player.every((v, i) => v === stationary[i]), 'releasing movement keeps stationary aimed fire active');
  send('pointerup', right, aim.x, aim.y);
  check(!game.rules.firing && !game.aimControls.state.active && game.snapshot().fireButtonVisible, 'releasing aim stops fire and restores the button');
  send('pointerdown', right, aim.x, aim.y); send('pointercancel', right, aim.x, aim.y);
  check(!game.rules.firing && !game.aimControls.state.active && game.snapshot().fireButtonVisible, 'aim cancellation stops fire and restores the button');
  send('pointerdown', left, move.x, move.y); send('pointerdown', right, aim.x, aim.y);
  game.cancelInteraction();
  check(!game.controls.state.active && !game.aimControls.state.active && !game.rules.firing, 'suspension cancels both sticks without retaining a trigger');
  // Lifecycle cancellation releases capture, but the native host retains contacts until physical up.
  send('pointerup', left, move.x, move.y); send('pointerup', right, aim.x, aim.y);
  game.restart();
  return checks;
}
